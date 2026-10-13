import React from "react";
import { ArrowRight, ClipboardList, RefreshCw, Search } from "lucide-react";
import { listDesignDrafts } from "../api.js";
import { templateDefinitions } from "../../templates/index.js";
import { formatWorkspaceDate } from "../workspaceData.js";

export function OrdersWorkspace({ onOpenDraft }) {
  const [drafts, setDrafts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listDesignDrafts()
      .then((items) => {
        if (!Array.isArray(items)) throw new Error("设计列表数据格式不正确。");
        if (!cancelled) setDrafts(items);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "设计记录读取失败，请稍后重试。");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filteredDrafts = drafts.filter((draft) => {
    const name = templateDefinitions[draft.template_id]?.label || "";
    return `${draft.order_id} ${draft.template_id} ${name}`.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <main className="workspace-page" aria-labelledby="ordersWorkspaceTitle">
      <header className="workspace-page-heading">
        <div><p className="workspace-eyebrow">ORDER REFERENCES</p><h1 id="ordersWorkspaceTitle">订单与设计记录</h1><p>当前显示设计草稿关联的单号，订单状态与客户信息尚未接入。</p></div>
        <div className="workspace-heading-stat"><strong>{loading ? "…" : error ? "—" : drafts.length}</strong><span>份设计记录</span></div>
      </header>

      <div className="orders-data-note"><ClipboardList size={17} aria-hidden="true" /><span>列表仅来自真实草稿接口。这里的单号用于定位设计，不代表生产、付款或履约状态。</span></div>
      <div className="asset-library-toolbar">
        <label className="workspace-search"><Search size={17} aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索订单号或模板" aria-label="搜索设计单号" />{search && <button type="button" onClick={() => setSearch("")} aria-label="清空搜索">清除</button>}</label>
        <button className="workspace-button secondary" type="button" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}><RefreshCw size={15} aria-hidden="true" />刷新</button>
      </div>

      {error && <div className="workspace-inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => setReloadKey((key) => key + 1)}>重试</button></div>}
      {loading ? <div className="workspace-loading" role="status">正在读取真实设计记录…</div> : filteredDrafts.length ? (
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead><tr><th scope="col">订单号</th><th scope="col">产品模板</th><th scope="col">版本</th><th scope="col">最近更新</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
            <tbody>{filteredDrafts.map((draft) => (
              <tr key={`${draft.template_id}:${draft.order_id}`}>
                <td><strong>{draft.order_id}</strong></td>
                <td><span>{templateDefinitions[draft.template_id]?.label || draft.template_id}</span><small>{draft.template_id}</small></td>
                <td>V{draft.template_version ?? "—"}</td>
                <td><time dateTime={draft.updated_at || undefined}>{formatWorkspaceDate(draft.updated_at)}</time></td>
                <td><button className="workspace-text-action" type="button" onClick={() => onOpenDraft(draft)}>打开设计<ArrowRight size={15} aria-hidden="true" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : !error ? (
        <section className="workspace-empty-state" role="status"><div className="workspace-empty-icon"><ClipboardList size={21} aria-hidden="true" /></div><h2>{search ? "没有匹配的设计记录" : "还没有设计记录"}</h2><p>{search ? "调整搜索内容后重试。" : "保存设计草稿后，关联单号会显示在这里。"}</p>{search && <button className="workspace-button secondary" type="button" onClick={() => setSearch("")}>清除搜索</button>}</section>
      ) : null}
    </main>
  );
}
