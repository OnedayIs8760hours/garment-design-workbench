from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from agent_app.api.auth import CurrentUser, get_current_user
from agent_app.api.dependencies import get_service
from agent_app.schemas import ChatRequest, ChatResponse
from agent_app.services.conversation import AgentService

router = APIRouter(tags=["conversations"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
    service: AgentService = Depends(get_service),
):
    result = await service.chat(user.id, payload, access_token=user.access_token)
    if result.status == "quota_exceeded":
        response.status_code = 429
        seconds = (result.quota.resets_at - datetime.now(UTC)).total_seconds()
        response.headers["Retry-After"] = str(max(1, int(seconds)))
    elif result.status in {"generation_failed", "storage_failed"}:
        response.status_code = 502
    return result


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    service: AgentService = Depends(get_service),
):
    await service.delete_conversation(user.id, conversation_id)
    return Response(status_code=204)
