from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
import pytest

from agent_app.main import create_app


@asynccontextmanager
async def api_client(settings, redis, model, *, auth_status=200, image_status=200, auth_body=None):
    requests = []

    def upstream(request):
        requests.append(request)
        if request.url.path == "/api/auth/me":
            token = request.headers["Authorization"]
            body = (
                auth_body
                if auth_body is not None
                else {"id": 2 if token == "Bearer user-2" else 1, "is_active": True}
            )
            return httpx.Response(auth_status, json=body)
        if request.url.path == "/v1/images/generations":
            return httpx.Response(
                image_status, json={"data": [{"url": "https://images.example.com/asset.png"}]}
            )
        if request.url.host == "images.example.com":
            return httpx.Response(
                200, content=b"image-bytes", headers={"Content-Type": "image/png"}
            )
        if request.url.path == "/api/assets":
            assert request.headers["Authorization"].startswith("Bearer user-")
            return httpx.Response(
                201,
                json={
                    "asset_id": "saved",
                    "object_key": "users/1/designs/generated/assets/asset.png",
                    "bucket": "test",
                    "original_name": "asset.png",
                    "content_type": "image/png",
                    "size": 11,
                    "url": "https://storage.example.com/asset.png",
                    "url_expires_in": 900,
                },
            )
        raise AssertionError(f"Unexpected upstream: {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as http:
        app = create_app(settings, redis=redis, model=model, http=http)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://agent.test"
            ) as client:
                client.headers["Authorization"] = "Bearer user-1"
                yield client, app, requests


async def test_authenticated_chat_quota_and_limit_http_status(settings, redis, model):
    async with api_client(settings, redis, model) as (client, _, requests):
        assert (await client.get("/api/agent/health")).status_code == 200
        response = await client.post("/api/agent/chat", json={"message": "你好"})
        assert response.status_code == 200
        assert response.json()["quota"]["used"] == 0
        model.intent = "image"
        conversation_ids = []
        for _ in range(5):
            response = await client.post("/api/agent/chat", json={"message": "生成一张"})
            assert response.status_code == 200
            conversation_ids.append(response.json()["conversation_id"])
            assert response.json()["images"][0]["url"].endswith("asset.png")
        response = await client.post("/api/agent/chat", json={"message": "再画一张"})
        assert response.status_code == 429
        assert response.json()["status"] == "quota_exceeded"
        assert int(response.headers["Retry-After"]) > 0
        assert len([r for r in requests if r.url.path.endswith("/generations")]) == 5
        for conversation_id in conversation_ids:
            assert (
                await client.delete(f"/api/agent/conversations/{conversation_id}")
            ).status_code == 204
        assert (await client.get("/api/agent/quota")).json()["used"] == 5
        client.headers["Authorization"] = "Bearer user-2"
        assert (await client.get("/api/agent/quota")).json()["used"] == 0


@pytest.mark.parametrize(
    "path,method",
    [
        ("/api/agent/chat", "POST"),
        ("/api/agent/quota", "GET"),
        (f"/api/agent/conversations/{uuid4()}", "DELETE"),
        ("/api/agent/assets/save", "POST"),
    ],
)
async def test_all_private_endpoints_require_auth(settings, redis, model, path, method):
    async with api_client(settings, redis, model) as (client, _, _):
        client.headers.pop("Authorization")
        kwargs = {"json": {"message": "hi"}} if method == "POST" else {}
        response = await client.request(method, path, **kwargs)
        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize("auth_status,expected", [(401, 401), (403, 401), (500, 503)])
async def test_revoked_token_or_auth_server_error(settings, redis, model, auth_status, expected):
    async with api_client(settings, redis, model, auth_status=auth_status) as (client, _, _):
        assert (await client.get("/api/agent/quota")).status_code == expected


@pytest.mark.parametrize(
    "auth_body,expected",
    [
        ({"id": 1, "is_active": False}, 401),
        ({"id": "invalid", "is_active": True}, 503),
        ({"id": 1}, 503),
    ],
)
async def test_inactive_or_malformed_auth_user(settings, redis, model, auth_body, expected):
    async with api_client(settings, redis, model, auth_body=auth_body) as (client, _, _):
        assert (await client.get("/api/agent/quota")).status_code == expected


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "hi", "user_id": 2},
        {"message": "   "},
        {"message": "a" * 8001},
        {"message": "hi", "conversation_id": "bad"},
    ],
)
async def test_invalid_input_is_rejected_before_model_call(settings, redis, model, payload):
    async with api_client(settings, redis, model) as (client, _, _):
        assert (await client.post("/api/agent/chat", json=payload)).status_code == 422
        assert model.inputs["router"] == []


async def test_upstream_image_failure_returns_safe_body_and_counts_attempt(settings, redis, model):
    model.intent = "image"
    async with api_client(settings, redis, model, image_status=500) as (client, _, requests):
        response = await client.post("/api/agent/chat", json={"message": "画一张"})
        assert response.status_code == 502
        assert response.json()["status"] == "generation_failed"
        assert response.json()["quota"]["used"] == 1
        assert response.json()["images"] == []
        assert "test-key" not in response.text
        assert len([r for r in requests if r.url.path.endswith("/generations")]) == 1


async def test_cors_preflight_allows_editor_authorization_header(settings, redis, model):
    async with api_client(settings, redis, model) as (client, _, _):
        response = await client.options(
            "/api/agent/chat",
            headers={
                "Origin": "http://localhost:5000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5000"


async def test_storage_retry_does_not_invoke_model_or_reserve_quota(settings, redis, model):
    async with api_client(settings, redis, model) as (client, _, requests):
        response = await client.post(
            "/api/agent/assets/save",
            json={"url": "https://images.example.com/asset.png"},
        )
        assert response.status_code == 200
        assert response.json()["asset"]["asset_id"] == "saved"
        assert (await client.get("/api/agent/quota")).json()["used"] == 0
        assert not any(r.url.path.endswith("/generations") for r in requests)
        assert model.inputs["router"] == []
