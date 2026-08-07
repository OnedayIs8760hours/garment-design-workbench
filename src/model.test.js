import assert from "node:assert/strict";
import { clampElement, createExportJson, createPanelState, createTemplate, validateDesign } from "./model.js";

const template = createTemplate();
const design = {
  schemaVersion: 1,
  orderId: "ORDER-1",
  productId: "PRODUCT-1",
  templateId: template.templateId,
  templateVersion: template.templateVersion,
  size: "2XL",
  garmentColor: "#8DAED4",
  assets: [{ assetId: "asset-1", dataUrl: "data:image/png;base64,abc", sourceFile: "a.png" }],
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

assert.equal(validateDesign(design).passed, true);
assert.equal(clampElement({ centerX: 2, centerY: -1, width: 0, height: 2, opacity: 3 }).centerX, 1);
assert.equal(createExportJson(design).assets[0].dataUrl, undefined);
assert.equal(createExportJson(design).panels.front.logicalSize.width, 2796);
assert.equal(createExportJson(design).panels.front.bounds.left, 9);
assert.equal(createExportJson(design).panels.front.maskImage, "/templates/M-2XL/masks/front-mask.png");
assert.equal(createExportJson(design).panels.front.guides[0].id, "cutline");
assert.equal(createExportJson(design).panels.front.guides[0].style.dash[0], 8);
assert.equal(createExportJson(design).panels.front.guides[1].id, "center_line");
assert.equal(Object.keys(template.panels).length, 8);
assert.equal(template.panels.back.templateImage, "/templates/M-2XL/panels/back.png");
assert.equal(createExportJson(design).panels.shouder.logicalSize.width, 2980);

design.panels.front.elements[0].centerX = 0.95;
assert.equal(validateDesign(design).passed, false);
