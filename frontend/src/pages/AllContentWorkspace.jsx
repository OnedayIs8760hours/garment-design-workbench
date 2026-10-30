import React from "react";
import { Download, Eye, Image, RefreshCw } from "lucide-react";
import { oversightApi } from "../api/oversight.js";
import { MaterialDialog } from "../components/MaterialStudio.jsx";
import { ReadOnlyDraft } from "./ReadOnlyDraft.jsx";
import { templateDefinitions } from "../../templates/index.js";
import { formatWorkspaceDate } from "../workspaceData.js";
import "../styles/permissions.css";

// 全员内容使用独立只读接口，不把别人的草稿装入带自动保存的个人编辑器。
export function AllContentWorkspace() {
  const [tab, setTab] = React.useState("designs");
  const [ownerInput, setOwnerInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState({ ownerId: "", query: "" });
  const [offset, setOffset] = React.useState(0);
  const [revision, setRevision] = React.useState(0);
  const [designs, setDesigns] = React.useState({ items: [], total: 0 });
  const [images, setImages] = React.useState([]);
  const [cursor, setCursor] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selected, setSelected] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [downloading, setDownloading] = React.useState("");
  const requestId = React.useRef(0);

  React.useEffect(() => {
    const ticket = ++requestId.current;
    setLoading(true); setError("");
    const request = tab === "designs" ? oversightApi.designs({ ...filters, offset }) : oversightApi.images(filters);
    request.then((result) => {
      if (requestId.current !== ticket) return;
      if (tab === "designs") setDesigns(result);
      else { setImages(result.items); setCursor(result.next_cursor); }
    }).catch((cause) => { if (requestId.current === ticket) setError(cause.message); })
      .finally(() => { if (requestId.current === ticket) setLoading(false); });
    return () => { requestId.current += 1; };
  }, [tab, filters, offset, revision]);

  const moreImages = async () => {
    if (loading || !cursor) return;
    const ticket = requestId.current;
    setLoading(true); setError("");
    try {
      const result = await oversightApi.images({ ...filters, cursor });
      if (requestId.current !== ticket) return;
      setImages((previous) => [...new Map([...previous, ...result.items].map((item) => [item.object_key, item])).values()]);
      setCursor(result.next_cursor);
    } catch (cause) { if (requestId.current === ticket) setError(cause.message); }
    finally { if (requestId.current === ticket) setLoading(false); }
  };
  const download = async (image) => {
    if (downloading) return;
    setDownloading(image.object_key); setError("");
    try {
      const blob = await oversightApi.imageBlob(image.object_key);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = image.original_name; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause.message); }
    finally { setDownloading(""); }
  };

  if (selected) return <ReadOnlyDraft draft={{ ...selected, scope: "all" }} onBack={() => setSelected(null)} />;
  return <main className="workspace-page all-content-page" aria-labelledby="allContentTitle">
    <header className="workspace-page-heading"><div><p className="workspace-eyebrow">ALL MEMBERS / CONTENT</p><h1 id="allContentTitle">全员作品</h1><p>查看所有成员制作的设计和已保存的生成图片，包含已停用账号的内容。</p></div><button className="workspace-button secondary" type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} />刷新</button></header>
    <nav className="all-content-tabs" aria-label="全员作品分类">{[{ id: "designs", name: "全部设计" }, { id: "images", name: "全部生成图片" }].map(({ id, name }) => <button key={id} className={`workspace-button ${tab === id ? "primary" : "secondary"}`} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setOffset(0); }}>{name}</button>)}</nav>
    <form className="all-content-filter" onSubmit={(event) => { event.preventDefault(); setOffset(0); setFilters({ ownerId: ownerInput.trim(), query: search.trim() }); }}>
      <label>用户 ID<input value={ownerInput} inputMode="numeric" pattern="[1-9][0-9]{0,18}" maxLength={19} placeholder="留空查看所有人" onChange={(event) => setOwnerInput(event.target.value)} /></label>
      {tab === "designs" && <label>单号或制作人<input type="search" maxLength={128} value={search} placeholder="搜索全部设计" onChange={(event) => setSearch(event.target.value)} /></label>}
      <button type="submit" className="workspace-button secondary" disabled={loading}>筛选</button>
    </form>
    {error && <p className="workspace-inline-error" role="alert">{error}</p>}
    {tab === "designs" ? loading ? <p className="workspace-loading" role="status">正在读取全员设计…</p> : <>
      <p className="workspace-notice">共 {designs.total} 份设计 · 按最近保存时间排列</p>
      <div className="permissions-table-wrap"><table className="permissions-table"><thead><tr><th>设计单号</th><th>制作人</th><th>模板</th><th>保存时间</th><th>操作</th></tr></thead><tbody>{designs.items.map((draft) => <tr key={`${draft.owner_user_id}:${draft.template_id}:${draft.order_id}`}><td>{draft.order_id}</td><td>{draft.owner_username}<small>ID {draft.owner_user_id}</small></td><td>{templateDefinitions[draft.template_id]?.label || draft.template_id}</td><td>{formatWorkspaceDate(draft.updated_at)}</td><td><button className="workspace-text-action" type="button" onClick={() => setSelected(draft)}><Eye size={15} />查看设计</button></td></tr>)}{!designs.items.length && <tr><td colSpan={5}>暂无匹配的设计。</td></tr>}</tbody></table></div>
      <div className="permissions-pagination"><button className="workspace-button secondary" type="button" disabled={!offset} onClick={() => setOffset((value) => Math.max(0, value - 30))}>上一页</button><span>第 {offset / 30 + 1} 页</span><button className="workspace-button secondary" type="button" disabled={offset + 30 >= designs.total} onClick={() => setOffset((value) => value + 30)}>下一页</button></div>
    </> : <>
      <p className="workspace-notice">已加载 {images.length} 张图片 · 按用户目录分页浏览</p>
      {loading && !images.length ? <p className="workspace-loading" role="status">正在读取全员生成图片…</p> : images.length ? <section className="all-content-images" aria-label="全员生成图片">{images.map((image) => <article key={image.object_key} className="all-content-image"><button type="button" className="all-content-image-preview" onClick={() => setPreview(image)} aria-label={`查看 ${image.original_name}`}><img src={image.url} alt={image.original_name} loading="lazy" /></button><div><h2>{image.original_name}</h2><p>生成者：{image.owner_username} · ID {image.owner_user_id}</p><time dateTime={image.created_at || undefined}>{formatWorkspaceDate(image.created_at)}</time><button className="workspace-text-action" type="button" disabled={Boolean(downloading)} onClick={() => download(image)}><Download size={15} />{downloading === image.object_key ? "正在下载…" : "下载图片"}</button></div></article>)}</section> : <section className="workspace-empty-state"><Image size={26} /><h2>{cursor ? "本批尚未发现生成图片" : "暂无生成图片"}</h2><p>{cursor ? "可以继续加载后续用户目录。" : "成员生成并保存的图片会显示在这里。"}</p></section>}
      {cursor && <button className="workspace-button secondary" type="button" disabled={loading} onClick={moreImages}>{loading ? "正在加载…" : "加载更多图片"}</button>}
    </>}
    {preview && <MaterialDialog title={`${preview.owner_username} · ${preview.original_name}`} onClose={() => setPreview(null)}><OversightPreview image={preview} /></MaterialDialog>}
  </main>;
}

function OversightPreview({ image }) {
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let cancelled = false, objectUrl = "";
    oversightApi.imageBlob(image.object_key).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch((cause) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.object_key]);
  return error ? <p role="alert">{error}</p> : url ? <img className="material-large-preview" src={url} alt={image.original_name} /> : <p role="status">正在读取图片…</p>;
}
