from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.designs import DesignDraft


async def get_design_draft(
    db: AsyncSession,
    user_id: int,
    template_id: str,
    order_id: str | None = None,
) -> DesignDraft | None:
    """查询用户在指定模板下的草稿；未指定订单号时返回最近更新的一份。"""
    filters = [DesignDraft.user_id == user_id, DesignDraft.template_id == template_id]
    if order_id:
        filters.append(DesignDraft.order_id == order_id)
    result = await db.execute(
        select(DesignDraft).where(*filters).order_by(DesignDraft.updated_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def upsert_design_draft(
    db: AsyncSession,
    *,
    user_id: int,
    template_id: str,
    order_id: str,
    template_version: int,
    design_data: dict[str, Any],
) -> DesignDraft:
    """创建或更新用户在指定模板下的设计草稿。"""
    draft = await get_design_draft(db, user_id, template_id, order_id)
    if draft is None:
        draft = DesignDraft(
            user_id=user_id,
            template_id=template_id,
            order_id=order_id,
            template_version=template_version,
            design_data=design_data,
        )
        db.add(draft)
    else:
        draft.template_version = template_version
        draft.design_data = design_data

    await db.commit()
    await db.refresh(draft)
    return draft


async def list_design_drafts(
    db: AsyncSession,
    user_id: int,
    template_id: str | None = None,
) -> list[DesignDraft]:
    """按更新时间倒序查询用户草稿箱。"""
    filters = [DesignDraft.user_id == user_id]
    if template_id:
        filters.append(DesignDraft.template_id == template_id)
    result = await db.execute(
        select(DesignDraft).where(*filters).order_by(DesignDraft.updated_at.desc())
    )
    return list(result.scalars().all())
