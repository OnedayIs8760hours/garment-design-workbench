import json
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.config import Config
from app.crud.designs import get_design_draft, list_design_drafts, upsert_design_draft
from app.models.designs import DesignDraft


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
            return json.loads(cached)
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
    return payload


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
    draft = await upsert_design_draft(
        db,
        user_id=user_id,
        template_id=template_id,
        order_id=order_id,
        template_version=template_version,
        design_data=design_data,
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
    return payload


def _json_default(value: Any) -> str:
    """将数据库时间转换为 JSON 字符串。"""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")
