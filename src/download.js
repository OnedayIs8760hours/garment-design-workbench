import JSZip from "jszip";
import { textFontFor } from "./fontMap.js";
import { textFontSizeForBox } from "./textMetrics.js";

export async function downloadZip(design, exportJson) {
  downloadBlob(`design-package-${exportJson.orderId}.zip`, await createPackageBlob(design, exportJson));
}

export async function createPackageBlob(design, exportJson) {
  const zip = new JSZip();
  const packageJson = rewriteAssetPathsForPackage(prepareTextRasterManifest(exportJson));

  if (document.fonts?.ready) await document.fonts.ready;

  for (const asset of design.assets) {
    if (!asset.dataUrl) continue;
    const file = await assetToZipFile(asset.dataUrl);
    zip.file(packageAssetPath(asset), file.content, file.options);
  }

  for (const item of textRasterItems(packageJson)) {
    const raster = renderTextRaster(item.panel, item.element);
    Object.assign(item.element, {
      rasterTarget: raster.target,
      rasterNaturalWidth: raster.width,
      rasterNaturalHeight: raster.height,
    });
    zip.file(`assets/${item.element.rasterSourceFile}`, raster.file.content, raster.file.options);
  }

  zip.file("manifest.json", JSON.stringify(packageJson, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export function prepareTextRasterManifest(exportJson) {
  const next = structuredClone(exportJson);
  const rasterAssets = [];

  Object.entries(next.panels ?? {}).forEach(([panelId, panel]) => {
    (panel.elements ?? []).forEach((element, index) => {
      if (element.type !== "text") return;
      const elementKey = safeFilename(element.id || index);
      const assetId = `text-raster-${panelId}-${elementKey}`;
      const sourceFile = `text-raster/${panelId}-${elementKey}.png`;

      Object.assign(element, {
        restoreMode: "editableText",
        measurementMode: "webRasterBounds",
        rasterAssetId: assetId,
        rasterSourceFile: sourceFile,
      });

      rasterAssets.push({
        assetId,
        type: "text-raster",
        name: sourceFile.split("/").pop(),
        sourceFile,
        panelId,
        elementId: element.id,
      });
    });
  });

  next.assets = [...(next.assets ?? []), ...rasterAssets];
  return next;
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
  if (asset.type === "text-raster") return `assets/${asset.sourceFile}`;
  return `assets/${asset.assetId}-${safeFilename(asset.sourceFile || asset.name || "asset.png")}`;
}

function safeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_");
}

function textRasterItems(packageJson) {
  const items = [];
  Object.values(packageJson.panels ?? {}).forEach((panel) => {
    (panel.elements ?? []).forEach((element) => {
      if (element.type === "text" && element.measurementMode === "webRasterBounds") {
        items.push({ panel, element });
      }
    });
  });
  return items;
}

function renderTextRaster(panel, element) {
  const panelWidth = Number(panel.logicalSize?.width || 1);
  const panelHeight = Number(panel.logicalSize?.height || 1);
  const width = Math.max(1, Math.round(Number(element.width || 0) * panelWidth));
  const height = Math.max(1, Math.round(Number(element.height || 0) * panelHeight));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const font = textFontFor(element);
  ctx.clearRect(0, 0, width, height);
  ctx.font = `${font.cssStyle ?? "normal"} ${font.cssWeight ?? 400} ${textFontSizeForBox(height, 1)}px ${font.cssFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = element.stroke || "#000000";
  ctx.lineWidth = Math.max(1, Number(element.strokeWidth || 0) * panelWidth);
  ctx.fillStyle = element.fill || "#000000";
  ctx.strokeText(String(element.text ?? ""), width / 2, height / 2, width);
  ctx.fillText(String(element.text ?? ""), width / 2, height / 2, width);

  const bounds = scanAlphaBounds(ctx, width, height) ?? { left: 0, top: 0, right: width, bottom: height };
  const croppedWidth = Math.max(1, bounds.right - bounds.left);
  const croppedHeight = Math.max(1, bounds.bottom - bounds.top);
  const cropped = document.createElement("canvas");
  cropped.width = croppedWidth;
  cropped.height = croppedHeight;
  cropped.getContext("2d").drawImage(canvas, bounds.left, bounds.top, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);

  return {
    width: croppedWidth,
    height: croppedHeight,
    file: dataUrlToZipFile(cropped.toDataURL("image/png")),
    target: textRasterTargetFromBounds(element, panelWidth, panelHeight, bounds),
  };
}

function scanAlphaBounds(ctx, width, height) {
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }

  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

export function textRasterTargetFromBounds(element, panelWidth, panelHeight, bounds) {
  const boxLeftPx = (Number(element.centerX || 0) - Number(element.width || 0) / 2) * panelWidth;
  const boxTopPx = (Number(element.centerY || 0) - Number(element.height || 0) / 2) * panelHeight;
  const elementCenterX = Number(element.centerX || 0) * panelWidth;
  const elementCenterY = Number(element.centerY || 0) * panelHeight;
  const visualCenterX = boxLeftPx + (bounds.left + bounds.right) / 2;
  const visualCenterY = boxTopPx + (bounds.top + bounds.bottom) / 2;
  const rotation = (Number(element.rotation || 0) * Math.PI) / 180;
  const dx = visualCenterX - elementCenterX;
  const dy = visualCenterY - elementCenterY;
  const rotatedCenterX = elementCenterX + dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const rotatedCenterY = elementCenterY + dx * Math.sin(rotation) + dy * Math.cos(rotation);

  return {
    centerX: rotatedCenterX / panelWidth,
    centerY: rotatedCenterY / panelHeight,
    width: (bounds.right - bounds.left) / panelWidth,
    height: (bounds.bottom - bounds.top) / panelHeight,
  };
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
