"""RBAC 写入规则与审计。

服务方法只 flush，不自行 commit；授权变更和审计记录由调用方在同一事务提交。
"""

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.normalizers import normalize_username
from app.core.rbac import is_system_admin_name
from app.core.security import hash_password
from app.models.rbac import Permission, RbacAudit, Role, user_roles
from app.models.users import User


async def lock_authorization(db: AsyncSession):
    """用事务级咨询锁串行处理授权写入，提交或回滚后自动释放。"""
    # 多 worker 不能只用进程内锁，否则两个请求可能同时移除各自认为的“另一名管理员”。
    if db.bind.dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(73482910)"))


def audit(db, actor_id, action, target, detail):
    """记录本次授权变更；调用方须先挑选字段，避免把密码写入 detail。"""
    db.add(
        RbacAudit(actor_id=actor_id, action=action, target=str(target), detail=detail)
    )


async def find_role(db, role_id):
    """读取角色最新状态，避免使用当前会话身份映射中已有的旧授权数据。"""
    role = await db.get(Role, role_id, populate_existing=True)
    if role is None:
        raise HTTPException(404, "角色不存在")
    return role


async def resolve_permissions(db, codes):
    """将权限码转换为目录对象；任一未知权限都会使整次请求失败。"""
    codes = set(codes)
    rows = list(
        (await db.scalars(select(Permission).where(Permission.code.in_(codes)))).all()
    )
    if {row.code for row in rows} != codes:
        raise HTTPException(422, "包含未知权限")
    return rows


async def resolve_roles(db, ids):
    """去重并校验全部角色 ID，避免部分有效的请求被误当作完整授权成功。"""
    ids = set(ids)
    rows = list((await db.scalars(select(Role).where(Role.id.in_(ids)))).all())
    if {row.id for row in rows} != ids:
        raise HTTPException(422, "包含未知角色")
    return rows


async def create_role(db, actor_id, payload):
    """创建自定义角色并记审计；编码重复或权限不存在时不保存部分结果。"""
    await lock_authorization(db)
    if await db.scalar(select(Role.id).where(Role.code == payload.code)):
        raise HTTPException(409, "角色编码已存在")
    if not payload.name.strip():
        raise HTTPException(422, "角色名称不能为空")
    role = Role(
        code=payload.code,
        name=payload.name.strip(),
        description=payload.description,
        permissions=await resolve_permissions(db, payload.permission_codes),
        is_system=False,
    )
    db.add(role)
    await db.flush()
    audit(db, actor_id, "role.create", role.id, payload.model_dump())
    return role


async def update_role(db, actor_id, role_id, payload):
    """替换角色权限，影响所有绑定该角色的用户；内置管理员不可修改。"""
    await lock_authorization(db)
    role = await find_role(db, role_id)
    if role.code == "admin":
        raise HTTPException(409, "内置管理员角色不可修改")
    if not payload.name.strip():
        raise HTTPException(422, "角色名称不能为空")
    role.permissions = await resolve_permissions(db, payload.permission_codes)
    role.name, role.description = payload.name.strip(), payload.description
    audit(db, actor_id, "role.update", role.id, payload.model_dump())
    await db.flush()
    return role


async def delete_role(db, actor_id, role_id):
    """仅删除未绑定用户的自定义角色，避免静默撤销一批用户的授权。"""
    await lock_authorization(db)
    role = await find_role(db, role_id)
    if role.is_system:
        raise HTTPException(409, "内置角色不可删除")
    if await db.scalar(
        select(func.count())
        .select_from(user_roles)
        .where(user_roles.c.role_id == role_id)
    ):
        raise HTTPException(409, "请先解除该角色与用户的关联")
    audit(db, actor_id, "role.delete", role.id, {"code": role.code, "name": role.name})
    await db.delete(role)
    await db.flush()


async def update_user_access(db, actor_id, user_id, payload):
    """替换用户角色和状态，并保证始终保留至少一名启用的内置管理员。"""
    await lock_authorization(db)
    user = await db.get(User, user_id, populate_existing=True)
    if user is None:
        raise HTTPException(404, "用户不存在")
    if user.is_system_admin:
        raise HTTPException(409, "专有 admin 账号不可通过管理接口停用或修改角色")
    roles = await resolve_roles(db, payload.role_ids)
    was_admin = user.is_active and any(role.code == "admin" for role in user.roles)
    stays_admin = payload.is_active and any(role.code == "admin" for role in roles)
    if was_admin and not stays_admin:
        # 只在本次操作会减少有效管理员时检查，统计与写入均处于上面的事务锁内。
        admin_count = await db.scalar(
            select(func.count(User.id))
            .join(user_roles)
            .join(Role)
            .where(User.is_active.is_(True), Role.code == "admin")
        )
        if admin_count <= 1:
            raise HTTPException(409, "至少保留一名启用的管理员")
    # 保存变更前后快照，便于定位谁在何时撤销了角色或停用了账号。
    before = {"role_ids": [role.id for role in user.roles], "is_active": user.is_active}
    user.roles, user.is_active = roles, payload.is_active
    audit(
        db,
        actor_id,
        "user.access.update",
        user.id,
        {"before": before, "after": payload.model_dump()},
    )
    await db.flush()
    return user


async def create_managed_user(db, actor_id, payload):
    """管理员创建用户并分配角色；密码仅保存哈希，审计中不记录密码。"""
    await lock_authorization(db)
    username = normalize_username(payload.username)
    if not username:
        raise HTTPException(422, "用户名不能为空")
    if is_system_admin_name(username):
        raise HTTPException(409, "admin 是系统初始化专用账号，不能在此创建")
    if await db.scalar(
        select(User.id).where(
            func.lower(func.trim(User.username)) == username.casefold()
        )
    ):
        raise HTTPException(409, "用户名已存在")
    user = User(
        username=username,
        password_hash=hash_password(payload.password),
        job_title=payload.job_title,
        is_active=True,
        roles=await resolve_roles(db, payload.role_ids),
    )
    db.add(user)
    await db.flush()
    audit(
        db,
        actor_id,
        "user.create",
        user.id,
        {"username": username, "role_ids": payload.role_ids},
    )
    await db.refresh(user)
    return user
