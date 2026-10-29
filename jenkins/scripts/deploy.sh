#!/usr/bin/env bash
# Send the tested Git commit; production .env and TLS settings stay on the server.
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../.."

case "${GIT_BRANCH:-}" in
  origin/main|main) ;;
  *) echo '只有 main 分支允许部署。' >&2; exit 1 ;;
esac

revision=$(git rev-parse HEAD)
[[ "$revision" == "${GIT_COMMIT:-}" ]] || { echo '待部署提交与本次测试提交不一致。' >&2; exit 1; }
git diff --exit-code HEAD --
key=${SDS_DEPLOY_SSH_KEY:-$HOME/.ssh/sds_design_deploy}
[[ -f "$key" ]] || { echo '缺少 Jenkins 专用部署 SSH 密钥。' >&2; exit 1; }
mkdir -p artifacts
bundle=artifacts/deploy.bundle
trap 'rm -f -- "$bundle"' EXIT
git bundle create "$bundle" HEAD
ssh -i "$key" -p "${SDS_DEPLOY_PORT:-22}" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 \
  "${SDS_DEPLOY_TARGET:?请设置 SDS_DEPLOY_TARGET}" "deploy $revision" < "$bundle"
