import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.config import Config
from app.config.db import get_async_db, get_redis
from app.core.security import decode_access_token
from app.crud.users import get_active_user_by_id
from app.models.users import User


bearer_scheme = HTTPBearer(auto_error=False)


def unauthorized(detail: str = "Invalid or expired token") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_async_db),
    redis: Redis = Depends(get_redis),
) -> User:
    if credentials is None:
        raise unauthorized("Authorization header is required")

    try:
        payload = decode_access_token(credentials.credentials)
    except (jwt.InvalidTokenError, RuntimeError):
        raise unauthorized()

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise unauthorized()

    try:
        active_session_id = await redis.get(Config.get_session_user_key(str(user_id)))
    except RedisError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Session service is unavailable",
        )

    if not active_session_id or active_session_id != session_id:
        raise unauthorized("Session expired or signed in elsewhere")

    user = await get_active_user_by_id(db, int(user_id))
    if user is None:
        raise unauthorized("User is inactive or does not exist")
    return user
