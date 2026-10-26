import json

import httpx
import pytest
from langchain_openai import ChatOpenAI

from agent_app.core.errors import ProviderError
from agent_app.providers.assets import GeneratedAssetStorage
from agent_app.providers.images import ImageProvider
from agent_app.schemas import ChatRequest
from agent_app.services.conversation import AgentService


@pytest.mark.parametrize(
    "body,expected",
    [
        ({"data": [{"url": "https://images.example.com/result.png"}]}, "url"),
        ({"data": [{"b64_json": "aW1hZ2U="}]}, "data:image/png;base64,"),
        ({"data": [{"b64_json": "aW1hZ2U="}], "output_format": "webp"}, "data:image/webp;"),
    ],
)
async def test_compatible_image_payload_and_results(settings, body, expected):
    requests = []

    def handle(request):
        requests.append(request)
        assert request.url.path == "/v1/images/generations"
        assert request.headers["Authorization"] == "Bearer test-key"
        assert json.loads(request.content) == {
            "model": "test-image",
            "prompt": "老虎",
            "n": 1,
            "size": "1024x1024",
        }
        return httpx.Response(200, json=body)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        image = await ImageProvider(settings, http).generate("老虎")
        assert image.url if expected == "url" else image.data_url.startswith(expected)
        assert len(requests) == 1


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"data": []},
        {"data": [{"url": None}]},
        {"data": [None]},
        {"data": [{"url": "javascript:alert(1)"}]},
        {"data": [{"b64_json": "bad base64"}]},
    ],
)
async def test_malformed_image_responses_fail_safely(settings, body):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body))
    ) as http:
        with pytest.raises(ProviderError):
            await ImageProvider(settings, http).generate("老虎")


async def test_separate_image_key_and_optional_response_format(settings):
    settings.image_api_key = "image-only-key"
    settings.image_response_format = "url"

    def handle(request):
        assert request.headers["Authorization"] == "Bearer image-only-key"
        assert json.loads(request.content)["response_format"] == "url"
        return httpx.Response(200, json={"data": [{"url": "https://images.example.com/a.png"}]})

    # Validate assigned settings exactly as environment loading would.
    settings = type(settings).model_validate(settings.model_dump())
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        await ImageProvider(settings, http).generate("老虎")


async def test_actual_chatopenai_adapter_and_tool_runtime_end_to_end(settings, quota):
    """Exercise actual API serialization, structured routing and bound-tool parsing offline."""
    calls = []

    def handle(request):
        if request.url.path == "/api/assets":
            calls.append({"storage": True})
            assert request.headers["Authorization"] == "Bearer user-token"
            return httpx.Response(
                201,
                json={
                    "asset_id": "saved",
                    "object_key": "users/1/designs/generated/assets/asset.png",
                    "bucket": "test",
                    "original_name": "asset.png",
                    "content_type": "image/png",
                    "size": 5,
                    "url": "https://storage.example.com/asset.png",
                    "url_expires_in": 900,
                },
            )
        payload = json.loads(request.content)
        calls.append(payload)
        if request.url.path.endswith("/images/generations"):
            return httpx.Response(200, json={"data": [{"b64_json": "aW1hZ2U="}]})
        assert request.url.path == "/v1/chat/completions"
        tool = payload["tools"][0]["function"]
        name = tool["name"]
        arguments = {"intent": "image"} if name == "IntentDecision" else {"prompt": "蓝色老虎"}
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1,
                "model": "test-chat",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "tool_calls",
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": f"call_{len(calls)}",
                                    "type": "function",
                                    "function": {"name": name, "arguments": json.dumps(arguments)},
                                }
                            ],
                        },
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        model = ChatOpenAI(
            model="test-chat",
            api_key="test-key",
            base_url="https://model.example.com/v1",
            http_async_client=http,
            max_retries=0,
        )
        service = AgentService(
            settings,
            model,
            ImageProvider(settings, http),
            quota,
            GeneratedAssetStorage(settings, http),
        )
        response = await service.chat(1, ChatRequest(message="生成蓝色老虎"), "user-token")
        assert response.status == "completed"
        assert len(response.images) == 1
        assert response.quota.used == 1
        assert response.images[0].asset.object_key.startswith("users/1/")
        assert len(calls) == 4


async def test_model_ignoring_structured_router_protocol_fails_without_charging(settings, quota):
    def handle(request):
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-refusal",
                "object": "chat.completion",
                "created": 1,
                "model": "test-chat",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "无法提供分类"},
                    }
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        model = ChatOpenAI(
            model="test-chat",
            api_key="test-key",
            base_url="https://model.example.com/v1",
            http_async_client=http,
            max_retries=0,
        )
        service = AgentService(
            settings,
            model,
            ImageProvider(settings, http),
            quota,
            GeneratedAssetStorage(settings, http),
        )
        with pytest.raises(ProviderError):
            await service.chat(1, ChatRequest(message="生成蓝色老虎"))
        assert (await quota.get(1)).used == 0
