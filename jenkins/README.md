# Jenkins 自动测试与构建

已有的 Git 推送触发和 SCM 凭据继续使用。流水线按顺序执行，任一步失败都会停止后续阶段：

```text
Checkout → Check environment → Frontend test and build
         → Backend tests → Agent tests and lint → Archive frontend
```

| 阶段 | 实际执行 |
| --- | --- |
| Checkout | 清理上次 CI 产物；`checkout scm` 拉取任务配置的分支/提交 |
| Check environment | 检查 Linux 节点与 Docker |
| Frontend test and build | Node.js 22 容器：`npm ci` → `npm test` → `npm run build` → 打包 `dist/` |
| Backend tests | Python 3.13 + uv 容器：`uv sync --locked --python 3.13` → `uv run --frozen pytest` |
| Agent tests and lint | Python 3.13 + uv 容器：锁定安装 → pytest → `uv run --frozen ruff check .` |
| Archive frontend | 全部通过后归档 `artifacts/frontend-dist.tar.gz` |

Python 测试生成 JUnit XML，在 Jenkins 构建页展示测试结果与历史趋势；失败时也保存已生成的报告。
前端完整执行 `package.json` 的 `npm test`，结果显示在控制台。
测试使用 mock，无需生产 `.env`、数据库、Redis、对象存储或真实模型密钥。
本次范围是自动测试与前端生产构建，不包含发布镜像或部署服务。

## 1. 执行节点要求

执行节点需要 **Linux、Bash、Git、Docker CLI**，Docker daemon 必须可用，
运行 Jenkins 任务的用户必须有 Docker 访问权限。无需在宿主机安装 Node.js、Python 或 uv。
流水线直接调用 Docker CLI，无需 Docker Pipeline 插件。

使用 Jenkins 的执行用户验证：

```bash
git --version
bash --version
docker version
docker info
```

若宿主机通过 `docker` 用户组授权，可由管理员执行以下命令，再重启对应 Jenkins 服务或 agent，
让新进程取得组权限。将 `jenkins` 替换为实际执行用户：

```bash
sudo usermod -aG docker jenkins
```

默认使用以下公共镜像，可在 `Jenkinsfile` 的 `environment` 中修改为内部镜像地址：

- `NODE_CI_IMAGE=node:22-bookworm-slim`
- `PYTHON_CI_IMAGE=ghcr.io/astral-sh/uv:python3.13-bookworm-slim`

节点需要能访问 Docker Hub、GHCR，以及锁文件中使用的 npm/Python 下载地址。
首次构建会拉取镜像和安装依赖，耗时会比后续构建长。
Python 虚拟环境放在容器 `/tmp/ci-venv`，不复用工作区 `.venv`；容器以执行用户的 UID/GID 运行，
避免产物变成 root 所有。每次测试结束删除容器及其临时 Python 依赖，Docker 镜像保留供后续构建使用。

### Jenkins 本身运行在 Docker 容器里

Docker 命令在 **Jenkins 执行节点** 上运行。若节点本身也是容器，需要：

1. 节点容器内安装 Docker CLI，并连接可用的 Docker daemon，例如挂载宿主机 Docker socket。
2. 节点用户有访问 socket 的权限。
3. **工作区在节点容器内和 Docker 宿主机上使用相同的绝对路径。**

脚本将当前仓库路径绑定到测试容器的 `/workspace`。
例如节点容器内的 Jenkins Home 为 `/var/jenkins_home`，宿主机也应将数据放在
`/var/jenkins_home` 并按 `-v /var/jenkins_home:/var/jenkins_home` 挂载。
若使用 `-v /data/jenkins:/var/jenkins_home` 或命名卷，宿主机通常无法通过相同路径找到工作区；
需调整映射，或改用直接运行在宿主机上的 Linux agent。远程 Docker daemon 同样必须能访问该工作区路径。

## 2. Jenkins 任务配置

1. 在 **Manage Jenkins → Plugins** 确认已安装 **Pipeline**、**Git** 和 **JUnit** 插件。
2. 使用现有 **Pipeline** 任务，Definition 选择 **Pipeline script from SCM**。
3. SCM 选择 Git，保留已跑通的仓库地址、拉取凭据和推送触发配置。
4. Branch Specifier 使用实际目标分支，例如 `*/main`。
5. **Script Path 设置为 `jenkins/Jenkinsfile`**，保存。
6. 推送这些配置文件后点击一次 **Build Now**，确认环境与整条流水线通过；以后由现有 webhook 自动触发。

`agent any` 使用任意可用节点，不要求 `linux`、`docker` 标签。
若有多个节点，需保证候选节点都符合要求，或把它改为已有 Linux Docker 节点的真实 label。
脚本不新增轮询或 webhook 触发器，避免与现有触发方式重复。
如果任务还保留旧版发布参数，可在配置中取消“参数化构建过程”；当前脚本不读取发布参数。

## 3. 结果与产物

成功时控制台以 `Finished: SUCCESS` 结束。构建页面可查看：

- **Artifacts → artifacts/frontend-dist.tar.gz**：完整前端 `dist/`，包括静态资源；
- **Test Result**：后端和 Agent 测试结果；
- **Artifacts → artifacts/backend-pytest.xml / agent-pytest.xml**：原始报告。

例如在空目录解压前端包：

```bash
tar -xzf frontend-dist.tar.gz -C /path/to/empty-directory
```

包内容用于静态站点交付；后端与 Agent 仍需独立运行，Nginx `/api` 代理配置见 `deploy/`。
流水线设置单任务不并发构建、45 分钟超时、保留最近 20 次构建记录和最近 5 次构建的归档产物。
前端包仅在整条 CI 通过后归档；后续测试失败时，不会把该次前端包作为通过的构建发布。
脚本会在退出时清理本次测试容器。

## 4. 手动复现

在满足相同要求的 Linux 节点、仓库根目录执行：

```bash
bash jenkins/scripts/ci.sh check
bash jenkins/scripts/ci.sh frontend
bash jenkins/scripts/ci.sh backend
bash jenkins/scripts/ci.sh agent
```

脚本可从其他目录调用；它会自动定位仓库根目录。产物统一写入根目录 `artifacts/`，已加入 Git 忽略。
运行前端检查会通过 `npm ci` 重建该工作区的 `frontend/node_modules`，建议使用专用 CI 工作区。

## 5. 常见问题

| 现象 | 处理 |
| --- | --- |
| `docker: command not found` | 在实际执行节点安装 Docker CLI；仅在宿主机安装而节点容器里没有也会报此错 |
| `permission denied` / 无法连接 daemon | 检查 Docker 服务、socket 挂载、执行用户组权限；变更后重启节点进程 |
| `bind source path does not exist` / 容器看不到锁文件 | 按上文检查节点与 Docker 宿主机的工作区路径映射 |
| GHCR / Docker Hub 拉取失败 | 检查网络、代理和镜像源，必要时替换 `Jenkinsfile` 中的两个镜像地址 |
| `No such DSL method 'junit'` | 安装或启用 JUnit 插件，再重新构建 |
| `npm ci` 报锁文件不一致 | 在开发机更新并一起提交 `package.json` 和 `package-lock.json` |
| `uv sync --locked` 失败 | 同步提交对应服务的 `pyproject.toml` 和 `uv.lock`，或检查依赖源网络 |
| 一直等待旧的 `linux&&docker` label | 停止旧构建，确认任务拉到新脚本后重新启动；旧排队构建不会自动换脚本 |

语法与运行机制参考 [Jenkins Pipeline 文档](https://www.jenkins.io/doc/book/pipeline/syntax/)、
[JUnit 报告文档](https://www.jenkins.io/doc/pipeline/steps/junit/) 和
[Docker run 文档](https://docs.docker.com/reference/cli/docker/container/run/)。
