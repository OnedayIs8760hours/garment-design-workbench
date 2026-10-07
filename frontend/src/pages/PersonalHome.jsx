import React from "react";
import { ArrowRight, FilePlus2, LogOut, RefreshCw } from "lucide-react";
import { createTemplate } from "../model.js";
import { templateDefinitions } from "../../templates/index.js";
import { listDesignDrafts } from "../api.js";
import "../styles/personal-home.css";

export function PersonalHome({ user, onOpenDraft, onNewDesign, onSignOut }) {
  const [drafts, setDrafts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(() => {
    setLoading(true);
    setError("");
    return listDesignDrafts()
      .then((items) => setDrafts(Array.isArray(items) ? items : []))
      .catch(() => setError("草稿箱暂时无法加载，请刷新重试。"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);
  const templateCount = new Set(drafts.map((draft) => draft.template_id)).size;

  return (
    <main className="personal-home">
      <header className="personal-nav">
        <div className="personal-brand">
          <span className="personal-brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>SDS Design</span>
        </div>
        <div className="personal-user">
          <span className="personal-avatar" aria-hidden="true">{(user?.username || "D").slice(0, 1).toUpperCase()}</span>
          <span>{user?.username || "设计师"}</span>
          <button type="button" className="personal-icon-button" onClick={onSignOut} title="退出登录" aria-label="退出登录">
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="personal-hero">
        <div>
          <p className="personal-eyebrow">Design library</p>
          <h1>你的设计草稿</h1>
          <p className="personal-intro">从最近的设计继续，或创建一个新的服装工作台。</p>
        </div>
        <button type="button" className="personal-new-button" onClick={onNewDesign}>
          <FilePlus2 size={18} aria-hidden="true" />
          新建设计
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </section>

      <section className="personal-stats" aria-label="设计统计">
        <div><strong>{drafts.length}</strong><span>份草稿</span></div>
        <div><strong>{templateCount}</strong><span>个模板</span></div>
        <div><strong>{loading ? "…" : "云端"}</strong><span>保存状态</span></div>
      </section>

      <section className="personal-library" aria-label="个人草稿箱">
        <div className="personal-section-heading">
          <div><p className="personal-eyebrow">Your workspace</p><h2>最近编辑</h2></div>
          <button type="button" className="personal-refresh" onClick={refresh} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />
            刷新
          </button>
        </div>

        {error && <p className="personal-error" role="alert">{error}</p>}
        {loading && <DraftSkeletons />}
        {!loading && !drafts.length && <EmptyDraftState onNewDesign={onNewDesign} />}
        {!loading && drafts.length > 0 && (
          <div className="draft-grid">
            {drafts.map((draft, index) => (
              <DraftCard key={`${draft.template_id}:${draft.order_id}`} draft={draft} index={index} onOpen={() => onOpenDraft(draft)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function DraftCard({ draft, index, onOpen }) {
  const definition = templateDefinitions[draft.template_id];
  const preview = definition ? createTemplate(definition).panels[definition.defaultPanelId]?.templateImage : null;
  return (
    <article className={`draft-card draft-card-${index % 3}`}>
      <button type="button" className="draft-preview" onClick={onOpen} aria-label={`打开草稿 ${draft.order_id}`}>
        {preview ? <img src={preview} alt="" /> : <span className="draft-preview-placeholder">SDS</span>}
        <span className="draft-open-indicator"><ArrowRight size={17} aria-hidden="true" /></span>
      </button>
      <div className="draft-card-body">
        <div className="draft-card-meta"><span>{definition?.label || draft.template_id}</span><span>V{draft.template_version}</span></div>
        <h3>{draft.order_id}</h3>
        <p>最近保存于 {formatDate(draft.updated_at)}</p>
        <button type="button" className="draft-open-link" onClick={onOpen}>继续编辑 <ArrowRight size={14} aria-hidden="true" /></button>
      </div>
    </article>
  );
}

function EmptyDraftState({ onNewDesign }) {
  return (
    <div className="draft-empty">
      <div className="draft-empty-mark" aria-hidden="true">＋</div>
      <h3>还没有保存的设计</h3>
      <p>创建第一份草稿，开始你的下一套球衣设计。</p>
      <button type="button" className="personal-new-button" onClick={onNewDesign}><FilePlus2 size={17} aria-hidden="true" />新建设计</button>
    </div>
  );
}

function DraftSkeletons() {
  return <div className="draft-grid draft-skeleton-grid">{[0, 1, 2].map((item) => <div className="draft-skeleton" key={item} />)}</div>;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
