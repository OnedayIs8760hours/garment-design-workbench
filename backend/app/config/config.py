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
    # 由部署初始化文件提供，只在首次创建专有 admin 时使用，不在重启时重置密码。
    RBAC_ADMIN_PASSWORD = os.getenv("RBAC_ADMIN_PASSWORD", "")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

    # 与 ERP 共用 Nacos TLS 网关；实例地址须填写其他服务器实际可访问的入口。
    NACOS_ENABLED = os.getenv("NACOS_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
    NACOS_SERVER_ADDR = os.getenv("NACOS_SERVER_ADDR", "").strip()
    NACOS_NAMESPACE_ID = os.getenv("NACOS_NAMESPACE_ID", "").strip()
    NACOS_SERVICE_NAME = os.getenv("NACOS_SERVICE_NAME", "woda-design-backend").strip()
    NACOS_GROUP_NAME = os.getenv("NACOS_GROUP_NAME", "DEFAULT_GROUP").strip()
    NACOS_CLUSTER_NAME = os.getenv("NACOS_CLUSTER_NAME", "DEFAULT").strip()
    NACOS_INSTANCE_IP = os.getenv("NACOS_INSTANCE_IP", "").strip()
    NACOS_INSTANCE_PORT = int(os.getenv("NACOS_INSTANCE_PORT", "8957"))
    NACOS_USERNAME = os.getenv("NACOS_USERNAME", "")
    NACOS_PASSWORD = os.getenv("NACOS_PASSWORD", "")
    NACOS_TLS_ENABLED = os.getenv("NACOS_TLS_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    NACOS_TLS_CA_FILE = os.getenv("NACOS_TLS_CA_FILE", "").strip()
    NACOS_TIMEOUT_SECONDS = float(os.getenv("NACOS_TIMEOUT_SECONDS", "10"))

    # 允许跨域访问后端的来源，同时用于 RustFS 桶 CORS，保证 3D 预览能跨域读取素材。
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://127.0.0.1:1234,http://localhost:1234,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5000,http://localhost:5000",
        ).split(",")
        if origin.strip()
    ]

    # RustFS 兼容标准 S3 API；访问密钥必须通过环境变量提供，不能写入源码。
    RUSTFS_ENDPOINT_URL = os.getenv("RUSTFS_ENDPOINT_URL", "http://127.0.0.1:9000").rstrip("/")
    RUSTFS_ACCESS_KEY = os.getenv("RUSTFS_ACCESS_KEY")
    RUSTFS_SECRET_KEY = os.getenv("RUSTFS_SECRET_KEY")
    RUSTFS_BUCKET = os.getenv("RUSTFS_BUCKET", "woda-design")
    RUSTFS_REGION = os.getenv("RUSTFS_REGION", "us-east-1")
    RUSTFS_ADDRESSING_STYLE = os.getenv("RUSTFS_ADDRESSING_STYLE", "path")
    RUSTFS_PRESIGNED_URL_EXPIRES_SECONDS = int(os.getenv("RUSTFS_PRESIGNED_URL_EXPIRES_SECONDS", 900))
    RUSTFS_MAX_UPLOAD_BYTES = int(os.getenv("RUSTFS_MAX_UPLOAD_BYTES", 25 * 1024 * 1024))

    # PSD 大文件分片上传：最大文件字节数、默认分片大小、会话过期时间。
    RUSTFS_MAX_PSD_UPLOAD_BYTES = int(os.getenv("RUSTFS_MAX_PSD_UPLOAD_BYTES", 500 * 1024 * 1024))
    RUSTFS_PSD_PART_SIZE = int(os.getenv("RUSTFS_PSD_PART_SIZE", 8 * 1024 * 1024))
    RUSTFS_PSD_MIN_PART_SIZE = 5 * 1024 * 1024  # S3 非末分片大小下限
    RUSTFS_PSD_MAX_PARTS = 10000  # S3 Multipart 分片数量上限
    PSD_UPLOAD_SESSION_TTL_SECONDS = int(os.getenv("PSD_UPLOAD_SESSION_TTL_SECONDS", 24 * 3600))

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
    def get_design_draft_key(cls, user_id: str, template_id: str, order_id: str | None = None) -> str:
        """返回用户模板草稿的 Redis 缓存键。"""
        suffix = order_id or "latest"
        return f"{cls.REDIS_KEY_PREFIX}:design:{user_id}:{template_id}:{suffix}"

    @classmethod
    def get_jwt_secret_key(cls) -> str:
        if not cls.JWT_SECRET_KEY:
            raise RuntimeError("JWT_SECRET_KEY is required")
        return cls.JWT_SECRET_KEY

    @classmethod
    def get_rustfs_config(cls) -> dict[str, str]:
        """返回创建 RustFS S3 客户端所需的配置。"""
        if not cls.RUSTFS_ACCESS_KEY or not cls.RUSTFS_SECRET_KEY:
            raise RuntimeError("RUSTFS_ACCESS_KEY and RUSTFS_SECRET_KEY are required")
        return {
            "endpoint_url": cls.RUSTFS_ENDPOINT_URL,
            "aws_access_key_id": cls.RUSTFS_ACCESS_KEY,
            "aws_secret_access_key": cls.RUSTFS_SECRET_KEY,
            "region_name": cls.RUSTFS_REGION,
        }
