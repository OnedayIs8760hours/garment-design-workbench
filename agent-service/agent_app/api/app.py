from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_app.api.exception_handlers import register_exception_handlers
from agent_app.api.router import router
from agent_app.bootstrap import create_container
from agent_app.core.config import CorsSettings, Settings


def create_app(settings: Settings | None = None, *, http=None, redis=None, model=None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with create_container(settings, http=http, redis=redis, model=model) as container:
            app.state.container = container
            try:
                yield
            finally:
                del app.state.container

    app = FastAPI(title="woda Design Agent Service", version="0.1.0", lifespan=lifespan)
    # API keys are validated during startup, not module import.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=(settings or CorsSettings()).cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_exception_handlers(app)
    app.include_router(router)
    return app
