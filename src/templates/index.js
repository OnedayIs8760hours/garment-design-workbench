import m2xlTemplate from "./M-2XL.template.json" with { type: "json" };
import m2xlUvMapping from "./M-2XL.uv_mapping.json" with { type: "json" };

// 当前加载的模板 ID。
export const activeTemplateId = "M-2XL";

// 所有可用模板的元数据入口。
export const templateDefinitions = {
  "M-2XL": {
    // 裁片模板定义。
    template: m2xlTemplate,
    // 当前模板支持的尺码。
    sizes: ["M-2XL"],
    // 导出订单使用的产品 ID。
    productId: "PRODUCT-M-2XL",
    // 3D 预览默认加载的模型路径。
    defaultModelUrl: "/models/soccer-new-rename.glb",
    // 3D 模型 UV 到裁片的映射数据。
    uvMapping: m2xlUvMapping,
  },
};

// 当前实际使用的模板定义。
export const activeTemplateDefinition = templateDefinitions[activeTemplateId];
