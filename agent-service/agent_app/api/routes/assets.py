from fastapi import APIRouter, Depends

from agent_app.api.auth import CurrentUser, get_current_user
from agent_app.api.dependencies import get_service
from agent_app.schemas import GeneratedImage
from agent_app.services.conversation import AgentService

router = APIRouter(tags=["assets"])


@router.post("/assets/save", response_model=GeneratedImage)
async def save_generated_image(
    image: GeneratedImage,
    user: CurrentUser = Depends(get_current_user),
    service: AgentService = Depends(get_service),
):
    # Storage retries never call the image model and never reserve quota.
    return await service.storage.save(image, user.access_token)
