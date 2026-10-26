import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, ValidationError

from agent_app.api.dependencies import get_container

bearer = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    id: int = Field(gt=0)
    is_active: bool
    access_token: str = Field(default="", exclude=True, repr=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> CurrentUser:
    """Delegate authentication, session revocation and account status to the main backend."""
    if credentials is None:
        raise HTTPException(401, "请先登录", headers={"WWW-Authenticate": "Bearer"})
    container = get_container(request)
    settings = container.settings
    try:
        response = await container.http.get(
            str(settings.auth_me_url),
            headers={"Authorization": f"Bearer {credentials.credentials}"},
            timeout=settings.auth_timeout_seconds,
        )
    except httpx.HTTPError:
        raise HTTPException(503, "登录校验服务暂不可用") from None
    if response.status_code in (401, 403):
        raise HTTPException(401, "登录已失效", headers={"WWW-Authenticate": "Bearer"})
    if response.status_code != 200:
        raise HTTPException(503, "登录校验服务暂不可用")
    try:
        user = CurrentUser.model_validate(response.json())
    except (ValueError, ValidationError):
        raise HTTPException(503, "登录校验服务返回异常") from None
    if not user.is_active:
        raise HTTPException(401, "账号已停用", headers={"WWW-Authenticate": "Bearer"})
    user.access_token = credentials.credentials
    return user
