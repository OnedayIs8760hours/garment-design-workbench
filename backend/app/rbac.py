"""可重复执行的 RBAC 表结构初始化，以及显式的管理员授权命令。

python -m app.rbac migrate
python -m app.rbac bootstrap-admin --username existing-account

迁移保留已有业务数据；不会自动将某个新注册用户提升为管理员。
"""

import argparse
import asyncio
from pathlib import Path

from dotenv import dotenv_values

from sqlalchemy import insert, literal, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.db import engine
from app.core.rbac import BUILTIN_ROLES, PERMISSIONS, SYSTEM_ADMIN_USERNAME
from app.core.security import hash_password
from app.config.config import Config
from app.crud.users import get_user_by_username
from app.models.base import Base
from app.models.designs import DesignDraft  # noqa: F401 -- register tables before create_all
from app.models.rbac import Permission, RbacMigration, Role, user_roles
from app.models.users import User
from app.services.rbac_service import audit, lock_authorization


async def initialize_system_admin(db, password):
    """首次创建保留账号；已有初始化记录时只检查完整性，不覆盖密码。"""
    marker = await db.get(RbacMigration, "v2-dedicated-admin")
    user = await get_user_by_username(db, SYSTEM_ADMIN_USERNAME)
    if marker is not None:
        if (
            user is None
            or not user.is_active
            or not any(role.code == "admin" for role in user.roles)
        ):
            raise ValueError("专有 admin 账号状态异常，请通过服务器管理权限检查")
        return
    if user is not None:
        # 不能把历史上自行注册的同名账号直接提升为最高权限者。
        raise ValueError("admin 名称已被已有账号占用，请先处理同名账号再执行初始化")
    role = await db.scalar(select(Role).where(Role.code == "admin"))
    user = User(
        username=SYSTEM_ADMIN_USERNAME,
        password_hash=hash_password(password),
        job_title="系统最高权限者",
        is_active=True,
        roles=[role],
    )
    db.add(user)
    await db.flush()
    db.add(RbacMigration(version="v2-dedicated-admin"))
    audit(db, None, "admin.initialize", user.id, {"username": SYSTEM_ADMIN_USERNAME})


async def migrate(bind, admin_password=None):
    """创建缺失表、补充权限目录，并执行尚未完成的一次性角色回填。"""
    if admin_password is not None and (
        not admin_password.strip() or not 8 <= len(admin_password) <= 128
    ):
        raise ValueError("初始化管理员密码须为 8 至 128 位非空字符")
    async with bind.begin() as connection:
        if bind.dialect.name == "postgresql":
            # 与授权写入使用同一把锁，避免多实例同时启动时重复初始化或互相覆盖。
            await connection.execute(text("SELECT pg_advisory_xact_lock(73482910)"))
        # create_all 只创建缺失的表，不负责修改已有表的列结构。
        await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(bind=connection, expire_on_commit=False) as db:
            for code, (name, description) in PERMISSIONS.items():
                if await db.get(Permission, code) is None:
                    db.add(Permission(code=code, name=name, description=description))
            await db.flush()
            for code, (name, permissions) in BUILTIN_ROLES.items():
                existing_role = await db.scalar(select(Role).where(Role.code == code))
                if existing_role is None:
                    grants = list(
                        (
                            await db.scalars(
                                select(Permission).where(
                                    Permission.code.in_(permissions)
                                )
                            )
                        ).all()
                    )
                    db.add(
                        Role(
                            code=code,
                            name=name,
                            description="内置角色",
                            is_system=True,
                            permissions=grants,
                        )
                    )
                elif code == "admin":
                    # 管理员角色不可编辑，因此新增权限自动补给管理员；其他角色保留配置。
                    granted = {
                        permission.code for permission in existing_role.permissions
                    }
                    additions = await db.scalars(
                        select(Permission).where(
                            Permission.code.in_(permissions - granted)
                        )
                    )
                    existing_role.permissions.extend(additions.all())
            await db.flush()
            # 仅首次升级回填当时已有的无角色账号，后续不能把管理员撤销的角色重新加回。
            if await db.get(RbacMigration, "v1-existing-users") is None:
                designer_id = await db.scalar(
                    select(Role.id).where(Role.code == "designer")
                )
                existing = select(User.id, literal(designer_id)).where(
                    ~select(user_roles.c.user_id)
                    .where(user_roles.c.user_id == User.id)
                    .exists()
                )
                await db.execute(
                    insert(user_roles).from_select(["user_id", "role_id"], existing)
                )
                db.add(RbacMigration(version="v1-existing-users"))
            await db.flush()
            if admin_password is not None:
                await initialize_system_admin(db, admin_password)
                await db.flush()


async def bootstrap_admin(username):
    """为明确指定的启用账号追加管理员角色；重复执行不重复授权或记审计。"""
    async with AsyncSession(engine, expire_on_commit=False) as db, db.begin():
        await lock_authorization(db)
        user = await get_user_by_username(db, username.strip())
        if user is None or not user.is_active:
            raise ValueError("请先创建该账号，并确保账号处于启用状态")
        role = await db.scalar(select(Role).where(Role.code == "admin"))
        if all(item.id != role.id for item in user.roles):
            user.roles.append(role)
            audit(db, user.id, "admin.bootstrap", user.id, {"username": user.username})
    print("管理员授权完成")


async def main():
    """先确保迁移完成，再执行可选的管理员初始化，结束时释放数据库连接池。"""
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    migration = sub.add_parser("migrate")
    migration.add_argument(
        "--admin-env-file", type=Path, help="包含 RBAC_ADMIN_PASSWORD 明文的初始化文件"
    )
    bootstrap = sub.add_parser("bootstrap-admin")
    bootstrap.add_argument("--username", required=True)
    args = parser.parse_args()
    try:
        password = Config.RBAC_ADMIN_PASSWORD or None
        if getattr(args, "admin_env_file", None) is not None:
            if not args.admin_env_file.is_file():
                raise ValueError("管理员初始化文件不存在")
            password = dotenv_values(args.admin_env_file).get("RBAC_ADMIN_PASSWORD")
            if not password:
                raise ValueError("初始化文件必须填写 RBAC_ADMIN_PASSWORD")
        await migrate(engine, admin_password=password)
        if args.command == "bootstrap-admin":
            await bootstrap_admin(args.username)
        else:
            print("RBAC migration completed")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
