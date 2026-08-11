import { createPanelState, createTemplate } from "./model.js";

// 应用运行时使用的模板对象。
export const template = createTemplate();
// 默认裁片，用于计算初始舞台尺寸。
export const firstPanel = template.panels.front;
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
export const garmentColors = ["#8DAED4", "#F3B7A7", "#B8D8C4", "#E8D7FF", "#F7D56F"];

// 创建一份新的空白设计草稿。
export function createInitialDesign() {
  return {
    // 导出 JSON 的 schema 版本。
    schemaVersion: 1,
    // 默认订单编号。
    orderId: "ORDER-20260805-001",
    // 当前产品 ID。
    productId: template.productId,
    // 当前模板 ID。
    templateId: template.templateId,
    // 当前模板版本。
    templateVersion: template.templateVersion,
    // 当前尺码。
    size: template.sizes[0],
    // 当前服装底色。
    garmentColor: "#8DAED4",
    // 当前正在编辑的裁片 ID。
    currentPanelId: "front",
    // 上次保存时间。
    savedAt: null,
    // 设计里可复用的素材清单。
    assets: [],
    // 每个裁片的编辑状态。
    panels: Object.fromEntries(
      Object.entries(template.panels).map(([panelId, panel]) => [panelId, createPanelState(panel)]),
    ),
  };
}
