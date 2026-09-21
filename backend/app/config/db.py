from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession, create_async_engine
from redis.asyncio import Redis

DATABASE_URL = "postgresql+asyncpg://user:password@localhost/dbname"

engine = create_async_engine(
    DATABASE_URL, 
    echo=True

    )

async_session = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
    )

async def get_async_db() :
    async with async_session() as session:
        try:
            yield session
            await session.commit()  
        except Exception:
            await session.rollback()
            raise  # 重新抛出异常以便上层处理
        finally:
            await session.close()  # 关闭会话，释放资源


async def get_redis():
    redis = Redis(host='localhost', port=6379, db=0)
    try:
        yield redis
    finally:
        await redis.close()