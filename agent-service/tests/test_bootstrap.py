import httpx
import pytest

from agent_app import bootstrap


async def test_injected_clients_are_owned_by_caller(settings, redis, model):
    async with httpx.AsyncClient() as http:
        async with bootstrap.create_container(settings, http=http, redis=redis, model=model):
            pass
        assert not http.is_closed
        assert await redis.ping()


async def test_startup_failure_closes_owned_clients(settings, monkeypatch):
    http = httpx.AsyncClient()
    closed = []

    class RedisStub:
        async def aclose(self):
            closed.append("redis")

    def fail_model(config):
        raise RuntimeError("model initialization failed")

    monkeypatch.setattr(bootstrap.httpx, "AsyncClient", lambda **kwargs: http)
    monkeypatch.setattr(bootstrap.Redis, "from_url", lambda *args, **kwargs: RedisStub())
    monkeypatch.setattr(bootstrap, "create_chat_model", fail_model)
    with pytest.raises(RuntimeError, match="model initialization failed"):
        async with bootstrap.create_container(settings):
            pytest.fail("startup should fail before yielding")
    assert http.is_closed
    assert closed == ["redis"]
