from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=8000)
    conversation_id: UUID | None = None

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must not be blank")
        return value.strip()


class IntentDecision(BaseModel):
    intent: Literal["chat", "image"] = Field(
        description="image: 用户要求现在生成图片；chat: 普通聊天、咨询或需要澄清需求"
    )


class ImageArguments(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    prompt: str = Field(min_length=1, max_length=8000, description="完整的生图提示词")


class StoredAsset(BaseModel):
    asset_id: str
    object_key: str
    bucket: str
    original_name: str
    content_type: str
    size: int
    url: HttpUrl
    etag: str | None = None
    url_expires_in: int


class GeneratedImage(BaseModel):
    url: HttpUrl | None = None
    data_url: str | None = None
    revised_prompt: str | None = None
    asset: StoredAsset | None = None

    @model_validator(mode="after")
    def require_image(self):
        if bool(self.url) == bool(self.data_url):
            raise ValueError("Exactly one image URL or data URL is required")
        return self


class QuotaResponse(BaseModel):
    limit: int = 5
    used: int
    remaining: int
    resets_at: datetime
    timezone: str


class ChatResponse(BaseModel):
    conversation_id: UUID
    intent: Literal["chat", "image"]
    status: Literal["completed", "quota_exceeded", "generation_failed", "storage_failed"]
    reply: str
    images: list[GeneratedImage] = Field(default_factory=list)
    quota: QuotaResponse
