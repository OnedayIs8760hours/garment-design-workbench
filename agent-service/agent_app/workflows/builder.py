from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from agent_app.agents.chat import create_chat_agent
from agent_app.agents.image import create_image_agent, finish_image
from agent_app.agents.intent import create_intent_agent
from agent_app.services.image_generation import ImageGenerationService
from agent_app.tools.image_generation import create_image_tool
from agent_app.workflows.state import AgentState, RunContext


def build_graph(model, generation: ImageGenerationService, checkpointer):
    """Declare workflow topology; business policy belongs in services."""
    generate_image = create_image_tool(generation)
    graph = StateGraph(AgentState, context_schema=RunContext)
    graph.add_node("intent_agent", create_intent_agent(model))
    graph.add_node("chat_agent", create_chat_agent(model))
    graph.add_node("image_agent", create_image_agent(model, generate_image))
    graph.add_node("image_tools", ToolNode([generate_image], handle_tool_errors=False))
    graph.add_node("image_result", finish_image)
    graph.add_edge(START, "intent_agent")
    graph.add_conditional_edges(
        "intent_agent",
        lambda state: state["intent"],
        {"chat": "chat_agent", "image": "image_agent"},
    )
    graph.add_edge("chat_agent", END)
    graph.add_edge("image_agent", "image_tools")
    graph.add_edge("image_tools", "image_result")
    graph.add_edge("image_result", END)
    return graph.compile(checkpointer=checkpointer)
