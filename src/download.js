import JSZip from "jszip";

// 将当前设计和素材打包成 zip 并触发下载。
export async function downloadZip(design, exportJson) {
  // zip 文件构建器。
  const zip = new JSZip();
  // 替换素材路径后的导出 JSON。
  const packageJson = rewriteAssetPathsForPackage(exportJson);

  zip.file("manifest.json", JSON.stringify(packageJson, null, 2));

  for (const asset of design.assets) {
    if (!asset.dataUrl) continue;
    // 当前素材转换后的 zip 文件内容。
    const file = await assetToZipFile(asset.dataUrl);
    zip.file(packageAssetPath(asset), file.content, file.options);
  }

  downloadBlob(`design-package-${exportJson.orderId}.zip`, await zip.generateAsync({ type: "blob" }));
}

// 把导出 JSON 中的素材路径改成 zip 包内相对路径。
function rewriteAssetPathsForPackage(exportJson) {
  // 素材 ID 到 zip 内文件名的映射。
  const assetPathById = new Map(exportJson.assets.map((asset) => [asset.assetId, packageAssetPath(asset).replace(/^assets\//, "")]));
  return {
    ...exportJson,
    assets: exportJson.assets.map((asset) => ({
      ...asset,
      sourceFile: assetPathById.get(asset.assetId) ?? asset.sourceFile,
    })),
  };
}

// 生成素材在 zip 包里的路径。
function packageAssetPath(asset) {
  return `assets/${asset.assetId}-${safeFilename(asset.sourceFile || asset.name || "asset.png")}`;
}

// 替换文件名中 Windows 和 zip 不适合的字符。
function safeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_");
}

// 将 dataUrl 或远程 URL 转成 JSZip 可写入的文件对象。
async function assetToZipFile(src) {
  if (String(src).startsWith("data:")) return dataUrlToZipFile(src);

  // 远程或静态资源请求结果。
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to fetch asset: ${src}`);
  return { content: await response.blob(), options: {} };
}

// 把 dataUrl 拆成 zip 内容和编码选项。
function dataUrlToZipFile(dataUrl) {
  // dataUrl 中元信息和 payload 的分隔位置。
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return { content: dataUrl, options: {} };

  // dataUrl 的 MIME 和编码信息。
  const meta = dataUrl.slice(0, comma);
  // dataUrl 的真实内容。
  const payload = dataUrl.slice(comma + 1);

  if (meta.includes(";base64")) {
    return { content: payload, options: { base64: true } };
  }

  return { content: decodeURIComponent(payload), options: {} };
}

// 下载 Blob 或文本内容到本地文件。
export function downloadBlob(filename, content, type = "application/octet-stream") {
  // 标准化后的 Blob 内容。
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  // 浏览器临时下载 URL。
  const url = URL.createObjectURL(blob);
  // 用于触发下载的隐藏链接。
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
