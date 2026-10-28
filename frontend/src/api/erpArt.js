const SESSION_KEY = "sds_design_erp_token";
export const ERP_BASE = (import.meta.env?.VITE_ERP_BASE_URL || "/erp").replace(/\/$/, "");
export const ERP_FRONTEND = (import.meta.env?.VITE_ERP_FRONTEND_URL || "http://127.0.0.1:5174").replace(/\/$/, "");
export const getErpToken = () => sessionStorage.getItem(SESSION_KEY);
export const clearErpSession = () => sessionStorage.removeItem(SESSION_KEY);

// ERP 的雪花 ID 可能超出 JS 安全整数范围；解析前保留完整数字文本。
export function parseErpJson(text) {
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) =>
    /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token));
}

export function createErpArtClient({ fetcher = (...args) => fetch(...args), base = ERP_BASE, getToken = getErpToken, onUnauthorized = () => {
  clearErpSession();
  window.dispatchEvent(new Event("erp-session-expired"));
} } = {}) {
  async function request(path, { method = "GET", body, signal, token, anonymous = false } = {}) {
    const headers = new Headers();
    const auth = anonymous ? null : token ?? getToken();
    if (auth) headers.set("Authorization", `Bearer ${auth}`);
    if (body !== undefined && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
    let response;
    try { response = await fetcher(`${base}${path}`, { method, headers, signal, body: body === undefined || body instanceof FormData ? body : JSON.stringify(body), credentials: "omit" }); }
    catch (error) { if (error.name === "AbortError") throw error; throw new Error("无法连接 ERP，请检查 ERP 服务及代理配置"); }
    const payload = await response.text().then(parseErpJson).catch(() => null);
    if (response.status === 401 && auth) onUnauthorized();
    if (!response.ok || payload?.success === false) {
      const detail = payload?.detail;
      const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((item) => item.msg).join("；") : payload?.message;
      const error = new Error(message || ({401: "ERP 登录已过期，请重新连接", 403: "ERP 账号没有此操作权限", 502: "ERP 服务暂时不可用"})[response.status] || `ERP 请求失败（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    if (payload === null) throw new Error("ERP 返回了无效响应，请检查代理地址");
    return payload;
  }
  const python = "/api/v1/orders";
  const java = "/java-api/api/v1";
  const unwrap = (payload) => payload.data ?? payload;
  async function putFile(url, file, type, signal) {
    if (!/^https?:\/\//i.test(url || "")) throw new Error("ERP 未返回有效的上传地址");
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetcher(url, { method: "PUT", body: file, headers: { "Content-Type": type || "application/octet-stream" }, credentials: "omit", signal });
        if (!response.ok) {
          const error = new Error(`文件存储上传失败（${response.status}）`);
          error.status = response.status;
          throw error;
        }
        return response;
      } catch (error) {
        if (error.name === "AbortError" || (error.status && error.status < 500 && error.status !== 429)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
  async function parallel(items, run, concurrency = 3) {
    let cursor = 0;
    const results = await Promise.allSettled(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
      while (cursor < items.length) { const index = cursor++; await run(items[index], index); }
    }));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  }
  return {
    request,
    login: (username, password) => request("/api/v1/system/login", { method: "POST", body: { username, password }, anonymous: true }),
    me: (options) => request("/api/v1/system/me", options),
    tasks: (query, signal) => request(`${python}/art/my-tasks?${query}`, { signal }),
    counts: async (signal) => unwrap(await request(`${java}/orders/art/my-tasks/counts`, { signal })),
    sidebarCounts: (signal) => request(`${python}/sidebar-task-counts`, { signal }),
    categories: async (signal) => unwrap(await request(`${java}/order-route-categories?include_inactive=false`, { signal })),
    autoMatch: (date) => request(`${python}/auto-batch/unassigned-machine${date ? `?date=${encodeURIComponent(date)}` : ""}`, { method: "POST" }),
    clearImages: (ids) => request(`${python}/art/batch-clear-images`, { method: "POST", body: { order_ids: ids } }),
    uploadImage: (id, file, panel) => {
      const body = new FormData(); body.append("file", file); if (panel) body.append("panel_position", panel);
      return request(`${python}/art/${encodeURIComponent(id)}/upload-image`, { method: "POST", body });
    },
    async uploadPsd(id, file, onProgress = () => {}) {
      if (!/\.psd$/i.test(file.name)) throw new Error("请选择 PSD 文件");
      const session = await request(`${python}/art/${encodeURIComponent(id)}/upload-psd/multipart/init`, { method: "POST", body: {
        filename: file.name, file_size: file.size, content_type: file.type || "application/octet-stream", last_modified: file.lastModified,
      } });
      const prefix = `${python}/art/upload-psd/multipart`;
      let completeSent = false;
      try {
        if (!session.session_id || !session.part_count || !session.part_size_bytes) throw new Error("ERP 分片会话无效");
        const parts = []; let uploaded = 0;
        await parallel(Array.from({ length: session.part_count }, (_, index) => index + 1), async (partNumber) => {
          const part = file.slice((partNumber - 1) * session.part_size_bytes, partNumber * session.part_size_bytes);
          const signed = await request(`${prefix}/part-url`, { method: "POST", body: { session_id: session.session_id, part_number: partNumber } });
          const response = await putFile(signed.url, part, file.type);
          const etag = response.headers.get("ETag");
          if (!etag) throw new Error("存储服务未返回 ETag，请检查 CORS 的 ETag 暴露配置");
          parts.push({ part_number: partNumber, etag }); uploaded += part.size;
          onProgress(Math.min(95, Math.round(uploaded / file.size * 95)));
        });
        completeSent = true;
        const result = await request(`${prefix}/complete`, { method: "POST", body: { session_id: session.session_id, parts: parts.sort((a, b) => a.part_number - b.part_number) } });
        onProgress(100);
        return result;
      } catch (error) {
        if (!completeSent && session.session_id) await request(`${prefix}/abort`, { method: "POST", body: { session_id: session.session_id } }).catch(() => {});
        if (completeSent) error.message += "；提交结果待确认，请先刷新订单核对，避免重复上传";
        throw error;
      }
    },
    async patchImages(files, split, onResult = () => {}) {
      const prefix = `${java}/orders/${split ? "patch-split-images" : "patch-images"}`;
      let batchSize = 6;
      for (let offset = 0; offset < files.length;) {
        const batch = files.slice(offset, offset + batchSize); offset += batch.length;
        const descriptors = batch.map((file) => ({ file_name: file.name, size: file.size, content_type: file.type || "application/octet-stream" }));
        let signed;
        try { signed = unwrap(await request(`${prefix}/presign`, { method: "POST", body: { files: descriptors } })); }
        catch (error) {
          batch.forEach((file) => onResult(file, false, error.message));
          if (error.status === 401 || error.status === 403) throw error;
          continue;
        }
        if (signed.max_presign_upload_urls > 0) batchSize = Math.min(6, signed.max_presign_upload_urls);
        const completed = [];
        await parallel(batch, async (file, index) => {
          const entry = signed.files?.find((item) => item.file_name === file.name);
          try {
            if (!entry?.success || !entry.upload_url || !entry.object_key) throw new Error(entry?.message || "ERP 未提供此文件的上传地址");
            await putFile(entry.upload_url, file, entry.content_type || file.type);
            completed.push({ ...descriptors[index], object_key: entry.object_key });
          } catch (error) { onResult(file, false, error.message); }
        });
        if (!completed.length) continue;
        let result;
        try { result = unwrap(await request(`${prefix}/complete`, { method: "POST", body: { files: completed } })); }
        catch (error) {
          completed.forEach((entry) => onResult(batch.find((file) => file.name === entry.file_name), null, `${error.message}；请核对 ERP 后再操作`));
          throw error;
        }
        completed.forEach((entry) => {
          const row = result.files?.find((item) => (item.file_name ?? item.fileName) === entry.file_name);
          const success = row ? row.success === true : Number(result.count) === completed.length ? true : null;
          onResult(batch.find((file) => file.name === entry.file_name), success, row?.message || (success ? "上传成功" : "ERP 未确认成功，请核对"));
        });
      }
    },
  };
}

export async function connectErp(username, password) {
  const client = createErpArtClient();
  const login = await client.login(username, password);
  if (!login.access_token) throw new Error("ERP 未返回登录凭证");
  const user = await client.me({ token: login.access_token });
  sessionStorage.setItem(SESSION_KEY, login.access_token);
  return user;
}

export const erpArt = createErpArtClient();
