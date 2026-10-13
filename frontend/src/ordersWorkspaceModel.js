import { templateDefinitions } from "../templates/index.js";
import { createTemplate } from "./model.js";

export const orderTemplateChoices = Object.entries(templateDefinitions).map(([templateId, definition]) => {
  const template = createTemplate(definition);
  const panel = template.panels[template.defaultPanelId];
  return {
    templateId,
    label: definition.label || templateId,
    sizes: definition.sizes || [],
    panelCount: Object.keys(template.panels).length,
    preview: panel?.templateImage,
  };
});

export const orderTemplateChoiceById = Object.fromEntries(orderTemplateChoices.map((item) => [item.templateId, item]));

export function getLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUpdatedTime(draft) {
  const timestamp = new Date(draft?.updated_at || "").getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function countDraftsUpdatedToday(drafts, now = new Date()) {
  const today = getLocalDateKey(now);
  return drafts.filter((draft) => getLocalDateKey(draft.updated_at) === today).length;
}

export function countDraftsUpdatedWithinDays(drafts, days, now = new Date()) {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return drafts.filter((draft) => {
    const timestamp = getUpdatedTime(draft);
    return timestamp !== null && timestamp <= now.getTime() && timestamp >= cutoff;
  }).length;
}

export function getDraftTemplateCounts(drafts) {
  const counts = new Map();
  drafts.forEach((draft) => {
    const templateId = String(draft?.template_id || "").trim();
    if (templateId) counts.set(templateId, (counts.get(templateId) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([templateId, count]) => ({ templateId, count, label: templateDefinitions[templateId]?.label || templateId }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}

export function filterOrderDrafts(drafts, filters = {}, now = new Date()) {
  const search = String(filters.search || "").trim().toLocaleLowerCase();
  const templateId = String(filters.templateId || "");
  const dateView = filters.dateView || "all";
  const customDate = String(filters.customDate || "");
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  return drafts
    .filter((draft) => {
      if (templateId && draft.template_id !== templateId) return false;

      const templateName = templateDefinitions[draft.template_id]?.label || "";
      const searchableText = `${draft.order_id || ""} ${draft.template_id || ""} ${templateName}`.toLocaleLowerCase();
      if (search && !searchableText.includes(search)) return false;

      if (customDate) return getLocalDateKey(draft.updated_at) === customDate;
      if (dateView === "today") return getLocalDateKey(draft.updated_at) === getLocalDateKey(now);
      if (dateView === "recent") {
        const timestamp = getUpdatedTime(draft);
        return timestamp !== null && timestamp <= now.getTime() && timestamp >= cutoff;
      }
      return true;
    })
    .sort((a, b) => (getUpdatedTime(b) || 0) - (getUpdatedTime(a) || 0));
}
