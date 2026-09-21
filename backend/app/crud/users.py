from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(
        select(User).where(
            func.lower(func.btrim(User.username)) == username.casefold(),
        )
    )
    return result.scalar_one_or_none()


async def get_active_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    *,
    username: str,
    password_hash: str,
    job_title: str | None,
) -> User:
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
    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)
    return user
