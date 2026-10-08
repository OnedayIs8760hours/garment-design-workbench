from __future__ import annotations

import re
from functools import lru_cache
from pathlib import PurePosixPath
from typing import BinaryIO, Iterator
from uuid import uuid4

import anyio
import boto3
from botocore.client import BaseClient
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from app.config.config import Config


ALLOWED_IMAGE_TYPES = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
SAFE_SEGMENT_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")


class ObjectStorageError(Exception):
    """RustFS 对象存储业务异常。"""

    def __init__(self, code: str, message: str | None = None):
        self.code = code
        super().__init__(message or code)


@lru_cache(maxsize=1)
def get_rustfs_client() -> BaseClient:
    """创建并缓存 RustFS S3 客户端。

    输入：环境变量中的 RustFS endpoint、access key、secret key 和 region。
    输出：配置为 S3 v4 签名和 path-style 寻址的 boto3 S3 客户端。
    功能：为后端所有上传、下载、删除和签名 URL 操作复用连接池。
    """
    try:
        connection = Config.get_rustfs_config()
    except RuntimeError as error:
        raise ObjectStorageError("not_configured", str(error)) from error

    return boto3.client(
        "s3",
        **connection,
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": Config.RUSTFS_ADDRESSING_STYLE},
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def clear_rustfs_client_cache() -> None:
    """清除缓存客户端，供配置热更新和测试隔离使用。"""
    get_rustfs_client.cache_clear()


def build_user_object_key(
    user_id: int,
    order_id: str | None,
    content_type: str,
    asset_id: str | None = None,
) -> tuple[str, str]:
    """生成只属于当前用户的不可预测对象键和素材 ID。"""
    extension = ALLOWED_IMAGE_TYPES.get(content_type)
    if extension is None:
        raise ObjectStorageError("unsupported_type", f"Unsupported image type: {content_type}")
    safe_order_id = SAFE_SEGMENT_PATTERN.sub("-", (order_id or "unassigned").strip()).strip(".-") or "unassigned"
    safe_asset_id = SAFE_SEGMENT_PATTERN.sub("-", (asset_id or f"asset-{uuid4().hex}").strip()).strip(".-")
    if not safe_asset_id:
        safe_asset_id = f"asset-{uuid4().hex}"
    return safe_asset_id, f"users/{user_id}/designs/{safe_order_id}/assets/{safe_asset_id}{extension}"


def assert_user_object_key(user_id: int, object_key: str) -> str:
    """校验对象键属于当前用户并拒绝目录穿越。"""
    normalized = str(PurePosixPath(object_key.strip()))
    expected_prefix = f"users/{user_id}/"
    if not object_key or ".." in PurePosixPath(object_key).parts or not normalized.startswith(expected_prefix):
        raise ObjectStorageError("forbidden", "Object does not belong to current user")
    return normalized


async def ensure_rustfs_bucket() -> None:
    """确认目标桶存在，不存在时自动创建。"""
    client = get_rustfs_client()

    def ensure() -> None:
        try:
            client.head_bucket(Bucket=Config.RUSTFS_BUCKET)
            return
        except ClientError as error:
            code = str(error.response.get("Error", {}).get("Code", ""))
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if code not in {"404", "NoSuchBucket", "NotFound"} and status != 404:
                raise
        client.create_bucket(Bucket=Config.RUSTFS_BUCKET)

    await _run_storage_call(ensure)


async def upload_image_object(
    *,
    user_id: int,
    order_id: str | None,
    file_object: BinaryIO,
    content_type: str,
    size: int,
    asset_id: str | None = None,
) -> dict[str, str | int | None]:
    """上传图片到 RustFS 并返回可写入草稿的对象元数据。"""
    if size <= 0:
        raise ObjectStorageError("empty_file", "Uploaded image is empty")
    if size > Config.RUSTFS_MAX_UPLOAD_BYTES:
        raise ObjectStorageError("file_too_large", "Uploaded image exceeds the configured size limit")

    asset_id, object_key = build_user_object_key(user_id, order_id, content_type, asset_id)
    await ensure_rustfs_bucket()
    client = get_rustfs_client()

    def upload() -> dict:
        file_object.seek(0)
        client.upload_fileobj(
            file_object,
            Config.RUSTFS_BUCKET,
            object_key,
            ExtraArgs={
                "ContentType": content_type,
                "Metadata": {"asset-id": asset_id, "owner-user-id": str(user_id)},
            },
        )
        return client.head_object(Bucket=Config.RUSTFS_BUCKET, Key=object_key)

    metadata = await _run_storage_call(upload)
    return {
        "asset_id": asset_id,
        "object_key": object_key,
        "bucket": Config.RUSTFS_BUCKET,
        "content_type": metadata.get("ContentType") or content_type,
        "size": int(metadata.get("ContentLength") or size),
        "etag": _clean_etag(metadata.get("ETag")),
    }


async def get_object_metadata(user_id: int, object_key: str) -> dict[str, str | int | None]:
    """读取当前用户 RustFS 对象的大小、类型和 ETag。"""
    owned_key = assert_user_object_key(user_id, object_key)
    client = get_rustfs_client()
    metadata = await _run_storage_call(
        lambda: client.head_object(Bucket=Config.RUSTFS_BUCKET, Key=owned_key)
    )
    return {
        "object_key": owned_key,
        "bucket": Config.RUSTFS_BUCKET,
        "content_type": metadata.get("ContentType") or "application/octet-stream",
        "size": int(metadata.get("ContentLength") or 0),
        "etag": _clean_etag(metadata.get("ETag")),
    }


async def create_download_url(user_id: int, object_key: str, expires_in: int | None = None) -> str:
    """为当前用户的私有对象生成临时 GET 预签名 URL。"""
    owned_key = assert_user_object_key(user_id, object_key)
    ttl = expires_in or Config.RUSTFS_PRESIGNED_URL_EXPIRES_SECONDS
    ttl = max(60, min(ttl, 604800))
    client = get_rustfs_client()
    return await _run_storage_call(
        lambda: client.generate_presigned_url(
            "get_object",
            Params={"Bucket": Config.RUSTFS_BUCKET, "Key": owned_key},
            ExpiresIn=ttl,
        )
    )


async def open_image_object(user_id: int, object_key: str) -> dict:
    """打开当前用户的 RustFS 对象，返回供 StreamingResponse 使用的响应体。"""
    owned_key = assert_user_object_key(user_id, object_key)
    client = get_rustfs_client()
    return await _run_storage_call(
        lambda: client.get_object(Bucket=Config.RUSTFS_BUCKET, Key=owned_key)
    )


def iter_object_chunks(body, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    """分块读取并关闭 boto3 StreamingBody，避免把整张图片载入内存。"""
    try:
        while chunk := body.read(chunk_size):
            yield chunk
    finally:
        body.close()


async def delete_image_object(user_id: int, object_key: str) -> None:
    """永久删除当前用户的 RustFS 私有对象。"""
    owned_key = assert_user_object_key(user_id, object_key)
    client = get_rustfs_client()
    await _run_storage_call(
        lambda: client.delete_object(Bucket=Config.RUSTFS_BUCKET, Key=owned_key)
    )


async def check_rustfs_health() -> None:
    """检查 RustFS 服务可连接且配置桶存在。"""
    client = get_rustfs_client()
    await _run_storage_call(lambda: client.head_bucket(Bucket=Config.RUSTFS_BUCKET))


async def _run_storage_call(function):
    try:
        return await anyio.to_thread.run_sync(function)
    except ObjectStorageError:
        raise
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise ObjectStorageError("not_found", "RustFS object was not found") from error
        if code in {"403", "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"}:
            raise ObjectStorageError("access_denied", "RustFS rejected the configured credentials") from error
        raise ObjectStorageError("unavailable", "RustFS request failed") from error
    except (BotoCoreError, OSError) as error:
        raise ObjectStorageError("unavailable", "RustFS is unavailable") from error


def _clean_etag(value: str | None) -> str | None:
    return value.strip('"') if value else None
