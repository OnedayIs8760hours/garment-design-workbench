# PS 还原脚本使用方法

## 文件位置

- Photoshop 还原脚本：`photoshop/restore-front-smart-object.jsx`
- PowerShell 启动脚本：`photoshop/run-restore-front.ps1`
- JSON 兼容脚本：`S:/JSX/oneChangeToMuch/oneToMuch/JSON.jsx`

## 方式一：选择设计包文件夹

运行：

```powershell
powershell -ExecutionPolicy Bypass -File <项目根目录>\photoshop\run-restore-front.ps1 -PickFolder
```

弹窗里选择已经解压好的设计包文件夹，例如：

```text
E:\download\design-package-ORDER-20260805-001
```

文件夹里应包含：

```text
manifest.json
assets\
```

## 方式二：直接传文件夹路径

```powershell
powershell -ExecutionPolicy Bypass -File <项目根目录>\photoshop\run-restore-front.ps1 -PackageFolder "E:\download\design-package-ORDER-20260805-001"
```

这种方式不会弹窗，适合重复运行同一个设计包。

## 方式三：在 JSX 代码里写路径

打开 `photoshop/restore-front-smart-object.jsx`，修改 `CONFIG`：

```js
var CONFIG = {
    psdPath: "C:/Users/Woda/Desktop/M-4XL.psd",
    packageFolderPath: "E:/download/design-package-ORDER-20260805-001",
    packageJsonPath: "",
    pickPackageFolder: false,
    jsonShimPath: "S:/JSX/oneChangeToMuch/oneToMuch/JSON.jsx",
    targetSmartObjectName: "前片",
    restoreGroupName: "CODEX_ORDER_RESTORE",
    panelId: "front"
};
```

然后运行：

```powershell
powershell -ExecutionPolicy Bypass -File <项目根目录>\photoshop\run-restore-front.ps1
```

也可以直接指定 JSON 文件：

```js
packageFolderPath: "",
packageJsonPath: "E:/download/design-package-ORDER-20260805-001/manifest.json",
```

## 常见问题

### 第 155 行提示“无法打开文件，因为打开选项不正确”

第 155 行是在打开素材图片：

```js
imageDoc = app.open(assetFile);
```

通常原因是素材扩展名和真实内容不一致。之前遇到的是：

```text
asset-sample-mark-sample-original.png
```

文件名是 `.png`，但内容实际是 SVG 文本，所以 Photoshop 按 PNG 打开会失败。

处理方式：

- 重新从网页导出新的设计包。
- 或者把设计包 `assets` 目录里的坏素材替换成真实 PNG。

### 脚本找不到 JSON

确认选择或填写的是“解压后的文件夹”，不是 zip 文件本身。文件夹下至少要有：

```text
manifest.json
assets\
```

### 找不到智能对象图层

确认 PSD 里智能对象图层名和脚本配置一致：

```js
targetSmartObjectName: "前片"
```

如果 PSD 图层名不同，改这里即可。
