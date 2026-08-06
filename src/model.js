export function createTemplate() {
  return {
    templateId: "FRONT-PANEL-DEMO-001",
    templateVersion: 2,
    name: "前片最小案例",
    sizes: ["2XL"],
    panels: {
      front_body: {
        name: "前片",
        logicalSize: { width: 3340, height: 3296 },
        templateImage: "/templates/front-panel.png",
        sourceFile: "templates/front-panel.png",
        clipPath: [
          [52, 3292],
          [3288, 3292],
          [3335, 1434],
          [3156, 1426],
          [2976, 1376],
          [2868, 1268],
          [2802, 1120],
          [2778, 910],
          [2798, 612],
          [2904, 286],
          [2134, 0],
          [2102, 164],
          [2040, 314],
          [1936, 440],
          [1804, 510],
          [1668, 530],
          [1532, 510],
          [1400, 440],
          [1296, 314],
          [1234, 164],
          [1202, 0],
          [442, 286],
          [548, 612],
          [568, 910],
          [544, 1120],
          [478, 1268],
          [370, 1376],
          [190, 1426],
          [4, 1434],
        ],
        previewMapping: { type: "simple", target: "front" },
      },
    },
  };
}

export function createPanelState(panel) {
  return {
    logicalSize: panel.logicalSize,
    templateImage: panel.templateImage,
    sourceFile: panel.sourceFile,
    clipPath: panel.clipPath,
    status: "not_started",
    elements: [],
  };
}

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function clampElement(element) {
  return {
    ...element,
    centerX: clamp01(element.centerX),
    centerY: clamp01(element.centerY),
    width: Math.min(1, Math.max(0.03, Number(element.width) || 0.03)),
    height: Math.min(1, Math.max(0.03, Number(element.height) || 0.03)),
    opacity: Math.min(1, Math.max(0.1, Number(element.opacity) || 1)),
  };
}

export function getPanelStatus(panel) {
  if (panel.elements.length) return "编辑中";
  return "未开始";
}

export function validateDesign(design) {
  const errors = [];
  const warnings = [];

  Object.entries(design.panels).forEach(([panelId, panel]) => {
    panel.elements.forEach((element) => {
      if (element.centerX - element.width / 2 < 0 || element.centerX + element.width / 2 > 1) {
        errors.push(`${panelId} 存在横向超出裁片的元素`);
      }
      if (element.centerY - element.height / 2 < 0 || element.centerY + element.height / 2 > 1) {
        errors.push(`${panelId} 存在纵向超出裁片的元素`);
      }
      if (element.type === "image" && !design.assets.some((asset) => asset.assetId === element.assetId)) {
        errors.push(`${panelId} 存在缺失素材引用`);
      }
      if (element.type === "text" && !String(element.text ?? "").trim()) {
        warnings.push(`${panelId} 存在空文字元素`);
      }
    });
  });

  return {
    passed: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

export function createExportJson(design, validation = validateDesign(design)) {
  const template = createTemplate();
  return {
    schemaVersion: design.schemaVersion,
    orderId: design.orderId,
    productId: design.productId,
    templateId: design.templateId,
    templateVersion: design.templateVersion,
    size: design.size,
    garmentColor: design.garmentColor,
    updatedAt: new Date().toISOString(),
    assets: design.assets.map(({ dataUrl, ...asset }) => asset),
    panels: Object.fromEntries(
      Object.entries(design.panels).map(([panelId, panel]) => [
        panelId,
        {
          logicalSize: panel.logicalSize,
          templateImage: template.panels[panelId]?.templateImage,
          sourceFile: template.panels[panelId]?.sourceFile,
          clipPath: template.panels[panelId]?.clipPath,
          status: panel.elements.length ? "completed" : "not_started",
          elements: panel.elements.map((element) => clampElement(element)),
        },
      ]),
    ),
    validation,
  };
}
