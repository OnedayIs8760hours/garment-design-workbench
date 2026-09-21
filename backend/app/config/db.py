"""
数据库配置，包括 SQLAlchemy 异步会话和 Redis 连接
"""

from collections.abc import AsyncIterator

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config.config import Config

engine = create_async_engine(
    Config.get_database_url(),
    echo=Config.DATABASE_ECHO,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_async_db() -> AsyncIterator[AsyncSession]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_redis() -> AsyncIterator[Redis]:
    redis = Redis(**Config.get_redis_config())
    try:
        yield redis
    finally:
        await redis.aclose()
