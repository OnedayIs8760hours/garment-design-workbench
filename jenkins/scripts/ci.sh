#!/usr/bin/env bash
# 与 Jenkinsfile 共用，也可在 Linux 仓库根目录手动执行。
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

node_image=${NODE_CI_IMAGE:-node:22-bookworm-slim}
python_image=${PYTHON_CI_IMAGE:-ghcr.io/astral-sh/uv:python3.13-bookworm-slim}

run_ci() (
  service=$1 image=$2 command=$3
  cid_dir=$(mktemp -d)

  # 取消/超时退出时同步删除容器。子 shell 保留 EXIT trap 所需变量。
  trap 'if [ -s "$cid_dir/container.cid" ]; then
    docker rm --force "$(cat "$cid_dir/container.cid")" >/dev/null 2>&1 || true
  fi
  rm -f -- "$cid_dir/container.cid"
  rmdir -- "$cid_dir"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  docker run --rm --init \
    --cidfile "$cid_dir/container.cid" \
    --user "$(id -u):$(id -g)" \
    --env CI=true \
    --env HOME=/tmp \
    --env UV_CACHE_DIR=/tmp/uv-cache \
    --env UV_PROJECT_ENVIRONMENT=/tmp/ci-venv \
    --env UV_HTTP_TIMEOUT=120 \
    --mount "type=bind,source=$repo_root,target=/workspace" \
    --workdir "/workspace/$service" \
    "$image" sh -eu -c "$command"
)

case "${1:-}" in
  check)
    command -v docker >/dev/null || {
      echo '执行节点缺少 Docker CLI，请先安装 Docker。' >&2
      exit 1
    }
    docker version
    docker info >/dev/null
    ;;
  frontend)
    mkdir -p artifacts
    rm -f -- artifacts/frontend-dist.tar.gz
    run_ci frontend "$node_image" '
      test -f package-lock.json || {
        echo "容器看不到 frontend/package-lock.json，请检查 Jenkins 与 Docker 宿主机的工作区路径映射。" >&2
        exit 1
      }
      node --version
      npm --version
      npm ci --no-audit --no-fund
      npm test
      npm run build
      tar -czf /workspace/artifacts/frontend-dist.tar.gz -C dist .
    '
    ;;
  backend|agent)
    service=backend
    report=backend-pytest.xml
    if [ "$1" = agent ]; then
      service=agent-service
      report=agent-pytest.xml
    fi
    mkdir -p artifacts
    rm -f -- "artifacts/$report"
    run_ci "$service" "$python_image" '
      test -f uv.lock || {
        echo "容器看不到 uv.lock，请检查 Jenkins 与 Docker 宿主机的工作区路径映射。" >&2
        exit 1
      }
      python --version
      uv --version
      uv sync --locked --python 3.13
      if [ "$PWD" = /workspace/agent-service ]; then
        uv run --frozen pytest --junitxml=/workspace/artifacts/agent-pytest.xml
        uv run --frozen ruff check .
      else
        uv run --frozen pytest --junitxml=/workspace/artifacts/backend-pytest.xml
      fi
    '
    ;;
  *)
    echo '用法: bash jenkins/scripts/ci.sh {check|frontend|backend|agent}' >&2
    exit 2
    ;;
esac
