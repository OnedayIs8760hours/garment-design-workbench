# GLB 裁片 UV 反推到 Web 实时 3D 预览流程

## 核心结论

当前 Web 端不是重新生成 3D 模型，而是复用 CLO 导出的 GLB 模型中已经存在的关系：

```text
GLB 顶点 3D 坐标 <-> GLB 顶点 UV 坐标
```

我们要补上的，是 Web 左侧 2D 裁片坐标和 GLB UV atlas 区域之间的关系：

```text
Web 裁片坐标 <-> GLB UV 区域 <-> GLB 3D 表面
```

## 三层数据关系

第一层是 Web 左侧裁片：

```text
front / back / left-sleeve 等裁片
元素位置使用 centerX / centerY / width / height 的百分比坐标
```

第二层是 GLB 的 UV 贴图空间：

```text
每个裁片在 UV atlas 里占据一个 u_min, v_min, u_max, v_max 区域
```

第三层是 GLB 的 3D 网格：

```text
模型顶点有 3D 坐标，也有 UV 坐标
Three.js 根据 UV 从动态 CanvasTexture 取颜色并显示到 3D 表面
```

## 反推步骤

1. 读取 CLO 导出的 GLB。
2. 遍历 GLB 里的 mesh 和 material。
3. 用材质名反推出裁片 ID。

例如：

```text
front_FRONT_2702 -> front
back_FRONT_2737 -> back
left-sleeve_FRONT_2722 -> left-sleeve
```

4. 找到该材质对应的 geometry group。
5. 遍历这一组顶点的 UV 坐标。
6. 计算该裁片在 UV 空间里的边界框：

```text
u_min, v_min, u_max, v_max
```

7. Web 中用户放置的图案继续使用裁片内百分比坐标。
8. 生成动态 Canvas atlas，把每个裁片的图案画到对应 UV 区域。
9. 把 Canvas atlas 转成 Three.js `CanvasTexture`。
10. 把该纹理应用到 GLB 材质上，完成实时 3D 预览。

## 为什么能实时预览

用户在 Web 裁片上移动或缩放素材时，变化的是：

```text
element.centerX
element.centerY
element.width
element.height
element.rotation
```

每次设计状态变化后，Web 重新生成一张 Canvas atlas。

GLB 模型本身不变，只更新贴图：

```text
Web 元素变化 -> Canvas atlas 更新 -> CanvasTexture 更新 -> 3D 预览更新
```

## 坐标原点问题

Canvas 的原点在左上角：

```text
x 向右
y 向下
```

UV 通常按左下角理解：

```text
u 向右
v 向上
```

因此把 UV 区域画到 Canvas atlas 时，需要处理 Y 方向：

```js
y = (1 - vMax) * atlasSize
```

并让 Three.js 纹理按当前模型需要设置：

```js
texture.flipY = true
```

## 黑边问题的原因

一开始 Web 端用 2D 裁片 mask 去裁切 3D atlas。

但 Web 裁片 mask 和 CLO GLB 实际 UV 岛边界不一定完全一致。只要 mask 裁掉了 GLB 仍会采样的边缘区域，3D 上就会采到透明或黑色。

最终处理方式：

```text
3D atlas 中每个 UV rect 直接填充服装底色
图案按百分比画进去
不再用 Web mask 硬裁 3D 底色
```

这样 GLB 自己通过 UV 和几何表面决定哪里可见，避免袖口或边缘出现黑块。

## 当前 M-2XL 的维护方式

当前这套映射数据只适用于 M-2XL。

M-2XL 的数据包括：

```text
src/templates/M-2XL.template.json
src/templates/M-2XL.uv_mapping.json
public/templates/M-2XL/
public/models/soccer-new-rename.glb
```

其中：

```text
template.json 管 Web 2D 裁片
uv_mapping.json 管默认 UV atlas 区域
glb 管真实 3D 网格和模型 UV
```

## 换品类或尺码时需要准备什么

每个新品类或新尺码都应该独立准备一套数据：

```text
src/templates/{templateId}.template.json
src/templates/{templateId}.uv_mapping.json
public/templates/{templateId}/panels/*.png
public/templates/{templateId}/masks/*.png
public/models/{templateId}.glb
```

然后在模板注册表中登记：

```js
{
  template: xxxTemplate,
  sizes: ["xxx"],
  productId: "PRODUCT-xxx",
  defaultModelUrl: "/models/xxx.glb",
  uvMapping: xxxUvMapping,
}
```

这样 Web 组件不需要再写死 M-2XL，后续只切换当前模板定义。

## 关键限制

材质名必须能对应裁片 ID。

例如 GLB 材质名可以是：

```text
front_FRONT_2702
back_FRONT_2737
left-sleeve_FRONT_2722
```

系统会把 `_FRONT...` 后缀去掉，得到 Web 裁片 ID。

如果新模型导出的材质名无法对应 Web 裁片 ID，就需要在模板数据中增加一份材质名到裁片 ID 的映射表。

## 一句话总结

这套方案的本质是：

```text
用 GLB 材质名找到裁片
用 GLB 顶点 UV 反推出裁片在 UV atlas 中的位置
把 Web 2D 裁片上的设计按百分比画到对应 UV 区域
让 GLB 自己通过 UV 显示到 3D 衣服表面
```
