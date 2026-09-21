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
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


async def register_user(db: AsyncSession, payload: RegisterRequest):
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
    try:
        await redis.delete(Config.get_session_user_key(str(user_id)))
    except RedisError:
        raise AuthServiceError("session_unavailable")
