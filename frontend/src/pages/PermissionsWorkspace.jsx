import React from "react";
import { Plus, RefreshCw, ShieldCheck, Users, X } from "lucide-react";
import { rbacApi } from "../api/rbac.js";
import "../styles/permissions.css";

const TABS = [
  { id: "users", label: "用户授权", icon: Users },
  { id: "roles", label: "角色与权限", icon: ShieldCheck },
  { id: "audits", label: "授权记录", icon: ShieldCheck },
];
const ACTIONS = {
  "role.create": "创建角色",
  "role.update": "修改角色权限",
  "role.delete": "删除角色",
  "user.create": "创建用户",
  "user.access.update": "调整用户授权",
  "admin.bootstrap": "初始化管理员",
  "admin.initialize": "创建系统最高权限账号",
};

// 集中管理用户授权、角色配置和审计查看；所有写入仍须通过后端的管理权限检查。
export function PermissionsWorkspace({ onAccessChanged }) {
  const [tab, setTab] = React.useState("users");
  const [roles, setRoles] = React.useState([]);
  const [permissions, setPermissions] = React.useState([]);
  const [users, setUsers] = React.useState({ items: [], total: 0 });
  const [audits, setAudits] = React.useState([]);
  // search 是输入框草稿，query 只在提交搜索后更新，避免每次输入都请求用户列表。
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  // 保存成功或手动刷新时递增，复用下方加载流程重新获取服务端状态。
  const [revision, setRevision] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  // kind 区分用户创建、用户授权和角色编辑；表单维护副本，不直接修改列表记录。
  const [editor, setEditor] = React.useState(null);
  const editorHeading = React.useRef(null);
  // 仅锁定已有管理员角色；创建时误输入 admin 仍应允许用户修改编码。
  const immutableAdmin = Boolean(editor?.id) && editor?.code === "admin";
  const changeTab = (id) => {
    setTab(id);
    setOffset(0);
    setEditor(null);
    setMessage("");
  };
  const tabKeys = (event) => {
    // 自定义 tablist 同步键盘焦点与选中页签，支持方向键和 Home/End。
    if (
      saving ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const current = TABS.findIndex(({ id }) => id === tab);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TABS.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) %
            TABS.length;
    changeTab(TABS[next].id);
    event.currentTarget.querySelectorAll('[role="tab"]')[next].focus();
  };

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    // 角色和权限目录用于编辑器，第三个请求按当前页签加载对应的分页数据。
    Promise.all([
      rbacApi.roles(),
      rbacApi.permissions(),
      tab === "audits" ? rbacApi.audits(offset) : rbacApi.users(query, offset),
    ])
      .then(([newRoles, newPermissions, rows]) => {
        if (cancelled) return;
        setRoles(newRoles);
        setPermissions(newPermissions);
        if (tab === "audits") setAudits(rows);
        else setUsers(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      // 快速切换页签或搜索时，旧请求的晚到响应不能覆盖新页面。
      cancelled = true;
    };
  }, [tab, query, offset, revision]);

  // 仅在打开编辑器时将焦点移到标题，填写字段时不反复抢走输入焦点。
  React.useEffect(() => {
    if (editor) editorHeading.current?.focus();
  }, [Boolean(editor)]);
  const open = (value) => {
    setEditor(value);
    setError("");
    setMessage("");
  };
  const patch = (value) => setEditor((previous) => ({ ...previous, ...value }));
  const toggle = (field, value) =>
    patch({
      [field]: editor[field].includes(value)
        ? editor[field].filter((item) => item !== value)
        : [...editor[field], value],
    });
  const run = async (operation) => {
    // 统一保存状态和错误展示；失败时保留表单内容，方便修正后重新提交。
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await operation();
      setEditor(null);
      setMessage("更改已保存。");
      setRevision((value) => value + 1);
      // 管理员可能刚修改自己的角色，必须刷新应用身份，及时收回已失去权限的入口。
      await onAccessChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const save = (event) => {
    // 按编辑类型组装允许写入的字段，角色响应中的 is_system 等内部属性不回传。
    event.preventDefault();
    if (editor.kind === "access")
      return run(() =>
        rbacApi.updateAccess(editor.id, {
          role_ids: editor.role_ids,
          is_active: editor.is_active,
        }),
      );
    if (editor.kind === "user")
      return run(() =>
        rbacApi.createUser({
          username: editor.username,
          password: editor.password,
          job_title: editor.job_title || null,
          role_ids: editor.role_ids,
        }),
      );
    const payload = {
      name: editor.name,
      description: editor.description,
      permission_codes: editor.permission_codes,
    };
    return run(() =>
      editor.id
        ? rbacApi.updateRole(editor.id, payload)
        : rbacApi.createRole({ ...payload, code: editor.code }),
    );
  };

  return (
    <main
      className="workspace-page permissions-page"
      aria-labelledby="permissionsTitle"
    >
      <header className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow">ACCESS CONTROL</p>
          <h1 id="permissionsTitle">权限管理</h1>
          <p>通过角色分配权限，控制成员可以查看和执行的操作。</p>
        </div>
        <button
          className="workspace-button secondary"
          type="button"
          disabled={loading || saving}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={15} />
          刷新
        </button>
      </header>
      <div
        className="permissions-tabs"
        role="tablist"
        aria-label="权限管理"
        onKeyDown={tabKeys}
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`rbac-tab-${id}`}
            role="tab"
            type="button"
            tabIndex={tab === id ? 0 : -1}
            aria-selected={tab === id}
            aria-controls="rbac-panel"
            disabled={saving}
            onClick={() => changeTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="workspace-inline-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="workspace-notice" role="status">
          {message}
        </p>
      )}
      <div className={`permissions-layout${editor ? " has-editor" : ""}`}>
        <section
          id="rbac-panel"
          role="tabpanel"
          aria-labelledby={`rbac-tab-${tab}`}
          aria-busy={loading}
        >
          {tab === "users" && (
            <form
              className="permissions-toolbar"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(search);
                setOffset(0);
              }}
            >
              <label className="workspace-search">
                <span className="permissions-label">用户名</span>
                <input
                  type="search"
                  maxLength={64}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索用户名"
                  aria-label="搜索用户"
                />
              </label>
              <button className="workspace-button secondary" type="submit">
                搜索
              </button>
              <button
                className="workspace-button primary"
                type="button"
                disabled={saving}
                onClick={() =>
                  open({
                    kind: "user",
                    username: "",
                    password: "",
                    job_title: "",
                    role_ids: roles
                      .filter((role) => role.code === "designer")
                      .map((role) => role.id),
                  })
                }
              >
                <Plus size={16} />
                创建用户
              </button>
            </form>
          )}
          {tab === "roles" && (
            <div className="permissions-toolbar">
              <p>
                {roles.length} 个角色 · {permissions.length} 项权限
              </p>
              <button
                className="workspace-button primary"
                type="button"
                disabled={saving}
                onClick={() =>
                  open({
                    kind: "role",
                    code: "",
                    name: "",
                    description: "",
                    permission_codes: [],
                  })
                }
              >
                <Plus size={16} />
                创建角色
              </button>
            </div>
          )}
          {loading ? (
            <p className="workspace-loading" role="status">
              正在加载权限数据…
            </p>
          ) : tab === "users" ? (
            <div className="permissions-table-wrap">
              <table className="permissions-table">
                <thead>
                  <tr>
                    <th scope="col">用户</th>
                    <th scope="col">角色</th>
                    <th scope="col">状态</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.username}</strong>
                        {user.is_system_admin && (
                          <span className="permissions-tag">最高权限者</span>
                        )}
                        <small>{user.job_title || `ID ${user.id}`}</small>
                      </td>
                      <td>
                        {user.roles.length ? (
                          user.roles.map((role) => (
                            <span className="permissions-tag" key={role.id}>
                              {role.name}
                            </span>
                          ))
                        ) : (
                          <span className="permissions-muted">尚未授权</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            user.is_active
                              ? "permissions-enabled"
                              : "permissions-muted"
                          }
                        >
                          {user.is_active ? "启用" : "停用"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="workspace-text-action"
                          type="button"
                          disabled={saving || user.is_system_admin}
                          onClick={() =>
                            open({
                              kind: "access",
                              id: user.id,
                              username: user.username,
                              role_ids: user.roles.map((role) => role.id),
                              is_active: user.is_active,
                            })
                          }
                        >
                          {user.is_system_admin ? "系统专有账号" : "调整授权"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!users.items.length && (
                    <tr>
                      <td colSpan={4}>没有匹配的用户。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : tab === "roles" ? (
            <div className="permissions-role-list">
              {roles.map((role) => (
                <article className="permissions-role" key={role.id}>
                  <header>
                    <div>
                      <h2>{role.name}</h2>
                      <code>{role.code}</code>
                      {role.is_system && (
                        <span className="permissions-tag">内置</span>
                      )}
                    </div>
                    <div className="permissions-row-actions">
                      <button
                        type="button"
                        className="workspace-text-action"
                        disabled={saving}
                        onClick={() =>
                          open({
                            kind: "role",
                            ...role,
                            permission_codes: role.permissions.map(
                              (p) => p.code,
                            ),
                          })
                        }
                      >
                        {role.code === "admin" ? "查看权限" : "编辑"}
                      </button>
                      {!role.is_system && (
                        <button
                          type="button"
                          className="workspace-text-action permissions-danger"
                          disabled={saving}
                          onClick={() => {
                            if (window.confirm(`确定删除角色“${role.name}”？`))
                              void run(() => rbacApi.deleteRole(role.id));
                          }}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </header>
                  <p>{role.description || "暂无说明"}</p>
                  <div>
                    {role.permissions.length ? (
                      role.permissions.map((p) => (
                        <span className="permissions-tag" key={p.code}>
                          {p.name}
                        </span>
                      ))
                    ) : (
                      <span className="permissions-muted">尚未配置权限</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="permissions-table-wrap">
              <table className="permissions-table">
                <thead>
                  <tr>
                    <th>操作</th>
                    <th>操作者</th>
                    <th>目标 ID</th>
                    <th>时间</th>
                    <th>变更详情</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((row) => (
                    <tr key={row.id}>
                      <td>{ACTIONS[row.action] || row.action}</td>
                      <td>{row.actor_id ?? "系统"}</td>
                      <td>{row.target}</td>
                      <td>
                        {new Date(row.created_at).toLocaleString("zh-CN")}
                      </td>
                      <td>
                        <details>
                          <summary>查看</summary>
                          <pre>{JSON.stringify(row.detail, null, 2)}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                  {!audits.length && (
                    <tr>
                      <td colSpan={5}>暂无授权记录。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {tab !== "roles" && (
            <div className="permissions-pagination">
              <button
                className="workspace-button secondary"
                type="button"
                disabled={loading || offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - 30))}
              >
                上一页
              </button>
              <span>
                {tab === "users" ? `共 ${users.total} 人 · ` : ""}第{" "}
                {offset / 30 + 1} 页
              </span>
              <button
                className="workspace-button secondary"
                type="button"
                disabled={
                  loading ||
                  (tab === "users"
                    ? offset + 30 >= users.total
                    : audits.length < 30)
                }
                onClick={() => setOffset((value) => value + 30)}
              >
                下一页
              </button>
            </div>
          )}
        </section>
        {editor && (
          <form
            className="permissions-editor"
            onSubmit={save}
            aria-labelledby="permissionsEditorTitle"
          >
            <header>
              <h2 id="permissionsEditorTitle" ref={editorHeading} tabIndex={-1}>
                {editor.kind === "access"
                  ? `授权：${editor.username}`
                  : editor.kind === "user"
                    ? "创建用户"
                    : editor.id
                      ? "角色配置"
                      : "创建角色"}
              </h2>
              <button
                className="workspace-icon-action"
                type="button"
                disabled={saving}
                onClick={() => setEditor(null)}
                aria-label="关闭编辑"
              >
                <X size={18} />
              </button>
            </header>
            {editor.kind === "user" && (
              <>
                <label>
                  用户名
                  <input
                    required
                    maxLength={64}
                    autoComplete="off"
                    value={editor.username}
                    onChange={(event) =>
                      patch({ username: event.target.value })
                    }
                  />
                </label>
                <label>
                  初始密码
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={editor.password}
                    onChange={(event) =>
                      patch({ password: event.target.value })
                    }
                  />
                </label>
                <label>
                  职位（选填）
                  <input
                    maxLength={100}
                    value={editor.job_title}
                    onChange={(event) =>
                      patch({ job_title: event.target.value })
                    }
                  />
                </label>
              </>
            )}
            {editor.kind === "role" ? (
              <fieldset disabled={saving || immutableAdmin}>
                <label>
                  角色编码
                  <input
                    required
                    pattern="[a-z][a-z0-9_]{1,63}"
                    maxLength={64}
                    disabled={Boolean(editor.id)}
                    value={editor.code}
                    onChange={(event) => patch({ code: event.target.value })}
                  />
                  <small>小写字母开头，2–64 位字母、数字或下划线。</small>
                </label>
                <label>
                  角色名称
                  <input
                    required
                    maxLength={100}
                    value={editor.name}
                    onChange={(event) => patch({ name: event.target.value })}
                  />
                </label>
                <label>
                  说明
                  <textarea
                    maxLength={255}
                    value={editor.description}
                    onChange={(event) =>
                      patch({ description: event.target.value })
                    }
                  />
                </label>
                <fieldset>
                  <legend>操作权限</legend>
                  {permissions.map((p) => (
                    <label className="permissions-choice" key={p.code}>
                      <input
                        type="checkbox"
                        checked={editor.permission_codes.includes(p.code)}
                        onChange={() => toggle("permission_codes", p.code)}
                      />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.description}</small>
                        <code>{p.code}</code>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </fieldset>
            ) : (
              <fieldset disabled={saving}>
                <legend>分配角色</legend>
                {roles.map((role) => (
                  <label className="permissions-choice" key={role.id}>
                    <input
                      type="checkbox"
                      checked={editor.role_ids.includes(role.id)}
                      onChange={() => toggle("role_ids", role.id)}
                    />
                    <span>
                      <strong>{role.name}</strong>
                      <small>{role.description || role.code}</small>
                    </span>
                  </label>
                ))}
                {editor.kind === "access" && (
                  <label className="permissions-choice">
                    <input
                      type="checkbox"
                      checked={editor.is_active}
                      onChange={(event) =>
                        patch({ is_active: event.target.checked })
                      }
                    />
                    <span>启用账号</span>
                  </label>
                )}
                <p className="permissions-muted">
                  未分配角色时，账号不能访问业务接口。
                </p>
              </fieldset>
            )}
            {immutableAdmin ? (
              <p className="workspace-notice">
                内置管理员角色拥有全部权限，不可修改。
              </p>
            ) : (
              <button
                className="workspace-button primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "正在保存…" : "保存"}
              </button>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
