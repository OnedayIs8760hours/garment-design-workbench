from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.config.db import get_async_db, get_redis
from app.models.users import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.services.auth_service import AuthServiceError, login_user, logout_user, register_user


router = APIRouter()


def to_http_exception(error: AuthServiceError) -> HTTPException:
    if error.code == "username_blank":
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username cannot be blank",
        )
    if error.code == "username_exists":
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )
    if error.code == "invalid_credentials":
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if error.code == "user_inactive":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )
    if error.code == "session_unavailable":
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Session service is unavailable",
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Authentication request failed",
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_async_db),
) -> User:
    try:
        return await register_user(db, payload)
    except AuthServiceError as error:
        raise to_http_exception(error)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_async_db),
    redis: Redis = Depends(get_redis),
) -> AuthResponse:
    try:
        return await login_user(db, redis, payload)
    except AuthServiceError as error:
        raise to_http_exception(error)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    try:
        await logout_user(redis, current_user.id)
    except AuthServiceError as error:
        raise to_http_exception(error)
    return {"message": "Logged out successfully"}
