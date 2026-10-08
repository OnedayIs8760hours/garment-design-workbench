from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.config.db import get_async_db, get_redis
from app.models.users import User
from app.schemas.designs import (
    DesignDraftBatchDeleteRequest,
    DesignDraftBatchDeleteResponse,
    DesignDraftResponse,
    DesignDraftSummary,
    DesignDraftUpsertRequest,
)
from app.services.design_service import (
    DesignServiceError,
    list_user_design_drafts,
    load_design_draft,
    remove_design_draft,
    remove_design_drafts,
    save_design_draft,
)


router = APIRouter()


def design_service_exception(error: DesignServiceError) -> HTTPException:
    """把设计草稿服务错误映射为 HTTP 异常。"""
    if error.code == "cache_unavailable":
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Design cache service is unavailable",
        )
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Design request failed")


@router.delete("", response_model=DesignDraftBatchDeleteResponse)
async def delete_designs(
    payload: DesignDraftBatchDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
    redis: Redis = Depends(get_redis),
) -> dict[str, int]:
    """批量删除当前用户选中的草稿，最多一次删除 100 份。"""
    draft_keys = [(draft.template_id, draft.order_id) for draft in payload.drafts]
    deleted_count = await remove_design_drafts(db, redis, current_user.id, draft_keys)
    return {"deleted_count": deleted_count}


@router.get("", response_model=list[DesignDraftSummary])
async def list_designs(
    template_id: str | None = Query(default=None, min_length=1, max_length=128),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> list[dict]:
    """读取当前用户的个人草稿箱摘要列表。

    输入：可选模板 ID 和 Bearer token。
    输出：按最近更新时间倒序排列的订单号、模板和更新时间列表。
    功能：只返回轻量摘要，打开具体草稿时再读取完整 JSON。
    """
    return await list_user_design_drafts(db, current_user.id, template_id)


@router.get("/{template_id}", response_model=DesignDraftResponse | None)
async def get_design(
    template_id: str,
    order_id: str | None = Query(default=None, min_length=1, max_length=128),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
    redis: Redis = Depends(get_redis),
) -> dict | None:
    """读取当前用户指定模板的设计草稿。

    输入：路径参数 ``template_id`` 和 Bearer token。
    输出：已有草稿时返回设计 JSON 和保存时间；没有草稿时返回 ``null``。
    功能：按订单号读取指定草稿；不传订单号时读取该模板最近更新的草稿。
    """
    return await load_design_draft(db, redis, current_user.id, template_id, order_id)


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
    功能：以用户、模板和订单号为唯一键 upsert 到 PostgreSQL，再更新 Redis 缓存。
    """
    design = payload.design
    if design.get("templateId") != template_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Template ID does not match design")
    order_id = str(design.get("orderId") or "").strip()
    if not order_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Design order ID is required")

    try:
        return await save_design_draft(
            db,
            redis,
            current_user.id,
            template_id,
            order_id,
            int(design.get("templateVersion") or 1),
            design,
        )
    except DesignServiceError as error:
        raise design_service_exception(error) from error


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_design(
    template_id: str,
    order_id: str = Query(min_length=1, max_length=128),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
    redis: Redis = Depends(get_redis),
) -> None:
    """永久删除当前用户指定模板和订单号的草稿。"""
    deleted = await remove_design_draft(db, redis, current_user.id, template_id, order_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Design draft not found")
