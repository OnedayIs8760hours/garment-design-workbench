from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_system_admin
from app.api.routes.assets import storage_http_exception
from app.config.db import get_async_db, get_redis
from app.services import oversight_service as service
from app.services.object_storage import ObjectStorageError, generated_image_owner, iter_object_chunks, open_image_object

# 整个路由组只开放给专有 admin；不提供跨用户修改或删除入口。
router = APIRouter(dependencies=[Depends(require_system_admin)])


@router.get("/designs")
async def designs(owner_id: int | None = Query(default=None, ge=1), q: str = Query(default="", max_length=128),
                  offset: int = Query(default=0, ge=0), limit: int = Query(default=30, ge=1, le=100),
                  db: AsyncSession = Depends(get_async_db)):
    return await service.list_designs(db, owner_id, q, offset, limit)


@router.get("/designs/{owner_id}/{template_id}")
async def design(owner_id: int, template_id: str, order_id: str = Query(min_length=1, max_length=128),
                 db: AsyncSession = Depends(get_async_db), redis: Redis = Depends(get_redis)):
    result = await service.read_design(db, redis, owner_id, template_id, order_id)
    if result is None:
        raise HTTPException(404, "设计不存在")
    return result


@router.get("/images")
async def images(owner_id: int | None = Query(default=None, ge=1), limit: int = Query(default=24, ge=1, le=100),
                 cursor: str | None = Query(default=None, max_length=2048), db: AsyncSession = Depends(get_async_db)):
    try:
        return await service.list_images(db, owner_id, limit, cursor)
    except ObjectStorageError as error:
        raise storage_http_exception(error) from error


@router.get("/images/content")
async def image_content(object_key: str = Query(min_length=1, max_length=1024)):
    # 只允许查看合法的生图图片键，不能借此读取桶中其他路径或 PSD 文件。
    owner_id = generated_image_owner(object_key)
    if owner_id is None:
        raise HTTPException(403, "不是有效的生成图片路径")
    try:
        response = await open_image_object(owner_id, object_key)
    except ObjectStorageError as error:
        raise storage_http_exception(error) from error
    headers = {"Cache-Control": "private, no-store"}
    if response.get("ContentLength") is not None:
        headers["Content-Length"] = str(response["ContentLength"])
    return StreamingResponse(iter_object_chunks(response["Body"]), media_type=response.get("ContentType") or "application/octet-stream", headers=headers)
