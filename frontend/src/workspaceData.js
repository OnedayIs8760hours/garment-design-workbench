import { getDesignDraft, listDesignDrafts } from "./api.js";

export function formatWorkspaceDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function loadSavedDesignAssets() {
  const drafts = await listDesignDrafts();
  const assetsByKey = new Map();
  let failedDraftReads = 0;

  for (let start = 0; start < drafts.length; start += 4) {
    const batch = drafts.slice(start, start + 4);
    const results = await Promise.allSettled(
      batch.map((draft) => getDesignDraft(draft.template_id, draft.order_id)),
    );

    results.forEach((result, index) => {
      if (result.status !== "fulfilled") {
        failedDraftReads += 1;
        return;
      }

      const draft = batch[index];
      const designAssets = result.value?.design?.assets;
      if (!Array.isArray(designAssets)) return;

      designAssets.forEach((asset) => {
        if (!asset || asset.internal) return;
        const assetKey = String(asset.objectKey || asset.assetId || `${draft.template_id}:${draft.order_id}:${asset.name || "asset"}`);
        const draftRef = {
          template_id: draft.template_id,
          order_id: draft.order_id,
          updated_at: draft.updated_at,
        };
        const existing = assetsByKey.get(assetKey);
        if (existing) {
          existing.drafts.push(draftRef);
          return;
        }
        assetsByKey.set(assetKey, { key: assetKey, asset, drafts: [draftRef] });
      });
    });
  }

  return { drafts, assets: [...assetsByKey.values()], failedDraftReads };
}
