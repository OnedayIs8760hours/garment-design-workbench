# Web 文字栅格测量到 PS 可编辑文字还原

## 目标

Web 端文字在编辑时使用的是浏览器/Konva 的文字布局框，但用户看到的是字体实际绘制出来的视觉像素边框。很多字体的布局框和视觉边框不一致，直接把 Web 的布局框还原到 Photoshop 会导致位置、宽高有偏差。

本方案的目标是：

- Web 导出时先按当前视觉效果临时栅格化文字。
- 用栅格化结果扫描真实非透明像素边框，得到 `rasterTarget`。
- Photoshop 还原时仍然创建可编辑文字图层。
- Photoshop 只把 Web 栅格测量得到的 `rasterTarget` 当作目标位置和宽高，不把文字 PNG 当作最终图层。

也就是说，栅格 PNG 是测量工具和调试参考，不是最终生产图层。

## 核心问题

旧逻辑里存在两个不同口径：

1. Web 端导出的是文字元素的编辑框：
   - `centerX`
   - `centerY`
   - `width`
   - `height`

2. Photoshop 还原时用文字图层的 `layer.bounds` 去适配目标框。

Photoshop 的 `layer.bounds` 更接近可见像素边框，而 Web 的 `width/height` 是编辑容器框。字体上方、下方、左右留白不同的时候，这两个框天然不一致。

## 导出流程

导出 zip 时，对每个文字元素做一次临时 canvas 渲染：

1. 以文字元素的编辑框尺寸创建透明 canvas。
2. 使用和 Web 预览一致的字体、字号、填充、描边绘制文字。
3. 扫描 canvas alpha 通道，找出非透明像素的最小矩形。
4. 把这个矩形转换为裁片相对坐标，写入文字元素的 `rasterTarget`。
5. 同时把裁剪后的 PNG 写入 zip 的 `assets/text-raster/`，用于调试和复核。

导出的文字元素仍保留原始字段：

```json
{
  "type": "text",
  "text": "YOUR NAME",
  "fontId": "font-nfl-seahawks-flat",
  "photoshopFont": "NFLSeattleSeahawksFlat",
  "centerX": 0.5,
  "centerY": 0.22,
  "width": 0.5,
  "height": 0.08,
  "restoreMode": "editableText",
  "measurementMode": "webRasterBounds",
  "rasterSourceFile": "text-raster/front-element-xxx.png",
  "rasterTarget": {
    "centerX": 0.5,
    "centerY": 0.218,
    "width": 0.42,
    "height": 0.062
  }
}
```

字段含义：

- `restoreMode: "editableText"` 表示 Photoshop 最终应还原成可编辑文字图层。
- `measurementMode: "webRasterBounds"` 表示 `rasterTarget` 来自 Web 端栅格测量。
- `rasterSourceFile` 是测量参考 PNG，不是最终还原素材。
- `rasterTarget` 是 Photoshop 可编辑文字图层要匹配的视觉目标框。

## 旋转处理

如果文字没有旋转，`rasterTarget` 的中心就是栅格可见像素框在原编辑框中的中心。

如果文字有旋转，不能简单使用未旋转的可见像素中心。因为 Web 中文字是围绕原编辑框中心旋转的，裁剪后的 PNG 可见中心会绕原编辑框中心发生位移。

因此导出时会：

1. 先计算可见像素中心相对原编辑框中心的偏移。
2. 按元素 `rotation` 旋转这个偏移。
3. 得到旋转后视觉框中心，写入 `rasterTarget.centerX/centerY`。

这样 Photoshop 先把可编辑文字图层适配到 `rasterTarget`，再按中心旋转时，视觉位置能对齐 Web。

## Photoshop 还原流程

Photoshop JSX 对文字元素仍执行 `createTextLayer`：

1. 创建 `LayerKind.TEXT` 图层。
2. 设置 `text.contents`、`text.font`、`text.color`、`text.justification`。
3. 目标框优先使用 `element.rasterTarget`，没有时回退到 `element` 原编辑框。
4. 用 `fitLayerToRect(layer, target)` 将 Photoshop 文字图层 bounds 适配到目标框。
5. 再按 `element.rotation` 旋转。
6. 应用描边和透明度。

关键点：

```jsx
var target = elementTargetRect(doc, element.rasterTarget || element);
```

这保证了新导出的 JSON 使用 Web 栅格测量结果，旧 JSON 仍可按原逻辑还原。

## 描边宽度口径

Web 端文字描边宽度按裁片宽度计算：

```js
strokeWidth = element.strokeWidth * panelWidth
```

Photoshop 兜底文字还原也应使用同一口径：

```jsx
Math.max(1, toPixels(doc.width) * Number(element.strokeWidth || 0.01))
```

不要按文字目标框宽度计算描边，否则文字越窄描边越细，会和 Web 视觉不一致。

## 方案优点

- Photoshop 最终图层仍是可编辑文字。
- Web 端真实视觉边框参与还原，减少字体布局框造成的位置和尺寸偏差。
- PNG 参考图可用于人工检查导出测量是否正确。
- 旧 JSON 没有 `rasterTarget` 时仍能回退还原。

## 已知限制

该方案让 Photoshop 文字图层匹配 Web 的视觉目标框，但不是把 Web 像素完全复制到 Photoshop。以下情况仍可能有轻微差异：

- 浏览器字体文件和 Photoshop 字体文件不是同一个版本。
- Photoshop 的字距、抗锯齿、描边算法和 canvas 不完全一致。
- Photoshop 中实际使用的 `photoshopFont` fallback 到了其他字体。

如果要求最终像素完全一致，只能把文字 PNG 作为最终图层；但那会牺牲 Photoshop 可编辑文字能力。
