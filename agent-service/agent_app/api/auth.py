import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, ValidationError

from agent_app.api.dependencies import get_container

bearer = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    """主后端确认过的身份和权限；令牌仅供内部转发，不进入响应或 repr。"""

    id: int = Field(gt=0)
    is_active: bool
    permissions: list[str] = Field(default_factory=list)
    access_token: str = Field(default="", exclude=True, repr=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> CurrentUser:
    """向主后端确认当前身份、会话和授权，避免 Agent 维护一份过期的角色缓存。"""
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
    # 在进入对话或额度等业务前拒绝未授权请求，不等待调用模型后再失败。
    if "ai.generate" not in user.permissions:
        raise HTTPException(403, "没有使用 AI 服务的权限")
    user.access_token = credentials.credentials
    return user


async def get_generation_user(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """生图会自动保存素材，因此调用模型前必须同时具备素材写入权限。"""
    if "assets.write" not in user.permissions:
        raise HTTPException(403, "生图需要素材保存权限")
    return user
