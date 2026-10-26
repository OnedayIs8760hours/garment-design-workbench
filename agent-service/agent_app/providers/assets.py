import base64
from datetime import UTC, datetime
from uuid import uuid4

import httpx
from pydantic import ValidationError

from agent_app.core.config import Settings
from agent_app.core.errors import AssetStorageError
from agent_app.schemas import GeneratedImage, StoredAsset

IMAGE_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}


class GeneratedAssetStorage:
    """Save through the existing authenticated backend; storage credentials stay there."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    async def _read_image(self, image: GeneratedImage) -> tuple[bytes, str]:
        maximum = self.settings.image_max_bytes
        if image.data_url:
            if len(image.data_url) > (maximum * 4 // 3) + 512:
                raise AssetStorageError("Image exceeds upload limit")
            header, encoded = image.data_url.split(",", 1)
            content_type = header.removeprefix("data:").removesuffix(";base64")
            if header != f"data:{content_type};base64" or content_type not in IMAGE_EXTENSIONS:
                raise AssetStorageError("Unsupported image type")
            content = base64.b64decode(encoded, validate=True)
        else:
            url = httpx.URL(str(image.url))
            allowed = {
                httpx.URL(str(self.settings.image_base_url)).host,
                *[host.lower() for host in self.settings.image_download_allowed_hosts],
            }
            # Provider URLs may use a CDN. Its host must be explicitly configured. Do not
            # follow redirects or send the user's Bearer token to the image host.
            if url.host.lower() not in allowed or url.username or url.password:
                raise AssetStorageError("Image host is not in the download allowlist")
            async with self.http.stream(
                "GET",
                url,
                follow_redirects=False,
                timeout=self.settings.storage_timeout_seconds,
            ) as response:
                response.raise_for_status()
                content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
                if content_type not in IMAGE_EXTENSIONS:
                    raise AssetStorageError("Unsupported image type")
                chunks = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > maximum:
                        raise AssetStorageError("Image exceeds upload limit")
                    chunks.append(chunk)
                content = b"".join(chunks)
        if not content or len(content) > maximum:
            raise AssetStorageError("Image is empty or exceeds upload limit")
        return content, content_type

    async def save(self, image: GeneratedImage, access_token: str) -> GeneratedImage:
        if not access_token:
            raise AssetStorageError("Authentication is required for storage")
        try:
            content, content_type = await self._read_image(image)
            stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
            filename = f"AI素材-{stamp}-{uuid4().hex[:6]}.{IMAGE_EXTENSIONS[content_type]}"
            response = await self.http.post(
                str(self.settings.asset_api_url),
                headers={"Authorization": f"Bearer {access_token}"},
                data={"order_id": "generated"},
                files={"file": (filename, content, content_type)},
                timeout=self.settings.storage_timeout_seconds,
            )
            response.raise_for_status()
            asset = StoredAsset.model_validate(response.json())
            return GeneratedImage(url=asset.url, asset=asset, revised_prompt=image.revised_prompt)
        except (httpx.HTTPError, ValueError, TypeError, KeyError, ValidationError) as error:
            raise AssetStorageError("图片保存失败") from error
