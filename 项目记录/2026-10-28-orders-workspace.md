# SDS-design 美工订单页面

## 页面与接口归属

订单业务区沿用 ERP 美工中心的布局、字段顺序与样式，保留 SDS-design 顶部导航。业务接口继续由现有 ERP Python 和 Java 服务处理，未修改 ERP 后端。

- 页面入口：`frontend/src/pages/OrdersWorkspace.jsx`。
- UI 组件：`frontend/src/components/orders/`，样式：`frontend/src/styles/orders.css`。
- ERP 请求封装：`frontend/src/api/erpArt.js`；查询与字段映射：`erpOrderModel.js`。
- ERP 源码参考：`frontend/src/views/Dashboard/MyTasks.vue`、`components/MyTaskWorkbench.vue`、`frontend/src/api/modules/orders.ts`。

## 数据与认证

- 订单页不再导入演示记录。列表、总数、今日统计、分类计数和表头选项均读取 ERP 响应，分页前筛选由 ERP 执行。
- 默认沃达、今天、人工、每页 20 条。待处理/已传图/异常分别映射为 ERP 的 `unfinished`/`completed`/`abnormal`。
- 国内、海外、阿里、大货传递原有 `module_scope`；动态来源分类传递中文 `category_key`。
- SDS-design 与 ERP 认证独立。订单页首次使用 ERP 账号连接，ERP token 仅存 `sessionStorage`，请求统一使用 ERP Bearer token。密码不持久化，也不复用 SDS-design token。
- ERP 401 仅清除 ERP 会话并提示重新连接；退出或更换 SDS-design 账号同时清除 ERP 会话。
- 查询取消与过期响应检查避免快速切换来源时旧结果覆盖新结果。失败时显示错误和重试，不回退到演示数据。
- 超出 JavaScript 安全整数范围的 ERP 数字 ID 在 JSON 解析前保留为字符串，清图和上传提交原始完整 ID。

## 现有 ERP 接口

下列路径均在客户端加 `/erp`，由 SDS-design 同源代理转发。

| 功能 | 服务 | 现有路径 |
| --- | --- | --- |
| 登录、当前用户 | Python | `/api/v1/system/login`、`/api/v1/system/me` |
| 我的任务、统计与筛选 | Python | `/api/v1/orders/art/my-tasks` |
| 来源数量 | Java | `/java-api/api/v1/orders/art/my-tasks/counts` |
| 来源分类 | Java | `/java-api/api/v1/order-route-categories` |
| 机器任务数量 | Python | `/api/v1/orders/sidebar-task-counts` |
| 自动匹配 | Python | `/api/v1/orders/auto-batch/unassigned-machine` |
| 单单/批量清图 | Python | `/api/v1/orders/art/batch-clear-images` |
| 单单生产图 | Python | `/api/v1/orders/art/{id}/upload-image` |
| PSD 分片初始化 | Python | `/api/v1/orders/art/{id}/upload-psd/multipart/init` |
| PSD 签名、完成与取消 | Python | `/api/v1/orders/art/upload-psd/multipart/{part-url,complete,abort}` |
| 全局普通/拆片补图 | Java | `/java-api/api/v1/orders/{patch-images,patch-split-images}/{presign,complete}` |

## 操作行为

- 清图先预览确认，仅提交做图中、驳回、或更新后 5 分钟内待审核且已有生产图的订单。
- 工作台分别提供生产图上传和 PSD 上传，遵循后置改单阻断原因及拆片位置/文件名规则。
- PSD 通过 ERP 初始化、签名、对象存储分片 PUT、完成提交。外部 PUT 不携带 ERP token。分片失败后等待工作线程退出再 abort；complete 结果不明时不自动重试或取消，提示核对订单。
- 全局传图先选择文件并预览，再显式开始；ERP 匹配全部订单，逐文件呈现成功、失败或待核对。仅已成功直传的文件提交 complete，不重传已经确认成功的文件。
- 导出按 ERP 原列顺序生成真正的 `.xlsx`，导出当前页勾选的真实订单；编号和用户输入写为文本，保留前导零并避免公式执行。使用已有 JSZip，不新增依赖。
- 正背面姓名/号码分别展示，保留号码 0。展示实际 PSD 预览、二维码、备注图和多张生产图；列表生产图仅使用独立缩略图，工作台按需读取原图。
- 订单全局、抢单大厅、订单指派、美工管理暂时打开对应 ERP 原页面；这些管理业务未在 SDS-design 内重建。

## 本地与 Docker 配置

本地可复制 `frontend/.env.example` 为本机配置并按实际地址修改：

- `VITE_ERP_PYTHON_PROXY_TARGET` 默认 `http://127.0.0.1:8848`。
- `VITE_ERP_JAVA_PROXY_TARGET` 默认 `http://127.0.0.1:8080`。
- `VITE_ERP_BASE_URL` 默认 `/erp`；`VITE_ERP_FRONTEND_URL` 指向管理菜单跳转的 ERP 页面。
- Vite 分别将 `/erp/java-api` 转发到 Java 并去除该前缀，将其它 `/erp` 转发到 Python 并去除 `/erp`。读取和上传接口无需启动 ERP 前端。
- Docker 运行时在 `deploy/.env` 设置 `ERP_PYTHON_UPSTREAM` 和 `ERP_JAVA_UPSTREAM`；填写服务根地址，不附加 `/api/v1`。默认访问宿主机的 8848/8080。远程部署应填写容器可达的 ERP 地址。
- Nginx 从模板生成配置，只替换 `ERP_` 环境变量，保留原 Nginx 变量。Java/Python 请求与静态图片不会落到 SPA 回退页。
- 管理菜单跳转地址是 Vite 构建配置，远程部署时应在构建环境设置 `VITE_ERP_FRONTEND_URL`。

## 验证

- `npm test`：原有模型自检，以及 27 项订单模型、API 合约、上传失败处理和 Excel 导出检查通过。
- `npm run build`：通过，仍有项目原有的大块体积提示；无独立 lint 脚本。
- 浏览器合成会话：21 组检查通过，覆盖登录、鉴权隔离、服务端分页/筛选/统计、真实字段、多图、Excel、拆片上传、PSD、清图确认、全局补图、自动匹配、错误与 401，补测模块切换后的会话恢复、1366/390 宽度和整体退出；无页面脚本异常。
- 本机真实服务只读检查：经 SDS-design 代理访问 Python `/system/me` 与 Java 来源数量接口，都返回 JSON 401，确认路由可达。未使用真实 ERP 账号执行订单写入。
- Docker Nginx `nginx -t` 通过；使用临时占位配置的 `docker compose config --quiet` 通过。
- 浏览器脚本和截图位于已忽略的 `output/playwright/`，视觉对照与限制见 `design-qa.md`。

