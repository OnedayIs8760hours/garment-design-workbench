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
    """提供一个带自动提交/回滚/关闭的异步数据库会话。

    输入：无；数据库连接参数来自 ``Config`` 环境配置。
    输出：FastAPI 依赖注入使用的 ``AsyncSession``。
    功能：请求成功时提交事务，发生异常时回滚，最后始终释放会话。
    """
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
    """创建并释放一个 Redis 客户端依赖。

    输入：无；主机、端口、密码和数据库编号来自 ``Config``。
    输出：FastAPI 依赖注入使用的 ``Redis`` 客户端。
    功能：为登录、会话校验和退出登录提供 Redis 连接，并在请求结束后关闭连接。
    """
    redis = Redis(**Config.get_redis_config())
    try:
        yield redis
    finally:
        await redis.aclose()
