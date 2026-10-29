# ERP 美工中心复刻与接口校验

## 当前结果

SDS-design 订单页已从演示记录切换到现有 ERP 接口。页面按 ERP 美工中心复制，保留 SDS-design 顶部导航。ERP 后端未改动。

## 视觉对照

- 来源：ERP `frontend/src/views/Dashboard/MyTasks.vue` 和 `components/MyTaskWorkbench.vue`。
- 实现：`frontend/src/pages/OrdersWorkspace.jsx`、`frontend/src/components/orders/`、`frontend/src/styles/orders.css`。
- 原始视觉对照：`output/playwright/erp-my-tasks-reference.png`、`erp-workbench-reference.png`。
- 并排结果：`output/playwright/erp-vs-sds-comparison.png`、`erp-vs-sds-workbench.png`。
- 接口接入后截图：`output/playwright/sds-erp-live-api-board.png`、`sds-erp-live-api-workbench.png`。
- 在 1440×960 视口测得：侧栏宽 220px、菜单行高 50px、工具栏高 32px、表格可视区高 580px，保留 29 列和左右固定列。
- 保留日期、搜索、状态多选、人工/机器、操作按钮、页签、分类/批次/工艺、三张统计卡、宽表、分页的原顺序。
- 全屏工作台保留任务列表、图片/详情/图片三栏、上下单、缩放，增加真实多图切换和实际二维码/备注图。
- 图标沿用已有 Lucide；日期和下拉弹层使用浏览器原生控件，部分边界与 Vue/Element Plus 存在细微差异。保留 SDS-design 顶栏高度。
- 前一轮视觉校验已覆盖 1366×768、390×844；宽表与工具栏通过局部横向滚动访问。

## 接口与交互验证

`output/playwright/verify-erp-integration.cjs` 使用独立浏览器测试会话，拦截所有 ERP 请求与对象存储 PUT，不写入真实订单。

21 组浏览器验证通过（主流程 17 组，补充会话与布局 4 组）：

1. ERP 登录错误可见，正确登录后独立保存会话，SDS token 不传给 ERP。
2. 列表使用服务端总数、今日统计和跨页表头筛选项。
3. 原有 29 列、侧栏和表格尺寸保持。
4. 所选真实字段生成 `.xlsx` 下载。
5. 换页发送真实 page 参数，清除当前页勾选。
6. 搜索发送 q 参数，空响应展示缺省状态。
7. 页签与表头分别使用 ERP 的原参数和状态语义。
8. 清除日期不再携带 date。
9. 海外来源传递 module_scope 和中文 category_key。
10. 工作台独立展示正背面字段与多张生产图。
11. 拆片上传先校验位置和文件名，再发送 multipart file/panel_position。
12. PSD 沿用分片 init、part-url、PUT、complete，并正确提交 ETag；外部 PUT 无授权头。
13. 清图取消不写入，确认提交完整长 ID，响应后刷新。
14. 全局传图选择阶段不写入，逐文件显示部分失败，仅成功直传的文件进入 complete。
15. 自动匹配调用现有 ERP mutation，成功后刷新。
16. 查询失败保留服务端提示，不回退演示记录。
17. ERP 401 清除 ERP 会话并回到连接表单，SDS 会话继续保留。

补充脚本 `output/playwright/verify-erp-session-layout.cjs` 验证模块切换后的 ERP 会话恢复、1366×768 与 390×844 布局、退出 SDS-design 同步清除 ERP 会话，均通过。

页面 `pageerror` 为 0；浏览器测试中的 401/500 是主动注入的预期错误。

## 工程与真实服务检查

- `npm test`：原模型自检与 27 项订单/API/Excel 检查通过。
- `npm run build`：通过，保留原有大包提示；仓库未配置独立 lint。
- Docker Nginx 模板经实际容器执行 `nginx -t` 通过。
- Docker Compose 使用占位配置执行 `config --quiet` 通过，不依赖真实密钥。
- 本机 Python 与 Java 接口经 SDS-design 代理均返回 JSON 401，确认服务和路由可达。
- 真实账号登录后的读写流程尚需使用 ERP 账号联调，以上合成测试不能视为真实订单处理已完成。

## 当前边界

- 订单全局、抢单大厅、订单指派、美工管理打开 ERP 对应页面，尚未在 SDS-design 内重建管理模块。
- 实际权限和状态流转继续由 ERP 负责；源 API 未增加或迁移。
- 对象存储直传需要现有 S3 CORS 允许当前页面来源，PSD 分片需要暴露 ETag。错误会直接展示，不伪报成功。

final result: passed (contract and mocked browser verification; authenticated live workflow pending)

