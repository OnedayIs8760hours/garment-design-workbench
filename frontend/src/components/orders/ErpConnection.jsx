import React from "react";
import { connectErp } from "../../api/erpArt.js";

export function ErpConnection({ onConnected, initialError = "" }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(initialError);
  React.useEffect(() => setError(initialError), [initialError]);
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try { onConnected(await connectErp(String(form.get("username")).trim(), String(form.get("password")))); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <form className="art-erp-connection" onSubmit={submit} aria-label="连接 ERP 美工中心">
    <h2>连接 ERP 美工中心</h2><p>使用 ERP 账号读取分派给你的任务。登录凭证仅保留在当前浏览器会话中。</p>
    <label>ERP 账号<input name="username" autoComplete="username" required disabled={busy} /></label>
    <label>ERP 密码<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label>
    {error && <p className="art-api-error" role="alert">{error}</p>}
    <button className="art-button art-primary-button" type="submit" disabled={busy}>{busy ? "正在连接…" : "连接 ERP"}</button>
  </form>;
}
