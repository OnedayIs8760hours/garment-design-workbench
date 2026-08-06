import { createPanelState, createTemplate } from "./model.js";

export const template = createTemplate();
export const firstPanel = template.panels.front;
export const draftKey = "sds-design-M-2XL-front-v1";
export const stageSize = {
  width: 620,
  height: Math.round((620 * firstPanel.logicalSize.height) / firstPanel.logicalSize.width),
};
export const garmentColors = ["#8DAED4", "#F3B7A7", "#B8D8C4", "#E8D7FF", "#F7D56F"];

export const sampleAsset = {
  assetId: "asset-sample-mark",
  type: "image",
  name: "示例图案",
  previewFile: "front-lower-panel-sample.png",
  sourceFile: "front-lower-panel-sample.png",
  dataUrl: "/samples/front-lower-panel-sample.png",
  originalWidth: 435,
  originalHeight: 466,
};

export function createInitialDesign() {
  return {
    schemaVersion: 1,
    orderId: "ORDER-20260805-001",
    productId: "PRODUCT-M-2XL-FRONT",
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    size: "M-2XL",
    garmentColor: "#8DAED4",
    currentPanelId: "front",
    savedAt: null,
    assets: [sampleAsset],
    panels: Object.fromEntries(
      Object.entries(template.panels).map(([panelId, panel]) => [panelId, createPanelState(panel)]),
    ),
  };
}
