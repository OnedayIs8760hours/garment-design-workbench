#!/usr/bin/env bash
# Install as root-owned /usr/local/sbin/sds-design-deploy, used by a forced SSH command.
set -euo pipefail
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
exec 9>/run/lock/sds-design-deploy.lock
flock -w 900 9
cd /opt/sds-design
[[ -z "$(git status --porcelain)" ]] || { echo '服务器代码有未提交修改，停止部署。' >&2; exit 1; }
git bundle verify "$bundle"
git fetch --no-tags "$bundle" HEAD
[[ "$(git rev-parse FETCH_HEAD)" == "$revision" ]] || { echo '部署包提交不匹配。' >&2; exit 1; }
git merge --ff-only "$revision"
bash /opt/sds-design/deploy/cloud/deploy.sh

mkdir -p /var/lib/sds-design
printf '%s\n' "$revision" > /var/lib/sds-design/deployed-revision
echo "DEPLOYED_COMMIT=$revision"
