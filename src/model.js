import exportedTemplate from "./templates/M-2XL.template.json" with { type: "json" };

export function createTemplate() {
  const basePath = `/templates/${exportedTemplate.templateId}`;
  const assetUrl = (filePath) => (filePath ? `${basePath}/${filePath}` : null);
  const panelIds = exportedTemplate.panelOrder ?? Object.keys(exportedTemplate.panels);

  return {
    templateId: exportedTemplate.templateId,
    templateVersion: exportedTemplate.templateVersion,
    name: `${exportedTemplate.templateId} garment panels`,
    sizes: ["M-2XL"],
    panels: Object.fromEntries(
      panelIds.map((panelId) => {
        const panel = exportedTemplate.panels[panelId];
        return [
          panelId,
          {
            name: panel.name,
            layerName: panel.layerName,
            bounds: panel.bounds,
            logicalSize: panel.size,
            templateImage: assetUrl(panel.panelImage),
            maskImage: assetUrl(panel.maskImage),
            sourceFile: `templates/${exportedTemplate.templateId}/${panel.panelImage}`,
            guides: panel.guides ?? [],
            previewMapping: { type: "simple", target: panelId },
          },
        ];
      }),
    ),
  };
}

export function createPanelState(panel) {
  return {
    logicalSize: panel.logicalSize,
    templateImage: panel.templateImage,
    maskImage: panel.maskImage,
    sourceFile: panel.sourceFile,
    bounds: panel.bounds,
    guides: panel.guides,
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
          maskImage: template.panels[panelId]?.maskImage,
          sourceFile: template.panels[panelId]?.sourceFile,
          bounds: template.panels[panelId]?.bounds,
          guides: template.panels[panelId]?.guides,
          status: panel.elements.length ? "completed" : "not_started",
          elements: panel.elements.map((element) => clampElement(element)),
        },
      ]),
    ),
    validation,
  };
}
