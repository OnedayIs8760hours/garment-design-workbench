"""权限模块的请求与响应契约，区分展示字段和允许修改的字段。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PermissionResponse(BaseModel):
    """只读权限目录；不提供由客户端新增权限码的请求模型。"""

    model_config = ConfigDict(from_attributes=True)
    code: str
    name: str
    description: str


class RoleSummary(BaseModel):
    """登录资料使用的角色摘要，避免把完整权限对象重复嵌入每个用户。"""

    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str


class RoleResponse(RoleSummary):
    """管理界面的角色详情，包含勾选权限所需的完整目录信息。"""

    description: str
    is_system: bool
    permissions: list[PermissionResponse]


class RoleCreate(BaseModel):
    """创建角色；拒绝额外字段，禁止客户端指定 is_system 等内部属性。"""

    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=255)
    permission_codes: list[str] = Field(default_factory=list, max_length=100)


class RoleUpdate(BaseModel):
    """整体替换角色的可编辑内容；角色编码创建后保持不变。"""

    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=255)
    permission_codes: list[str] = Field(max_length=100)


class UserAccessUpdate(BaseModel):
    """整体替换用户角色和启用状态；空 role_ids 表示撤销全部角色。"""

    model_config = ConfigDict(extra="forbid")
    role_ids: list[int] = Field(max_length=100)
    is_active: bool


class AuditResponse(BaseModel):
    """只读授权记录，返回操作者、目标和变更内容，不包含密码信息。"""

    model_config = ConfigDict(from_attributes=True)
    id: int
    actor_id: int | None
    action: str
    target: str
    detail: dict
    created_at: datetime
