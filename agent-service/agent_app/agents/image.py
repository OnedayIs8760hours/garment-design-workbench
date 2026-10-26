from langchain_core.messages import AIMessage, SystemMessage
from langgraph.runtime import Runtime
from pydantic import ValidationError

from agent_app.agents.prompts import IMAGE_PROMPT
from agent_app.core.errors import ProviderError
from agent_app.schemas import ImageArguments
from agent_app.workflows.state import AgentState, RunContext


def create_image_agent(model, generate_image):
    image_agent = model.bind_tools(
        [generate_image], tool_choice="generate_image", parallel_tool_calls=False
    )

    async def plan_image(state: AgentState):
        reply = await image_agent.ainvoke([SystemMessage(IMAGE_PROMPT), *state["messages"]])
        if (
            not isinstance(reply, AIMessage)
            or len(reply.tool_calls) != 1
            or reply.invalid_tool_calls
        ):
            raise ProviderError("生图 Agent 未返回单个工具调用")
        call = reply.tool_calls[0]
        if call["name"] != "generate_image" or not call.get("id"):
            raise ProviderError("生图 Agent 返回无效工具调用")
        try:
            arguments = ImageArguments.model_validate(call["args"])
        except ValidationError as error:
            raise ProviderError("生图参数不合法") from error
        reply.tool_calls[0]["args"] = arguments.model_dump()
        return {"messages": [reply]}

    return plan_image


async def finish_image(state: AgentState, runtime: Runtime[RunContext]):
    if not runtime.context.tool_invoked:
        raise ProviderError("生图工具没有执行")
    return {"messages": [AIMessage(state["messages"][-1].content)]}
