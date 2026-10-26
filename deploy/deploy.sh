#!/usr/bin/env bash
# 在服务器仓库中运行 bash deploy/deploy.sh [build|pull]。
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "请先复制 deploy/.env.example 为 deploy/.env，并填写域名、密钥和对象存储配置。" >&2
  exit 1
fi

mode="${1:-build}"
if [[ $# -gt 1 || ( "$mode" != build && "$mode" != pull ) ]]; then
  echo "用法：bash deploy/deploy.sh [build|pull]" >&2
  exit 1
fi

compose=(docker compose --env-file .env -f docker-compose.yml)
"${compose[@]}" config --quiet

if [[ "$mode" == pull ]]; then
  # 三个应用镜像必须已发布，且 .env 中的 IMAGE 指向对应版本；拉取失败立即停止。
  "${compose[@]}" pull
  "${compose[@]}" up -d --no-build --wait --wait-timeout 180
else
  "${compose[@]}" up -d --build --wait --wait-timeout 180
fi

# 从已启动的前端容器检查反向代理，不依赖宿主机开放后端端口或安装 curl。
"${compose[@]}" exec -T frontend wget -q -O /dev/null http://127.0.0.1/api/health
"${compose[@]}" exec -T frontend wget -q -O /dev/null http://127.0.0.1/api/agent/health
"${compose[@]}" exec -T backend python -c 'import asyncio; from app.services.object_storage import check_rustfs_health; asyncio.run(check_rustfs_health())'
"${compose[@]}" ps
echo "部署完成：前端、后端、Agent 与对象存储连接检查通过。"
