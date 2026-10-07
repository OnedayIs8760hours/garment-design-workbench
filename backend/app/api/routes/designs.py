from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.config.db import get_async_db, get_redis
from app.models.users import User
from app.schemas.designs import DesignDraftResponse, DesignDraftUpsertRequest
from app.services.design_service import DesignServiceError, load_design_draft, save_design_draft


router = APIRouter()


def design_service_exception(error: DesignServiceError) -> HTTPException:
    """把设计草稿服务错误映射为 HTTP 异常。"""
    if error.code == "cache_unavailable":
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Design cache service is unavailable",
        )
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Design request failed")


@router.get("/{template_id}", response_model=DesignDraftResponse | None)
async def get_design(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
    redis: Redis = Depends(get_redis),
) -> dict | None:
    """读取当前用户指定模板的设计草稿。

    输入：路径参数 ``template_id`` 和 Bearer token。
    输出：已有草稿时返回设计 JSON 和保存时间；没有草稿时返回 ``null``。
    功能：优先读取 Redis，缓存未命中时查询 PostgreSQL 并回填缓存。
    """
    return await load_design_draft(db, redis, current_user.id, template_id)


@router.put("/{template_id}", response_model=DesignDraftResponse)
async def put_design(
    template_id: str,
    payload: DesignDraftUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
    redis: Redis = Depends(get_redis),
) -> dict:
    """保存当前用户指定模板的设计草稿。

    输入：路径参数 ``template_id``、包含完整设计 JSON 的请求体和 Bearer token。
    输出：保存后的设计 JSON、模板版本和 PostgreSQL 创建/更新时间。
    功能：以用户和模板为唯一键 upsert 到 PostgreSQL，再更新 Redis 缓存。
    """
    design = payload.design
    if design.get("templateId") != template_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Template ID does not match design")

    try:
        return await save_design_draft(
            db,
            redis,
            current_user.id,
            template_id,
            int(design.get("templateVersion") or 1),
            design,
        )
    except DesignServiceError as error:
        raise design_service_exception(error) from error
