from fastapi import APIRouter

from agent_app.api.routes import assets, chat, health, quota

router = APIRouter(prefix="/api/agent")
router.include_router(health.router)
router.include_router(chat.router)
router.include_router(assets.router)
router.include_router(quota.router)
