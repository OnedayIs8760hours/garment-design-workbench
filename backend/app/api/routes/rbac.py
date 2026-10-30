"""权限管理接口：处理输入、输出和外部会话失效，授权规则集中在 service 层。"""

from app.api.dependencies.auth import require_permission
from app.config.config import Config
from app.config.db import get_async_db, get_redis
from app.models.rbac import Permission, RbacAudit, Role
from app.models.users import User
from app.schemas.auth import RegisterRequest, UserResponse
from app.schemas.rbac import (
    AuditResponse,
    PermissionResponse,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
    UserAccessUpdate,
)
from app.services import rbac_service as service
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import Field
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()
# 每个接口都依赖同一个管理权限检查，隐藏前端入口不能代替这里的服务端校验。
manager = require_permission("rbac.manage")


class ManagedUserCreate(RegisterRequest):
    """管理员专用的创建用户请求；公开注册请求不接受 role_ids。"""

    role_ids: list[int] = Field(default_factory=list, max_length=100)


@router.get("/permissions", response_model=list[PermissionResponse])
async def permissions(
    db: AsyncSession = Depends(get_async_db), actor: User = Depends(manager)
):
    """返回服务器定义的可分配权限，供角色编辑器展示勾选项。"""
    return list((await db.scalars(select(Permission).order_by(Permission.code))).all())


@router.get("/roles", response_model=list[RoleResponse])
async def roles(
    db: AsyncSession = Depends(get_async_db), actor: User = Depends(manager)
):
    """返回角色和各自权限，不能通过本接口修改授权。"""
    return list((await db.scalars(select(Role).order_by(Role.id))).all())


@router.post("/roles", response_model=RoleResponse, status_code=201)
async def create_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_async_db),
    actor: User = Depends(manager),
):
    """创建自定义角色，服务层负责重复编码和未知权限校验。"""
    return await service.create_role(db, actor.id, payload)


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: AsyncSession = Depends(get_async_db),
    actor: User = Depends(manager),
):
    """整体替换角色的名称、说明和权限列表。"""
    return await service.update_role(db, actor.id, role_id, payload)


@router.delete("/roles/{role_id}", status_code=204)
async def delete_role(
    role_id: int,
    db: AsyncSession = Depends(get_async_db),
    actor: User = Depends(manager),
):
    """删除满足业务保护条件的角色，成功时返回无响应体的 204。"""
    await service.delete_role(db, actor.id, role_id)
    return Response(status_code=204)


@router.get("/users")
async def users(
    q: str = Query(default="", max_length=64),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    actor: User = Depends(manager),
):
    """按用户名搜索并分页返回用户，使用响应模型排除密码哈希等内部字段。"""
    condition = User.username.ilike(f"%{q.strip()}%")
    total = await db.scalar(select(func.count(User.id)).where(condition))
    items = (
        await db.scalars(
            select(User).where(condition).order_by(User.id).offset(offset).limit(limit)
        )
    ).all()
    return {
        "items": [UserResponse.model_validate(user) for user in items],
        "total": total,
    }


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    payload: ManagedUserCreate,
    db: AsyncSession = Depends(get_async_db),
    actor: User = Depends(manager),
):
    """创建账号并分配角色；该入口本身也要求管理权限。"""
    return await service.create_managed_user(db, actor.id, payload)


@router.put("/users/{user_id}/access", response_model=UserResponse)
async def update_access(
    user_id: int,
    payload: UserAccessUpdate,
    db: AsyncSession = Depends(get_async_db),
    actor: User = Depends(manager),
    redis: Redis = Depends(get_redis),
):
    """替换用户授权；停用时同时撤销会话，重新启用后必须重新登录。"""
    user = await service.update_user_access(db, actor.id, user_id, payload)
    if not payload.is_active:
        try:
            await redis.delete(Config.get_session_user_key(str(user_id)))
        except RedisError:
            # 抛出异常让数据库依赖回滚本次修改，避免会话失效失败却提示停用成功。
            raise HTTPException(503, "会话服务暂不可用，未保存账号状态") from None
    return user


@router.get("/audits", response_model=list[AuditResponse])
async def audits(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    actor: User = Depends(manager),
):
    """按最新记录优先分页展示授权变更，查询本身也要求管理权限。"""
    return list(
        (
            await db.scalars(
                select(RbacAudit)
                .order_by(RbacAudit.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )
