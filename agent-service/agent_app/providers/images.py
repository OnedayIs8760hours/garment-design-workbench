import base64
import binascii

import httpx
from pydantic import ValidationError

from agent_app.core.config import Settings
from agent_app.core.errors import ProviderError
from agent_app.schemas import GeneratedImage


class ImageProvider:
    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    async def generate(self, prompt: str) -> GeneratedImage:
        """One attempt, one image. Never automatically retry a potentially billed request."""
        settings = self.settings
        payload = {
            "model": settings.image_model,
            "prompt": prompt,
            "n": 1,
            "size": settings.image_size,
        }
        if settings.image_response_format:
            payload["response_format"] = settings.image_response_format
        key = settings.image_api_key.get_secret_value() or settings.chat_api_key.get_secret_value()
        try:
            response = await self.http.post(
                f"{str(settings.image_base_url).rstrip('/')}/images/generations",
                json=payload,
                headers={"Authorization": f"Bearer {key}"},
                timeout=settings.image_timeout_seconds,
            )
            response.raise_for_status()
            body = response.json()
            item = body["data"][0]
            if item.get("b64_json"):
                encoded = item["b64_json"]
                if not base64.b64decode(encoded, validate=True):
                    raise ValueError("Empty image")
                output_format = body.get("output_format", "png")
                mime = {"png": "image/png", "jpeg": "image/jpeg", "webp": "image/webp"}[
                    output_format
                ]
                return GeneratedImage(
                    data_url=f"data:{mime};base64,{encoded}",
                    revised_prompt=item.get("revised_prompt"),
                )
            return GeneratedImage(url=item["url"], revised_prompt=item.get("revised_prompt"))
        except (
            httpx.HTTPError,
            ValueError,
            KeyError,
            IndexError,
            TypeError,
            AttributeError,
            binascii.Error,
            ValidationError,
        ) as error:
            raise ProviderError("生图服务调用失败") from error
