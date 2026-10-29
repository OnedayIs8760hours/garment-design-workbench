#!/usr/bin/env bash
# Install as root-owned /usr/local/sbin/sds-design-deploy, used by a forced SSH command.
set -euo pipefail
environment=${SDS_DEPLOY_ENV:-prod}
case "$environment" in
  prod) root=/opt/sds-design; entrypoint=deploy/cloud/deploy.sh; state=/var/lib/sds-design; lock=/run/lock/sds-design-deploy.lock ;;
  dev) root=/opt/sds-design-dev; entrypoint=deploy/test/deploy.sh; state=/var/lib/sds-design-dev; lock=/run/lock/sds-design-dev-deploy.lock ;;
  *) echo '未知部署环境。' >&2; exit 1 ;;
esac
if [[ "${SSH_ORIGINAL_COMMAND:-}" == check ]]; then
  echo 'SDS deployment receiver ready'
  exit 0
fi
if [[ ! "${SSH_ORIGINAL_COMMAND:-}" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  echo '只允许 check 或 deploy <commit>。' >&2
  exit 1
fi
revision=${BASH_REMATCH[1]}
bundle=$(mktemp /var/tmp/sds-design-deploy.XXXXXXXX.bundle)
trap 'rm -f -- "$bundle"' EXIT
chmod 600 "$bundle"
cat > "$bundle"

# Serialize deployments from all Jenkins jobs and SSH sessions.
exec 9>"$lock"
flock -w 900 9
cd "$root"
[[ -z "$(git status --porcelain)" ]] || { echo '服务器代码有未提交修改，停止部署。' >&2; exit 1; }
git bundle verify "$bundle"
git fetch --no-tags "$bundle" HEAD
[[ "$(git rev-parse FETCH_HEAD)" == "$revision" ]] || { echo '部署包提交不匹配。' >&2; exit 1; }
git merge --ff-only "$revision"
bash "$root/$entrypoint"

mkdir -p "$state"
printf '%s\n' "$revision" > "$state/deployed-revision"
echo "DEPLOYED_COMMIT=$revision"
