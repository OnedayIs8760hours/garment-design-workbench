# Jenkins CI/CD

流水线入口为 `jenkins/Jenkinsfile`，复用项目现有 Dockerfile、
`deploy/docker-compose.yml` 和 `deploy/deploy.sh`，包含前端、后端和 Agent 三个服务。

```text
jenkins/
├── Jenkinsfile          # 测试 → 构建镜像 → 推送镜像 → SSH 部署
├── README.md            # 节点、凭据、任务和部署配置
└── scripts/
    ├── images.sh        # 构建或推送三个相同版本的应用镜像
    └── deploy.sh        # 同步部署文件，拉取镜像并验证服务健康
```

## 1. 准备 Jenkins 节点

本目录针对 Linux 执行节点。给节点添加 `linux` 和 `docker` 标签，并安装：

- Git、Bash、tar、OpenSSH client（含 ssh-agent）。
- Node.js 22.12+ 与 npm。
- uv、Python 3.13，可预先运行 `uv python install 3.13`。
- Docker Engine，执行 Jenkins 任务的用户可以运行 `docker build` 和 `docker push`。

Jenkins 安装 Pipeline、Git、Credentials Binding、JUnit 和 SSH Agent 插件。
Multibranch Pipeline 对接 GitHub 时还需 GitHub Branch Source 插件。
节点须能访问 npm、Python 依赖源、镜像仓库和部署服务器。
镜像在当前节点本地构建；节点与部署服务器须使用相同 CPU 架构。

## 2. 创建任务

1. 新建 **Pipeline**，Definition 选择 **Pipeline script from SCM**。
2. SCM 选择 Git，填写仓库地址、拉取凭据与目标分支。
3. **Script Path 填 `jenkins/Jenkinsfile`**，不是根目录 `Jenkinsfile`。
4. 保存后运行一次，之后通过 **Build with Parameters** 选择模式。

| MODE | 行为 | 额外配置 |
| --- | --- | --- |
| CI（默认） | 前端 `npm ci / build / test`；后端 pytest；Agent pytest / Ruff | 无需发布或 SSH 凭据 |
| BUILD | CI 通过后构建三个镜像 | 可用的 Docker daemon |
| PUBLISH | BUILD 后登录并推送三个镜像 | 镜像仓库、命名空间、仓库凭据 |
| DEPLOY | PUBLISH 后通过 SSH 更新服务器 | 部署参数、SSH 凭据和 known_hosts |

测试失败会阻止后续阶段，pytest 结果会显示在 Jenkins 测试报告中。
镜像版本为 `<Jenkins构建号>-<Git提交前12位>`，三个服务使用相同版本，不覆盖 `latest`。
`disableConcurrentBuilds()` 防止同一任务重叠部署；同一环境应只由一个发布任务负责。
若使用 Multibranch Pipeline，分支/PR 任务保持默认 CI，发布使用受控分支的独立 Pipeline 任务。

推送自动触发需要在 Jenkins 任务及 Git 托管平台配置对应 webhook；提交本目录不会自动创建任务。
现有 `.github/workflows/` 仍按原规则运行；完成 Jenkins 验证后，可在仓库 Actions 设置中停用重复工作流。

## 3. 配置凭据和发布参数

在 Jenkins Credentials 中创建以下凭据，ID 可通过流水线参数调整：

| 默认 ID | 类型 | 内容 |
| --- | --- | --- |
| sds-registry | Username with password | 仓库用户名与可推送镜像的密码/Token；GHCR 使用 PAT |
| sds-deploy-ssh | SSH Username with private key | 部署用户的 SSH 私钥；用户名与 `DEPLOY_USER` 一致 |
| sds-known-hosts | Secret file | 已核实服务器主机公钥的 known_hosts 文件 |

`REGISTRY` 默认 `ghcr.io`，`IMAGE_NAMESPACE` 默认 `woda-custom`，发布前改成自己有权限的命名空间。
`DEPLOY_HOST` 填服务器域名或 IPv4，`DEPLOY_PORT` 默认 `22`，`DEPLOY_USER` 默认 `deploy`，
`DEPLOY_DIR` 默认 `/opt/sds-design`（只支持无空格的绝对路径）。
非 22 端口的 known_hosts 条目使用 `[主机]:端口` 格式。
脚本严格校验 SSH 主机公钥；主机密钥应通过可信渠道核实后再保存。

仓库登录信息由 Credentials Binding 注入，推送时使用临时 Docker 认证目录，结束后删除。
数据库、对象存储和模型密钥保留在服务器 `deploy/.env`。

## 4. 首次准备服务器

服务器安装 Docker Engine、Docker Compose v2（支持 `up --wait`）、Bash 和 tar。
部署用户需要目录写入权限与 Docker 使用权限。按 [统一部署说明](../deploy/README.md)
准备对象存储、域名和生产配置：

1. 在目标目录中创建 `deploy/`，把仓库 `deploy/.env.example` 复制为服务器上的 `deploy/.env`。
2. 填好全部生产配置并设置文件权限 `600`。已有部署保持原目录及 `COMPOSE_PROJECT_NAME`，以继续使用原数据卷。
3. 若使用私有镜像，在服务器上以部署用户执行 `docker login <仓库>`，配置只读拉取凭据。
4. 在 Jenkins 选择 `MODE=DEPLOY` 并填写发布参数。

流水线同步当前提交的 Compose、部署脚本和数据库初始化 SQL，
通过环境变量指定本次三个镜像，再调用 `bash deploy/deploy.sh pull`。
它等待容器健康、检查后端/Agent 反向代理和对象存储，失败返回非零状态。
部署失败可能已有部分服务更新；流水线不自动回滚，也不执行数据库迁移。

## 5. 手动维护与回滚

部署通过后，服务器 `deploy/jenkins-release.env` 记录最近一次成功部署的镜像地址，
不会自动改写生产 `.env`。手动维护时先加载该文件，防止回到 `.env` 中的旧镜像：

```bash
cd /opt/sds-design
set -a
source deploy/jenkins-release.env
set +a
bash deploy/deploy.sh pull
```

回滚时将上述文件中的三个镜像标签都改为目标历史版本，再执行同样命令。
需要配套旧版部署配置时，从对应 Git 提交恢复 Compose、部署脚本和初始化 SQL。
数据库数据及表结构不随镜像回滚，变更前按项目部署说明备份。

配置语法参考 [Jenkins Declarative Pipeline](https://www.jenkins.io/doc/book/pipeline/syntax/)
和 [SSH Agent Pipeline step](https://www.jenkins.io/doc/pipeline/steps/ssh-agent/)。
