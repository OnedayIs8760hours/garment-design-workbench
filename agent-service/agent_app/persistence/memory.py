import asyncio
from collections.abc import Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from time import monotonic

from langgraph.checkpoint.memory import InMemorySaver

from agent_app.core.errors import MemoryCapacityExceeded


@dataclass
class Conversation:
    last_used: float
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    leases: int = 0


class ShortTermMemory:
    """Bounded process-local checkpoints with idle expiry and per-conversation serialization."""

    def __init__(self, ttl: float, max_conversations: int, now: Callable[[], float] = monotonic):
        self.checkpointer = InMemorySaver()
        self.ttl = ttl
        self.max_conversations = max_conversations
        self.now = now
        self.conversations: dict[str, Conversation] = {}
        self.lock = asyncio.Lock()

    async def _expire(self):
        for key, entry in list(self.conversations.items()):
            if entry.leases == 0 and self.now() - entry.last_used >= self.ttl:
                await self.checkpointer.adelete_thread(key)
                del self.conversations[key]

    async def cleanup(self):
        async with self.lock:
            await self._expire()

    @asynccontextmanager
    async def hold(self, thread_id: str):
        async with self.lock:
            await self._expire()
            if thread_id not in self.conversations:
                if len(self.conversations) >= self.max_conversations:
                    raise MemoryCapacityExceeded
                self.conversations[thread_id] = Conversation(last_used=self.now())
            entry = self.conversations[thread_id]
            # Include waiters so cleanup cannot remove their lock while a request is queued.
            entry.leases += 1
        try:
            async with entry.lock:
                yield
        finally:
            async with self.lock:
                entry.last_used = self.now()
                entry.leases -= 1

    async def delete(self, thread_id: str):
        # Do not allocate memory when deleting an unknown conversation.
        async with self.lock:
            entry = self.conversations.get(thread_id)
            if entry is None:
                return
            entry.leases += 1
        try:
            async with entry.lock:
                await self.checkpointer.adelete_thread(thread_id)
        finally:
            async with self.lock:
                entry.leases -= 1
                if entry.leases == 0:
                    del self.conversations[thread_id]

    async def run_cleanup(self):
        while True:
            await asyncio.sleep(min(60, self.ttl))
            await self.cleanup()
