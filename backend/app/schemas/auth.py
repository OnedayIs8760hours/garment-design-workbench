"""
认证相关的请求和响应模型
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RegisterRequest(BaseModel):
    """注册接口输入模型。"""

    username: str = Field(min_length=1, max_length=64, description="登录用户名")
    password: str = Field(min_length=8, max_length=128, description="登录密码，至少 8 位")
    job_title: str | None = Field(default=None, max_length=100, description="职位，可选")


class LoginRequest(BaseModel):
    """登录接口输入模型。"""

    username: str = Field(min_length=1, max_length=64, description="登录用户名")
    password: str = Field(min_length=1, max_length=128, description="登录密码")


class UserResponse(BaseModel):
    """用户资料输出模型，不包含密码字段。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    job_title: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None


class AuthResponse(BaseModel):
    """登录接口输出模型，包含访问令牌和当前用户资料。"""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
