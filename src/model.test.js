import assert from "node:assert/strict";
import { createImageElement, createTextElement, fillPanelSize } from "./elements.js";
import { createInitialDesign, garmentColors, normalizeColor } from "./config.js";
import { prepareTextRasterManifest, textRasterTargetFromBounds } from "./download.js";
import { textFonts } from "./fontMap.js";
import { clampElement, createExportJson, createPanelState, createTemplate, validateDesign } from "./model.js";

// 测试使用的模板结构。
const template = createTemplate();
// 测试使用的最小设计草稿。
const design = {
  // JSON schema 版本。
  schemaVersion: 1,
  // 测试订单号。
  orderId: "ORDER-1",
  // 测试产品 ID。
  productId: "PRODUCT-1",
  // 模板 ID。
  templateId: template.templateId,
  // 模板版本。
  templateVersion: template.templateVersion,
  // 当前尺码。
  size: "2XL",
  // 当前服装颜色。
  garmentColor: "rgb(141, 174, 212)",
  // 测试素材清单。
  assets: [{ assetId: "asset-1", dataUrl: "data:image/png;base64,abc", sourceFile: "a.png" }],
  // 每个裁片的初始状态。
  panels: Object.fromEntries(Object.entries(template.panels).map(([id, panel]) => [id, createPanelState(panel)])),
};

design.panels.front.elements.push({
  id: "element-1",
  type: "image",
  assetId: "asset-1",
  centerX: 0.5,
  centerY: 0.4,
  width: 0.3,
  height: 0.2,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  visible: true,
});
design.panels.front.elements.push(createTextElement("name"));

assert.equal(validateDesign(design).passed, true);
assert.equal(clampElement({ centerX: 2, centerY: -1, width: 0, height: 2, opacity: 3 }).centerX, 1);
assert.equal(createExportJson(design).assets[0].dataUrl, undefined);
assert.equal(createExportJson(design).panels.front.logicalSize.width, 2796);
assert.equal(createExportJson(design).panels.front.changed, true);
assert.equal(createExportJson(design).panels.front.layerName, "前片");
assert.equal(createExportJson(design).panels.front.bounds.left, 9);
assert.equal(createExportJson(design).panels.front.maskImage, "/templates/M-2XL/masks/front-mask.png");
assert.equal(createExportJson(design).panels.front.guides[0].id, "cutline");
assert.equal(createExportJson(design).panels.front.guides[0].style.dash[0], 8);
assert.equal(createExportJson(design).panels.front.elements[1].photoshopFont, "NFLSeattleSeahawksFlat");
assert.equal(createExportJson(design).panels.front.elements[1].fontFamily, "\"NFL Seattle Seahawks Flat\", Arial, sans-serif");
assert.equal(textFonts["font-nfl-seahawks-flat"].label, "NFL Seattle Seahawks Flat");
assert.equal(createExportJson(design).panels.front.guides[1].id, "center_line");
assert.equal(template.productId, "PRODUCT-M-2XL");
assert.equal(template.draftKey, "sds-design-M-2XL-panels-v1");
assert.equal(template.threeD.defaultModelUrl, "/models/soccer-new-rename.glb");
assert.deepEqual(template.threeD.uvRects.front, [0.450439453125, 0.5546875, 0.88720703125, 0.9921875]);
assert.equal(Object.keys(template.panels).length, 8);
assert.equal(template.panels.back.templateImage, "/templates/M-2XL/panels/back.png");
assert.equal(createExportJson(design).panels.shouder.logicalSize.width, 2980);
assert.equal(createInitialDesign().assets.length, 0);
assert.equal(createInitialDesign().garmentColor, "rgb(141, 174, 212)");
assert.ok(garmentColors.every((color) => color.startsWith("rgb(")));
assert.match(createInitialDesign().garmentColor, /^rgb\(\d+, \d+, \d+\)$/);
assert.equal(normalizeColor("#F7D56F"), "rgb(247, 213, 111)");

design.panels.back.changed = true;
assert.equal(createExportJson(design).panels.back.changed, true);
assert.equal(createExportJson(design).panels.back.status, "not_started");

design.panels.front.elements[1].centerX = 0.95;
assert.equal(validateDesign(design).passed, false);
design.panels.front.elements[1].centerX = 0.5;

// 验证上传图片默认尺寸会按原图比例计算。
const uploadedImage = createImageElement("asset-wide", 2, 1);
assert.equal(uploadedImage.width, 0.42);
assert.equal(uploadedImage.height, 0.21);
assert.deepEqual(fillPanelSize(2, 1), { width: 2, height: 1 });
assert.deepEqual(fillPanelSize(0.5, 1), { width: 1, height: 2 });
const packageManifest = prepareTextRasterManifest(createExportJson(design));
const exportedNameText = packageManifest.panels.front.elements.find((element) => element.type === "text");
assert.equal(exportedNameText.restoreMode, "editableText");
assert.equal(exportedNameText.measurementMode, "webRasterBounds");
assert.match(exportedNameText.rasterAssetId, /^text-raster-front-/);
assert.match(exportedNameText.rasterSourceFile, /^text-raster\/front-/);
assert.equal(packageManifest.assets.find((asset) => asset.assetId === exportedNameText.rasterAssetId).type, "text-raster");
assert.deepEqual(textRasterTargetFromBounds({
  centerX: 0.5,
  centerY: 0.5,
  width: 0.2,
  height: 0.2,
  rotation: 90,
}, 1000, 1000, { left: 0, top: 50, right: 100, bottom: 150 }), {
  centerX: 0.5,
  centerY: 0.45,
  width: 0.1,
  height: 0.1,
});
assert.equal(validateDesign({
  ...design,
  panels: {
    ...design.panels,
    front: {
      ...design.panels.front,
      elements: [{ ...design.panels.front.elements[0], centerX: 0.5, centerY: 0.5, width: 2, height: 1 }],
    },
  },
}).passed, true);
