from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DesignDraftUpsertRequest(BaseModel):
    """保存设计草稿的请求体。"""

    design: dict[str, Any] = Field(description="完整的前端设计状态 JSON")


class DesignDraftResponse(BaseModel):
    """设计草稿接口的响应体。"""

    template_id: str
    order_id: str
    template_version: int
    design: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class DesignDraftSummary(BaseModel):
    """个人草稿箱列表中的轻量草稿摘要。"""

    template_id: str
    order_id: str
    template_version: int
    updated_at: datetime


class DesignDraftDeleteItem(BaseModel):
    """批量删除时用于定位一份草稿。"""

    template_id: str = Field(min_length=1, max_length=128)
    order_id: str = Field(min_length=1, max_length=128)


class DesignDraftBatchDeleteRequest(BaseModel):
    """批量删除草稿的请求体。"""

    drafts: list[DesignDraftDeleteItem] = Field(min_length=1, max_length=100)


class DesignDraftBatchDeleteResponse(BaseModel):
    """批量删除草稿的结果。"""

    deleted_count: int
