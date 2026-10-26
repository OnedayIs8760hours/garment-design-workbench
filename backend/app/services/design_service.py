import json
from copy import deepcopy
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.config import Config
from app.crud.designs import (
    delete_design_draft,
    delete_design_drafts,
    get_design_draft,
    list_design_drafts,
    upsert_design_draft,
)
from app.models.designs import DesignDraft
from app.services.object_storage import ObjectStorageError, create_download_url


class DesignServiceError(Exception):
    """设计草稿业务异常。"""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def serialize_draft(draft: DesignDraft) -> dict[str, Any]:
    """将数据库草稿转换为 API/Redis 共用的普通字典。"""
    return {
        "template_id": draft.template_id,
        "order_id": draft.order_id,
        "template_version": draft.template_version,
        "design": draft.design_data,
        "created_at": draft.created_at,
        "updated_at": draft.updated_at,
    }


def serialize_draft_summary(draft: DesignDraft) -> dict[str, Any]:
    """将草稿转换为草稿箱列表所需的轻量摘要。"""
    return {
        "template_id": draft.template_id,
        "order_id": draft.order_id,
        "template_version": draft.template_version,
        "updated_at": draft.updated_at,
    }


async def list_user_design_drafts(
    db: AsyncSession,
    user_id: int,
    template_id: str | None = None,
) -> list[dict[str, Any]]:
    """返回当前用户的草稿箱列表，不返回大体积设计 JSON 和图片 data URL。"""
    drafts = await list_design_drafts(db, user_id, template_id)
    return [serialize_draft_summary(draft) for draft in drafts]


async def load_design_draft(
    db: AsyncSession,
    redis: Redis,
    user_id: int,
    template_id: str,
    order_id: str | None = None,
) -> dict[str, Any] | None:
    """读取设计草稿，优先使用 Redis，未命中时回源 PostgreSQL 并回填缓存。"""
    cache_key = Config.get_design_draft_key(str(user_id), template_id, order_id)
    try:
        cached = await redis.get(cache_key)
        if cached:
            return await attach_runtime_asset_urls(json.loads(cached), user_id)
    except (RedisError, json.JSONDecodeError):
        # 缓存不可用或内容损坏时继续读取数据库，不能阻塞设计恢复。
        pass

    draft = await get_design_draft(db, user_id, template_id, order_id)
    if draft is None:
        return None

    payload = serialize_draft(draft)
    try:
        await redis.set(cache_key, json.dumps(payload, default=_json_default), ex=Config.DESIGN_CACHE_TTL_SECONDS)
    except RedisError:
        pass
    return await attach_runtime_asset_urls(payload, user_id)


async def save_design_draft(
    db: AsyncSession,
    redis: Redis,
    user_id: int,
    template_id: str,
    order_id: str,
    template_version: int,
    design_data: dict[str, Any],
) -> dict[str, Any]:
    """先写入 PostgreSQL，再更新 Redis 缓存，返回持久化后的草稿。"""
    persistent_design_data = strip_runtime_asset_data(design_data)
    draft = await upsert_design_draft(
        db,
        user_id=user_id,
        template_id=template_id,
        order_id=order_id,
        template_version=template_version,
        design_data=persistent_design_data,
    )
    payload = serialize_draft(draft)
    try:
        await redis.set(
            Config.get_design_draft_key(str(user_id), template_id, order_id),
            json.dumps(payload, default=_json_default),
            ex=Config.DESIGN_CACHE_TTL_SECONDS,
        )
    except RedisError:
        # 数据库已经保存成功，下一次读取会回源数据库并尝试回填缓存。
        pass
    return await attach_runtime_asset_urls(payload, user_id)


def strip_runtime_asset_data(design_data: dict[str, Any]) -> dict[str, Any]:
    """移除不应写入 PostgreSQL/Redis 的图片内容和临时签名 URL。

    输入：前端提交的完整设计状态。
    输出：适合写入 JSONB 的独立副本。
    功能：对象存储素材只保留 ``objectKey`` 等引用；内部纯色素材只保留颜色和尺寸，
    从而保证 ``design_data`` 不再包含 Base64 图片或会过期的 URL。
    """
    persistent = deepcopy(design_data)
    for asset in persistent.get("assets") or []:
        if not isinstance(asset, dict):
            continue
        asset.pop("dataUrl", None)
        asset.pop("url", None)
    return persistent


async def attach_runtime_asset_urls(payload: dict[str, Any], user_id: int) -> dict[str, Any]:
    """为数据库中的 RustFS 对象引用附加临时 URL，仅用于本次 API 响应。"""
    hydrated = deepcopy(payload)
    design = hydrated.get("design") or {}
    for asset in design.get("assets") or []:
        if not isinstance(asset, dict):
            continue
        object_key = asset.get("objectKey") or asset.get("object_key")
        if not object_key:
            continue
        try:
            asset["dataUrl"] = await create_download_url(user_id, str(object_key))
        except ObjectStorageError:
            # 单个素材不可用不应阻止整份草稿恢复；前端会显示该素材缺失。
            asset["storageUnavailable"] = True
    return hydrated


async def remove_design_draft(
    db: AsyncSession,
    redis: Redis,
    user_id: int,
    template_id: str,
    order_id: str,
) -> bool:
    """删除数据库草稿，并清除订单缓存和该模板的最近草稿缓存。"""
    deleted = await delete_design_draft(db, user_id, template_id, order_id)
    try:
        await redis.delete(
            Config.get_design_draft_key(str(user_id), template_id, order_id),
            Config.get_design_draft_key(str(user_id), template_id),
        )
    except RedisError:
        # 数据库删除已经成功，缓存会在到期后自然失效。
        pass
    return deleted


async def remove_design_drafts(
    db: AsyncSession,
    redis: Redis,
    user_id: int,
    draft_keys: list[tuple[str, str]],
) -> int:
    """批量删除数据库草稿并清除涉及的订单缓存和最近草稿缓存。"""
    unique_draft_keys = list(dict.fromkeys(draft_keys))
    deleted_count = await delete_design_drafts(db, user_id, unique_draft_keys)
    cache_keys = {
        cache_key
        for template_id, order_id in unique_draft_keys
        for cache_key in (
            Config.get_design_draft_key(str(user_id), template_id, order_id),
            Config.get_design_draft_key(str(user_id), template_id),
        )
    }
    if cache_keys:
        try:
            await redis.delete(*cache_keys)
        except RedisError:
            pass
    return deleted_count


def _json_default(value: Any) -> str:
    """将数据库时间转换为 JSON 字符串。"""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")
