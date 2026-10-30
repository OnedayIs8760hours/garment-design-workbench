"""最高权限者的只读内容查询；个人编辑、保存和删除接口继续按当前用户隔离。"""
from sqlalchemy import func, or_, select

from app.models.designs import DesignDraft
from app.models.users import User
from app.services import object_storage
from app.services.design_service import load_design_draft, serialize_draft_summary


async def list_designs(db, owner_id, query, offset, limit):
    filters = []
    if owner_id is not None:
        filters.append(DesignDraft.user_id == owner_id)
    if query.strip():
        pattern = f"%{query.strip()}%"
        filters.append(or_(DesignDraft.order_id.ilike(pattern), User.username.ilike(pattern)))
    joined = select(DesignDraft, User.username).join(User, User.id == DesignDraft.user_id).where(*filters)
    total = await db.scalar(select(func.count()).select_from(joined.subquery()))
    rows = (await db.execute(joined.order_by(DesignDraft.updated_at.desc(), DesignDraft.id.desc()).offset(offset).limit(limit))).all()
    return {"items": [{**serialize_draft_summary(draft), "owner_user_id": draft.user_id, "owner_username": username} for draft, username in rows], "total": total}


async def read_design(db, redis, owner_id, template_id, order_id):
    # 使用制作者自己的缓存命名空间和素材签名归属，不能把同单号的不同用户草稿混在一起。
    owner = await db.get(User, owner_id)
    if owner is None:
        return None
    result = await load_design_draft(db, redis, owner_id, template_id, order_id)
    return None if result is None else {**result, "owner_user_id": owner_id, "owner_username": owner.username}


async def list_images(db, owner_id, limit, cursor):
    if owner_id is not None:
        result = await object_storage.list_generated_images(owner_id, limit, cursor)
        for item in result["items"]:
            item["owner_user_id"] = owner_id
    else:
        items, current = [], cursor
        # 全桶的用户目录也包含普通上传文件。分段扫描生成目录，限制一次请求的工作量。
        for _ in range(8):
            page = await object_storage.list_generated_images(None, limit - len(items), current)
            items.extend(page["items"])
            next_cursor = page["next_cursor"]
            if next_cursor and next_cursor == current:
                raise object_storage.ObjectStorageError("unavailable", "Storage cursor did not advance")
            current = next_cursor
            if len(items) >= limit or not current:
                break
        result = {"items": items, "next_cursor": current}
    ids = {item["owner_user_id"] for item in result["items"]}
    owners = dict((await db.execute(select(User.id, User.username).where(User.id.in_(ids)))).all())
    for item in result["items"]:
        item["owner_username"] = owners.get(item["owner_user_id"], f"用户 #{item['owner_user_id']}")
    return result
