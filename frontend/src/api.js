const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const ACCESS_TOKEN_KEY = "sds_design_access_token";
const SESSION_TOKEN_KEY = "sds_design_session_token";

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

function storeAccessToken(token, remember) {
  clearAccessToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(remember ? ACCESS_TOKEN_KEY : SESSION_TOKEN_KEY, token);
}

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const token = getAccessToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("无法连接认证服务，请确认后端已启动。");
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response.status, payload));
  }

  return payload;
}

function getApiErrorMessage(status, payload) {
  if (status === 401) return "用户名或密码错误，或登录会话已过期。";
  if (status === 403) return "当前账号已停用。";
  if (status === 409) return "用户名已被占用，请换一个试试。";
  if (status === 503) return "认证服务暂时不可用，请稍后再试。";

  if (Array.isArray(payload?.detail)) {
    return payload.detail.map((item) => item.msg).filter(Boolean).join("；") || "请求参数不正确。";
  }
  if (typeof payload?.detail === "string") return payload.detail;
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
