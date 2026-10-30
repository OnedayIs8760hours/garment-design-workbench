from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.assets import router as assets_router
from app.api.routes.designs import router as designs_router
from app.api.routes.psd import router as psd_router
from app.api.routes.rbac import router as rbac_router
from app.api.routes.oversight import router as oversight_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(assets_router, prefix="/assets", tags=["assets"])
router.include_router(designs_router, prefix="/designs", tags=["designs"])
router.include_router(psd_router, prefix="/psd", tags=["psd"])
router.include_router(rbac_router, prefix="/rbac", tags=["rbac"])
router.include_router(oversight_router, prefix="/oversight", tags=["oversight"])
