import m2xlTemplate from "./M-2XL.template.json" with { type: "json" };
import m2xlUvMapping from "./M-2XL.uv_mapping.json" with { type: "json" };

export const activeTemplateId = "M-2XL";

export const templateDefinitions = {
  "M-2XL": {
    template: m2xlTemplate,
    sizes: ["M-2XL"],
    productId: "PRODUCT-M-2XL",
    defaultModelUrl: "/models/soccer-new-rename.glb",
    uvMapping: m2xlUvMapping,
  },
};

export const activeTemplateDefinition = templateDefinitions[activeTemplateId];
