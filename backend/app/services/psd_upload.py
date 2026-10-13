from __future__ import annotations

import json
import re
from typing import Any
from uuid import uuid4

import anyio
from botocore.exceptions import BotoCoreError, ClientError

from app.config.config import Config
from app.services.object_storage import _clean_etag, ensure_rustfs_bucket, get_rustfs_client

SAFE_SEGMENT_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")


class PsdUploadError(Exception):
    """PSD 分片上传业务异常，code 用于稳定映射到 HTTP 状态码。"""

    def __init__(self, code: str, message: str | None = None):
        self.code = code
        super().__init__(message or code)


def build_psd_object_key(user_id: int, order_id: str | None, asset_id: str | None = None) -> tuple[str, str]:
    """为当前用户生成不可预测的 PSD 对象键，作用域固定在其私有目录下。"""
    safe_order_id = SAFE_SEGMENT_PATTERN.sub("-", (order_id or "unassigned").strip()).strip(".-") or "unassigned"
    safe_asset_id = SAFE_SEGMENT_PATTERN.sub("-", (asset_id or f"psd-{uuid4().hex}").strip()).strip(".-")
    if not safe_asset_id:
        safe_asset_id = f"psd-{uuid4().hex}"
    return safe_asset_id, f"users/{user_id}/designs/{safe_order_id}/psd/{safe_asset_id}.psd"


def compute_part_layout(size: int, requested_part_size: int | None = None) -> tuple[int, int]:
    """计算分片大小与总数，把请求值夹紧到 [S3 下限, 文件大小] 且不超 S3 上限。"""
    part_size = requested_part_size or Config.RUSTFS_PSD_PART_SIZE
    part_size = max(Config.RUSTFS_PSD_MIN_PART_SIZE, min(part_size, size))
    total_parts = max(1, (size + part_size - 1) // part_size)
    if total_parts > Config.RUSTFS_PSD_MAX_PARTS:
        part_size = max(Config.RUSTFS_PSD_MIN_PART_SIZE, (size + Config.RUSTFS_PSD_MAX_PARTS - 1) // Config.RUSTFS_PSD_MAX_PARTS)
        total_parts = (size + part_size - 1) // part_size
    return part_size, total_parts


async def _run(client_call) -> Any:
    """在线程池里执行 RustFS 调用，并把 multipart 相关错误翻译成 PsdUploadError。"""
    try:
        return await anyio.to_thread.run_sync(client_call)
    except PsdUploadError:
        raise
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchUpload", "NoSuchKey", "NotFound"}:
            raise PsdUploadError("not_found", "PSD upload session was not found") from error
        if code in {"403", "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"}:
            raise PsdUploadError("access_denied", "RustFS rejected the configured credentials") from error
        raise PsdUploadError("unavailable", "RustFS request failed") from error
    except (BotoCoreError, OSError) as error:
        raise PsdUploadError("unavailable", "RustFS is unavailable") from error


async def create_psd_multipart_upload(
    *,
    object_key: str,
    content_type: str,
    asset_id: str,
    user_id: int,
) -> str:
    """在 RustFS 上开启一个 S3 Multipart Upload，返回 upload_id。"""
    await ensure_rustfs_bucket()
    client = get_rustfs_client()
    response = await _run(
        lambda: client.create_multipart_upload(
            Bucket=Config.RUSTFS_BUCKET,
            Key=object_key,
            ContentType=content_type,
            Metadata={"asset-id": asset_id, "owner-user-id": str(user_id)},
        )
    )
    return str(response["UploadId"])


async def upload_psd_part(*, bucket: str, object_key: str, upload_id: str, part_number: int, data: bytes) -> str:
    """上传单个分片到 RustFS，返回该分片 ETag。客户端可并发调用，mutipart 允许乱序。"""
    client = get_rustfs_client()
    response = await _run(
        lambda: client.upload_part(
            Bucket=bucket,
            Key=object_key,
            UploadId=upload_id,
            PartNumber=part_number,
            Body=data,
        )
    )
    etag = _clean_etag(response.get("ETag"))
    if not etag:
        raise PsdUploadError("unavailable", "RustFS did not return an ETag for the uploaded part")
    return etag


async def complete_psd_multipart(*, bucket: str, object_key: str, upload_id: str, parts: list[dict]) -> str:
    """按 part_number 升序组装分片列表并完成 Multipart Upload，返回最终 ETag。"""
    client = get_rustfs_client()
    ordered = {"Parts": sorted(parts, key=lambda part: part["PartNumber"])}
    response = await _run(
        lambda: client.complete_multipart_upload(
            Bucket=bucket,
            Key=object_key,
            UploadId=upload_id,
            MultipartUpload=ordered,
        )
    )
    return _clean_etag(response.get("ETag"))


async def abort_psd_multipart(*, bucket: str, object_key: str, upload_id: str) -> None:
    """中止未完成的 Multipart Upload，删除已上传的分片。"""
    client = get_rustfs_client()
    try:
        await _run(
            lambda: client.abort_multipart_upload(
                Bucket=bucket,
                Key=object_key,
                UploadId=upload_id,
            )
        )
    except PsdUploadError as error:
        if error.code != "not_found":
            raise


# ---------------- Redis 上传会话 ----------------

def psd_session_key(session_id: str) -> str:
    return f"{Config.REDIS_KEY_PREFIX}:psd:session:{session_id}"


async def save_psd_session(redis, session: dict) -> None:
    await redis.set(psd_session_key(session["session_id"]), json.dumps(session, ensure_ascii=False), ex=Config.PSD_UPLOAD_SESSION_TTL_SECONDS)


async def load_psd_session(redis, session_id: str) -> dict | None:
    raw = await redis.get(psd_session_key(session_id))
    if raw is None:
        return None
    return json.loads(raw)


async def record_psd_part(redis, session_id: str, part_number: int, etag: str) -> dict:
    """把成功上传的分片记入会话（缺则追加）供断点续传，返回更新后的会话。"""
    session = await load_psd_session(redis, session_id)
    if session is None:
        raise PsdUploadError("not_found", "PSD upload session was not found")
    session.setdefault("parts", [])
    existing = {part["PartNumber"] for part in session["parts"]}
    if part_number not in existing:
        session["parts"].append({"PartNumber": part_number, "ETag": etag})
    await save_psd_session(redis, session)
    return session


async def delete_psd_session(redis, session_id: str) -> None:
    await redis.delete(psd_session_key(session_id))