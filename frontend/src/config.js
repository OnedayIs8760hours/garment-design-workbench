import { createPanelState, createTemplate } from "./model.js";
import { selectedTemplateIdFromLocation, templateDefinitionFor } from "../templates/index.js";

// 应用运行时使用的模板对象。
export const template = createTemplate(templateDefinitionFor(selectedTemplateIdFromLocation()));
// 默认裁片，用于计算初始舞台尺寸。
export const firstPanel = template.panels[template.defaultPanelId];
// localStorage 保存草稿时使用的键。
export const draftKey = template.draftKey;

// 根据裁片原始比例生成编辑画布尺寸。
export const getStageSize = (panel = firstPanel) => ({
  // 画布固定显示宽度。
  width: 620,
  // 画布高度跟随裁片宽高比。
  height: Math.round((620 * panel.logicalSize.height) / panel.logicalSize.width),
});

// 默认裁片的画布尺寸。
export const stageSize = getStageSize();
// 侧栏可选的服装颜色。
export const garmentColors = [
  "rgb(255, 255, 255)", "rgb(141, 174, 212)", "rgb(0, 0, 0)", "rgb(245, 245, 245)", "rgb(225, 225, 225)", "rgb(188, 188, 188)", "rgb(148, 148, 148)", "rgb(92, 92, 92)",
  "rgb(255, 225, 219)", "rgb(255, 193, 180)", "rgb(183, 0, 36)", "rgb(214, 20, 43)", "rgb(238, 34, 37)", "rgb(232, 77, 58)", "rgb(255, 157, 140)", "rgb(239, 116, 100)",
  "rgb(255, 199, 162)", "rgb(253, 213, 174)", "rgb(235, 196, 174)", "rgb(246, 213, 198)", "rgb(249, 232, 224)", "rgb(244, 225, 206)", "rgb(255, 213, 160)", "rgb(255, 197, 112)",
  "rgb(181, 82, 36)", "rgb(130, 62, 28)", "rgb(90, 54, 24)", "rgb(156, 91, 36)", "rgb(188, 127, 75)", "rgb(218, 145, 77)", "rgb(210, 126, 30)", "rgb(221, 151, 35)",
  "rgb(255, 232, 65)", "rgb(246, 242, 114)", "rgb(237, 234, 67)", "rgb(222, 230, 43)", "rgb(205, 174, 63)", "rgb(186, 200, 102)", "rgb(226, 235, 178)", "rgb(219, 241, 210)",
  "rgb(78, 165, 94)", "rgb(39, 146, 76)", "rgb(0, 116, 80)", "rgb(0, 83, 58)", "rgb(100, 183, 72)", "rgb(223, 239, 218)", "rgb(207, 235, 210)", "rgb(190, 226, 218)",
  "rgb(53, 157, 183)", "rgb(65, 180, 199)", "rgb(193, 239, 243)", "rgb(159, 222, 234)", "rgb(136, 211, 229)", "rgb(58, 169, 206)", "rgb(46, 169, 221)", "rgb(20, 131, 192)",
  "rgb(189, 185, 223)", "rgb(169, 176, 212)", "rgb(131, 147, 193)", "rgb(110, 105, 171)", "rgb(134, 128, 183)", "rgb(108, 97, 164)", "rgb(76, 61, 106)", "rgb(62, 45, 88)",
  "rgb(234, 196, 219)", "rgb(236, 127, 180)", "rgb(204, 73, 132)", "rgb(193, 21, 111)", "rgb(158, 19, 102)", "rgb(134, 23, 89)", "rgb(205, 30, 135)", "rgb(242, 77, 145)",
  "rgb(142, 103, 102)", "rgb(163, 143, 144)", "rgb(178, 167, 174)", "rgb(243, 205, 215)", "rgb(251, 218, 220)", "rgb(247, 198, 205)", "rgb(232, 161, 174)", "rgb(177, 104, 118)",
];

export function normalizeColor(color) {
  if (!/^#[\da-f]{6}$/i.test(color ?? "")) return color;
  const value = Number.parseInt(color.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

export function normalizeDesignColors(design) {
  design.garmentColor = normalizeColor(design.garmentColor);
  design.assets?.forEach((asset) => {
    if (asset.color) asset.color = normalizeColor(asset.color);
  });
  return design;
}

// 创建一份新的空白设计草稿。
export function createInitialDesign(activeTemplate = template) {
  return {
    // 导出 JSON 的 schema 版本。
    schemaVersion: 1,
    // 默认订单编号。
    orderId: createOrderId(),
    // 当前产品 ID。
    productId: activeTemplate.productId,
    // 当前模板 ID。
    templateId: activeTemplate.templateId,
    // 当前模板版本。
    templateVersion: activeTemplate.templateVersion,
    // 当前尺码。
    size: activeTemplate.sizes[0],
    // 当前服装底色。
    garmentColor: "rgb(141, 174, 212)",
    // 当前正在编辑的裁片 ID。
    currentPanelId: activeTemplate.defaultPanelId,
    // 上次保存时间。
    savedAt: null,
    // 设计里可复用的素材清单。
    assets: [],
    // 每个裁片的编辑状态。
    panels: Object.fromEntries(
      Object.entries(activeTemplate.panels).map(([panelId, panel]) => [panelId, createPanelState(panel)]),
    ),
  };
}

export function createOrderId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ORDER-${stamp}-${random}`;
}
