from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.assets import router as assets_router
from app.api.routes.designs import router as designs_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(assets_router, prefix="/assets", tags=["assets"])
router.include_router(designs_router, prefix="/designs", tags=["designs"])
