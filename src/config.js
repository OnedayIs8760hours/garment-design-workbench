import { createPanelState, createTemplate } from "./model.js";

export const template = createTemplate();
export const firstPanel = template.panels.front_body;
export const draftKey = "sds-design-front-panel-demo-v3";
export const stageSize = {
  width: 620,
  height: Math.round((620 * firstPanel.logicalSize.height) / firstPanel.logicalSize.width),
};
export const garmentColors = ["#8DAED4", "#F3B7A7", "#B8D8C4", "#E8D7FF", "#F7D56F"];

export const sampleAsset = {
  assetId: "asset-sample-mark",
  type: "image",
  name: "示例图案",
  previewFile: "inline-sample.svg",
  sourceFile: "sample-original.png",
  dataUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><rect width="600" height="420" rx="42" fill="#111827"/><path d="M100 290 220 130l78 112 62-76 140 124" fill="none" stroke="#22c55e" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/><circle cx="410" cy="112" r="42" fill="#f59e0b"/></svg>',
    ),
  originalWidth: 600,
  originalHeight: 420,
};

export function createInitialDesign() {
  return {
    schemaVersion: 1,
    orderId: "ORDER-20260805-001",
    productId: "PRODUCT-FRONT-PANEL-DEMO",
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    size: "2XL",
    garmentColor: "#8DAED4",
    currentPanelId: "front_body",
    savedAt: null,
    assets: [sampleAsset],
    panels: Object.fromEntries(
      Object.entries(template.panels).map(([panelId, panel]) => [panelId, createPanelState(panel)]),
    ),
  };
}
