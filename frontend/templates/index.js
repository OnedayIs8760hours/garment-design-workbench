import m2xlTemplate from "./football-jersey/M-2XL.template.json" with { type: "json" };
import m2xlUvMapping from "./football-jersey/M-2XL.uv_mapping.json" with { type: "json" };
import wmTemplate from "./football-jersey-crop-top-two-tone/W-M.template.json" with { type: "json" };
import wmUvMapping from "./football-jersey-crop-top-two-tone/W-M.uv_mapping.json" with { type: "json" };

export const activeTemplateId = "W-M";

export const templateCatalogPaths = {
  "M-2XL": {
    category: "football-jersey",
    template: "templates/football-jersey/M-2XL.template.json",
    uvMapping: "templates/football-jersey/M-2XL.uv_mapping.json",
  },
  "W-M": {
    category: "football-jersey-crop-top-two-tone",
    template: "templates/football-jersey-crop-top-two-tone/W-M.template.json",
    uvMapping: "templates/football-jersey-crop-top-two-tone/W-M.uv_mapping.json",
  },
};

export const templateDefinitions = {
  "M-2XL": {
    template: m2xlTemplate,
    label: "橄榄球衣",
    sizes: ["M-2XL"],
    productId: "PRODUCT-M-2XL",
    defaultPanelId: "front",
    publicAssetBase: "/templates/football-jersey",
    defaultModelUrl: "/models/football-jersey.glb",
    uvMapping: m2xlUvMapping,
  },
  "W-M": {
    template: wmTemplate,
    label: "橄榄球衣-双拼-露脐",
    sizes: ["W-M"],
    productId: "PRODUCT-W-M",
    defaultPanelId: "up-front",
    publicAssetBase: "/templates/football-jersey-crop-top-two-tone",
    defaultModelUrl: "/models/football-jersey-crop-top-two-tone.glb",
    uvMapping: wmUvMapping,
  },
};

export const activeTemplateDefinition = templateDefinitions[activeTemplateId];

export const templateOptions = Object.entries(templateDefinitions).map(([templateId, definition]) => ({
  templateId,
  label: definition.label ?? templateId,
}));

export const templateSelectionStorageKey = "woda-design-active-template-id";

export function resolveTemplateId(templateId) {
  return templateDefinitions[templateId] ? templateId : activeTemplateId;
}

export function selectedTemplateIdFromLocation(location = globalThis.location, storage = globalThis.localStorage) {
  const urlTemplateId = new URLSearchParams(location?.search ?? "").get("template");
  const storedTemplateId = safeStorageGet(storage, templateSelectionStorageKey);
  return resolveTemplateId(urlTemplateId || storedTemplateId);
}

function safeStorageGet(storage, key) {
  try {
    return storage?.getItem(key);
  } catch {
    return null;
  }
}

export function templateDefinitionFor(templateId) {
  return templateDefinitions[templateId] ?? activeTemplateDefinition;
}
