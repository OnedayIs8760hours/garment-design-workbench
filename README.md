# woda Design

woda Design 是一个基于 Vite + React 的球衣裁片定制工作台，用于在浏览器里编辑服装裁片、上传图片素材、添加姓名/号码文字、设置裁片底色、预览 2D/3D 效果，并导出可供 Photoshop 脚本还原的设计包。

当前项目内置 `M-2XL` 模板，包含前片、后片、领条、左右袖、左右袖条、肩片等裁片资源，以及对应的 3D UV 映射数据。

## 功能概览

- 多裁片编辑：按模板裁片切换编辑前片、后片、袖片等区域。
- 图片素材：上传本地图片，复用已上传素材，并放置到当前裁片。
- 文字元素：添加姓名、号码文字，并调整位置、大小、旋转、颜色、描边和透明度。
- 裁片底色：使用色板或 RGB 取色器设置当前裁片底色，也可以一键应用到所有裁片。
- 图层管理：查看当前裁片图层，支持调整图层上下顺序和删除选中元素。
- 草稿保存：登录后自动保存到 PostgreSQL，Redis 缓存最近草稿；草稿箱可列出并打开个人历史草稿继续编辑；浏览器 `localStorage` 仅作为网络异常时的兜底。
- RustFS 素材接口：后端通过 S3 兼容 API 上传、读取、生成临时下载地址和删除用户图片；草稿可以只保存 `assetId`、`objectKey` 等素材引用。
- 导出设计包：导出 `manifest.json` 和素材文件，供后续 Photoshop 脚本还原。
- 预览：提供裁片预览、快速成衣预览和基于 GLB/UV 映射的 3D 预览。

## 技术栈

- Python 3.13 / FastAPI
- Vite 7
- React 19
- Zustand
- Konva / react-konva
- Three.js
- JSZip
- Photoshop JSX / PowerShell COM 自动化

## 环境要求

- Node.js 版本建议使用 20 或更高版本。
- npm。
- Python 版本建议使用 3.13 或更高版本。
- 如需运行 Photoshop 还原流程，需要 Windows + Adobe Photoshop，并允许通过 COM 调用 Photoshop。

## 快速开始

前端在 `frontend/` 目录下运行：

```powershell
cd frontend
npm install
npm run dev -- --port 5000 --strictPort
```

浏览器打开：

```text
http://127.0.0.1:5000
```

如果只想使用默认 Vite 端口，也可以运行：

```powershell
cd frontend
npm run dev
```

后端在 `backend/` 目录下运行：

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8957 --reload
```

后端默认地址：

```text
http://127.0.0.1:8957
```

## 常用命令

```powershell
# 安装依赖
cd frontend
npm install

# 启动本地开发服务器
npm run dev -- --port 5000 --strictPort

# 运行当前模型自检
npm test

# 构建生产包
npm run build

# 启动后端
cd ../backend
uv run uvicorn app.main:app --host 127.0.0.1 --port 8957 --reload

# 运行后端测试
uv run pytest
```

## 项目结构

```text
woda-design/
├─ backend/                      # FastAPI 后端服务
│  ├─ app/                       # Python 应用源码
│  ├─ tests/                     # 后端测试
│  └─ pyproject.toml             # uv 项目配置与依赖
├─ frontend/                     # Vite + React 前端项目
│  ├─ src/                       # Web 应用源码
│  │  ├─ components/             # React UI 组件
│  │  ├─ App.jsx                 # 应用主组件
│  │  ├─ config.js               # 默认配置、模板初始化、颜色配置
│  │  ├─ designStore.js          # Zustand 状态、草稿保存、撤销逻辑
│  │  ├─ model.js                # 模板转换、导出 JSON、校验逻辑
│  │  ├─ elements.js             # 图片/文字元素创建和显示逻辑
│  │  ├─ download.js             # 设计包 zip 导出逻辑
│  │  └─ model.test.js           # 当前测试入口
│  ├─ templates/                 # 模板 JSON 和 UV 映射入口
│  ├─ public/                    # 浏览器可访问静态资源
│  │  ├─ templates/              # 裁片图片和遮罩
│  │  └─ models/                 # 3D 预览 GLB 模型
│  ├─ package.json
│  └─ vite.config.js
├─ photoshop/                    # Photoshop 还原、导出、辅助脚本
├─ scripts/                      # 模板导入和 GLB UV 工具脚本
├─ 使用方法/                     # Photoshop 脚本使用说明
├─ 项目实现思路/                 # 实现方案和过程文档
└─ 规范/                         # 项目规范文档
```

## Web 端使用流程

1. 启动开发服务器并打开页面。
2. 在顶部或裁片区域切换需要编辑的裁片。
3. 在左侧工具栏选择功能：
   - `填色`：设置当前裁片或所有裁片底色。
   - `上传`：上传图片素材，并点击素材名称添加到当前裁片。
   - `文字`：添加姓名或号码。
   - `图层`：查看当前裁片图层。
4. 在画布中选中元素后，可拖动、缩放、旋转，也可以在底部属性面板精确修改 X、Y、宽、高、旋转和透明度。
5. 点击 `保存草稿` 可手动保存；编辑过程中也会自动延迟保存到后端，按当前用户和模板隔离。
6. 点击 `导出设计包` 下载 zip 文件。

## 导出设计包

点击页面右上角 `导出设计包` 后，会生成类似下面名称的文件：

```text
design-package-ORDER-xxxx.zip
```

解压后目录结构通常为：

```text
design-package-ORDER-xxxx/
├─ manifest.json
└─ assets/
   └─ asset-xxx-filename.png
```

`manifest.json` 是 Photoshop 还原脚本使用的主数据文件，记录订单、模板、裁片、元素、坐标、字体、素材引用和校验结果。图片素材不会以内嵌 `dataUrl` 形式写入 JSON，而是放在 `assets/` 目录下。

## Photoshop 还原流程

项目提供 PowerShell 启动脚本，通过 Photoshop COM 执行 JSX 还原脚本。

### 方式一：弹窗选择设计包目录

先解压 Web 端导出的 zip，然后运行：

```powershell
powershell -ExecutionPolicy Bypass -File <项目根目录>\photoshop\run-restore-front.ps1 -PickFolder
```

在弹窗中选择已经解压的设计包目录，例如：

```text
E:\download\design-package-ORDER-xxxx
```

目录内至少需要包含：

```text
manifest.json
assets\
```

### 方式二：直接传入设计包目录

```powershell
powershell -ExecutionPolicy Bypass -File <项目根目录>\photoshop\run-restore-front.ps1 -PackageFolder "E:\download\design-package-ORDER-xxxx"
```

这种方式适合重复运行同一个设计包。

### Photoshop 注意事项

- 当前 PowerShell 脚本调用的是 `photoshop/restore-panels-smart-objects.jsx`。
- PSD 中需要存在与模板裁片对应的智能对象图层或脚本预期的图层结构。
- 还原结果会写入脚本指定的还原图层组，常见名称为 `CODEX_ORDER_RESTORE`。
- 如果 Photoshop 无法打开素材，优先检查素材扩展名和真实内容是否一致，例如文件名是 `.png`，但内容实际是 SVG 文本时会打开失败。

更多 Photoshop 说明见：

```text
使用方法/PS脚本使用方法.md
```

## 模板与资源说明

目录命名和新增品类流程见 `规范/模板与资源目录规范.md`。

当前模板入口在：

```text
frontend/templates/index.js
```

核心模板文件：

```text
frontend/templates/football-jersey/M-2XL.template.json
frontend/templates/football-jersey/M-2XL.uv_mapping.json
frontend/templates/football-jersey-crop-top-two-tone/W-M.template.json
frontend/templates/football-jersey-crop-top-two-tone/W-M.uv_mapping.json
```

浏览器实际加载的裁片图和遮罩在：

```text
frontend/public/templates/football-jersey/panels/
frontend/public/templates/football-jersey/masks/
frontend/public/templates/football-jersey-crop-top-two-tone/
```

3D 预览默认模型：

```text
frontend/public/models/football-jersey.glb
frontend/public/models/football-jersey-crop-top-two-tone.glb
```

新增或替换模板时，应优先修改模板 JSON 和 `frontend/templates/index.js`，不要把裁片尺寸、坐标、图层名等模板事实硬编码到 React 组件里。

## 数据流简述

```text
PSD 模板数据 / 裁片图片 / 遮罩
        ↓
frontend/templates/<category>/*.template.json
        ↓
createTemplate() 转成 Web 编辑器模板
        ↓
浏览器编辑设计状态 Zustand store
        ↓
createExportJson() 生成订单 JSON
        ↓
downloadZip() 导出 manifest.json + assets
        ↓
Photoshop JSX 按 manifest.json 还原到 PSD
```

## 测试与构建

提交或交付前建议至少运行：

```powershell
cd frontend
npm test
npm run build
```

当前前端测试入口是 `frontend/src/model.test.js`，主要覆盖模板结构、导出 JSON、坐标校验和回归用例。项目暂未接入完整测试框架。

## 常见问题

### 页面打不开

确认开发服务器已启动，并访问：

```text
http://127.0.0.1:5000
```

如果端口被占用，可以去掉 `--strictPort` 或换一个端口：

```powershell
npm run dev -- --port 5173
```

### 刷新后旧设计还在

登录用户的草稿保存在后端 PostgreSQL，Redis 用于加速读取；浏览器 `localStorage` 仅作为网络异常时的本地兜底。可以在页面内重做/清空，也可以通过后端设计草稿接口管理数据。

### RustFS 图片存储接口

后端使用 RustFS 的 S3 兼容接口保存设计图片。先将 `backend/.env.example` 复制为本地环境配置，并填写 `RUSTFS_ACCESS_KEY`、`RUSTFS_SECRET_KEY`；默认地址为 `http://127.0.0.1:9000`，默认桶为 `woda-design`。

受保护的接口如下：

- `POST /api/assets`：上传 PNG/JPEG/WebP/GIF，表单字段为 `file` 和可选 `order_id`。
- `GET /api/assets/info?object_key=...`：读取素材元数据和临时 URL。
- `GET /api/assets/download-url?object_key=...`：生成临时下载 URL。
- `GET /api/assets/content?object_key=...`：通过后端鉴权后流式读取图片。
- `DELETE /api/assets?object_key=...`：删除当前用户的图片。
- `GET /api/assets/health`：检查 RustFS 桶是否可访问。

对象键固定在 `users/{user_id}/designs/{order_id}/assets/` 下，后端会拒绝访问其他用户目录。核心实现位于 `backend/app/services/object_storage.py`，同步 S3 SDK 调用会放入线程池，不阻塞 FastAPI 异步请求。

### Photoshop 找不到 JSON

传给脚本的应该是解压后的设计包文件夹，不是 zip 文件本身。目录下需要有 `manifest.json`。

### Photoshop 找不到素材

检查 `manifest.json` 中的素材路径是否能在设计包 `assets/` 目录中找到。尽量保持导出的目录结构不变。

## 开发约定

- 使用 ES modules、React 函数组件和普通 JavaScript。
- JS/JSX/JSON 使用 2 空格缩进。
- 组件文件使用 `PascalCase.jsx`，工具模块使用 `camelCase.js`。
- 模板相关事实放在模板 JSON 或 `frontend/templates/` 中，避免写死在 UI 组件里。
- Web 端导出的订单 JSON 可能只引用素材文件名，不嵌入图片内容；交给 Photoshop 还原时需要保留 `assets/` 目录。
