import { getAccessToken, requestJson } from "../api.js";

const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
export const oversightApi = {
  designs: ({ ownerId, query = "", offset = 0 }) => {
    const params = new URLSearchParams({ q: query, offset, limit: 30 });
    if (ownerId) params.set("owner_id", ownerId);
    return requestJson(`/oversight/designs?${params}`);
  },
  design: (draft) => requestJson(`/oversight/designs/${draft.owner_user_id}/${encodeURIComponent(draft.template_id)}?${new URLSearchParams({ order_id: draft.order_id })}`),
  images: ({ ownerId, cursor }) => {
    const params = new URLSearchParams({ limit: 24 });
    if (ownerId) params.set("owner_id", ownerId);
    if (cursor) params.set("cursor", cursor);
    return requestJson(`/oversight/images?${params}`);
  },
  imageBlob: async (objectKey) => {
    const response = await fetch(`${base}/oversight/images/content?${new URLSearchParams({ object_key: objectKey })}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
    if (!response.ok) throw new Error(`图片读取失败（${response.status}）`);
    return response.blob();
  },
};
