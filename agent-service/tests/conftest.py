from uuid import uuid4

import pytest
from fakeredis.aioredis import FakeRedis
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableLambda

from agent_app.core.config import Settings
from agent_app.core.errors import AssetStorageError, ProviderError
from agent_app.persistence.quota import QuotaStore
from agent_app.schemas import GeneratedImage, IntentDecision, StoredAsset
from agent_app.services.conversation import AgentService


class FakeModel:
    """Scripted model boundary; graph orchestration and tools remain real."""

    def __init__(self):
        self.inputs = {"router": [], "chat": [], "image": []}
        self.intent = "chat"
        self.multiple_calls = False
        self.invalid_prompt = False
        self.fail_chat = False

    def with_structured_output(self, schema, **kwargs):
        async def route(messages):
            self.inputs["router"].append(messages)
            return IntentDecision(intent=self.intent)

        return RunnableLambda(route)

    def bind_tools(self, tools, **kwargs):
        self.tools = tools
        self.tool_options = kwargs

        async def image(messages):
            self.inputs["image"].append(messages)
            prompt = "；".join(m.content for m in messages if isinstance(m, HumanMessage))
            calls = [
                {
                    "name": "generate_image",
                    "args": {"prompt": "   " if self.invalid_prompt else prompt},
                    "id": str(uuid4()),
                    "type": "tool_call",
                }
            ]
            if self.multiple_calls:
                calls.append({**calls[0], "id": str(uuid4())})
            return AIMessage(content="", tool_calls=calls)

        return RunnableLambda(image)

    async def ainvoke(self, messages):
        self.inputs["chat"].append(messages)
        if self.fail_chat:
            raise ProviderError("Model unavailable")
        return AIMessage("我记住了你的设计要求。")


class FakeProvider:
    def __init__(self):
        self.prompts = []
        self.fail = False

    async def generate(self, prompt):
        self.prompts.append(prompt)
        if self.fail:
            raise ProviderError("upstream secret must never be exposed")
        return GeneratedImage(data_url="data:image/png;base64,aW1hZ2U=")


class FakeStorage:
    def __init__(self):
        self.saved = []
        self.fail = False

    async def save(self, image, token):
        self.saved.append((image, token))
        if self.fail:
            raise AssetStorageError("Storage unavailable")
        asset = StoredAsset(
            asset_id="asset-generated",
            object_key="users/1/designs/generated/assets/asset.png",
            bucket="test",
            original_name="asset.png",
            content_type="image/png",
            size=5,
            url="https://storage.example.com/asset.png",
            url_expires_in=900,
        )
        return GeneratedImage(url=asset.url, asset=asset)


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        chat_api_key="test-key",
        chat_model="test-chat",
        image_model="test-image",
        redis_url="redis://localhost:6379/15",
        image_download_allowed_hosts=["images.example.com"],
    )


@pytest.fixture
async def redis():
    client = FakeRedis(decode_responses=True)
    yield client
    await client.aclose()


@pytest.fixture
def model():
    return FakeModel()


@pytest.fixture
def provider():
    return FakeProvider()


@pytest.fixture
def quota(redis):
    return QuotaStore(redis, "test:quota", "Asia/Shanghai")


@pytest.fixture
def storage():
    return FakeStorage()


@pytest.fixture
def service(settings, model, provider, quota, storage):
    return AgentService(settings, model, provider, quota, storage)
