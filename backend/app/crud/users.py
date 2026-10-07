from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User

"""用户相关的 CRUD 操作"""
async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    """按忽略大小写且去除首尾空格后的用户名查询用户。

    输入：异步数据库会话和已规范化用户名。
    输出：匹配的 ``User``，找不到时返回 ``None``。
    功能：供注册重复检查和登录凭据查询使用。
    """
    result = await db.execute(
        select(User).where(
            func.lower(func.btrim(User.username)) == username.casefold(),
        )
    )
    return result.scalar_one_or_none()


async def get_active_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    """按 ID 查询启用状态的用户。

    输入：异步数据库会话和用户 ID。
    输出：启用的 ``User``，找不到或已停用时返回 ``None``。
    功能：供认证依赖确认 token 对应账号仍可使用。
    """
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()

# * 后面的参数必须使用“关键字参数”传递，不能按位置传递
async def create_user(
    db: AsyncSession,
    *,
    username: str,
    password_hash: str,
    job_title: str | None,
) -> User:
    """创建并提交用户记录。

    输入：数据库会话、用户名、已哈希密码和可选职位（关键字参数）。
    输出：提交并刷新后的 ``User`` 对象。
    功能：写入 users 表；唯一约束冲突由 service 层转换为业务错误。
    """
    user = User(
        username=username,
        password_hash=password_hash,
        job_title=job_title,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_last_login(db: AsyncSession, user: User) -> User:
    """更新用户最后登录时间并持久化。

    输入：数据库会话和待更新的 ``User`` 对象。
    输出：刷新后的 ``User`` 对象。
    功能：记录成功登录时间，供用户资料和审计使用。
    """
    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)
    return user
