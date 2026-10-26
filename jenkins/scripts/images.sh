#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
mode="${1:-build}"
if [[ $# -gt 1 || ( "$mode" != build && "$mode" != push ) ]]; then
  echo '用法：bash jenkins/scripts/images.sh [build|push]' >&2
  exit 1
fi

: "${REGISTRY:?请设置 REGISTRY}"
: "${IMAGE_NAMESPACE:?请设置 IMAGE_NAMESPACE}"
: "${IMAGE_TAG:?请设置 IMAGE_TAG}"
if [[ ! "$REGISTRY" =~ ^[a-z0-9][a-z0-9.-]*(:[0-9]+)?$ ||
      ! "$IMAGE_NAMESPACE" =~ ^[a-z0-9]+([._/-][a-z0-9]+)*$ ||
      ! "$IMAGE_TAG" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]]; then
  echo '镜像仓库、命名空间或版本标签格式不正确。' >&2
  exit 1
fi

if [[ "$mode" == push ]]; then
  : "${REGISTRY_USER:?请绑定镜像仓库用户名}"
  : "${REGISTRY_PASSWORD:?请绑定镜像仓库密码或 Token}"
  # 临时认证目录，避免改动节点上其他任务的 Docker 登录状态。
  DOCKER_CONFIG="$(mktemp -d)"
  export DOCKER_CONFIG
  trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
  printf '%s' "$REGISTRY_PASSWORD" | docker login "$REGISTRY" --username "$REGISTRY_USER" --password-stdin
fi

for service in frontend backend agent; do
  context="$service"
  if [[ "$service" == agent ]]; then
    context=agent-service
  fi
  image="$REGISTRY/$IMAGE_NAMESPACE/woda-design-$service:$IMAGE_TAG"
  if [[ "$mode" == build ]]; then
    docker build --pull --tag "$image" "$context"
  else
    docker push "$image"
  fi
done
