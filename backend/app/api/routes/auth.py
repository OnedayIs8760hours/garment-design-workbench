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
    """将认证服务内部错误转换为统一的 HTTP 异常响应。

    输入：包含业务错误码的 ``AuthServiceError``。
    输出：带有 HTTP 状态码、用户可读错误信息和必要响应头的异常对象。
    功能：隔离 service 层错误码与 API 层 HTTP 协议，统一处理认证失败、
    重复用户名、停用账号和会话服务不可用等情况。
    """
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
    """创建用户账号。

    输入：JSON 请求体 ``RegisterRequest``，包含用户名、8～128 位密码和可选职位；
    通过依赖注入获得数据库会话。
    输出：HTTP 201 和 ``UserResponse``，不返回密码明文或密码哈希。
    功能：规范化用户名、检查重复账号、哈希密码并写入用户表。
    失败：用户名为空返回 422，用户名已存在返回 409。
    """
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
    """校验账号并创建登录会话。

    输入：JSON 请求体 ``LoginRequest``，包含用户名和密码；通过依赖注入获得
    PostgreSQL 数据库会话和 Redis 客户端。
    输出：HTTP 200 和 ``AuthResponse``，包含 Bearer JWT、token 类型及用户资料。
    功能：验证密码和账号状态，更新最后登录时间，并在 Redis 写入当前会话 ID。
    失败：凭据错误返回 401，账号停用返回 403，会话服务不可用返回 503。
    """
    try:
        return await login_user(db, redis, payload)
    except AuthServiceError as error:
        raise to_http_exception(error)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    """获取当前登录用户资料。

    输入：``Authorization: Bearer <token>`` 请求头，由 ``get_current_user`` 校验。
    输出：HTTP 200 和当前用户的 ``UserResponse``。
    功能：确认 token、Redis 会话和用户状态均有效后返回用户资料。
    失败：缺少、过期、被替换或无效 token 返回 401。
    """
    return current_user


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    """注销当前用户会话。

    输入：``Authorization: Bearer <token>`` 请求头，以及当前用户和 Redis 客户端。
    输出：HTTP 200 和 ``{"message": "Logged out successfully"}``。
    功能：删除 Redis 中当前用户的会话 ID，使现有 JWT 立即不能继续访问受保护接口。
    失败：token 无效返回 401，Redis 不可用返回 503。
    """
    try:
        await logout_user(redis, current_user.id)
    except AuthServiceError as error:
        raise to_http_exception(error)
    return {"message": "Logged out successfully"}
