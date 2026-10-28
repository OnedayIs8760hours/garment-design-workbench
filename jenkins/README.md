# Jenkins 自动测试与构建

现有 Git 推送触发和 SCM 凭据继续使用。流水线在 **Linux 执行节点** 上运行，
自动把 Node.js、uv、Python 和依赖准备到工作区，**无需 Docker、sudo 或全局安装工具链**。

```text
Checkout → Prepare environment → Frontend test and build
         → Backend tests → Agent tests and lint → Archive frontend
```

| 阶段 | 实际执行 |
| --- | --- |
| Checkout | 清理上次 CI 产物；`checkout scm` 拉取任务配置的提交 |
| Prepare environment | 准备 Node.js 22、uv、Python 3.13，输出版本与解释器路径 |
| Frontend test and build | `npm ci` → `npm test` → `npm run build` → 打包 `dist/` |
| Backend tests | `uv sync --locked --python 3.13` → pytest，生成 JUnit XML |
| Agent tests and lint | 锁定安装 → pytest → `uv run --frozen ruff check .` |
| Archive frontend | 全部通过后归档 `artifacts/frontend-dist.tar.gz` |

任一步失败停止后续阶段；失败时也保存已生成的 Python 测试报告。
测试使用 mock，无需生产 `.env`、数据库、Redis、对象存储或真实模型密钥。
本次范围为自动测试和前端生产构建，不发布镜像或部署服务。

## 执行节点要求

- Linux x86_64 或 ARM64，使用支持官方 Node.js 二进制的 glibc 系统，例如 Debian 12 / Ubuntu 22.04。
- Bash、Git、tar、gzip、sha256sum，以及 **curl 或 wget 中至少一个**。
- Jenkins 执行用户对工作区有读写、执行权限；工作区所在文件系统不能以 `noexec` 挂载。
- 能访问 `nodejs.org`、`astral.sh`、GitHub Release 下载地址，以及锁文件中的 npm/Python 依赖源。

使用官方 Jenkins Linux 镜像时，直接在现有节点执行，无需挂载 Docker socket。
流水线下载固定版本的 Node.js 和 uv；Node.js 安装前验证官方 SHA-256 校验文件。
版本由 `Jenkinsfile` 的 `CI_NODE_VERSION` / `CI_UV_VERSION` 设置，脚本内有相同默认值。
Python 使用 uv 管理的 3.13 版本，安装目录、可执行文件目录和虚拟环境均位于工作区。

```text
.jenkins-tools/                 # 已忽略，不提交 Git
├── node-v<version>-linux-<arch>/
├── uv-<version>/
├── python/                     # Python 解释器
├── bin/                        # uv 管理的 Python 可执行文件
├── venvs/backend/              # 后端 CI 虚拟环境
├── venvs/agent-service/        # Agent CI 虚拟环境
├── cache/                      # npm / uv 下载缓存
└── downloads/                  # 安装包与安装脚本
```

后续构建复用工具和下载缓存；每次仍执行锁文件检查和依赖同步。
清空工作区后会重新下载。脚本通过自己的 PATH 使用这些工具，不修改用户 shell 配置。
测试使用独立 CI 虚拟环境，不复用服务目录已有的 `.venv`。
首次准备工具和安装依赖需要更多时间；Python 依赖下载超时设置为 120 秒。

## Jenkins 任务配置

1. 在 **Manage Jenkins → Plugins** 确认已启用 **Pipeline**、**Git** 和 **JUnit** 插件。
2. 保留现有 **Pipeline script from SCM**、仓库地址、Git 凭据及 webhook 配置。
3. Branch Specifier 设置为实际分支，例如 `*/main`。
4. **Script Path 设置为 `jenkins/Jenkinsfile`**，保存。
5. 推送配置后由现有 webhook 触发，或点击 **Build Now** 重试。

`agent any` 使用任意可用节点，不要求特定标签；若有多个节点，候选节点都应满足上述 Linux 要求，
或将它改成对应节点的真实 label。脚本不额外配置轮询或 webhook。

## 结果与产物

成功时以 `Finished: SUCCESS` 结束。构建页面可查看：

- **Artifacts → artifacts/frontend-dist.tar.gz**：完整前端 `dist/`，包含静态资源；
- **Test Result**：后端和 Agent 测试结果与历史趋势；
- **Artifacts → artifacts/backend-pytest.xml / agent-pytest.xml**：原始测试报告。

前端测试完整执行 `package.json` 的 `npm test`，结果显示在控制台。
前端包仅在整条 CI 通过后归档。后端与 Agent 仍需独立运行，Nginx `/api` 配置见 `deploy/`。
单任务禁止并发，超时 45 分钟，保留最近 20 次构建记录和最近 5 次构建的归档产物。

## 手动复现

在 Linux 节点的专用 CI 仓库工作区执行：

```bash
bash jenkins/scripts/ci.sh check
bash jenkins/scripts/ci.sh frontend
bash jenkins/scripts/ci.sh backend
bash jenkins/scripts/ci.sh agent
```

脚本会自动定位仓库根目录；前端步骤通过 `npm ci` 重建 `frontend/node_modules`。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 旧构建提示缺少 Docker CLI | 确认任务拉到了修复后的提交；新版本不调用 Docker |
| 缺少 curl / wget / tar 等基础命令 | 由节点管理员补齐提示的基础工具，或使用包含这些工具的 Linux agent |
| 工具或依赖下载失败 | 查看日志中的下载地址，检查节点网络、代理和 CA 证书；不要关闭 TLS 校验 |
| 已下载的 Node.js / uv 提示 `Permission denied` | 检查工作区权限及 `noexec` 挂载设置 |
| `No such DSL method 'junit'` | 安装或启用 JUnit 插件，再重新构建 |
| `npm ci` 报锁文件不一致 | 在开发机更新并一起提交 `package.json` 和 `package-lock.json` |
| `uv sync --locked` 失败 | 同步提交对应服务的 `pyproject.toml` 和 `uv.lock`，或检查依赖源网络 |

参考 [uv 官方安装说明](https://docs.astral.sh/uv/getting-started/installation/)、
[uv 安装目录设置](https://docs.astral.sh/uv/reference/installer/) 和
[Jenkins JUnit 报告](https://www.jenkins.io/doc/pipeline/steps/junit/)。
