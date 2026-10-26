from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import Field, HttpUrl, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class CorsSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", env_file=".env", extra="ignore")
    cors_origins: list[str] = ["http://localhost:5000", "http://127.0.0.1:5000"]


class Settings(CorsSettings):
    chat_base_url: HttpUrl = "https://api.openai.com/v1"
    chat_api_key: SecretStr
    chat_model: str = Field(min_length=1)
    chat_timeout_seconds: float = Field(default=60, gt=0)
    image_base_url: HttpUrl = "https://api.openai.com/v1"
    image_api_key: SecretStr = SecretStr("")
    image_model: str = Field(min_length=1)
    image_size: str = "1024x1024"
    image_response_format: Literal["", "url", "b64_json"] = ""
    image_timeout_seconds: float = Field(default=180, gt=0)
    auth_me_url: HttpUrl = "http://127.0.0.1:8957/api/auth/me"
    auth_timeout_seconds: float = Field(default=5, gt=0)
    asset_api_url: HttpUrl = "http://127.0.0.1:8957/api/assets"
    storage_timeout_seconds: float = Field(default=60, gt=0)
    image_max_bytes: int = Field(default=25 * 1024 * 1024, gt=0)
    image_download_allowed_hosts: list[str] = []
    redis_url: SecretStr
    quota_key_prefix: str = Field(default="woda:agent:quota", min_length=1)
    quota_timezone: str = "Asia/Shanghai"
    memory_ttl_seconds: float = Field(default=3600, gt=0)
    memory_max_conversations: int = Field(default=1000, ge=1)
    memory_max_turns: int = Field(default=10, ge=1, le=100)

    @field_validator("quota_timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        return value

    @field_validator("chat_api_key", "redis_url")
    @classmethod
    def nonempty_secret(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("must not be blank")
        return value
