#!/usr/bin/env bash
# 在 Jenkins 工作区准备工具并运行 CI；无需 Docker、sudo 或全局安装。
set -euo pipefail

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"
[ "$(uname -s)" = Linux ] || fail '此 CI 脚本需要 Linux 执行节点。'
case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64|arm64) node_arch=arm64 ;;
  *) fail "不支持的 CPU 架构: $(uname -m)" ;;
esac

node_version=${CI_NODE_VERSION:-22.23.4}
uv_version=${CI_UV_VERSION:-0.13.6}
tools_root="$repo_root/.jenkins-tools"
node_dist="node-v$node_version-linux-$node_arch"
node_home="$tools_root/$node_dist"
uv_home="$tools_root/uv-$uv_version"
export PATH="$node_home/bin:$uv_home:$tools_root/bin:$PATH"
export CI=true
export UV_CACHE_DIR="$tools_root/cache/uv"
export UV_PYTHON_INSTALL_DIR="$tools_root/python"
export UV_PYTHON_BIN_DIR="$tools_root/bin"
export UV_PYTHON_PREFERENCE=only-managed
export UV_HTTP_TIMEOUT=120
export npm_config_cache="$tools_root/cache/npm"

# .part 文件避免中断下载后误用不完整文件；所有安装均限定在当前工作区。
download() {
  local url=$1 destination=$2
  printf '下载 %s\n' "$url"
  if command -v curl >/dev/null; then
    curl --fail --location --silent --show-error --retry 3 \
      --connect-timeout 20 --max-time 600 --output "$destination.part" "$url" ||
      fail "下载失败，请检查执行节点网络: $url"
  elif command -v wget >/dev/null; then
    wget -nv --tries=3 --timeout=120 -O "$destination.part" "$url" ||
      fail "下载失败，请检查执行节点网络: $url"
  else
    fail '执行节点需要 curl 或 wget 才能下载 CI 工具。'
  fi
  mv -f -- "$destination.part" "$destination"
}

prepare_environment() {
  local tool archive checksums digest name verified
  for tool in tar gzip sha256sum; do
    command -v "$tool" >/dev/null || fail "执行节点缺少基础工具: $tool"
  done
  mkdir -p "$tools_root/downloads"

  if [ ! -f "$node_home/.ready" ]; then
    archive="$node_dist.tar.gz"
    checksums="$tools_root/downloads/node-$node_version-SHASUMS256.txt"
    download "https://nodejs.org/dist/v$node_version/$archive" "$tools_root/downloads/$archive"
    download "https://nodejs.org/dist/v$node_version/SHASUMS256.txt" "$checksums"
    verified=false
    while read -r digest name; do
      if [ "$name" = "$archive" ]; then
        printf '%s  %s\n' "$digest" "$tools_root/downloads/$archive" | sha256sum --check -
        verified=true
        break
      fi
    done < "$checksums"
    [ "$verified" = true ] || fail "官方校验文件中未找到 $archive"
    mkdir -p "$node_home"
    tar -xzf "$tools_root/downloads/$archive" --strip-components=1 -C "$node_home"
    "$node_home/bin/node" --version
    "$node_home/bin/npm" --version
    touch "$node_home/.ready"
  fi

  if [ ! -x "$uv_home/uv" ]; then
    download "https://astral.sh/uv/$uv_version/install.sh" "$tools_root/downloads/uv-$uv_version-install.sh"
    UV_UNMANAGED_INSTALL="$uv_home" sh "$tools_root/downloads/uv-$uv_version-install.sh"
  fi

  node --version
  npm --version
  uv --version
  # uv 同时把解释器和可执行文件放在工作区，不修改系统 Python 或 shell 配置。
  uv python install 3.13
  uv python find 3.13
}

require_environment() {
  [ -f "$node_home/.ready" ] && [ -x "$uv_home/uv" ] ||
    fail 'CI 工具尚未准备完成，请先执行 bash jenkins/scripts/ci.sh check。'
}

case "${1:-}" in
  check)
    prepare_environment
    ;;
  frontend)
    require_environment
    mkdir -p artifacts
    rm -f -- artifacts/frontend-dist.tar.gz
    cd frontend
    npm ci --no-audit --no-fund
    npm test
    npm run build
    tar -czf "$repo_root/artifacts/frontend-dist.tar.gz" -C dist .
    ;;
  backend|agent)
    require_environment
    service=backend
    report=backend-pytest.xml
    if [ "$1" = agent ]; then
      service=agent-service
      report=agent-pytest.xml
    fi
    mkdir -p artifacts
    rm -f -- "artifacts/$report"
    export UV_PROJECT_ENVIRONMENT="$tools_root/venvs/$service"
    cd "$service"
    uv sync --locked --python 3.13
    uv run --frozen pytest --junitxml="$repo_root/artifacts/$report"
    if [ "$service" = agent-service ]; then
      uv run --frozen ruff check .
    fi
    ;;
  *)
    echo '用法: bash jenkins/scripts/ci.sh {check|frontend|backend|agent}' >&2
    exit 2
    ;;
esac
