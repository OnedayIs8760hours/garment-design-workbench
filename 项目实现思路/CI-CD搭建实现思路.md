# CI/CD 搭建实现思路

> 本文保留最初的 CI/CD 方案记录。当前 CI 已包含 Agent，CD 会构建前端、后端和 Agent 三个镜像；
> 云端使用 `deploy/docker-compose.yml` 与唯一的 `deploy/.env`，同时启动 RustFS 并初始化私有桶，不再使用下文旧的服务级环境文件配置。
> 实际部署、更新、HTTPS 与存储接入请以 [云端统一部署说明](../deploy/README.md) 为准。

## 背景

项目目前没有 CI/CD 配置、没有 Dockerfile、没有流水线。交付靠手动 `npm test` / `npm run build` / `uv run pytest`，容易漏测、漏构建。

目标：搭建一套基于 **GitHub Actions** 的持续集成 + 持续交付体系：

- **CI（已验证可落地）**：每次 push / PR 自动跑前端单测+构建、后端 pytest。
- **CD（预留）**：镜像构建、推送 GHCR、部署脚本，配套 Dockerfile 与 docker-compose 全栈编排。

## 现状事实

| 层 | 技术栈 | 可复现文件 | 验证命令 |
|---|---|---|---|
| 前端 | Vite 7 + React 19，Node ≥20 | `frontend/package-lock.json` | `npm ci` → `npm run build` → `npm test` |
| 后端 | FastAPI + Python 3.13，uv | `backend/uv.lock` | `uv sync --locked` → `uv run pytest` |

- 后端现有测试**全部 mock**（`test_health` 仅 import app，无需 Postgres/Redis/RustFS），可在无外部服务下跑通——因此 CI 不需要 service 容器。
- 项目依赖外部服务：PostgreSQL、Redis、RustFS（S3 兼容对象存储，真实为 `RustFS_*` 配置）。CD 按「自建 VPS + Docker Compose」作为推荐路线。

## 一、CI 设计（`.github/workflows/ci.yml`）

单个 workflow、两个并行 job，触发于 `push`(main/dev) 与 `PR`，用 `actions/checkout@v4`。

### Job 1: frontend
- `actions/setup-node@v4`，`node-version: 20`
- `npm ci`（锁文件，可复现）
- `npm run build`（先构建，保证产物通过）
- `npm test`（跑 `src/model.test.js` 自检）

### Job 2: backend
- `astral-sh/setup-uv@v6`（官方 uv action，自带缓存）
- `uv sync --locked`（含 dev 组，装 pytest）
- `uv run pytest`（无需外部服务）

失败即红灯，拦截合并。

## 二、CD 设计（预留）

### 2.1 镜像构建（`.github/workflows/cd.yml`）
触发：`workflow_dispatch` 手动 + `push tags: v*`。
- `build-push-action@v6` 构建前后端镜像 → 推 **GHCR**，打 `latest` + `vX.Y.Z`。

### 2.2 Dockerfile
- **前端 `frontend/Dockerfile`**：多阶段 —— `node:20-alpine` 构建静态 `dist/` → `nginx:alpine` 提供服务，`nginx.conf` 里 `/api` 反向代理到后端。
- **后端 `backend/Dockerfile`**：多阶段 —— `ghcr.io/astral-sh/uv:python3.13-bookworm-slim` 安装依赖 → `python:3.13-slim` 运行阶段拷入 `.venv` 与 `app/`。

### 2.3 全栈编排（`deploy/docker-compose.yml`）
单机全栈，内部网络 + `env_file: ../backend/.env`：
- `frontend`（nginx，暴露外部端口）
- `backend`（uvicorn，依赖 db/redis/objectstore）
- `db`（postgres:16）
- `redis`（redis:7-alpine）
- `objectstore`（**MinIO** 作为 S3 兼容存储；生产切回真实 RustFS 只需改 `RUSTFS_*` 指向）

> 说明：RustFS 是真实使用的 S3 兼容对象存储。compose 中 MinIO 为本地/演示替身，`backend/.env` 的 `RUSTFS_ENDPOINT_URL` / key / bucket 结构完全兼容，切换只改指向。

### 2.4 部署脚本（`deploy/deploy.sh`）
SSH 到 VPS：拉镜像、备份 `.env`、`docker compose pull && up -d`、`curl /api/health` 健康检查。也可用 `appleboy/ssh-action@v1` 在 cd.yml 直接远程执行（需 `SSH_HOST/SSH_USER/SSH_KEY/SSH_PORT` 四个 Secret）。

## 待定事项（确定部署目标后补全）

- [ ] 选定 VPS / 云平台，补全 `SSH_*` 四个 Secret。
- [ ] 决定 cd.yml 是否用 ssh-action 直连，还是由服务器 cron 拉镜像自更新。
- [ ] 决定镜像推送目标：GHCR（推荐，私有免费）或 Docker Hub。

## 实施步骤

1. 新增 `项目实现思路/CI-CD搭建实现思路.md`（本文档）。
2. 新增 `.github/workflows/ci.yml`，本地验证后推送，Actions 变绿。
3. 新增 `frontend/Dockerfile`、`frontend/nginx.conf`、`backend/Dockerfile`、`deploy/docker-compose.yml`、`deploy/deploy.sh`。
4. 新增 `.github/workflows/cd.yml`。
5. 更新 `AGENTS.md`、`README.md` 补充 CI/CD 说明。

## 验证方式

- **CI**：提交后 Actions 里 `ci` workflow 两次运行均绿。故意改坏一处断言确认会红灯拦截。
- **本地等价验证**：
  ```powershell
  cd frontend; npm ci; npm run build; npm test
  cd ../backend; uv sync --locked; uv run pytest
  ```
- **CD（有部署目标后）**：手动触发 cd.yml → GHCR 出现镜像 → 服务器 `docker compose up -d` → `curl http://<host>/api/health` 返回 `{"status":"ok",...}`。
