# 云端统一 Docker 部署

统一入口是本目录的 `docker-compose.yml` 和 `.env`。前端、后端、Agent 和 RustFS 默认一起启动，
不需要启用 `generation` profile，也不读取 `backend/.env` 或 `agent-service/.env`。
这两份配置仅用于各服务在本地单独开发。

## 服务与运行环境

| 服务 | 用途 | 宿主机端口 |
| --- | --- | --- |
| frontend | Nginx 静态网页；`/api/agent/` 转发至 Agent，其余 `/api/` 转发至后端 | 默认 `8080` |
| backend | FastAPI、认证、草稿、素材和 PSD 上传 | 不发布，容器内 `8957` |
| agent | 对话与生图 API 编排 | 不发布，容器内 `8958` |
| db | PostgreSQL 16 | 不发布 |
| redis | 登录会话、草稿缓存、PSD 上传会话；AOF 持久化 | 不发布 |
| agent-redis | 每日生图额度；独立数据卷和 AOF 持久化 | 不发布 |
| rustfs | 素材和 PSD 对象存储；私有桶、S3 API、管理控制台 | API 默认 `9000`；控制台默认仅 `127.0.0.1:9001` |

准备一台 Linux 云服务器、Docker Engine 和 Docker Compose v2（支持 `up --wait`），
起步建议 4 核 / 8GB / 100GB SSD。默认在服务器构建镜像，需要访问镜像仓库和依赖源。
也可以从镜像仓库拉取已构建的三个应用镜像。

RustFS 使用固定版本 `rustfs/rustfs:1.0.4`，可通过 `RUSTFS_IMAGE` 调整。
对象数据和日志分别保存在 `rustfsdata`、`rustfslogs` 命名卷，容器使用镜像默认的非 root 用户运行。
后端等待 RustFS 健康后启动；`deploy.sh` 自动创建 `.env` 指定的私有桶，并设置网页来源的 GET/HEAD CORS。
重复部署会复用已有桶和素材。该配置是单节点存储，需要备份素材数据卷。
已有外部存储或旧 `miniodata` 中的素材不会自动迁移到新的 RustFS 卷，更新前应明确数据来源和迁移方式。

网页 3D 预览运行在浏览器；AI 调用外部 API，网页服务器不需要 GPU。
Photoshop 还原脚本仍在 Windows + Photoshop 工作机上运行，不包含在这些 Linux 容器内。

## 1. 填写唯一的 .env

在仓库根目录执行：

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

如果已经存在 `deploy/.env`，直接编辑，避免覆盖已生成的密码。
新服务器从仓库部署时，应复制示例，并分别生成数据库密码、Redis 密码、JWT 密钥及 RustFS 访问密钥。

必填项：

| 变量 | 填写内容 |
| --- | --- |
| PUBLIC_URL | 网页来源，例如 `http://服务器IP:8080` 或 `https://design.example.com`，不带末尾 `/` |
| DB_PASSWORD / REDIS_PASSWORD / JWT_SECRET_KEY | 分别生成的随机字符串；DB/Redis 密码建议使用 `openssl rand -hex 32` |
| RUSTFS_ENDPOINT_URL | 本次 RustFS 的 S3 API 地址，例如 `http://服务器公网IP:9000` 或 S3 专用 HTTPS 域名 |
| RUSTFS_ACCESS_KEY / RUSTFS_SECRET_KEY | 设置 RustFS 的启动凭据，同时供后端连接使用；分别使用 `openssl rand -hex 16` / `openssl rand -hex 32` 生成 |
| AGENT_CHAT_BASE_URL / AGENT_CHAT_API_KEY / AGENT_CHAT_MODEL | 对话 API 根地址、密钥和支持 tool calling 的模型名 |
| AGENT_IMAGE_BASE_URL / AGENT_IMAGE_MODEL | 支持 `POST /images/generations` 的 API 根地址及模型名 |

`AGENT_IMAGE_API_KEY` 可以留空以复用对话密钥。若生图接口返回 CDN 图片 URL，
把 CDN 主机名填入 `AGENT_IMAGE_DOWNLOAD_ALLOWED_HOSTS` JSON 数组；Base64 返回不需要。
密钥中有 `$` 时，按 Compose 的 `.env` 规则用单引号包住完整值，避免变量插值。

容器间数据库、Redis、认证、素材接口地址由 Compose 自动生成，无需手动填写。
`PUBLIC_URL` 同时设置后端和 Agent 的 CORS。前端固定使用同源 `/api`，不需要设置 Vite API 地址，
修改域名也无需重新编译网页。

**RUSTFS_ENDPOINT_URL 必须同时能被服务器和用户浏览器访问。** 当前后端使用该地址生成
预签名下载链接，不能写 `http://rustfs:9000`、`localhost` 或仅容器内部可解析的地址。
HTTPS 网页应搭配 HTTPS 对象存储地址，以免浏览器拦截混合内容。
`RUSTFS_API_PORT` 默认 `9000`；修改后同步修改 `RUSTFS_ENDPOINT_URL` 中的端口或网关上游。
`RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` 必须填写自定义值，不使用镜像公开的默认账号。

### Nacos 服务注册（可选）

后端支持注册到 ERP 使用的独立 Nacos 服务器。默认关闭，不影响现有部署；
设置 `NACOS_ENABLED=true` 后，首次连接或注册失败会阻止后端启动，避免把未注册的部署误判为成功。
本次只接入后端注册，不会自动从 Nacos 发现 ERP，也不会改变前端 `/erp/` 的转发地址。
Agent 仍由本机 Nginx 代理，不单独注册。

在 `deploy/.env` 中设置（地址仅为示例）：

```dotenv
NACOS_ENABLED=true
NACOS_SERVER_ADDR=203.0.113.20:18848
NACOS_NAMESPACE_ID=
NACOS_SERVICE_NAME=woda-design-backend
NACOS_GROUP_NAME=DEFAULT_GROUP
NACOS_CLUSTER_NAME=DEFAULT
NACOS_INSTANCE_IP=10.0.0.30
NACOS_USERNAME=replace-with-nacos-username
NACOS_PASSWORD=replace-with-nacos-password
NACOS_TLS_ENABLED=true
```

- `NACOS_SERVER_ADDR` 是 Nacos HTTP 入口，不是控制台地址；可用逗号分隔多个 `host:port`。
  TLS 网关使用 `18848`，SDK 同时连接 `19848`（HTTP 端口 + 1000）；中间件安全组需允许 SDS-design 服务器访问这两个端口。
  该示例公网 IP 是占位符，必须替换，且实际地址必须与 TLS 证书中的 IP 或域名匹配。
- 内网直接连接未启用 TLS 的 Nacos 时使用 `NACOS_SERVER_ADDR=内网IP:8848`、
  `NACOS_TLS_ENABLED=false`，同时确保 `9848` 可达。
- `NACOS_NAMESPACE_ID` 填命名空间 ID，留空使用公共命名空间；分组、集群按实际环境填写。
  启用认证时账号和密码必须同时配置，并具有对应服务的注册权限。
- `NACOS_INSTANCE_IP` 是 **ERP 等调用方能够访问的 SDS-design 服务器 IP**，不是 Nacos 服务器 IP、
  `0.0.0.0` 或容器 IP。注册端口 `NACOS_INSTANCE_PORT` 留空时沿用 `HTTP_PORT`（默认 `8080`），
  通过现有 Nginx 暴露 `/api/`，无需额外发布后端 `8957`。
  须确保该入口监听在可达的服务器地址，并允许调用方访问；绑定 `127.0.0.1` 的端口不可供其他服务器直连。
  如果注册外层 HTTPS 入口，填写该入口 IP 和端口（通常 `443`），调用方需明确使用 HTTPS；
  Nacos 连接的 `NACOS_TLS_ENABLED` 不决定业务接口的协议。
- `NACOS_TLS_CA_FILE` 留空使用系统信任根。自签名证书需先只读挂载 CA 文件到后端容器，
  再设置容器内路径；不会跳过证书校验。
- `NACOS_TIMEOUT_SECONDS` 默认 `10`，限制首次注册和退出注销的等待时间。

客户端复用 ERP 的 `nacos-sdk-python==2.0.11` 和 TLS 适配，支持 Nacos 3.2 的表单认证、
单向 TLS 和 SDK 后台任务清理。临时实例通过 SDK 的 gRPC 连接维护，断线后由 SDK 自动重连和重新注册，
应用正常退出时主动注销。实例元数据为 `contextPath=/api`、`healthPath=/api/health`；
健康检查地址供调用方使用，临时实例的存活由 gRPC 连接维护。

启用后重新构建并启动后端（首次部署仍按下文启动全部服务）：

```bash
cd deploy
docker compose --env-file .env up -d --build --wait backend
```

检查 Nacos 控制台对应命名空间和分组中的 `woda-design-backend` 实例；
还要从 ERP 服务器访问 `http://注册IP:注册端口/api/health`（HTTPS 入口使用 `https://`），
确认注册的业务地址确实可达。注册成功不代表服务器间网络已经自动打通。

## 2. 启动

推荐从仓库根目录运行部署脚本：

```bash
bash deploy/deploy.sh
```

脚本会校验必填变量、构建三个应用镜像、启动包括 RustFS 在内的全部服务、等待健康检查，
随后验证 Nginx 到后端/Agent 的代理，初始化私有桶及 CORS，并检查后端到存储桶的连接。
缺失配置、构建失败、拉取失败或检查失败会返回非零退出码。
存储检查失败时服务可能已经启动，可查看日志并修复 `.env` 后重新运行脚本。
健康接口只表示进程可响应，部署检查不会调用真实模型或产生生图费用；
模型密钥和真实生成效果需登录后通过业务功能验证。

手动启动全部容器（随后仍需运行部署脚本完成建桶、CORS 和连通性验证）：

```bash
cd deploy
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build --wait --wait-timeout 180
docker compose --env-file .env ps
```

默认通过 `http://服务器IP:8080` 访问。安全组放行网页入口端口，
直接通过公网端口提供 S3 API 时还需放行 `RUSTFS_API_PORT`（默认 `9000`）。
数据库、Redis、后端和 Agent 无需开放公网端口。

### RustFS 管理控制台

控制台默认绑定宿主机 `127.0.0.1:9001`。在自己的电脑建立 SSH 隧道：

```bash
ssh -L 9001:127.0.0.1:9001 root@服务器IP
```

保持 SSH 连接，在浏览器打开 `http://127.0.0.1:9001`，使用 `.env` 中的 RustFS Access Key 和 Secret Key 登录。
可查看脚本创建的 `woda-design` 桶；桶名以 `RUSTFS_BUCKET` 为准。
修改 `RUSTFS_CONSOLE_PORT` 后，隧道命令的目标端口也要修改。
如需通过已有的认证网关访问控制台，可调整 `RUSTFS_CONSOLE_BIND_ADDRESS` 和代理设置。

## 3. 域名和 HTTPS

Compose 中的 Nginx 提供 HTTP；证书与 TLS 由云负载均衡、网关或宿主机反向代理提供。
`PUBLIC_URL=https://...` 仅声明网页来源，不会自动申请证书或启用 HTTPS。

使用同一宿主机上的 HTTPS 反向代理时，在 `.env` 设置：

```dotenv
PUBLIC_URL=https://design.example.com
HTTP_BIND_ADDRESS=127.0.0.1
HTTP_PORT=8080
```

代理转发到 `http://127.0.0.1:8080`，保留请求路径和 Authorization 请求头；
上游读取/发送超时至少 300 秒，单次请求体限制至少 50 MiB。
若入口是远程云负载均衡，应绑定服务器私网地址或 `0.0.0.0`，并仅允许负载均衡访问该端口。

RustFS 的 S3 API 使用单独域名，例如 `https://s3.example.com`，代理到宿主机 `127.0.0.1:9000`，
并保持原始 Host 和请求路径，以便 S3 签名验证。此时设置 `RUSTFS_ENDPOINT_URL=https://s3.example.com`、
`RUSTFS_API_BIND_ADDRESS=127.0.0.1`，无需公开 `9000`；控制台 `9001` 和 S3 API 是不同入口。

图片默认最大 25 MiB；PSD 默认最大 500 MiB，但通过默认 8 MiB 分片上传，
因此不需要把 Nginx 的单次请求上限改成 500 MiB。
若增大图片或分片限制，需要同时调整前端 Nginx 和外层代理的请求体限制。

## 4. 更新和维护

修改 `.env` 后使用 `up -d` 重新创建受影响容器；`restart` 不会重新加载环境变量。

```bash
cd deploy
docker compose --env-file .env up -d --wait
docker compose --env-file .env logs --tail=100 -f frontend backend agent rustfs
docker compose --env-file .env stop
```

更新代码后，从仓库根目录重新运行 `bash deploy/deploy.sh`。
使用已发布镜像时，把 `.env` 中 `FRONTEND_IMAGE`、`BACKEND_IMAGE`、`AGENT_IMAGE`
设置为仓库中同一版本的完整镜像地址，然后运行：

```bash
bash deploy/deploy.sh pull
```

私有镜像仓库需先 `docker login`。仓库 CD 流水线会构建和推送全部三个应用镜像。
GitHub 仓库变量 `IMAGE_NAMESPACE` 用于指定镜像所属用户/组织，默认值为 `woda-custom`。

PostgreSQL、主 Redis、Agent Redis 分别持久化到 `pgdata`、`redisdata`、`agentquota` 命名卷。
RustFS 素材与日志分别持久化到 `rustfsdata`、`rustfslogs` 命名卷。
保持 `COMPOSE_PROJECT_NAME` 不变，以继续使用同一组数据卷。
数据库初始化 SQL 只在首次创建空卷时执行；已有数据库改用户名、密码、库名或表结构需要另外迁移。
备份应包括 PostgreSQL 数据、RustFS 素材数据卷，以及妥善保管的 `.env`。
Agent 只有一个 worker、一个副本；重启后短期聊天记忆丢失，Redis 中额度保留。
`down` 会移除容器和网络但保留命名卷；不要给生产环境添加 `--volumes`，该选项会删除数据库、缓存及 RustFS 素材数据卷。

部署文件采用 Compose 官方支持的 `.env` 插值与必填变量校验：
[Docker 环境变量说明](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation)。
RustFS 的端口、启动参数及存储卷配置参考 [RustFS 官方 Docker 安装说明](https://docs.rustfs.com/en/installation/container/docker)。
