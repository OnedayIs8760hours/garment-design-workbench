"""角色、权限、多对多关联及授权审计的数据结构。"""

from datetime import datetime

from app.models.base import Base
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

# 联合主键防止重复授权；删除实体时清理关联，不会级联删除另一端实体。
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "permission_code",
        ForeignKey("permissions.code", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Permission(Base):
    """以稳定权限码作为主键，名称和说明仅用于管理页面展示。"""

    __tablename__ = "permissions"
    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(255))


class Role(Base):
    """角色是一组权限；is_system 表示内置角色，删除限制由业务层执行。"""

    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(255), default="")
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    # 预先批量读取权限，避免异步请求序列化时再触发隐式数据库查询。
    permissions: Mapped[list[Permission]] = relationship(
        secondary=role_permissions, lazy="selectin"
    )


class RbacMigration(Base):
    """记录已完成的一次性数据升级，防止重启时恢复被撤销的用户授权。"""

    __tablename__ = "rbac_migrations"
    version: Mapped[str] = mapped_column(String(64), primary_key=True)


class RbacAudit(Base):
    """授权变更记录；操作者删除后保留记录，actor_id 置空。"""

    __tablename__ = "rbac_audits"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(String(128))
    # 业务层只写入角色、状态等授权信息，不能直接保存含密码的创建用户请求。
    detail: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
