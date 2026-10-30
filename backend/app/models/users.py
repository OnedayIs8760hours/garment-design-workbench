from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Identity,
    Integer,
    String,
    Text,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.rbac import Role, user_roles
from app.core.rbac import is_system_admin_name


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        Identity(always=True),
        primary_key=True,
    )
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    job_title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    roles: Mapped[list[Role]] = relationship(secondary=user_roles, lazy="selectin")

    @property
    def is_system_admin(self) -> bool:
        """标识不可通过普通用户管理入口停用或撤权的专有 admin 账号。"""
        return is_system_admin_name(self.username)

    @property
    def permissions(self) -> list[str]:
        """合并当前角色的权限并去重；不将角色名或权限列表固化进 JWT。"""
        return sorted(
            {permission.code for role in self.roles for permission in role.permissions}
        )
