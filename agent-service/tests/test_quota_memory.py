import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fakeredis import FakeServer
from fakeredis.aioredis import FakeRedis

from agent_app.core.errors import MemoryCapacityExceeded, QuotaUnavailable
from agent_app.persistence.memory import ShortTermMemory
from agent_app.persistence.quota import QuotaStore
from agent_app.schemas import ChatRequest


async def test_quota_is_atomic_across_store_instances(redis):
    first = QuotaStore(redis, "shared", "Asia/Shanghai")
    second = QuotaStore(redis, "shared", "Asia/Shanghai")
    results = await asyncio.gather(*[(first if i % 2 else second).reserve(1) for i in range(30)])
    assert sum(allowed for allowed, _ in results) == 5
    assert (await first.get(1)).used == 5
    assert (await second.get(2)).used == 0


async def test_natural_day_midnight_and_redis_expiry(redis):
    # Future dates keep fakeredis' real clock from expiring test keys immediately.
    current = datetime(2099, 1, 1, 15, 59, 59, tzinfo=UTC)
    store = QuotaStore(redis, "day", "Asia/Shanghai", now=lambda: current)
    for _ in range(5):
        await store.reserve(1)
    allowed, result = await store.reserve(1)
    assert not allowed
    assert result.resets_at.isoformat() == "2099-01-02T00:00:00+08:00"
    assert await redis.ttl("day:1:2099-01-01") > 0
    current += timedelta(seconds=1)
    allowed, result = await store.reserve(1)
    assert allowed
    assert result.used == 1


async def test_new_quota_store_preserves_previous_usage(redis):
    await QuotaStore(redis, "restart", "Asia/Shanghai").reserve(1)
    restarted = QuotaStore(redis, "restart", "Asia/Shanghai")
    assert (await restarted.get(1)).used == 1


async def test_redis_failure_fails_closed():
    server = FakeServer()
    redis = FakeRedis(server=server, decode_responses=True)
    server.connected = False
    store = QuotaStore(redis, "down", "Asia/Shanghai")
    try:
        with pytest.raises(QuotaUnavailable):
            await store.reserve(1)
        with pytest.raises(QuotaUnavailable):
            await store.get(1)
    finally:
        await redis.aclose()


async def test_expired_memory_is_removed_and_old_messages_are_not_reused(service, model):
    clock = [0.0]
    service.memory.now = lambda: clock[0]
    service.memory.ttl = 10
    result = await service.chat(1, ChatRequest(message="已经过期的秘密"))
    clock[0] = 11
    await service.memory.cleanup()
    assert not service.memory.conversations
    assert not service.memory.checkpointer.storage
    await service.chat(1, ChatRequest(message="新请求", conversation_id=result.conversation_id))
    assert not any("秘密" in m.content for m in model.inputs["chat"][-1])


async def test_memory_capacity_does_not_evict_active_conversation():
    clock = [0.0]
    memory = ShortTermMemory(ttl=1, max_conversations=1, now=lambda: clock[0])
    async with memory.hold("one"):
        clock[0] = 2
        await memory.cleanup()
        with pytest.raises(MemoryCapacityExceeded):
            async with memory.hold("two"):
                pytest.fail("Active memory must not be evicted")
    clock[0] = 4
    await memory.cleanup()
    async with memory.hold("two"):
        assert set(memory.conversations) == {"two"}


async def test_expired_quota_window_cannot_be_recreated_to_bypass_limit(redis):
    old_clock = datetime.now(UTC) - timedelta(days=2)
    store = QuotaStore(redis, "expired", "Asia/Shanghai", now=lambda: old_clock)
    with pytest.raises(QuotaUnavailable):
        await store.reserve(1)
    assert not await redis.keys("expired:*")
