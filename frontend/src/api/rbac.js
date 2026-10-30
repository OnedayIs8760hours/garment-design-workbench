import { requestJson } from "../api.js";

// 复用统一请求层的 Bearer 令牌、错误转换和 403 通知，不在页面重复实现鉴权。
// 用户与审计列表每页固定 30 条，与管理页面的翻页步长保持一致。
export const rbacApi = {
  permissions: () => requestJson("/rbac/permissions"),
  roles: () => requestJson("/rbac/roles"),
  users: (query, offset = 0) =>
    requestJson(
      `/rbac/users?${new URLSearchParams({ q: query, offset, limit: 30 })}`,
    ),
  audits: (offset = 0) => requestJson(`/rbac/audits?offset=${offset}&limit=30`),
  createUser: (payload) =>
    requestJson("/rbac/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // PUT 整体替换 role_ids 和 is_active；未勾选的角色会被撤销，不是增量追加。
  updateAccess: (id, payload) =>
    requestJson(`/rbac/users/${id}/access`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  createRole: (payload) =>
    requestJson("/rbac/roles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRole: (id, payload) =>
    requestJson(`/rbac/roles/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteRole: (id) => requestJson(`/rbac/roles/${id}`, { method: "DELETE" }),
};
