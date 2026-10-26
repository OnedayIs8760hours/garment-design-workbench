import httpx
import pytest

from agent_app.core.errors import AssetStorageError
from agent_app.providers.assets import GeneratedAssetStorage
from agent_app.schemas import GeneratedImage


async def test_private_token_only_goes_to_backend_and_images_are_stored_in_library(settings):
    calls = []

    def handle(request):
        calls.append(request)
        if request.method == "GET":
            assert "Authorization" not in request.headers
            return httpx.Response(200, content=b"image", headers={"Content-Type": "image/png"})
        assert request.url.path == "/api/assets"
        assert request.headers["Authorization"] == "Bearer owner-token"
        assert b'name="order_id"\r\n\r\ngenerated' in request.content
        return httpx.Response(
            201,
            json={
                "asset_id": "saved",
                "object_key": "users/7/designs/generated/assets/a.png",
                "bucket": "test",
                "original_name": "a.png",
                "content_type": "image/png",
                "size": 5,
                "url": "https://storage.example.com/a.png",
                "url_expires_in": 900,
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        storage = GeneratedAssetStorage(settings, http)
        image = await storage.save(
            GeneratedImage(url="https://images.example.com/a.png"), "owner-token"
        )
        assert image.asset.object_key.startswith("users/7/")
        assert image.data_url is None
        assert len(calls) == 2


@pytest.mark.parametrize(
    "image",
    [
        {"url": "http://127.0.0.1/private"},
        {"url": "https://evil.example.com/image.png"},
        {"data_url": "data:image/svg+xml;base64,PHN2Zz4="},
        {"data_url": "data:image/png;base64,invalid"},
    ],
)
async def test_storage_rejects_untrusted_hosts_and_malformed_data(settings, image):
    def unexpected(request):
        pytest.fail("No HTTP request should be made")

    async with httpx.AsyncClient(transport=httpx.MockTransport(unexpected)) as http:
        with pytest.raises(AssetStorageError):
            await GeneratedAssetStorage(settings, http).save(GeneratedImage(**image), "token")


@pytest.mark.parametrize("status", [302, 500])
async def test_image_download_does_not_follow_redirects_or_retry(settings, status):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(status, headers={"Location": "http://localhost/private"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        with pytest.raises(AssetStorageError):
            await GeneratedAssetStorage(settings, http).save(
                GeneratedImage(url="https://images.example.com/a.png"), "token"
            )
        assert len(calls) == 1


async def test_size_limit_prevents_storage_upload(settings):
    settings.image_max_bytes = 2
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, content=b"too-big", headers={"Content-Type": "image/png"}
            )
        )
    ) as http:
        with pytest.raises(AssetStorageError):
            await GeneratedAssetStorage(settings, http).save(
                GeneratedImage(url="https://images.example.com/a.png"), "token"
            )
