from fastapi import APIRouter, Depends

from agent_app.api.auth import CurrentUser, get_current_user
from agent_app.api.dependencies import get_service
from agent_app.schemas import QuotaResponse
from agent_app.services.conversation import AgentService

router = APIRouter(tags=["quota"])


@router.get("/quota", response_model=QuotaResponse)
async def quota(
    user: CurrentUser = Depends(get_current_user),
    service: AgentService = Depends(get_service),
):
    return await service.quota.get(user.id)
