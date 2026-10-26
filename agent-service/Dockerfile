FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH"
COPY --from=builder /app/.venv /app/.venv
COPY agent_app ./agent_app
EXPOSE 8958
CMD ["uvicorn", "agent_app.main:app", "--host", "0.0.0.0", "--port", "8958", "--workers", "1"]
