#!/usr/bin/env bash
# Dev-only entrypoint; production keeps deploy/cloud/deploy.sh.
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
[[ -f test/.env ]] || { echo '缺少 deploy/test/.env。' >&2; exit 1; }
compose=(docker compose --env-file test/.env -f docker-compose.yml -f test/docker-compose.yml)
"${compose[@]}" config --quiet
# Refuse a misconfigured project before any build or container mutation.
"${compose[@]}" config --format json | python3 -c '
import json, sys
c = json.load(sys.stdin)
assert c["name"] == "sds-design-dev", "测试环境必须使用独立 Compose 项目"
s = c["services"]
assert all("-dev:" in s[n]["image"] for n in ("frontend", "backend", "agent")), "应用镜像必须使用 dev 名称"
assert s["backend"]["environment"]["NACOS_ENABLED"] == "false", "测试环境不能注册生产 Nacos"
assert all(p["host_ip"] == "127.0.0.1" for p in s["rustfs"]["ports"]), "存储端口仅允许本机访问"
assert all(str(p["published"]) == "8081" for p in s["frontend"]["ports"]), "测试环境端口必须为 8081"
'
# BuildKit Bake can build services concurrently despite COMPOSE_PARALLEL_LIMIT.
# Separate invocations also keep builds serial when Compose enables Bake.
for service in backend agent frontend; do
  "${compose[@]}" build "$service"
done
"${compose[@]}" up -d --no-build --wait --wait-timeout 600
"${compose[@]}" exec -T backend python -c 'import asyncio
from app.services.object_storage import ensure_rustfs_bucket, check_rustfs_health
async def initialize():
    await ensure_rustfs_bucket()
    await check_rustfs_health()
asyncio.run(initialize())'
for path in / /api/health /api/agent/health; do
  curl --fail --silent --show-error "https://38.22.234.43:8081$path" -o /dev/null
done
"${compose[@]}" ps
echo 'DEV 测试环境部署及 HTTPS、API、对象存储检查通过。'
