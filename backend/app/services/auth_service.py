from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.config import Config
from app.core.normalizers import normalize_optional_text, normalize_username
from app.core.security import create_access_token, hash_password, verify_password
from app.crud.users import (
    create_user,
    get_user_by_username,
    update_last_login,
)
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse


class AuthServiceError(Exception):
    """认证业务异常，``code`` 由路由层映射为 HTTP 响应。"""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


async def register_user(db: AsyncSession, payload: RegisterRequest):
    """执行业务层注册流程。

    输入：数据库会话和 ``RegisterRequest``。
    输出：创建并持久化后的 ``User`` 对象。
    功能：规范化输入、检查用户名唯一性、哈希密码并创建用户。
    """
    username = normalize_username(payload.username)
    job_title = normalize_optional_text(payload.job_title)

    if not username:
        raise AuthServiceError("username_blank")

    existing_user = await get_user_by_username(db, username)
    if existing_user is not None:
        raise AuthServiceError("username_exists")

    try:
        return await create_user(
            db,
            username=username,
            password_hash=hash_password(payload.password),
            job_title=job_title,
        )
    except IntegrityError:
        await db.rollback()
        raise AuthServiceError("username_exists")


async def login_user(
    db: AsyncSession,
    redis: Redis,
    payload: LoginRequest,
) -> AuthResponse:
    """执行业务层登录流程并创建 Redis 会话。

    输入：数据库会话、Redis 客户端和 ``LoginRequest``。
    输出：包含 JWT 和用户资料的 ``AuthResponse``。
    功能：验证凭据与账号状态，更新最后登录时间，保存带 TTL 的会话 ID。
    """
    user = await get_user_by_username(db, normalize_username(payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AuthServiceError("invalid_credentials")

    if not user.is_active:
        raise AuthServiceError("user_inactive")

    user = await update_last_login(db, user)

    access_token, session_id = create_access_token(user.id)
    try:
        await redis.set(
            Config.get_session_user_key(str(user.id)),
            session_id,
            ex=Config.SESSION_TTL_SECONDS,
        )
    except RedisError:
        raise AuthServiceError("session_unavailable")

    return AuthResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


async def logout_user(redis: Redis, user_id: int) -> None:
    """删除指定用户的 Redis 会话。

    输入：Redis 客户端和用户 ID。
    输出：成功时无返回值（``None``）。
    功能：使该用户当前 JWT 对受保护接口立即失效。
    """
    try:
        await redis.delete(Config.get_session_user_key(str(user_id)))
    except RedisError:
        raise AuthServiceError("session_unavailable")
