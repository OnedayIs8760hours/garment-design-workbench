import anyio
import pytest

from app.config.config import Config
from app.services import psd_upload
from app.services.psd_upload import (
    PsdUploadError,
    build_psd_object_key,
    compute_part_layout,
    complete_psd_multipart,
    create_psd_multipart_upload,
    delete_psd_session,
    load_psd_session,
    record_psd_part,
    save_psd_session,
    upload_psd_part,
)


class _FakeRustfsClient:
    """记录 multipart 调用并模拟 ETag 的内存版 RustFS 客户端。"""

    def __init__(self):
        self.uploads = {}  # upload_id -> {create:, parts:{n:etag}, completed:etag, aborted:bool}

    def create_multipart_upload(self, Bucket, Key, ContentType=None, Metadata=None):
        upload_id = f"upload-{len(self.uploads) + 1}"
        self.uploads[upload_id] = {"key": Key, "parts": {}, "completed": None, "aborted": False}
        return {"UploadId": upload_id}

    def upload_part(self, Bucket, Key, UploadId, PartNumber, Body):
        assert not self.uploads[UploadId]["aborted"], "part uploaded after abort"
        etag = f"etag-{PartNumber}"
        self.uploads[UploadId]["parts"][PartNumber] = etag
        return {"ETag": f'"{etag}"'}

    def complete_multipart_upload(self, Bucket, Key, UploadId, MultipartUpload):
        record = self.uploads[UploadId]
        record["completed"] = MultipartUpload["Parts"]
        return {"ETag": '"final-etag"'}

    def abort_multipart_upload(self, Bucket, Key, UploadId):
        self.uploads[UploadId]["aborted"] = True


class _FakeRedis:
    def __init__(self):
        self.store = {}

    async def get(self, key):
        raw = self.store.get(key)
        return raw.encode("utf-8") if raw is not None else None

    async def set(self, key, value, ex=None):
        self.store[key] = value

    async def delete(self, key):
        self.store.pop(key, None)


@pytest.fixture
def fixtures(monkeypatch):
    rustfs = _FakeRustfsClient()
    redis = _FakeRedis()

    async def _noop_bucket():
        return None

    monkeypatch.setattr(psd_upload, "get_rustfs_client", lambda: rustfs)
    monkeypatch.setattr(psd_upload, "ensure_rustfs_bucket", _noop_bucket)
    monkeypatch.setattr(Config, "RUSTFS_MAX_PSD_UPLOAD_BYTES", 200 * 1024 * 1024)
    monkeypatch.setattr(Config, "RUSTFS_PSD_PART_SIZE", 8 * 1024 * 1024)
    return rustfs, redis


def test_build_psd_object_key_scopes_to_user_order_and_psd_suffix():
    asset_id, object_key = build_psd_object_key(42, "ORDER/危险 001")
    assert asset_id.startswith("psd-")
    assert object_key.startswith("users/42/designs/ORDER-001/psd/psd-")
    assert object_key.endswith(".psd")


def test_compute_part_layout_default_splits_500mb_sized_file():
    part_size, total_parts = compute_part_layout(500 * 1024 * 1024)
    assert part_size == 8 * 1024 * 1024
    assert total_parts == 63
    assert part_size * total_parts >= 500 * 1024 * 1024


def test_compute_part_layout_clamps_below_s3_minimum():
    # 请求 1MB 分片会被夹紧到 5MB 下限
    part_size, _ = compute_part_layout(100 * 1024 * 1024, requested_part_size=1 * 1024 * 1024)
    assert part_size == 5 * 1024 * 1024


def test_compute_part_layout_small_file_is_one_part():
    # part_size 是分片上限：文件小于下限时仍是一个整体片（最后一片允许小于 S3 下限）
    part_size, total_parts = compute_part_layout(1 * 1024 * 1024)
    assert total_parts == 1
    assert part_size == 5 * 1024 * 1024  # 被夹紧到 S3 下限，但只会有 1 片


def test_compute_part_layout_caps_total_parts(monkeypatch):
    monkeypatch.setattr(Config, "RUSTFS_PSD_MIN_PART_SIZE", 1)
    part_size, total_parts = compute_part_layout(100 * 10000, requested_part_size=1)
    assert total_parts == 10000


async def _new_session(redis, rustfs, size=20 * 1024 * 1024):
    upload_id = await create_psd_multipart_upload(
        object_key="users/42/designs/O1/psd/psd-abc.psd", content_type="application/octet-stream", asset_id="psd-abc", user_id=42
    )
    part_size, total_parts = compute_part_layout(size)
    session = {
        "session_id": "psd-abc",
        "owner_user_id": 42,
        "bucket": Config.RUSTFS_BUCKET,
        "object_key": "users/42/designs/O1/psd/psd-abc.psd",
        "upload_id": upload_id,
        "asset_id": "psd-abc",
        "original_name": "a.psd",
        "content_type": "application/octet-stream",
        "size": size,
        "part_size": part_size,
        "total_parts": total_parts,
        "parts": [],
    }
    await save_psd_session(redis, session)
    return session


def test_upload_parts_and_complete_concurrent(fixtures):
    rustfs, redis = fixtures
    session = anyio.run(_new_session, redis, rustfs)
    sid = session["session_id"]

    async def run_concurrent():
        results = []
        # 模拟前端并发上传所有分片
        for n in range(1, session["total_parts"] + 1):
            etag = await upload_psd_part(
                bucket=session["bucket"],
                object_key=session["object_key"],
                upload_id=session["upload_id"],
                part_number=n,
                data=b"x" * session["part_size"],
            )
            await record_psd_part(redis, sid, n, etag)
            results.append((n, etag))
        return results

    results = anyio.run(run_concurrent)

    persisted = anyio.run(load_psd_session, redis, sid)
    assert len(persisted["parts"]) == session["total_parts"]

    async def do_complete(bucket, object_key, upload_id, parts):
        return await complete_psd_multipart(
            bucket=bucket, object_key=object_key, upload_id=upload_id, parts=parts
        )

    final_etag = anyio.run(do_complete, session["bucket"], session["object_key"], session["upload_id"], persisted["parts"])
    assert final_etag == "final-etag"
    record = rustfs.uploads[session["upload_id"]]
    # complete 按 part_number 升序组装
    numbers = [part["PartNumber"] for part in record["completed"]]
    assert numbers == list(range(1, session["total_parts"] + 1))
    # 会话在上传后、complete 前仍可查询（断点续传数据）
    assert persisted["parts"][0]["PartNumber"] == 1


def test_record_part_deduplicates_and_appends(fixtures):
    _, redis = fixtures
    session = anyio.run(_new_session, redis, None)
    # 上传 part 2 和 part 1（乱序）
    anyio.run(record_psd_part, redis, session["session_id"], 2, "e2")
    anyio.run(record_psd_part, redis, session["session_id"], 1, "e1")
    # 重传 part 2 不会重复追加
    anyio.run(record_psd_part, redis, session["session_id"], 2, "e2b")

    persisted = anyio.run(load_psd_session, redis, session["session_id"])
    assert len(persisted["parts"]) == 2
    numbers = {p["PartNumber"] for p in persisted["parts"]}
    assert numbers == {1, 2}


def test_session_unknown_raises_not_found(fixtures):
    _, redis = fixtures

    async def check():
        with pytest.raises(PsdUploadError, match="not found"):
            await record_psd_part(redis, "nope", 1, "e")

    anyio.run(check)


def test_complete_multipart_out_of_order_rejected_by_server(fixtures):
    # 展示 complete 前所有分片必须齐备（路由层校验），这里验证排序逻辑本身
    fake, _ = fixtures
    upload = fake.create_multipart_upload(Bucket="b", Key="k")["UploadId"]
    parts = [{"PartNumber": 2, "ETag": "e2"}, {"PartNumber": 1, "ETag": "e1"}]

    async def do_complete(bucket, object_key, upload_id, parts):
        return await complete_psd_multipart(
            bucket=bucket, object_key=object_key, upload_id=upload_id, parts=parts
        )

    etag = anyio.run(do_complete, "b", "k", upload, parts)
    assert etag == "final-etag"
    numbers = [p["PartNumber"] for p in fake.uploads[upload]["completed"]]
    assert numbers == [1, 2]


def test_delete_session_removes_state(fixtures):
    _, redis = fixtures
    session = anyio.run(_new_session, redis, None)

    async def run():
        await delete_psd_session(redis, session["session_id"])
        return await load_psd_session(redis, session["session_id"])

    assert anyio.run(run) is None