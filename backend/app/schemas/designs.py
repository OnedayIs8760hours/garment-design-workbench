from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DesignDraftUpsertRequest(BaseModel):
    """保存设计草稿的请求体。"""

    design: dict[str, Any] = Field(description="完整的前端设计状态 JSON")


class DesignDraftResponse(BaseModel):
    """设计草稿接口的响应体。"""

    template_id: str
    template_version: int
    design: dict[str, Any]
    created_at: datetime
    updated_at: datetime
