from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.dependencies.auth import get_current_user
from app.config.config import Config
from app.models.users import User
from app.schemas.assets import (
    AssetDeleteResponse,
    AssetObjectResponse,
    AssetUploadResponse,
    StorageHealthResponse,
)
from app.services.object_storage import (
    ObjectStorageError,
    check_rustfs_health,
    create_download_url,
    delete_image_object,
    get_object_metadata,
    iter_object_chunks,
    open_image_object,
    upload_image_object,
)


router = APIRouter()


def storage_http_exception(error: ObjectStorageError) -> HTTPException:
    """将 RustFS 服务错误转换成稳定的 HTTP 响应。"""
    if error.code == "unsupported_type":
        return HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(error))
    if error.code in {"empty_file", "file_too_large"}:
        return HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(error))
    if error.code == "forbidden":
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    if error.code == "not_found":
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if error.code == "not_configured":
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="RustFS is not configured")
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="RustFS is unavailable")


@router.post("", response_model=AssetUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    file: UploadFile = File(description="PNG、JPEG、WebP 或 GIF 图片"),
    order_id: str | None = Form(default=None, max_length=128),
    current_user: User = Depends(get_current_user),
) -> AssetUploadResponse:
    """上传一张设计图片到当前用户的 RustFS 私有目录。

    输入：multipart 图片文件、可选订单号和 Bearer token。
    输出：素材 ID、对象键、大小、ETag 以及临时访问 URL。
    功能：校验图片类型和大小、自动创建桶、上传对象并返回可写入 design_data.assets 的引用。
    """
    content_type = (file.content_type or "application/octet-stream").lower()
    size = file.size
    if size is None:
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
    try:
        metadata = await upload_image_object(
            user_id=current_user.id,
            order_id=order_id,
            file_object=file.file,
            content_type=content_type,
            size=size,
        )
        url = await create_download_url(current_user.id, str(metadata["object_key"]))
    except ObjectStorageError as error:
        raise storage_http_exception(error) from error
    finally:
        await file.close()

    return AssetUploadResponse(
        **metadata,
        original_name=file.filename or "image",
        url=url,
        url_expires_in=Config.RUSTFS_PRESIGNED_URL_EXPIRES_SECONDS,
    )


@router.get("/info", response_model=AssetObjectResponse)
async def get_asset_info(
    object_key: str = Query(min_length=1, max_length=1024),
    current_user: User = Depends(get_current_user),
) -> AssetObjectResponse:
    """读取当前用户图片的 RustFS 元数据并生成临时访问 URL。"""
    try:
        metadata = await get_object_metadata(current_user.id, object_key)
        url = await create_download_url(current_user.id, object_key)
    except ObjectStorageError as error:
        raise storage_http_exception(error) from error
    return AssetObjectResponse(
        **metadata,
        url=url,
        url_expires_in=Config.RUSTFS_PRESIGNED_URL_EXPIRES_SECONDS,
    )


@router.get("/download-url")
async def get_asset_download_url(
    object_key: str = Query(min_length=1, max_length=1024),
    expires_in: int | None = Query(default=None, ge=60, le=604800),
    current_user: User = Depends(get_current_user),
) -> dict[str, str | int]:
    """为当前用户的私有图片生成限时下载 URL。"""
    try:
        url = await create_download_url(current_user.id, object_key, expires_in)
    except ObjectStorageError as error:
        raise storage_http_exception(error) from error
    return {"url": url, "expires_in": expires_in or Config.RUSTFS_PRESIGNED_URL_EXPIRES_SECONDS}


@router.get("/content")
async def stream_asset(
    object_key: str = Query(min_length=1, max_length=1024),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """通过后端鉴权后从 RustFS 流式返回图片，不把整张图片载入内存。"""
    try:
        response = await open_image_object(current_user.id, object_key)
    except ObjectStorageError as error:
        raise storage_http_exception(error) from error
    headers = {}
    if response.get("ContentLength") is not None:
        headers["Content-Length"] = str(response["ContentLength"])
    if response.get("ETag"):
        headers["ETag"] = response["ETag"]
    return StreamingResponse(
        iter_object_chunks(response["Body"]),
        media_type=response.get("ContentType") or "application/octet-stream",
        headers=headers,
    )


@router.delete("", response_model=AssetDeleteResponse)
async def delete_asset(
    object_key: str = Query(min_length=1, max_length=1024),
    current_user: User = Depends(get_current_user),
) -> AssetDeleteResponse:
    """永久删除当前用户 RustFS 目录中的指定图片。"""
    try:
        await delete_image_object(current_user.id, object_key)
    except ObjectStorageError as error:
        raise storage_http_exception(error) from error
    return AssetDeleteResponse(deleted=True, object_key=object_key)


@router.get("/health", response_model=StorageHealthResponse)
async def storage_health(current_user: User = Depends(get_current_user)) -> StorageHealthResponse:
    """检查后端能否使用当前配置访问 RustFS 桶。"""
    try:
        await check_rustfs_health()
    except ObjectStorageError as error:
        raise storage_http_exception(error) from error
    return StorageHealthResponse(status="ok", endpoint=Config.RUSTFS_ENDPOINT_URL, bucket=Config.RUSTFS_BUCKET)
