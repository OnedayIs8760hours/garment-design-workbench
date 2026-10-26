import asyncio
from contextlib import AsyncExitStack, asynccontextmanager, suppress
from dataclasses import dataclass

import httpx
from redis.asyncio import Redis

from agent_app.core.config import Settings
from agent_app.persistence.quota import QuotaStore
from agent_app.providers.assets import GeneratedAssetStorage
from agent_app.providers.chat import create_chat_model
from agent_app.providers.images import ImageProvider
from agent_app.services.conversation import AgentService


@dataclass(frozen=True)
class Container:
    settings: Settings
    http: httpx.AsyncClient
    service: AgentService


@asynccontextmanager
async def create_container(settings: Settings | None = None, *, http=None, redis=None, model=None):
    """Composition root. Own resources created here; callers own injected resources."""
    config = settings or Settings()
    async with AsyncExitStack() as stack:
        http_client = http if http is not None else httpx.AsyncClient(follow_redirects=False)
        if http is None:
            stack.push_async_callback(http_client.aclose)
        redis_client = (
            redis
            if redis is not None
            else Redis.from_url(
                config.redis_url.get_secret_value(),
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=False,
            )
        )
        if redis is None:
            stack.push_async_callback(redis_client.aclose)
        service = AgentService(
            config,
            model if model is not None else create_chat_model(config),
            ImageProvider(config, http_client),
            QuotaStore(redis_client, config.quota_key_prefix, config.quota_timezone),
            GeneratedAssetStorage(config, http_client),
        )
        cleanup = asyncio.create_task(service.memory.run_cleanup())
        try:
            yield Container(config, http_client, service)
        finally:
            cleanup.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup
