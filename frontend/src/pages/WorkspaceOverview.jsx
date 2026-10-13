import React from "react";
import { ArrowRight, FilePlus2, Layers3, RefreshCw, Shirt } from "lucide-react";
import { listDesignDrafts } from "../api.js";
import { createTemplate } from "../model.js";
import { templateDefinitions } from "../../templates/index.js";
import { formatWorkspaceDate } from "../workspaceData.js";

export function WorkspaceOverview({ user, onNavigate, onOpenDraft, onNewDesign }) {
  const [drafts, setDrafts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listDesignDrafts()
      .then((items) => {
        if (!Array.isArray(items)) throw new Error("草稿列表数据格式不正确。");
        if (!cancelled) setDrafts(items);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "草稿加载失败，请稍后重试。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const templateCount = new Set(drafts.map((draft) => draft.template_id)).size;
  const recentDrafts = drafts.slice(0, 4);

  return (
    <main className="workspace-page workspace-overview" aria-labelledby="overviewTitle">
      <section className="overview-hero">
        <div className="overview-copy">
          <p className="workspace-eyebrow">WODA DESIGN / WORKSPACE</p>
          <h1 id="overviewTitle">让创意成为作品。</h1>
          <p className="overview-intro">{user?.username ? `${user.username}，` : ""}从服装模板开始，继续推进手边的设计。</p>
          <div className="overview-actions">
            <button className="workspace-button primary" type="button" onClick={onNewDesign}>
              <FilePlus2 size={17} aria-hidden="true" />新建设计
            </button>
            <button className="workspace-button secondary" type="button" onClick={() => onNavigate("products")}>
              浏览产品模板<ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="overview-art" aria-hidden="true">
          <div className="overview-art-meta"><span>当前可用模板</span><strong>{Object.keys(templateDefinitions).length}</strong></div>
          <div className="overview-garment">
            {Object.values(templateDefinitions).slice(0, 2).map((definition) => {
              const template = createTemplate(definition);
              const preview = template.panels[template.defaultPanelId]?.templateImage;
              return preview ? <img key={template.templateId} src={preview} alt="" /> : null;
            })}
          </div>
          <div className="overview-art-foot"><span>GARMENT DESIGN</span><span>2D · 3D</span></div>
        </div>
      </section>

      <section className="overview-stats" aria-label="工作区统计">
        <div><span>已保存设计</span><strong>{loading ? "…" : error ? "—" : drafts.length}</strong><small>来自当前账户的云端草稿</small></div>
        <div><span>使用模板</span><strong>{loading ? "…" : error ? "—" : templateCount}</strong><small>至少保存过一份设计的模板</small></div>
        <div><span>保存状态</span><strong>{loading ? "读取中" : error ? "待重试" : "已连接"}</strong><small>草稿列表由后端实时提供</small></div>
      </section>

      <section className="overview-lower">
        <div className="overview-recent">
          <div className="workspace-section-heading">
            <div><p className="workspace-eyebrow">YOUR DESIGNS</p><h2>最近设计</h2></div>
            <div className="heading-actions">
              <button className="workspace-icon-action" type="button" title="刷新草稿" aria-label="刷新草稿" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}><RefreshCw size={16} aria-hidden="true" /></button>
              <button className="workspace-text-action" type="button" onClick={() => onNavigate("design")}>查看全部<ArrowRight size={15} aria-hidden="true" /></button>
            </div>
          </div>
          {error && <div className="workspace-inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => setReloadKey((key) => key + 1)}>重试</button></div>}
          {loading ? <div className="overview-loading" role="status">正在读取真实草稿…</div> : recentDrafts.length ? (
            <div className="overview-draft-list">
              {recentDrafts.map((draft) => <OverviewDraft key={`${draft.template_id}:${draft.order_id}`} draft={draft} onOpen={() => onOpenDraft(draft)} />)}
            </div>
          ) : !error ? (
            <div className="overview-empty">
              <div className="overview-empty-mark"><Layers3 size={20} aria-hidden="true" /></div>
              <div><strong>还没有保存的设计</strong><p>新建一份设计后，草稿会显示在这里。</p></div>
              <button className="workspace-button secondary" type="button" onClick={() => onNavigate("products")}>选择模板<ArrowRight size={15} aria-hidden="true" /></button>
            </div>
          ) : null}
        </div>

        <aside className="overview-shortcuts" aria-label="工作区快捷入口">
          <div className="workspace-section-heading"><div><p className="workspace-eyebrow">QUICK ACCESS</p><h2>快速访问</h2></div></div>
          <button type="button" className="overview-shortcut" onClick={() => onNavigate("products")}>
            <span className="overview-shortcut-icon"><Shirt size={18} aria-hidden="true" /></span><span><strong>产品模板</strong><small>查看可用的服装裁片模板</small></span><ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="overview-shortcut" onClick={() => onNavigate("assets")}>
            <span className="overview-shortcut-icon"><Layers3 size={18} aria-hidden="true" /></span><span><strong>设计素材</strong><small>浏览已关联到草稿的图片</small></span><ArrowRight size={16} aria-hidden="true" />
          </button>
        </aside>
      </section>
    </main>
  );
}

function OverviewDraft({ draft, onOpen }) {
  const definition = templateDefinitions[draft.template_id];
  const template = definition ? createTemplate(definition) : null;
  const preview = template?.panels[template.defaultPanelId]?.templateImage;
  return (
    <button className="overview-draft" type="button" onClick={onOpen}>
      <span className="overview-draft-preview">{preview ? <img src={preview} alt="" /> : <Layers3 size={20} aria-hidden="true" />}</span>
      <span className="overview-draft-info"><strong>{draft.order_id}</strong><small>{definition?.label || draft.template_id} · V{draft.template_version}</small></span>
      <time dateTime={draft.updated_at || undefined}>{formatWorkspaceDate(draft.updated_at)}</time>
      <ArrowRight className="overview-draft-arrow" size={16} aria-hidden="true" />
    </button>
  );
}
