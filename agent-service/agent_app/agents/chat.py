from langchain_core.messages import AIMessage, SystemMessage

from agent_app.agents.prompts import CHAT_PROMPT
from agent_app.core.errors import ProviderError
from agent_app.workflows.state import AgentState


def create_chat_agent(model):
    async def chat(state: AgentState):
        reply = await model.ainvoke([SystemMessage(CHAT_PROMPT), *state["messages"]])
        if not isinstance(reply, AIMessage) or reply.tool_calls or not reply.text.strip():
            raise ProviderError("对话模型未返回有效文本")
        return {"messages": [AIMessage(reply.text)]}

    return chat
