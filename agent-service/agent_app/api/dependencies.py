from fastapi import Request

from agent_app.bootstrap import Container
from agent_app.services.conversation import AgentService


def get_container(request: Request) -> Container:
    return request.app.state.container


def get_service(request: Request) -> AgentService:
    return get_container(request).service
