import os

from dotenv import load_dotenv


load_dotenv()


class Config:
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:123456@127.0.0.1:5432/oline_design")
    DATABASE_ECHO = os.getenv("DATABASE_ECHO", "false").lower() in {"1", "true", "yes", "on"}

    REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
    REDIS_PORT = int(os.getenv("REDIS_PORT", 4185))
    REDIS_DB = int(os.getenv("REDIS_DB", 0))
    REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "123456")
    REDIS_KEY_PREFIX = os.getenv("REDIS_KEY_PREFIX", "auth:dev")

    SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", 604800))
    DESIGN_CACHE_TTL_SECONDS = int(os.getenv("DESIGN_CACHE_TTL_SECONDS", 604800))

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

    @classmethod
    def get_database_url(cls):
        return cls.DATABASE_URL

    @classmethod
    def get_redis_config(cls):
        return {
            "host": cls.REDIS_HOST,
            "port": cls.REDIS_PORT,
            "db": cls.REDIS_DB,
            "password": cls.REDIS_PASSWORD,
            "decode_responses": True,
        }

    @classmethod
    def get_session_user_key(cls, user_id: str) -> str:
        """用来存储用户会话信息的 Redis 键，格式为 auth:dev:session:user:{user_id}"""
        return f"{cls.REDIS_KEY_PREFIX}:session:user:{user_id}"

    @classmethod
    def get_design_draft_key(cls, user_id: str, template_id: str) -> str:
        """返回用户模板草稿的 Redis 缓存键。"""
        return f"{cls.REDIS_KEY_PREFIX}:design:{user_id}:{template_id}"

    @classmethod
    def get_jwt_secret_key(cls) -> str:
        if not cls.JWT_SECRET_KEY:
            raise RuntimeError("JWT_SECRET_KEY is required")
        return cls.JWT_SECRET_KEY
