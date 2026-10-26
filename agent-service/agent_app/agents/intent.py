from langchain_core.messages import SystemMessage

from agent_app.agents.prompts import ROUTER_PROMPT
from agent_app.core.errors import ProviderError
from agent_app.schemas import IntentDecision
from agent_app.workflows.state import AgentState


def create_intent_agent(model):
    router = model.with_structured_output(IntentDecision, method="function_calling")

    async def recognize_intent(state: AgentState):
        decision = await router.ainvoke([SystemMessage(ROUTER_PROMPT), *state["messages"]])
        if not isinstance(decision, IntentDecision):
            raise ProviderError("意图 Agent 未返回有效分类")
        return {"intent": decision.intent}

    return recognize_intent
