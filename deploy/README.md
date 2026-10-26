# 云端统一 Docker 部署

统一入口是本目录的 `docker-compose.yml` 和 `.env`。前端、后端和 Agent 默认一起启动，
不需要启用 `generation` profile，也不读取 `backend/.env` 或 `agent-service/.env`。
这两份配置仅用于各服务在本地单独开发。

## 服务与外部依赖

| 服务 | 用途 | 宿主机端口 |
| --- | --- | --- |
| frontend | Nginx 静态网页；`/api/agent/` 转发至 Agent，其余 `/api/` 转发至后端 | 默认 `8080` |
| backend | FastAPI、认证、草稿、素材和 PSD 上传 | 不发布，容器内 `8957` |
| agent | 对话与生图 API 编排 | 不发布，容器内 `8958` |
| db | PostgreSQL 16 | 不发布 |
| redis | 登录会话、草稿缓存、PSD 上传会话；AOF 持久化 | 不发布 |
| agent-redis | 每日生图额度；独立数据卷和 AOF 持久化 | 不发布 |

准备一台 Linux 云服务器、Docker Engine 和 Docker Compose v2（支持 `up --wait`），
起步建议 4 核 / 8GB / 100GB SSD。默认在服务器构建镜像，需要访问镜像仓库和依赖源。
也可以从镜像仓库拉取已构建的三个应用镜像。

对象存储使用**独立的 RustFS / MinIO 或支持 S3 API 的云存储**，不随此 Compose 启动。
这是云端部署版本与旧演示编排的区别；旧 `miniodata` 数据卷不会被本配置挂载或迁移。
如已有素材，需保留原存储服务，或先把原桶的数据迁移到新的对象存储。
对象存储应提前创建 `.env` 指定的私有桶，访问密钥需要对应桶的列举、读取、写入、删除及分片上传权限。
程序上传时也会尝试创建不存在的桶；若密钥没有建桶权限，需要提前建好。
可为该桶配置网页域名的 GET/HEAD CORS，供浏览器直接读取预签名链接。

网页 3D 预览运行在浏览器；AI 调用外部 API，网页服务器不需要 GPU。
Photoshop 还原脚本仍在 Windows + Photoshop 工作机上运行，不包含在这些 Linux 容器内。

## 1. 填写唯一的 .env

在仓库根目录执行：

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

如果已经存在 `deploy/.env`，直接编辑，避免覆盖已生成的密码。
新服务器从仓库部署时，应复制示例，并分别生成数据库密码、Redis 密码和 JWT 密钥。

必填项：

| 变量 | 填写内容 |
| --- | --- |
| PUBLIC_URL | 网页来源，例如 `http://服务器IP:8080` 或 `https://design.example.com`，不带末尾 `/` |
| DB_PASSWORD / REDIS_PASSWORD / JWT_SECRET_KEY | 分别生成的随机字符串；DB/Redis 密码建议使用 `openssl rand -hex 32` |
| RUSTFS_ENDPOINT_URL | 带协议的 S3 API 地址，不是存储管理控制台地址 |
| RUSTFS_ACCESS_KEY / RUSTFS_SECRET_KEY | 对应私有桶的存储凭据 |
| AGENT_CHAT_BASE_URL / AGENT_CHAT_API_KEY / AGENT_CHAT_MODEL | 对话 API 根地址、密钥和支持 tool calling 的模型名 |
| AGENT_IMAGE_BASE_URL / AGENT_IMAGE_MODEL | 支持 `POST /images/generations` 的 API 根地址及模型名 |

`AGENT_IMAGE_API_KEY` 可以留空以复用对话密钥。若生图接口返回 CDN 图片 URL，
把 CDN 主机名填入 `AGENT_IMAGE_DOWNLOAD_ALLOWED_HOSTS` JSON 数组；Base64 返回不需要。
密钥中有 `$` 时，按 Compose 的 `.env` 规则用单引号包住完整值，避免变量插值。

容器间数据库、Redis、认证、素材接口地址由 Compose 自动生成，无需手动填写。
`PUBLIC_URL` 同时设置后端和 Agent 的 CORS。前端固定使用同源 `/api`，不需要设置 Vite API 地址，
修改域名也无需重新编译网页。

**RUSTFS_ENDPOINT_URL 必须同时能被服务器和用户浏览器访问。** 当前后端使用该地址生成
预签名下载链接，不能写 `http://objectstore:9000`、`localhost` 或仅容器内部可解析的地址。
HTTPS 网页应搭配 HTTPS 对象存储地址，以免浏览器拦截混合内容。

## 2. 启动

推荐从仓库根目录运行部署脚本：

```bash
bash deploy/deploy.sh
```

脚本会校验必填变量、构建三个应用镜像、启动全部服务、等待健康检查，
随后验证 Nginx 到后端/Agent 的代理和后端到对象存储桶的连接。
缺失配置、构建失败、拉取失败或检查失败会返回非零退出码。
存储检查失败时服务可能已经启动，可查看日志并修复 `.env` 后重新运行脚本。
健康接口只表示进程可响应，部署检查不会调用真实模型或产生生图费用；
模型密钥和真实生成效果需登录后通过业务功能验证。

等价的手动启动命令（最后的对象存储连接检查需另做）：

```bash
cd deploy
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build --wait --wait-timeout 180
docker compose --env-file .env ps
```

默认通过 `http://服务器IP:8080` 访问。安全组放行网页入口端口。
数据库、Redis、后端和 Agent 无需开放公网端口。

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

图片默认最大 25 MiB；PSD 默认最大 500 MiB，但通过默认 8 MiB 分片上传，
因此不需要把 Nginx 的单次请求上限改成 500 MiB。
若增大图片或分片限制，需要同时调整前端 Nginx 和外层代理的请求体限制。

## 4. 更新和维护

修改 `.env` 后使用 `up -d` 重新创建受影响容器；`restart` 不会重新加载环境变量。

```bash
cd deploy
docker compose --env-file .env up -d --wait
docker compose --env-file .env logs --tail=100 -f frontend backend agent
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
保持 `COMPOSE_PROJECT_NAME` 不变，以继续使用同一组数据卷。
数据库初始化 SQL 只在首次创建空卷时执行；已有数据库改用户名、密码、库名或表结构需要另外迁移。
备份应包括 PostgreSQL 数据、对象存储素材，以及妥善保管的 `.env`。
Agent 只有一个 worker、一个副本；重启后短期聊天记忆丢失，Redis 中额度保留。
`down` 会移除容器和网络但保留命名卷；不要给生产环境添加 `--volumes`，该选项会删除数据库与缓存数据卷。

部署文件采用 Compose 官方支持的 `.env` 插值与必填变量校验：
[Docker 环境变量说明](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation)。
