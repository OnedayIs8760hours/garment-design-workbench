from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.designs import DesignDraft


async def get_design_draft(db: AsyncSession, user_id: int, template_id: str) -> DesignDraft | None:
    """查询用户在指定模板下的设计草稿。"""
    result = await db.execute(
        select(DesignDraft).where(
            DesignDraft.user_id == user_id,
            DesignDraft.template_id == template_id,
        )
    )
    return result.scalar_one_or_none()


async def upsert_design_draft(
    db: AsyncSession,
    *,
    user_id: int,
    template_id: str,
    template_version: int,
    design_data: dict[str, Any],
) -> DesignDraft:
    """创建或更新用户在指定模板下的设计草稿。"""
    draft = await get_design_draft(db, user_id, template_id)
    if draft is None:
        draft = DesignDraft(
            user_id=user_id,
            template_id=template_id,
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
