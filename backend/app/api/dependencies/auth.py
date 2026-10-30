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
    """构造统一的 401 未认证异常。

    输入：可选的用户可读错误信息。
    输出：带 ``WWW-Authenticate: Bearer`` 响应头的 ``HTTPException``。
    功能：保证所有认证失败场景返回一致的 HTTP 协议响应。
    """
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
    """解析并校验 Bearer token，返回当前有效用户。

    输入：Authorization 请求头、数据库会话和 Redis 客户端，均由 FastAPI 依赖注入。
    输出：通过校验的启用状态 ``User`` 对象。
    功能：依次校验 JWT 签名/过期时间、用户 ID、会话 ID、Redis 会话一致性及用户状态。
    失败：缺少或无效 token 返回 401，Redis 不可用返回 503，用户不存在或已停用返回 401。
    """
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


def require_permission(code: str):
    """生成可用于 Depends 的权限依赖：先认证，再检查指定业务权限。

    无有效身份由 get_current_user 返回 401；身份有效但未授权返回 403。
    返回同一个用户对象，让业务处理继续使用原有的用户数据隔离逻辑。
    """
    async def check(user: User = Depends(get_current_user)) -> User:
        # 缺少权限字段时默认拒绝，不能把旧客户端或不完整资料视为已授权。
        if code not in getattr(user, "permissions", ()):
            raise HTTPException(status_code=403, detail="没有执行此操作的权限")
        return user

    return check


async def require_system_admin(user: User = Depends(require_permission("rbac.manage"))) -> User:
    """全员内容查看专属于初始化的 admin，普通管理员角色不自动获得此数据范围。"""
    if not user.is_system_admin:
        raise HTTPException(status_code=403, detail="只有系统最高权限账号可以查看全员内容")
    return user
