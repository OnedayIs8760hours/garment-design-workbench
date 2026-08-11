import { activeTemplateDefinition } from "./templates/index.js";

// 将模板 JSON 转成应用内部统一使用的模板结构。
export function createTemplate(definition = activeTemplateDefinition) {
  // 从定义中取出原始导出模板。
  const exportedTemplate = definition.template;
  // 浏览器访问模板静态资源的基础路径。
  const basePath = `/templates/${exportedTemplate.templateId}`;
  // 把模板内的相对资源路径转换成浏览器路径。
  const assetUrl = (filePath) => (filePath ? `${basePath}/${filePath}` : null);
  // 裁片显示顺序，未配置时使用对象键顺序。
  const panelIds = exportedTemplate.panelOrder ?? Object.keys(exportedTemplate.panels);

  return {
    templateId: exportedTemplate.templateId,
    templateVersion: exportedTemplate.templateVersion,
    name: `${exportedTemplate.templateId} garment panels`,
    sizes: definition.sizes ?? [exportedTemplate.templateId],
    productId: definition.productId ?? `PRODUCT-${exportedTemplate.templateId}`,
    draftKey: definition.draftKey ?? `sds-design-${exportedTemplate.templateId}-panels-v${exportedTemplate.templateVersion}`,
    threeD: {
      // 3D 预览默认模型地址。
      defaultModelUrl: definition.defaultModelUrl ?? null,
      // 每个裁片在 UV 图集中的矩形区域。
      uvRects: Object.fromEntries(
        Object.entries(definition.uvMapping?.parts ?? {}).map(([panelId, part]) => [panelId, part.uv_rect]),
      ),
    },
    // 编辑器使用的裁片元数据。
    panels: Object.fromEntries(
      panelIds.map((panelId) => {
        // 原始模板里的单个裁片定义。
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

// 创建单个裁片的初始编辑状态。
export function createPanelState(panel) {
  return {
    // 裁片原始逻辑尺寸。
    logicalSize: panel.logicalSize,
    // 裁片底图路径。
    templateImage: panel.templateImage,
    // 裁片遮罩路径。
    maskImage: panel.maskImage,
    // 导出时记录的模板源文件。
    sourceFile: panel.sourceFile,
    // 裁片在原始模板里的边界。
    bounds: panel.bounds,
    // 裁片辅助线。
    guides: panel.guides,
    // 当前裁片是否被编辑过。
    changed: false,
    // 当前裁片业务状态。
    status: "not_started",
    // 当前裁片上的图片和文字元素。
    elements: [],
  };
}

// 把数值限制到 0 到 1 之间。
export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// 修正元素的坐标、尺寸和透明度，避免写入非法值。
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

// 根据裁片是否有元素返回标签状态。
export function getPanelStatus(panel) {
  if (panel.elements.length) return "编辑中";
  return "未开始";
}

// 校验设计是否存在越界、素材丢失或空文字。
export function validateDesign(design) {
  // 阻止导出的硬错误。
  const errors = [];
  // 可提示但不阻止导出的警告。
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

// 生成交给 Photoshop 和导出包使用的订单 JSON。
export function createExportJson(design, validation = validateDesign(design)) {
  // 最新模板结构，用于补齐导出里的模板元数据。
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
    // 导出 JSON 不内嵌 dataUrl，素材文件由 zip assets 目录承载。
    assets: design.assets.map(({ dataUrl, ...asset }) => asset),
    // 每个裁片的导出数据。
    panels: Object.fromEntries(
      Object.entries(design.panels).map(([panelId, panel]) => [
        panelId,
        {
          logicalSize: panel.logicalSize,
          name: template.panels[panelId]?.name,
          layerName: template.panels[panelId]?.layerName,
          templateImage: template.panels[panelId]?.templateImage,
          maskImage: template.panels[panelId]?.maskImage,
          sourceFile: template.panels[panelId]?.sourceFile,
          bounds: template.panels[panelId]?.bounds,
          guides: template.panels[panelId]?.guides,
          changed: Boolean(panel.changed || panel.elements.length),
          status: panel.elements.length ? "completed" : "not_started",
          elements: panel.elements.map((element) => clampElement(element)),
        },
      ]),
    ),
    validation,
  };
}
