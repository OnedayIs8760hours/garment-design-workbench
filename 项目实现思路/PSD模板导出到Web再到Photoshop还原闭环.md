# PSD 模板导出到 Web 再到 Photoshop 还原闭环

## 一句话目标

用 Photoshop JSX 从生产 PSD 导出 Web 可用模板数据，再让 Web 基于这些数据编辑裁片并生成订单 JSON，最后再用 Photoshop JSX 把订单 JSON 还原回生产 PSD 的前片智能对象。

当前已经跑通的是前片最小闭环。

## 当前已验证链路

```text
<项目根目录>\photoshop\export-psd-json.jsx
  -> Photoshop 中运行
  -> 生成 S:\ps工作目录\外链智能对象实验
  -> 把模板数据接入 Web 代码
  -> Web 显示真实前片并编辑
  -> 点击“生成 JSON”
  -> 得到 E:\download\order-design (1).json
  -> 运行 Photoshop 还原脚本
  -> 写入 C:\Users\Woda\Desktop\M-4XL.psd 的“前片”智能对象
```

## 第 1 步：用 111.jsx 导出模板包

源脚本：

```text
<项目根目录>\photoshop\export-psd-json.jsx
```

运行位置：

```text
Photoshop
```

输入：

```text
打开一个生产 PSD
```

当前导出的目标目录：

```text
S:\ps工作目录\外链智能对象实验
```

导出结果：

```text
S:\ps工作目录\外链智能对象实验
  template.json
  panels\
    front.png
  masks\
    front-mask.png
```

当前 `template.json` 记录了：

- PSD 文档宽高
- 分辨率
- 模板 ID
- 前片图层名
- 前片在整张 PSD 里的 bounds
- 前片局部尺寸
- 前片透明 PNG 路径
- 前片 mask PNG 路径
- guides 辅助线数据

关键点：

`front.png` 和 `front-mask.png` 的尺寸必须等于 `template.json -> panels.front.size`。

当前已验证：

```text
front.png       2796 x 2800
front-mask.png  2796 x 2800
```

## 第 2 步：把模板包接入 Web 项目

Web 项目目录：

```text
<项目根目录>
```

模板资源复制到：

```text
<项目根目录>\public\templates\M-2XL
  panels\front.png
  masks\front-mask.png
```

模板 JSON 复制到：

```text
<项目根目录>\src\templates\M-2XL.template.json
```

前端配置入口：

```text
<项目根目录>\src\model.js
<项目根目录>\src\config.js
```

当前做法：

- `model.js` 静态导入 `M-2XL.template.json`
- 根据 `templateId` 拼出 public 下的资源路径
- `panel.logicalSize` 来自 `template.json -> panels.front.size`
- `panel.bounds` 来自 `template.json -> panels.front.bounds`
- `maskImage` 来自 `template.json -> panels.front.maskImage`
- `guides[]` 来自 `template.json -> panels.front.guides`

## 第 3 步：Web 端呈现真实前片

中间编辑画布：

```text
<项目根目录>\src\components\PanelStage.jsx
```

负责：

- 显示 `front.png`
- 根据 `guides[]` 画辅助虚线
- 根据 `front-mask.png` 裁切用户素材
- 用相对坐标编辑元素

右侧预览：

```text
<项目根目录>\src\components\QuickGarmentPreview.jsx
```

负责：

- 显示同一张 `front.png`
- 使用同一份 `guides[]`
- 使用同一张 `front-mask.png` 裁切
- 用同一份元素数据同步预览

本地访问地址：

```text
http://127.0.0.1:5000
```

启动命令：

```powershell
npm run dev -- --port 5000 --strictPort
```

## 第 4 步：Web 编辑时的数据原则

订单设计元素保存的是相对坐标，不保存浏览器像素。

示例：

```json
{
  "type": "text",
  "role": "number",
  "text": "100",
  "centerX": 0.49785765177817565,
  "centerY": 0.5634017682204542,
  "width": 0.700226009850921,
  "height": 0.47909480692820017,
  "rotation": -2.01006391212196,
  "fill": "#a17880",
  "stroke": "#e03e3e",
  "strokeWidth": 0.01,
  "zIndex": 2
}
```

含义：

- `centerX`：元素中心在当前裁片宽度中的比例
- `centerY`：元素中心在当前裁片高度中的比例
- `width`：元素宽度占裁片宽度的比例
- `height`：元素高度占裁片高度的比例
- `rotation`：角度
- `zIndex`：层级

这样 Web 端、模板导出、Photoshop 还原都能统一计算。

## 第 5 步：生成订单 JSON

Web 页面点击：

```text
生成 JSON
```

当前使用的订单 JSON：

```text
E:\download\order-design (1).json
```

订单 JSON 包含：

- orderId
- productId
- templateId
- templateVersion
- assets 素材引用
- panels.front.logicalSize
- panels.front.bounds
- panels.front.guides
- panels.front.elements

注意：

点击“生成 JSON”只导出 JSON。

图片素材在 JSON 里只有文件名，没有图片本体。

如果要完整还原图片，应使用“导出 ZIP”，或者把图片文件放在 JSON 同目录或 `assets/` 目录。

## 第 6 步：Photoshop 还原脚本

脚本目录：

```text
<项目根目录>\photoshop
```

主脚本：

```text
<项目根目录>\photoshop\restore-front-smart-object.jsx
```

运行脚本：

```text
<项目根目录>\photoshop\run-restore-front.ps1
```

当前固定输入：

```text
PSD:  C:\Users\Woda\Desktop\M-4XL.psd
JSON: E:\download\order-design (1).json
目标智能对象图层名: 前片
```

运行命令：

```powershell
<项目根目录>\photoshop\run-restore-front.ps1
```

脚本执行流程：

1. 打开或激活 `C:\Users\Woda\Desktop\M-4XL.psd`
2. 递归查找名为 `前片` 的智能对象图层
3. 执行 `placedLayerEditContents` 进入智能对象
4. 删除旧的 `CODEX_ORDER_RESTORE` 图层组
5. 新建 `CODEX_ORDER_RESTORE`
6. 按 `zIndex` 排序订单元素
7. 还原文字图层
8. 查找图片素材并还原图片图层
9. 保存智能对象
10. 回到主 PSD 并保存

当前已验证：

```text
C:\Users\Woda\Desktop\M-4XL.psd 已更新
前片智能对象内出现 CODEX_ORDER_RESTORE 图层组
CODEX_ORDER_RESTORE:2
```

`CODEX_ORDER_RESTORE:2` 表示当前成功还原了两个文字图层：姓名和号码。

## 第 7 步：Photoshop 坐标换算

Web 保存的是相对坐标。

Photoshop 智能对象里使用像素坐标。

换算公式：

```js
targetCenterX = element.centerX * smartObjectWidth;
targetCenterY = element.centerY * smartObjectHeight;
targetWidth = element.width * smartObjectWidth;
targetHeight = element.height * smartObjectHeight;
```

当前脚本是在前片智能对象内部还原，所以使用智能对象文档宽高。

不要用浏览器 stage 尺寸。

不要用整张生产 PSD 的宽高。

## 第 8 步：文字还原

当前脚本支持：

- 文字内容
- 中心位置
- 宽高
- 旋转
- 填充色
- 描边色
- 描边宽度
- 透明度
- 图层顺序

当前简化：

```text
字体使用 Arial-BoldMT
```

后续应该做字体映射：

```json
{
  "font-college-01": "实际 Photoshop 字体 PostScript 名",
  "font-number-01": "实际 Photoshop 字体 PostScript 名"
}
```

Photoshop JSX 里 `textItem.font` 需要的是 PostScript 字体名，不一定是系统里看到的中文字体名。

## 第 9 步：图片还原

当前订单 JSON 里的图片素材示例：

```json
{
  "assetId": "asset-1786000034780",
  "name": "下载.png",
  "sourceFile": "下载.png"
}
```

脚本会按以下位置查找：

```text
JSON 同目录\assets\下载.png
JSON 同目录\下载.png
E:\download\assets\下载.png
E:\download\下载.png
C:\Users\Woda\Downloads\下载.png
C:\Users\Woda\Desktop\下载.png
```

如果找不到，脚本会跳过图片并提示。

这次还原时，图片文件没找到，所以只还原了文字。

后续建议：

- Web 的“导出 ZIP”必须包含 `manifest.json` 和 `assets/`
- Photoshop 还原脚本优先读取 ZIP 解压后的 `manifest.json`
- 图片素材不要只靠文件名

## 第 10 步：为什么先进智能对象再还原

目标不是把内容直接放在整张生产 PSD 上。

目标是放进：

```text
M-4XL.psd
  前片 智能对象
```

原因：

- 前片智能对象内部坐标就是裁片局部坐标
- Web 的相对坐标可以直接映射到智能对象宽高
- 主 PSD 里的前片智能对象可以继续保留变形、遮罩、位置关系
- 后续扩展到其他裁片时，每个裁片都可以进入对应智能对象还原

## 当前踩过的坑

### 1. `template.json` 和订单 JSON 不是同一个东西

`template.json` 是模板事实：

```text
裁片尺寸、bounds、mask、guides
```

订单 JSON 是用户设计：

```text
姓名、号码、图片、位置、大小、旋转、颜色
```

不能拿 `template.json` 当订单 JSON 去还原。

### 2. 点击“生成 JSON”不包含图片二进制

这次 JSON 只有：

```text
sourceFile: 下载.png
```

没有 base64，也没有图片文件。

所以 Photoshop 只能还原文字，图片需要原始素材文件。

### 3. 目标 PSD 里有多个“前片”

主 PSD 中有普通图层，也有智能对象图层，名字可能都叫 `前片`。

脚本必须查找：

```js
layer.name === "前片" && layer.kind === LayerKind.SMARTOBJECT
```

不能只按名字找第一个。

### 4. 重跑脚本会重复图层

如果每次直接新增图层，会越跑越乱。

所以脚本固定创建：

```text
CODEX_ORDER_RESTORE
```

每次运行先删除旧组，再重建。

### 5. 文字大小不能只设置 fontSize

Web 里文字是一个有宽高的盒子。

Photoshop 文字层的 `textItem.size` 不等于最终盒子尺寸。

当前脚本做法：

1. 先创建一个较大的文字层
2. 读取 bounds
3. 按目标宽高 resize
4. 移动到目标中心

这样更接近 Web 的盒子缩放效果。

### 6. 描边宽度要按目标宽度换算

Web 里 `strokeWidth` 是相对值。

Photoshop 里描边是像素。

当前换算：

```js
strokePx = targetWidth * element.strokeWidth
```

### 7. 文件编码问题

Windows PowerShell 输出中文可能乱码。

JSX 文件、JSON 文件应该按 UTF-8 保存和读取。

判断是否成功不要只看终端中文显示，要看：

- Photoshop 图层是否创建
- PSD 文件修改时间
- JSON 是否能 parse
- Web 构建是否通过

### 8. Photoshop 自动化有状态

Photoshop 里可能已经打开多个 PSD 和 PSB。

脚本不能假设当前激活文档就是目标 PSD。

当前脚本会按完整路径打开或激活：

```text
C:\Users\Woda\Desktop\M-4XL.psd
```

### 9. 智能对象保存顺序很重要

进入智能对象后，必须：

```text
smartDoc.save()
smartDoc.close(SaveOptions.SAVECHANGES)
mainDoc.save()
```

否则主 PSD 可能看不到智能对象内部更新。

## 当前文件清单

模板导出器：

```text
C:\Users\Woda\Downloads\111.jsx
```

模板导出结果：

```text
S:\ps工作目录\外链智能对象实验\template.json
S:\ps工作目录\外链智能对象实验\panels\front.png
S:\ps工作目录\外链智能对象实验\masks\front-mask.png
```

Web 模板数据：

```text
<项目根目录>\src\templates\M-2XL.template.json
<项目根目录>\public\templates\M-2XL\panels\front.png
<项目根目录>\public\templates\M-2XL\masks\front-mask.png
```

Web 关键代码：

```text
<项目根目录>\src\model.js
<项目根目录>\src\config.js
<项目根目录>\src\components\PanelStage.jsx
<项目根目录>\src\components\QuickGarmentPreview.jsx
```

订单 JSON：

```text
E:\download\order-design (1).json
```

Photoshop 还原脚本：

```text
<项目根目录>\photoshop\restore-front-smart-object.jsx
<项目根目录>\photoshop\run-restore-front.ps1
```

目标 PSD：

```text
C:\Users\Woda\Desktop\M-4XL.psd
```

备份 PSD：

```text
C:\Users\Woda\Desktop\M-4XL.before-json-restore.psd
```

## 下一步建议

最小下一步：

```text
让 Web 导出 ZIP，并让 Photoshop 脚本读取 ZIP 解压目录
```

这样图片素材就不会丢。

再下一步：

```text
把前片流程复制到后片、袖子、袖条、肩片、领条
```

但不要同时做 8 个裁片。先把前片的：

```text
模板导出 -> Web 编辑 -> JSON -> Photoshop 还原
```

打磨稳定，再扩展。
