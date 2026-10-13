#!/usr/bin/env bash
# 一键部署脚本：在目标服务器上拉取最新镜像并重启服务。
# 用法：在服务器项目目录下运行  deploy/deploy.sh
# 前置：已把仓库同步到服务器、backend/.env 已配置、已 `docker compose build` 或镜像已推送。
set -euo pipefail

cd "$(dirname "$0")"

echo "==> 拉取最新镜像"
docker compose pull frontend backend || true

echo "==> 启动服务"
docker compose up -d

echo "==> 健康检查（后端）"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8957/api/health >/dev/null 2>&1; then
    echo "==> 后端健康检查通过"
    exit 0
  fi
  sleep 2
done

echo "==> 后端健康检查超时" >&2
docker compose ps
exit 1