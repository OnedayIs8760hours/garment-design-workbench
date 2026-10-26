import React from "react";
import { ArrowRight, Image, RefreshCw, Search } from "lucide-react";
import { templateDefinitions } from "../../templates/index.js";
import { formatWorkspaceDate, loadSavedDesignAssets } from "../workspaceData.js";

export function AssetLibrary({ onOpenDraft, onNavigate }) {
  const [assets, setAssets] = React.useState([]);
  const [draftCount, setDraftCount] = React.useState(0);
  const [failedDraftReads, setFailedDraftReads] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    loadSavedDesignAssets()
      .then((result) => {
        if (cancelled) return;
        setAssets(result.assets);
        setDraftCount(result.drafts.length);
        setFailedDraftReads(result.failedDraftReads);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "素材读取失败，请稍后重试。");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filteredAssets = assets.filter(({ asset, drafts }) => {
    const linkedDesigns = drafts.map((draft) => `${draft.order_id} ${draft.template_id}`).join(" ");
    return `${asset.name || ""} ${asset.originalName || ""} ${asset.previewFile || ""} ${linkedDesigns}`.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <main className="workspace-page" aria-labelledby="assetLibraryTitle">
      <header className="workspace-page-heading">
        <div><p className="workspace-eyebrow">DESIGN ASSETS</p><h1 id="assetLibraryTitle">素材库</h1><p>汇总已保存在设计草稿中的图片素材，可继续打开对应设计进行编辑。</p></div>
        <div className="workspace-heading-stat"><strong>{loading ? "…" : error ? "—" : assets.length}</strong><span>个关联素材</span></div>
      </header>

      <div className="asset-library-toolbar">
        <label className="workspace-search">
          <Search size={17} aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索素材名称或关联设计" aria-label="搜索素材" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="清空搜索">清除</button>}
        </label>
        <button className="workspace-button secondary" type="button" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}><RefreshCw size={15} aria-hidden="true" />刷新</button>
      </div>

      {error && <div className="workspace-inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => setReloadKey((key) => key + 1)}>重试</button></div>}
      {!error && failedDraftReads > 0 && <p className="workspace-notice" role="status">有 {failedDraftReads} 份草稿未能读取，当前素材列表可能不完整。</p>}
      {loading ? <div className="workspace-loading" role="status">正在读取草稿和关联素材…</div> : filteredAssets.length ? (
        <section className="workspace-asset-grid" aria-label="设计图片素材">
          {filteredAssets.map(({ key, asset, drafts }) => {
            const primaryDraft = drafts[0];
            const templateName = templateDefinitions[primaryDraft?.template_id]?.label || primaryDraft?.template_id || "设计草稿";
            return (
              <article className="workspace-asset-card" key={key}>
                <div className="workspace-asset-preview">
                  {asset.dataUrl ? <img src={asset.dataUrl} alt={asset.name || asset.originalName || "设计图片素材"} loading="lazy" /> : <Image size={26} aria-hidden="true" />}
                </div>
                <div className="workspace-asset-body">
                  <h2 title={asset.name || asset.originalName || "未命名素材"}>{asset.name || asset.originalName || "未命名素材"}</h2>
                  <p>{templateName} · {primaryDraft?.order_id || "关联设计"}</p>
                  <div className="workspace-asset-meta"><span>{drafts.length > 1 ? `关联 ${drafts.length} 份设计` : "1 份关联设计"}</span><time dateTime={primaryDraft?.updated_at || undefined}>{formatWorkspaceDate(primaryDraft?.updated_at)}</time></div>
                  <button className="workspace-text-action" type="button" onClick={() => onOpenDraft(primaryDraft)}>打开设计<ArrowRight size={15} aria-hidden="true" /></button>
                </div>
              </article>
            );
          })}
        </section>
      ) : !error ? (
        <section className="workspace-empty-state" role="status">
          <div className="workspace-empty-icon"><Image size={21} aria-hidden="true" /></div>
          <h2>{search ? "没有匹配的素材" : "还没有关联的图片素材"}</h2>
          <p>{search ? "清除搜索条件，查看所有素材。" : draftCount ? "打开一份设计草稿并上传图片，素材会显示在这里。" : "先创建一份设计，再上传要放到裁片上的图片。"}</p>
          {search ? <button className="workspace-button secondary" type="button" onClick={() => setSearch("")}>清除搜索</button> : <button className="workspace-button primary" type="button" onClick={() => onNavigate(draftCount ? "design" : "products")}>{draftCount ? "查看设计草稿" : "选择产品模板"}<ArrowRight size={15} aria-hidden="true" /></button>}
        </section>
      ) : null}
    </main>
  );
}
