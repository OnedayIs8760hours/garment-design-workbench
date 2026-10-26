"""ASGI entry point: uvicorn agent_app.main:app."""

from agent_app.api.app import create_app

app = create_app()
