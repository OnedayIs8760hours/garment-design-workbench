from dataclasses import dataclass, field

from langgraph.graph import MessagesState

from agent_app.schemas import GeneratedImage, QuotaResponse


class AgentState(MessagesState):
    """Checkpointed conversation data. Never include credentials or image bytes here."""

    intent: str


@dataclass
class RunContext:
    """Request-scoped identity and results, separate from checkpointed state."""

    user_id: int
    quota: QuotaResponse
    status: str = "completed"
    images: list[GeneratedImage] = field(default_factory=list)
    tool_invoked: bool = False
    access_token: str = field(default="", repr=False)
