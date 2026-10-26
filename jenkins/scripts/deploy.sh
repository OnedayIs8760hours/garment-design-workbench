#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
: "${DEPLOY_HOST:?请设置 DEPLOY_HOST}"
: "${DEPLOY_USER:?请设置 DEPLOY_USER}"
: "${DEPLOY_DIR:?请设置 DEPLOY_DIR}"
: "${REGISTRY:?请设置 REGISTRY}"
: "${IMAGE_NAMESPACE:?请设置 IMAGE_NAMESPACE}"
: "${IMAGE_TAG:?请设置 IMAGE_TAG}"
: "${KNOWN_HOSTS_FILE:?请绑定 known_hosts 文件}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"

# 参数会传给远端 shell；限定字符，避免远端命令解释任意输入。
if [[ ! "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ||
      ! "$DEPLOY_USER" =~ ^[a-z_][a-zA-Z0-9_-]*$ ||
      ! "$DEPLOY_PORT" =~ ^[0-9]{1,5}$ ||
      ! "$DEPLOY_DIR" =~ ^/[a-zA-Z0-9_/-]+$ ||
      "$DEPLOY_DIR" == / || "$DEPLOY_DIR" == *'/../'* || "$DEPLOY_DIR" == */.. ||
      ! "$REGISTRY" =~ ^[a-z0-9][a-z0-9.-]*(:[0-9]+)?$ ||
      ! "$IMAGE_NAMESPACE" =~ ^[a-z0-9]+([._/-][a-z0-9]+)*$ ||
      ! "$IMAGE_TAG" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]]; then
  echo '部署参数格式不正确；目录须为不含空格和 .. 的绝对路径。' >&2
  exit 1
fi
if (( 10#$DEPLOY_PORT < 1 || 10#$DEPLOY_PORT > 65535 )); then
  echo 'SSH 端口必须在 1–65535 之间。' >&2
  exit 1
fi

ssh_options=(-p "$DEPLOY_PORT" -o BatchMode=yes -o ConnectTimeout=15
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$KNOWN_HOSTS_FILE")
target="$DEPLOY_USER@$DEPLOY_HOST"
prefix="$REGISTRY/$IMAGE_NAMESPACE/woda-design"

# 只同步本次提交的部署文件，不传输服务器 .env，也不依赖服务器 git pull。
ssh "${ssh_options[@]}" "$target" "test -f '$DEPLOY_DIR/deploy/.env'"
tar -czf - deploy/docker-compose.yml deploy/deploy.sh backend/db/init.sql |
  ssh "${ssh_options[@]}" "$target" "tar -xzf - -C '$DEPLOY_DIR'"

ssh "${ssh_options[@]}" "$target" "bash -s -- '$DEPLOY_DIR' '$prefix' '$IMAGE_TAG'" <<'REMOTE'
set -euo pipefail
cd "$1"
export FRONTEND_IMAGE="$2-frontend:$3"
export BACKEND_IMAGE="$2-backend:$3"
export AGENT_IMAGE="$2-agent:$3"
bash deploy/deploy.sh pull

# 只有健康检查全部通过才记录版本，供维护和回滚时查阅。
umask 077
printf 'FRONTEND_IMAGE=%s\nBACKEND_IMAGE=%s\nAGENT_IMAGE=%s\n' \
  "$FRONTEND_IMAGE" "$BACKEND_IMAGE" "$AGENT_IMAGE" > deploy/jenkins-release.env
REMOTE
