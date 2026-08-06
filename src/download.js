import JSZip from "jszip";

export async function downloadZip(design, exportJson) {
  const zip = new JSZip();
  const packageJson = rewriteAssetPathsForPackage(exportJson);

  zip.file("manifest.json", JSON.stringify(packageJson, null, 2));
  zip.file("order-design.json", JSON.stringify(packageJson, null, 2));

  for (const asset of design.assets) {
    if (!asset.dataUrl) continue;
    const file = await assetToZipFile(asset.dataUrl);
    zip.file(packageAssetPath(asset), file.content, file.options);
  }

  downloadBlob(`design-package-${exportJson.orderId}.zip`, await zip.generateAsync({ type: "blob" }));
}

function rewriteAssetPathsForPackage(exportJson) {
  const assetPathById = new Map(exportJson.assets.map((asset) => [asset.assetId, packageAssetPath(asset).replace(/^assets\//, "")]));
  return {
    ...exportJson,
    assets: exportJson.assets.map((asset) => ({
      ...asset,
      sourceFile: assetPathById.get(asset.assetId) ?? asset.sourceFile,
    })),
  };
}

function packageAssetPath(asset) {
  return `assets/${asset.assetId}-${safeFilename(asset.sourceFile || asset.name || "asset.png")}`;
}

function safeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_");
}

async function assetToZipFile(src) {
  if (String(src).startsWith("data:")) return dataUrlToZipFile(src);

  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to fetch asset: ${src}`);
  return { content: await response.blob(), options: {} };
}

function dataUrlToZipFile(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return { content: dataUrl, options: {} };

  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);

  if (meta.includes(";base64")) {
    return { content: payload, options: { base64: true } };
  }

  return { content: decodeURIComponent(payload), options: {} };
}

export function downloadBlob(filename, content, type = "application/octet-stream") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
