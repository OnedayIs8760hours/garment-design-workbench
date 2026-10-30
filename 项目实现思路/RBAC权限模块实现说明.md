# RBAC 权限模块

采用用户—角色—权限模型：一个用户可以拥有多个角色，实际权限取角色权限的并集。
后端对每次请求重新读取角色和权限，不把授权结果长期写入 JWT，因此角色变更会影响已有令牌。

## 内置角色

| 角色 | 编码 | 默认权限 |
| --- | --- | --- |
| 管理员 | admin | 全部权限；该角色不可修改或删除 |
| 设计师 | designer | 查看和编辑自己的设计、查看和管理自己的素材、上传 PSD、AI 对话和生图 |
| 只读成员 | viewer | 查看自己的设计和素材 |

设计师和只读成员的权限可以调整，但内置角色不能删除。自定义角色支持创建、编辑和删除；
已分配给用户的角色须先解除关联才可删除。授权操作和服务器管理员初始化都有审计记录。
系统阻止撤销或停用最后一名启用的内置管理员，PostgreSQL 中通过事务锁串行执行授权修改。

## 权限目录

| 编码 | 范围 |
| --- | --- |
| designs.read | 查看自己的设计草稿 |
| designs.write | 创建、保存和删除自己的草稿 |
| assets.read | 查看、下载自己的图片素材 |
| assets.write | 上传、删除自己的图片素材 |
| psd.upload | PSD 分片上传及上传会话管理 |
| ai.generate | AI 对话、图片生成、额度与会话管理 |
| rbac.manage | 用户管理、角色授权和审计记录 |

权限定义由服务器代码维护，管理页面不能创建任意权限码。编辑器同时需要设计查看和编辑权限；
AI 对话和图片保存接口同时需要 `ai.generate`、`assets.write`，避免产生图片后才发现不能保存。
只读账号进入独立裁片预览，不挂载带自动保存的编辑器。

角色不会扩大现有的数据范围：管理员也不会因此自动获得其他用户的设计或素材。
专有 `admin` 账号额外拥有“全员作品”只读范围：可以按用户 ID、单号或制作人查看所有人的设计，
并查看所有用户生成并保存到 RustFS 的图片。该范围不授予普通 `admin` 角色，也不提供跨用户修改、删除或保存接口。
全员设计读取时使用制作人的数据库/Redis 命名空间生成素材临时地址；全员图片读取只接受标准
`users/<id>/designs/generated/assets/<filename>` 路径，避免借查看接口读取其他对象。
ERP 使用独立账号和接口，当前模块不接管 ERP 后端权限；ERP 接口仍须由其服务自行鉴权。
前端隐藏导航和按钮、拦截页面入口，并在窗口获得焦点、收到 403 或每 60 秒刷新资料；
实际权限以服务端的每次接口检查为准。停用账号时删除 Redis 会话，重新启用后需要重新登录。

## 首次迁移与管理员初始化

Docker 后端启动命令会先执行 `python -m app.rbac migrate`，成功后才启动 Uvicorn。
迁移增加角色、权限、关联、审计和版本记录表，保留现有用户和业务数据；
仅第一次迁移将当时已有的无角色账号赋予设计师角色。后续启动不恢复被撤销的角色，也不覆盖管理员编辑过的角色权限。
专有最高权限账号固定为 `admin`。部署初始化文件 `deploy/.env` 中的
`RBAC_ADMIN_PASSWORD` 明文记录首次密码；Compose 将其提供给启动迁移，创建账号时只向数据库保存密码哈希。
重复部署不重置已有密码。该用户名禁止公开注册及普通管理接口创建，专有账号不能通过管理接口停用或修改角色。
若初始化前已有同名账号，则停止初始化，避免将历史账号误提升为最高权限者。

本地开发先执行：

```powershell
cd backend
uv sync --locked
uv run python -m app.rbac migrate --admin-env-file ../deploy/.env
uv run uvicorn app.main:app --host 127.0.0.1 --port 8957 --reload
```

生产部署将已填写 `RBAC_ADMIN_PASSWORD` 的配置放到服务器 `deploy/.env`，后端首次启动时自动初始化 `admin`。
此配置文件被 Git 忽略，需要随部署配置同步到服务器。若不提供初始化密码，迁移只准备角色和权限，不创建专有账号。

如需额外为其他现有账号分配普通管理员角色，仍可通过服务器管理权限执行：

```bash
cd /opt/sds-design/deploy
docker compose --env-file .env -f docker-compose.yml -f cloud/docker-compose.yml exec -T backend \
  python -m app.rbac bootstrap-admin --username 现有账号名
```

全新数据库直接使用初始化文件创建专有 `admin`，不需要先公开注册。
公开注册不能指定角色，新注册账号默认没有业务权限；已有的登录页注册入口继续隐藏。
之后由管理员从“权限管理 → 用户授权”创建用户并分配角色。

## 接口

登录和 `/api/auth/me` 返回 `roles`（角色摘要）、`permissions`（权限码列表）及 `is_system_admin`（专有账号标记）。
所有 `/api/rbac/` 接口均要求 `rbac.manage`：

- `GET /permissions`：权限目录。
- `GET /roles`、`POST /roles`：查看、创建角色。
- `PUT /roles/{id}`、`DELETE /roles/{id}`：修改和删除角色。
- `GET /users?q=&offset=0&limit=30`：搜索及分页查询用户，不返回密码哈希。
- `POST /users`：创建用户，输入用户名、初始密码、可选职位及角色 ID。
- `PUT /users/{id}/access`：整体替换角色列表和启用状态。
- `GET /audits?offset=0&limit=30`：按时间倒序分页读取授权记录，不记录密码。

无登录返回 401，无权限返回 403，未知角色或权限返回 422，最后管理员等冲突返回 409。

## 验证

后端使用隔离 SQLite 数据库验证关系、真实 JWT 鉴权、登录资料、撤权、停用、角色生命周期、迁移和初始化；
PostgreSQL 仍使用原有 BIGINT、JSONB 类型，SQLite 类型仅用于本地隔离测试。
Agent 验证无授权时不会调用模型或存储；前端测试覆盖入口权限和只读限制。
浏览器验证使用隔离模拟数据，不创建或修改生产用户，截图位于 `output/playwright/`。

```powershell
cd backend
uv run pytest
cd ../agent-service
uv run pytest
uv run ruff check .
cd ../frontend
npm test
npm run build
```
