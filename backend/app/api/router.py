from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.assets import router as assets_router
from app.api.routes.designs import router as designs_router
from app.api.routes.psd import router as psd_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(assets_router, prefix="/assets", tags=["assets"])
router.include_router(designs_router, prefix="/designs", tags=["designs"])
router.include_router(psd_router, prefix="/psd", tags=["psd"])
