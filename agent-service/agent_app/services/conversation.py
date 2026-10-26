import hashlib
from uuid import UUID, uuid4

from langchain_core.exceptions import OutputParserException
from langchain_core.messages import AIMessage, HumanMessage
from openai import OpenAIError
from pydantic import ValidationError

from agent_app.core.config import Settings
from agent_app.core.errors import ProviderError
from agent_app.persistence.memory import ShortTermMemory
from agent_app.persistence.quota import QuotaStore
from agent_app.providers.assets import GeneratedAssetStorage
from agent_app.providers.images import ImageProvider
from agent_app.schemas import ChatRequest, ChatResponse
from agent_app.services.image_generation import ImageGenerationService
from agent_app.workflows.builder import build_graph
from agent_app.workflows.state import RunContext


def thread_key(user_id: int, conversation_id: UUID) -> str:
    return hashlib.sha256(f"{user_id}:{conversation_id}".encode()).hexdigest()


class AgentService:
    def __init__(
        self,
        settings: Settings,
        model,
        provider: ImageProvider,
        quota: QuotaStore,
        storage: GeneratedAssetStorage,
    ):
        self.settings = settings
        self.quota = quota
        self.storage = storage
        self.memory = ShortTermMemory(
            settings.memory_ttl_seconds, settings.memory_max_conversations
        )
        self.generation = ImageGenerationService(provider, quota, storage)
        self.graph = build_graph(model, self.generation, self.memory.checkpointer)

    async def chat(
        self, user_id: int, payload: ChatRequest, access_token: str = ""
    ) -> ChatResponse:
        conversation_id = payload.conversation_id or uuid4()
        thread_id = thread_key(user_id, conversation_id)
        config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 10}
        context = RunContext(
            user_id=user_id, quota=await self.quota.get(user_id), access_token=access_token
        )
        async with self.memory.hold(thread_id):
            snapshot = await self.graph.aget_state(config)
            # Only user-facing turns are replayed. Tool messages and base64 data never enter
            # subsequent prompts. Keep the last N complete turns, starting with a user message.
            history = [
                message
                for message in snapshot.values.get("messages", [])
                if isinstance(message, HumanMessage)
                or (isinstance(message, AIMessage) and not message.tool_calls)
            ][-self.settings.memory_max_turns * 2 :]
            # Retain just the current run's checkpoints rather than an unbounded timeline.
            # The conversation lock makes deletion + invocation atomic for this thread.
            await self.memory.checkpointer.adelete_thread(thread_id)
            try:
                result = await self.graph.ainvoke(
                    {"messages": [*history, HumanMessage(payload.message)]},
                    config,
                    context=context,
                )
            except BaseException as error:
                # Never resume a partially completed image tool on a subsequent request.
                await self.memory.checkpointer.adelete_thread(thread_id)
                if history:
                    await self.graph.aupdate_state(
                        config, {"messages": history, "intent": "chat"}, as_node="chat_agent"
                    )
                if isinstance(error, (OpenAIError, ValidationError, OutputParserException)):
                    raise ProviderError("对话模型调用失败") from error
                raise
        return ChatResponse(
            conversation_id=conversation_id,
            intent=result["intent"],
            status=context.status,
            reply=result["messages"][-1].text,
            images=context.images,
            quota=context.quota,
        )

    async def delete_conversation(self, user_id: int, conversation_id: UUID):
        await self.memory.delete(thread_key(user_id, conversation_id))
