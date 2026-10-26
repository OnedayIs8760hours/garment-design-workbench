from collections.abc import Callable
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from redis.asyncio import Redis
from redis.exceptions import RedisError

from agent_app.core.errors import QuotaUnavailable
from agent_app.schemas import QuotaResponse

DAILY_IMAGE_LIMIT = 5

# Check and increment in one operation, across conversations and processes.
RESERVE_SCRIPT = """
if tonumber(redis.call('TIME')[1]) >= tonumber(ARGV[2]) then return {-1, 0} end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
if used >= tonumber(ARGV[1]) then return {0, used} end
used = redis.call('INCR', KEYS[1])
redis.call('EXPIREAT', KEYS[1], ARGV[2])
return {1, used}
"""


class QuotaStore:
    def __init__(
        self,
        redis: Redis,
        prefix: str,
        timezone: str,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ):
        self.redis = redis
        self.prefix = prefix
        self.timezone = ZoneInfo(timezone)
        self.now = now

    def _window(self, user_id: int) -> tuple[str, datetime]:
        local = self.now().astimezone(self.timezone)
        reset = datetime.combine(local.date() + timedelta(days=1), time(), self.timezone)
        return f"{self.prefix}:{user_id}:{local.date().isoformat()}", reset

    def _result(self, used: int, reset: datetime) -> QuotaResponse:
        return QuotaResponse(
            limit=DAILY_IMAGE_LIMIT,
            used=used,
            remaining=max(0, DAILY_IMAGE_LIMIT - used),
            resets_at=reset,
            timezone=str(self.timezone),
        )

    async def get(self, user_id: int) -> QuotaResponse:
        key, reset = self._window(user_id)
        try:
            used = int(await self.redis.get(key) or 0)
        except RedisError as error:
            raise QuotaUnavailable from error
        return self._result(used, reset)

    async def reserve(self, user_id: int) -> tuple[bool, QuotaResponse]:
        # A request queued across midnight must not increment an already-expired key,
        # otherwise each queued EVAL could recreate the key and bypass the limit.
        for _ in range(2):
            key, reset = self._window(user_id)
            try:
                allowed, used = await self.redis.eval(
                    RESERVE_SCRIPT, 1, key, DAILY_IMAGE_LIMIT, int(reset.timestamp())
                )
            except RedisError as error:
                raise QuotaUnavailable from error
            if int(allowed) != -1:
                return bool(allowed), self._result(int(used), reset)
        raise QuotaUnavailable("Quota clock is behind Redis")
