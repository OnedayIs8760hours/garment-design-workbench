import React from "react";
import { ArrowDownToLine, ArrowUp, Check, Image, MessageSquare, Plus, RefreshCw, Search, Trash2, WandSparkles, X } from "lucide-react";
import { batchDeleteDesignAssets, fetchDesignAssetBlob, listGeneratedAssets } from "../api.js";
import { formatWorkspaceDate } from "../workspaceData.js";
import { useMaterialSession } from "./MaterialSession.jsx";
import "../styles/material-studio.css";

const IDEAS = ["生成一张蓝白配色的老虎徽章，简洁有力量", "生成一张红黑色速度感几何图案，不要文字", "生成一张国风山水纹样，适合球衣印花"];

export function MaterialStudio({ onUse, onDeleted }) {
  const session = useMaterialSession();
  const [prompt, setPrompt] = React.useState("");
  const [assets, setAssets] = React.useState([]);
  const [cursor, setCursor] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [quotaError, setQuotaError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [confirm, setConfirm] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  const [working, setWorking] = React.useState("");
  const [retrying, setRetrying] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const endRef = React.useRef(null);
  const requestId = React.useRef(0);
  const deletingRef = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    session.refreshQuota().catch((cause) => { if (active) setQuotaError(cause.message); });
    return () => { active = false; };
  }, [session.refreshQuota]);

  React.useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    listGeneratedAssets().then((result) => {
      if (id !== requestId.current) return;
      setAssets(result.items);
      setCursor(result.next_cursor);
      setSelected(new Set());
    }).catch((cause) => { if (id === requestId.current) setError(cause.message); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
    return () => { requestId.current += 1; };
  }, [session.revision, reload]);

  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [session.messages, session.pending]);

  const filtered = assets.filter((asset) => asset.original_name.toLowerCase().includes(search.toLowerCase().trim()));
  const allSelected = filtered.length > 0 && filtered.slice(0, 100).every((asset) => selected.has(asset.object_key));
  const toggle = (key) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key);
    else if (next.size < 100) next.add(key);
    return next;
  });
  const submit = (event) => {
    event.preventDefault();
    if (!prompt.trim() || session.pending) return;
    void session.send(prompt.trim());
    setPrompt("");
  };
  const deleteConfirmed = async () => {
    if (deletingRef.current || !confirm?.length) return;
    deletingRef.current = true;
    setDeleting(true);
    setError("");
    try {
      const result = await batchDeleteDesignAssets(confirm);
      setAssets((items) => items.filter((item) => !result.deleted.includes(item.object_key)));
      setSelected((items) => new Set([...items].filter((key) => !result.deleted.includes(key))));
      session.markDeleted(result.deleted);
      onDeleted?.(result.deleted);
      setConfirm(null);
      if (result.failed.length) setError(`${result.failed.length} 张素材删除失败，请重新选择后重试。`);
    } catch (cause) { setError(cause.message); }
    finally { deletingRef.current = false; setDeleting(false); }
  };
  const useAsset = async (asset) => {
    setWorking(asset.object_key);
    setError("");
    try { await onUse(asset); }
    catch (cause) { setError(cause.message || "添加到裁片失败。"); }
    finally { setWorking(""); }
  };
  const download = async (asset) => {
    setWorking(asset.object_key);
    setError("");
    try {
      const blob = await fetchDesignAssetBlob(asset.object_key);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = asset.original_name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause.message); }
    finally { setWorking(""); }
  };
  const loadMore = async () => {
    const id = requestId.current;
    setLoading(true);
    try {
      const result = await listGeneratedAssets(cursor);
      if (id !== requestId.current) return;
      setAssets((items) => [...new Map([...items, ...result.items].map((item) => [item.object_key, item])).values()]);
      setCursor(result.next_cursor);
    } catch (cause) { if (id === requestId.current) setError(cause.message); }
    finally { if (id === requestId.current) setLoading(false); }
  };

  return (
    <div className="material-studio">
      <header className="material-heading">
        <div><span className="material-kicker">素材创作</span><h1>把想法变成图案<span>素材生成</span></h1><p>描述你的图案，生成后自动保存到个人素材库。</p></div>
        <div className="material-quota" aria-label="今日生图额度">
          <span>今日剩余</span><strong>{session.quota ? session.quota.remaining : "—"}<small> / 5 次</small></strong><span>北京时间每天 00:00 重置</span>
        </div>
      </header>
      {quotaError && <div className="material-notice" role="status">额度暂未读取：{quotaError}<button type="button" onClick={() => session.refreshQuota().then(() => setQuotaError("")).catch((cause) => setQuotaError(cause.message))}>重试</button></div>}
      <div className="material-layout">
        <section className="material-chat" aria-label="素材生成对话">
          <div className="material-section-heading"><h2><MessageSquare size={17} />创作对话</h2><button type="button" className="material-text-button" disabled={session.pending || !session.messages.length} onClick={session.clear}><Plus size={15} />新对话</button></div>
          <div className="material-messages" role="log" aria-live="polite" aria-relevant="additions">
            {!session.messages.length && <div className="material-welcome"><span className="material-welcome-icon"><WandSparkles size={25} strokeWidth={1.5} /></span><h3>想做什么样的图案？</h3><p>可以直接生图，也可以先聊聊配色、风格和构图。</p><div className="material-ideas">{IDEAS.map((idea) => <button type="button" key={idea} onClick={() => setPrompt(idea)}>{idea}<Plus size={13} /></button>)}</div></div>}
            {session.messages.map((message) => <article className={`material-message ${message.role}${message.failed ? " failed" : ""}`} key={message.id}>
              <span className="material-message-role">{message.role === "user" ? "你" : "设计助手"}</span><p>{message.text}</p>
              {message.images?.map((image, index) => image.deleted ? <span className="material-saved" key={index}>这张素材已删除</span> : <div className="material-message-image" key={index}>
                <button type="button" className="material-image-button" onClick={() => setPreview({ url: image.data_url || image.url, objectKey: image.asset?.object_key, name: image.asset?.original_name || "生成图片" })}><MaterialImage src={image.data_url || image.url} objectKey={image.asset?.object_key} alt={image.asset?.original_name || "本次生成的图案"} /></button>
                {image.asset ? <span className="material-saved"><Check size={13} />已保存到素材库</span> : <button type="button" className="material-retry" disabled={!!retrying} onClick={async () => {
                  setRetrying(message.id); setError("");
                  try { await session.retrySave(message.id, index); } catch (cause) { setError(cause.message); }
                  finally { setRetrying(""); }
                }}>{retrying === message.id ? "正在保存…" : "重新保存到素材库"}</button>}
              </div>)}
            </article>)}
            {session.pending && <div className="material-pending" role="status"><span /><span /><span /><p>正在处理，生成图片并保存通常需要一些时间…</p></div>}
            <div ref={endRef} />
          </div>
          <form className="material-composer" onSubmit={submit}>
            <label htmlFor="materialPrompt">描述图案或发送设计问题</label>
            <textarea id="materialPrompt" value={prompt} maxLength={8000} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：生成一张蓝白色老虎徽章，不要文字…" onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(event); }
            }} />
            <div><span>{session.quota?.remaining === 0 ? "今日额度已用完，仍可继续对话" : "普通对话不消耗生图次数"}</span><button type="submit" aria-label="发送消息" disabled={session.pending || !prompt.trim()}><ArrowUp size={18} /></button></div>
            {session.sessionError && <p className="material-composer-error" role="alert">{session.sessionError}</p>}
          </form>
        </section>
        <section className="material-library" aria-labelledby="materialLibraryTitle">
          <div className="material-section-heading"><h2 id="materialLibraryTitle">我的生成素材<span>{assets.length}{cursor ? "+" : ""}</span></h2><button type="button" className="material-icon-button" aria-label="刷新素材库" disabled={loading || deleting} onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} /></button></div>
          <div className="material-toolbar"><label className="material-search"><Search size={16} /><input value={search} type="search" onChange={(event) => setSearch(event.target.value)} placeholder="搜索已加载素材" aria-label="搜索生成素材" /></label><button type="button" className="material-text-button danger" disabled={!selected.size || deleting} onClick={() => setConfirm([...selected])}><Trash2 size={15} />删除{selected.size ? ` (${selected.size})` : ""}</button></div>
          {!!assets.length && <div className="material-selection"><label><input type="checkbox" checked={allSelected} disabled={deleting} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.slice(0, 100).map((item) => item.object_key)))} />选择当前结果</label><span>已选 {selected.size} 张</span></div>}
          {error && <div className="material-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="关闭错误提示"><X size={14} /></button></div>}
          <div className="material-gallery-scroll">
            {loading && !assets.length ? <div className="material-grid" aria-label="正在加载素材">{[0, 1, 2, 3].map((key) => <div className="material-skeleton" key={key} />)}</div> : filtered.length ? <div className="material-grid">
              {filtered.map((asset) => <article className={`material-card${selected.has(asset.object_key) ? " selected" : ""}`} key={asset.object_key}>
                <div className="material-card-image"><button type="button" className="material-image-button" onClick={() => setPreview({ url: asset.url, objectKey: asset.object_key, name: asset.original_name })}><MaterialImage src={asset.url} objectKey={asset.object_key} alt={asset.original_name} /></button><label className="material-card-check"><input type="checkbox" checked={selected.has(asset.object_key)} disabled={deleting} onChange={() => toggle(asset.object_key)} aria-label={`选择 ${asset.original_name}`} /></label></div>
                <div className="material-card-body"><h3 title={asset.original_name}>{asset.original_name}</h3><time dateTime={asset.created_at || undefined}>{formatWorkspaceDate(asset.created_at)}</time><div className="material-card-actions">
                  {onUse ? <button type="button" className="material-use" disabled={!!working || deleting} onClick={() => useAsset(asset)}><Plus size={14} />{working === asset.object_key ? "正在添加…" : "用于当前裁片"}</button> : <button type="button" className="material-text-button" disabled={!!working || deleting} onClick={() => download(asset)}><ArrowDownToLine size={14} />下载</button>}
                  <button type="button" className="material-icon-button danger" aria-label={`删除 ${asset.original_name}`} disabled={deleting || !!working} onClick={() => setConfirm([asset.object_key])}><Trash2 size={15} /></button>
                </div></div>
              </article>)}
            </div> : <div className="material-empty"><Image size={32} strokeWidth={1.3} /><h3>{error ? "素材暂时无法读取" : search ? "没有匹配的素材" : "你的图案，从这里开始"}</h3><p>{error ? "检查服务连接后刷新重试。" : search ? "试试其他名称，或清空搜索条件。" : "在左侧描述想法，生成的图片会自动出现在这里。"}</p>{error && <button type="button" className="material-text-button" onClick={() => setReload((value) => value + 1)}>重新加载</button>}</div>}
            {cursor && <button type="button" className="material-load-more" disabled={loading} onClick={loadMore}>{loading ? "正在加载…" : "加载更多素材"}</button>}
          </div>
          <footer className="material-library-footer"><Check size={13} />自动保存到个人素材库 · 可在 2D 贴图中直接使用</footer>
        </section>
      </div>
      {confirm && <MaterialDialog title={`删除 ${confirm.length} 张素材？`} onClose={() => { if (!deleting) setConfirm(null); }}>
        <p>将永久删除这些图片。已使用它们的设计也会受到影响，此操作无法撤销。</p>
        {error && <p className="material-composer-error" role="alert">{error}</p>}
        <div className="material-dialog-actions"><button type="button" disabled={deleting} onClick={() => setConfirm(null)}>取消</button><button type="button" className="danger" disabled={deleting} onClick={deleteConfirmed}>{deleting ? "正在删除…" : "确认删除"}</button></div>
      </MaterialDialog>}
      {preview && <MaterialDialog title={preview.name} onClose={() => setPreview(null)}><MaterialImage className="material-large-preview" src={preview.url} objectKey={preview.objectKey} alt={preview.name} /></MaterialDialog>}
    </div>
  );
}

function MaterialImage({ src, objectKey, alt, className }) {
  const [fallback, setFallback] = React.useState("");
  const [failed, setFailed] = React.useState(false);
  const attempted = React.useRef(false);
  const active = React.useRef(true);
  const blobUrl = React.useRef("");
  React.useEffect(() => {
    active.current = true;
    return () => { active.current = false; if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); };
  }, []);
  const recover = async () => {
    if (attempted.current || !objectKey) { setFailed(true); return; }
    attempted.current = true;
    try {
      const blob = await fetchDesignAssetBlob(objectKey);
      if (!active.current) return;
      blobUrl.current = URL.createObjectURL(blob);
      setFallback(blobUrl.current);
    } catch { if (active.current) setFailed(true); }
  };
  return failed ? <span className="material-image-unavailable" role="img" aria-label={`${alt}：预览暂不可用`}><Image size={24} /><small>预览暂不可用</small></span>
    : <img src={fallback || src} alt={alt} className={className} loading="lazy" onError={recover} />;
}

export function MaterialDialog({ title, onClose, children, wide = false }) {
  const dialogRef = React.useRef(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={dialogRef} className={`material-dialog${wide ? " wide" : ""}`} aria-label={title} onCancel={(event) => { event.preventDefault(); closeRef.current(); }}><div className="material-dialog-heading"><h2>{title}</h2><button type="button" className="material-icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>{children}</dialog>;
}
