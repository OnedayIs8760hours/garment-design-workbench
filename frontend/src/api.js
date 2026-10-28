import { clearErpSession } from "./api/erpArt.js";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const ACCESS_TOKEN_KEY = "woda_design_access_token";
const SESSION_TOKEN_KEY = "woda_design_session_token";

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  clearErpSession();
}

function storeAccessToken(token, remember) {
  clearAccessToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(remember ? ACCESS_TOKEN_KEY : SESSION_TOKEN_KEY, token);
}

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const token = getAccessToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("无法连接服务，请确认后端已启动。");
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.reply || getApiErrorMessage(response.status, payload));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function getApiErrorMessage(status, payload) {
  if (status === 401) return "用户名或密码错误，或登录会话已过期。";
  if (status === 403) return "当前账号已停用。";
  if (status === 409) return "用户名已被占用，请换一个试试。";

  if (Array.isArray(payload?.detail)) {
    return payload.detail.map((item) => item.msg).filter(Boolean).join("；") || "请求参数不正确。";
  }
  if (typeof payload?.detail === "string") return payload.detail;
  if (status === 503) return "服务暂时不可用，请稍后再试。";
  if (status === 502) return "生成服务暂时不可用，请确认服务已启动。";
  return "请求失败，请稍后再试。";
}

export function registerUser(username, password, jobTitle) {
  return requestJson("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, job_title: jobTitle || null }),
  });
}

export async function loginUser(username, password, remember) {
  const payload = await requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  storeAccessToken(payload.access_token, remember);
  return payload;
}

export function getCurrentUser() {
  return requestJson("/auth/me");
}

export async function logoutUser() {
  try {
    await requestJson("/auth/logout", { method: "POST" });
  } finally {
    clearAccessToken();
  }
}

export function listDesignDrafts(templateId) {
  const query = templateId ? `?template_id=${encodeURIComponent(templateId)}` : "";
  return requestJson(`/designs${query}`);
}

export function getDesignDraft(templateId, orderId) {
  const query = orderId ? `?order_id=${encodeURIComponent(orderId)}` : "";
  return requestJson(`/designs/${encodeURIComponent(templateId)}${query}`);
}

export function saveDesignDraft(templateId, design) {
  return requestJson(`/designs/${encodeURIComponent(templateId)}`, {
    method: "PUT",
    body: JSON.stringify({ design }),
  });
}

export function uploadDesignAsset(file, orderId) {
  const form = new FormData();
  form.append("file", file);
  if (orderId) form.append("order_id", orderId);
  return requestJson("/assets", { method: "POST", body: form });
}

export function getDesignAssetInfo(objectKey) {
  return requestJson(`/assets/info?object_key=${encodeURIComponent(objectKey)}`);
}

// 通过同源后端读取私有素材，避免 3D Canvas 直接读取 RustFS 预签名 URL 时触发 CORS。
export async function fetchDesignAssetBlob(objectKey) {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/assets/content?object_key=${encodeURIComponent(objectKey)}`, { headers });
  if (!response.ok) throw new Error(`素材读取失败（${response.status}）`);
  return response.blob();
}

export function deleteDesignAsset(objectKey) {
  return requestJson(`/assets?object_key=${encodeURIComponent(objectKey)}`, { method: "DELETE" });
}

export function listGeneratedAssets(cursor) {
  const query = new URLSearchParams({ limit: "24" });
  if (cursor) query.set("cursor", cursor);
  return requestJson(`/assets?${query}`);
}

export function batchDeleteDesignAssets(objectKeys) {
  return requestJson("/assets/batch-delete", {
    method: "POST", body: JSON.stringify({ object_keys: objectKeys }),
  });
}

export function getGenerationQuota() {
  return requestJson("/agent/quota");
}

export function sendGenerationMessage(message, conversationId) {
  return requestJson("/agent/chat", {
    method: "POST",
    body: JSON.stringify({ message, conversation_id: conversationId || null }),
  });
}

export function saveGeneratedImage(image) {
  return requestJson("/agent/assets/save", { method: "POST", body: JSON.stringify(image) });
}

export function clearGenerationConversation(conversationId) {
  return requestJson(`/agent/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
}

// ---------------- PSD 分片上传 ----------------

export function initPsdUpload({ filename, size, content_type, order_id, part_size }) {
  return requestJson("/psd/uploads", {
    method: "POST",
    body: JSON.stringify({
      filename,
      size,
      content_type: content_type || null,
      order_id: order_id || null,
      part_size: part_size || null,
    }),
  });
}

export function getPsdUploadStatus(sessionId) {
  return requestJson(`/psd/uploads/${encodeURIComponent(sessionId)}`);
}

export function completePsdUpload(sessionId) {
  return requestJson(`/psd/uploads/${encodeURIComponent(sessionId)}/complete`, { method: "POST" });
}

export function abortPsdUpload(sessionId) {
  return requestJson(`/psd/uploads/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

// 上传单个分片：body 是原始字节而非 JSON，不能用 requestJson，单独用 fetch 走鉴权头。
export async function uploadPsdPartRaw(sessionId, partNumber, blob) {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/octet-stream");

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/psd/uploads/${encodeURIComponent(sessionId)}/parts/${partNumber}`, {
      method: "PUT",
      headers,
      body: blob,
    });
  } catch {
    throw new Error("上传分片时网络中断，请重试。");
  }

  if (!response.ok) {
    let detail = `上传失败（${response.status}）`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") detail = payload.detail;
    } catch {
      // 忽略非 JSON 错误体
    }
    throw new Error(detail);
  }
  return response.json();
}

export function deleteDesignDraft(templateId, orderId) {
  const query = `?order_id=${encodeURIComponent(orderId)}`;
  return requestJson(`/designs/${encodeURIComponent(templateId)}${query}`, {
    method: "DELETE",
  });
}

export function deleteDesignDrafts(drafts) {
  return requestJson("/designs", {
    method: "DELETE",
    body: JSON.stringify({
      drafts: drafts.map((draft) => ({ template_id: draft.template_id, order_id: draft.order_id })),
    }),
  });
}
