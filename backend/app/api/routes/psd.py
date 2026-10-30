from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.asyncio import Redis

from app.api.dependencies.auth import get_current_user, require_permission
from app.config.config import Config
from app.config.db import get_redis
from app.models.users import User
from app.schemas.psd import (
    PsdPartUploadResponse,
    PsdUploadAbortResponse,
    PsdUploadCompleteResponse,
    PsdUploadInitRequest,
    PsdUploadInitResponse,
    PsdUploadStatusResponse,
)
from app.services.object_storage import create_download_url
from app.services.psd_upload import (
    PsdUploadError,
    abort_psd_multipart,
    build_psd_object_key,
    complete_psd_multipart,
    compute_part_layout,
    create_psd_multipart_upload,
    delete_psd_session,
    load_psd_session,
    record_psd_part,
    save_psd_session,
    upload_psd_part,
)

router = APIRouter(dependencies=[Depends(require_permission("psd.upload"))])


def psd_http_exception(error: PsdUploadError) -> HTTPException:
    """把服务层错误统一转成稳定的 HTTP 响应。"""
    if error.code == "empty_file":
        return HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(error))
    if error.code == "file_too_large":
        return HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(error))
    if error.code == "unsupported_type":
        return HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(error))
    if error.code == "part_out_of_range":
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))
    if error.code == "part_too_large":
        return HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(error))
    if error.code == "forbidden":
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    if error.code in {"not_found", "upload_expired"}:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if error.code == "not_configured":
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="RustFS is not configured")
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="PSD upload service is unavailable")


@router.post("/uploads", response_model=PsdUploadInitResponse, status_code=status.HTTP_201_CREATED)
async def create_upload_session(
    payload: PsdUploadInitRequest,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> PsdUploadInitResponse:
    """为即将上传的 PSD 开启一个 S3 Multipart 上传会话。

    输入：文件名、文件大小、可选订单号与自定义分片大小。
    输出：session_id、S3 upload_id、对象键与客户端切片所需的 part_size/total_parts。
    功能：校验类型与大小，开启 RustFS multipart，把会话状态写入 Redis 供后续分片与断点续传使用。
    """
    filename = payload.filename[:255]
    if not filename.lower().endswith(".psd"):
        raise psd_http_exception(PsdUploadError("unsupported_type", "Only .psd files are supported"))
    if payload.size <= 0:
        raise psd_http_exception(PsdUploadError("empty_file", "Uploaded PSD is empty"))
    if payload.size > Config.RUSTFS_MAX_PSD_UPLOAD_BYTES:
        raise psd_http_exception(
            PsdUploadError("file_too_large", f"PSD exceeds the configured size limit ({Config.RUSTFS_MAX_PSD_UPLOAD_BYTES} bytes)")
        )

    content_type = (payload.content_type or "application/octet-stream").lower()
    asset_id, object_key = build_psd_object_key(current_user.id, payload.order_id, payload.asset_id)
    part_size, total_parts = compute_part_layout(payload.size, payload.part_size)

    upload_id = await create_psd_multipart_upload(
        object_key=object_key,
        content_type=content_type,
        asset_id=asset_id,
        user_id=current_user.id,
    )

    session_id = asset_id  # 用不可预测的 asset_id 充当会话标识，避免与 upload_id 混用
    session = {
        "session_id": session_id,
        "owner_user_id": current_user.id,
        "bucket": Config.RUSTFS_BUCKET,
        "object_key": object_key,
        "upload_id": upload_id,
        "asset_id": asset_id,
        "original_name": filename,
        "content_type": content_type,
        "size": payload.size,
        "part_size": part_size,
        "total_parts": total_parts,
        "parts": [],
    }
    await save_psd_session(redis, session)

    return PsdUploadInitResponse(
        session_id=session_id,
        upload_id=upload_id,
        object_key=object_key,
        bucket=session["bucket"],
        asset_id=asset_id,
        original_name=filename,
        content_type=content_type,
        size=payload.size,
        part_size=part_size,
        total_parts=total_parts,
    )


@router.put("/uploads/{session_id}/parts/{part_number}", response_model=PsdPartUploadResponse)
async def upload_part(
    session_id: str,
    part_number: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> PsdPartUploadResponse:
    """上传单个分片。body 为该分片的原始字节；可被前端并发调用。

    输入：session_id、分片序号和原始字节。
    输出：该分片 ETag 与当前进度。
    功能：校验会话归属、分片范围与大小，上传到 RustFS 并把 ETag 记回会话供断点续传。
    """
    session = await load_psd_session(redis, session_id)
    if session is None:
        raise psd_http_exception(PsdUploadError("not_found", "PSD upload session was not found or expired"))
    if session["owner_user_id"] != current_user.id:
        raise psd_http_exception(PsdUploadError("forbidden", "Session does not belong to current user"))
    if not 1 <= part_number <= session["total_parts"]:
        raise psd_http_exception(PsdUploadError("part_out_of_range", f"part_number must be in [1, {session['total_parts']}]"))

    data = await request.body()
    if len(data) < 1:
        raise psd_http_exception(PsdUploadError("empty_file", "Uploaded part is empty"))
    if len(data) > session["part_size"]:
        raise psd_http_exception(PsdUploadError("part_too_large", "Uploaded part exceeds the configured part size"))

    etag = await upload_psd_part(
        bucket=session["bucket"],
        object_key=session["object_key"],
        upload_id=session["upload_id"],
        part_number=part_number,
        data=data,
    )
    updated = await record_psd_part(redis, session_id, part_number, etag)

    return PsdPartUploadResponse(
        part_number=part_number,
        etag=etag,
        uploaded_parts=len(updated["parts"]),
        total_parts=session["total_parts"],
    )


@router.get("/uploads/{session_id}", response_model=PsdUploadStatusResponse)
async def get_upload_status(
    session_id: str,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> PsdUploadStatusResponse:
    """查询分片上传进度，客户端据此断点续传已完成的片段。"""
    session = await load_psd_session(redis, session_id)
    if session is None:
        raise psd_http_exception(PsdUploadError("not_found", "PSD upload session was not found or expired"))
    if session["owner_user_id"] != current_user.id:
        raise psd_http_exception(PsdUploadError("forbidden", "Session does not belong to current user"))

    parts = sorted(session.get("parts", []), key=lambda part: part["PartNumber"])
    total_parts = session["total_parts"]
    complete = {part["PartNumber"] for part in parts} == set(range(1, total_parts + 1))

    return PsdUploadStatusResponse(
        session_id=session_id,
        object_key=session["object_key"],
        size=session["size"],
        part_size=session["part_size"],
        total_parts=total_parts,
        completed_parts=[{"part_number": part["PartNumber"], "etag": part["ETag"]} for part in parts],
        complete=complete,
    )


@router.post("/uploads/{session_id}/complete", response_model=PsdUploadCompleteResponse)
async def complete_upload(
    session_id: str,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> PsdUploadCompleteResponse:
    """把所有已上传分片合并为最终 PSD 对象。"""
    session = await load_psd_session(redis, session_id)
    if session is None:
        raise psd_http_exception(PsdUploadError("not_found", "PSD upload session was not found or expired"))
    if session["owner_user_id"] != current_user.id:
        raise psd_http_exception(PsdUploadError("forbidden", "Session does not belong to current user"))

    parts = session.get("parts", [])
    total_parts = session["total_parts"]
    if {part["PartNumber"] for part in parts} != set(range(1, total_parts + 1)):
        raise psd_http_exception(
            PsdUploadError("part_out_of_range", f"Not all parts uploaded yet ({len(parts)}/{total_parts})")
        )

    complete_etag = await complete_psd_multipart(
        bucket=session["bucket"],
        object_key=session["object_key"],
        upload_id=session["upload_id"],
        parts=parts,
    )
    url = await create_download_url(current_user.id, session["object_key"])
    await delete_psd_session(redis, session_id)

    return PsdUploadCompleteResponse(
        asset_id=session["asset_id"],
        object_key=session["object_key"],
        bucket=session["bucket"],
        original_name=session["original_name"],
        content_type=session["content_type"],
        size=session["size"],
        etag=complete_etag,
        url=url,
        url_expires_in=Config.RUSTFS_PRESIGNED_URL_EXPIRES_SECONDS,
    )


@router.delete("/uploads/{session_id}", response_model=PsdUploadAbortResponse)
async def abort_upload(
    session_id: str,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> PsdUploadAbortResponse:
    """中止未完成的上传，删除已上传的分片并清理会话。"""
    session = await load_psd_session(redis, session_id)
    if session is None:
        raise psd_http_exception(PsdUploadError("not_found", "PSD upload session was not found or expired"))
    if session["owner_user_id"] != current_user.id:
        raise psd_http_exception(PsdUploadError("forbidden", "Session does not belong to current user"))

    await abort_psd_multipart(
        bucket=session["bucket"],
        object_key=session["object_key"],
        upload_id=session["upload_id"],
    )
    await delete_psd_session(redis, session_id)
    return PsdUploadAbortResponse(aborted=True, object_key=session["object_key"])
