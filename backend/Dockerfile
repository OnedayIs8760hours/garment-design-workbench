# 后端 FastAPI 镜像：多阶段构建，用 uv 安装依赖，slim 运行阶段拷入 .venv 与源码。

# --- 构建阶段 ---
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

# --- 运行阶段 ---
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/app /app/app
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8957
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8957"]