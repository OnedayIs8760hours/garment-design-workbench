import anyio
import pytest
from botocore.exceptions import ClientError

from app.config.config import Config
from app.services import object_storage
from app.services.object_storage import (
    ObjectStorageError,
    assert_user_object_key,
    build_user_object_key,
    ensure_rustfs_bucket,
)


class _FakeRustfsClient:
    """记录桶操作的内存版 RustFS 客户端。"""

    def __init__(self, missing_bucket=False):
        self.missing_bucket = missing_bucket
        self.created_buckets = []
        self.cors_configs = []

    def head_bucket(self, Bucket):
        if self.missing_bucket:
            raise ClientError(
                {"Error": {"Code": "404"}, "ResponseMetadata": {"HTTPStatusCode": 404}},
                "HeadBucket",
            )
        return {}

    def create_bucket(self, Bucket):
        self.created_buckets.append(Bucket)

    def put_bucket_cors(self, Bucket, CORSConfiguration):
        self.cors_configs.append((Bucket, CORSConfiguration))


def test_build_user_object_key_scopes_asset_to_user_and_order():
    asset_id, object_key = build_user_object_key(42, "ORDER/危险 001", "image/png")

    assert asset_id.startswith("asset-")
    assert object_key.startswith("users/42/designs/ORDER-001/assets/asset-")
    assert object_key.endswith(".png")


def test_assert_user_object_key_rejects_other_users_and_traversal():
    assert assert_user_object_key(42, "users/42/designs/ORDER-1/assets/a.png") == (
        "users/42/designs/ORDER-1/assets/a.png"
    )

    with pytest.raises(ObjectStorageError, match="current user"):
        assert_user_object_key(42, "users/41/designs/ORDER-1/assets/a.png")

    with pytest.raises(ObjectStorageError, match="current user"):
        assert_user_object_key(42, "users/42/../41/assets/a.png")


def test_build_user_object_key_rejects_unsupported_file_type():
    with pytest.raises(ObjectStorageError, match="Unsupported image type"):
        build_user_object_key(42, "ORDER-1", "image/svg+xml")


def test_ensure_rustfs_bucket_applies_cors_for_existing_bucket(monkeypatch):
    """已存在的桶也要补上 CORS，否则前端 3D 预览跨域读取素材会被浏览器拦截。"""
    fake_client = _FakeRustfsClient()
    monkeypatch.setattr(object_storage, "get_rustfs_client", lambda: fake_client)
    monkeypatch.setattr(Config, "CORS_ORIGINS", ["http://127.0.0.1:5000"])

    anyio.run(ensure_rustfs_bucket)

    assert fake_client.created_buckets == []
    assert len(fake_client.cors_configs) == 1
    bucket, cors = fake_client.cors_configs[0]
    assert bucket == Config.RUSTFS_BUCKET
    assert cors["CORSRules"][0]["AllowedMethods"] == ["GET", "HEAD"]
    assert "*" in cors["CORSRules"][0]["AllowedHeaders"]
    assert cors["CORSRules"][0]["AllowedOrigins"] == ["http://127.0.0.1:5000"]


def test_ensure_rustfs_bucket_creates_bucket_then_applies_cors(monkeypatch):
    """桶不存在时先创建再写 CORS，保证新部署环境开箱即用。"""
    fake_client = _FakeRustfsClient(missing_bucket=True)
    monkeypatch.setattr(object_storage, "get_rustfs_client", lambda: fake_client)

    anyio.run(ensure_rustfs_bucket)

    assert fake_client.created_buckets == [Config.RUSTFS_BUCKET]
    assert len(fake_client.cors_configs) == 1
