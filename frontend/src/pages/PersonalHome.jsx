import React from "react";
import { ArrowRight, FilePlus2, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { createTemplate } from "../model.js";
import { templateDefinitions } from "../../templates/index.js";
import { deleteDesignDraft, deleteDesignDrafts, listDesignDrafts } from "../api.js";
import "../styles/personal-home.css";

export function PersonalHome({ user, onOpenDraft, onNewDesign, onSignOut }) {
  const [drafts, setDrafts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [deletingDraftKey, setDeletingDraftKey] = React.useState("");
  const [selectedDraftKeys, setSelectedDraftKeys] = React.useState(() => new Set());
  const [batchDeleting, setBatchDeleting] = React.useState(false);
  const refresh = React.useCallback(() => {
    setLoading(true);
    setError("");
    return listDesignDrafts()
      .then((items) => {
        setDrafts(Array.isArray(items) ? items : []);
        setSelectedDraftKeys(new Set());
      })
      .catch(() => setError("草稿箱暂时无法加载，请刷新重试。"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);
  const templateCount = new Set(drafts.map((draft) => draft.template_id)).size;
  const handleDelete = async (draft) => {
    const draftKey = draftIdentity(draft);
    if (!window.confirm(`确定删除草稿“${draft.order_id}”吗？\n删除后无法恢复。`)) return;

    setDeletingDraftKey(draftKey);
    setError("");
    try {
      await deleteDesignDraft(draft.template_id, draft.order_id);
      setDrafts((items) => items.filter((item) => draftIdentity(item) !== draftKey));
      setSelectedDraftKeys((keys) => {
        const nextKeys = new Set(keys);
        nextKeys.delete(draftKey);
        return nextKeys;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "草稿删除失败，请稍后重试。");
    } finally {
      setDeletingDraftKey("");
    }
  };
  const allSelected = drafts.length > 0 && selectedDraftKeys.size === drafts.length;
  const toggleDraft = (draft) => {
    const draftKey = draftIdentity(draft);
    setSelectedDraftKeys((keys) => {
      const nextKeys = new Set(keys);
      if (nextKeys.has(draftKey)) nextKeys.delete(draftKey);
      else nextKeys.add(draftKey);
      return nextKeys;
    });
  };
  const toggleAllDrafts = () => {
    setSelectedDraftKeys(allSelected ? new Set() : new Set(drafts.map(draftIdentity)));
  };
  const handleBatchDelete = async () => {
    const selectedDrafts = drafts.filter((draft) => selectedDraftKeys.has(draftIdentity(draft)));
    if (!selectedDrafts.length) return;
    if (!window.confirm(`确定删除选中的 ${selectedDrafts.length} 份草稿吗？\n删除后无法恢复。`)) return;

    setBatchDeleting(true);
    setError("");
    try {
      await deleteDesignDrafts(selectedDrafts);
      setDrafts((items) => items.filter((draft) => !selectedDraftKeys.has(draftIdentity(draft))));
      setSelectedDraftKeys(new Set());
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "草稿批量删除失败，请稍后重试。");
    } finally {
      setBatchDeleting(false);
    }
  };

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
          <>
            <div className="draft-batch-toolbar">
              <label className="draft-select-all">
                <input type="checkbox" checked={allSelected} onChange={toggleAllDrafts} />
                <span>{allSelected ? "取消全选" : "选择全部"}</span>
              </label>
              <span className="draft-selection-count">已选择 {selectedDraftKeys.size} 份</span>
              <button type="button" className="draft-batch-delete" onClick={handleBatchDelete} disabled={!selectedDraftKeys.size || batchDeleting}>
                <Trash2 size={15} aria-hidden="true" />
                {batchDeleting ? "删除中…" : `删除所选（${selectedDraftKeys.size}）`}
              </button>
            </div>
            <div className="draft-grid">
              {drafts.map((draft, index) => (
                <DraftCard
                  key={`${draft.template_id}:${draft.order_id}`}
                  draft={draft}
                  index={index}
                  selected={selectedDraftKeys.has(draftIdentity(draft))}
                  deleting={batchDeleting || deletingDraftKey === draftIdentity(draft)}
                  onToggle={() => toggleDraft(draft)}
                  onOpen={() => onOpenDraft(draft)}
                  onDelete={() => handleDelete(draft)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function DraftCard({ draft, index, selected, deleting, onToggle, onOpen, onDelete }) {
  const definition = templateDefinitions[draft.template_id];
  const preview = definition ? createTemplate(definition).panels[definition.defaultPanelId]?.templateImage : null;
  return (
    <article className={`draft-card draft-card-${index % 3}${selected ? " selected" : ""}`}>
      <label className="draft-card-selector">
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span className="draft-card-checkmark" aria-hidden="true" />
        <span className="sr-only">选择草稿 {draft.order_id}</span>
      </label>
      <button type="button" className="draft-preview" onClick={onOpen} aria-label={`打开草稿 ${draft.order_id}`}>
        {preview ? <img src={preview} alt="" /> : <span className="draft-preview-placeholder">SDS</span>}
        <span className="draft-open-indicator"><ArrowRight size={17} aria-hidden="true" /></span>
      </button>
      <div className="draft-card-body">
        <div className="draft-card-meta"><span>{definition?.label || draft.template_id}</span><span>V{draft.template_version}</span></div>
        <h3>{draft.order_id}</h3>
        <p>最近保存于 {formatDate(draft.updated_at)}</p>
        <div className="draft-card-actions">
          <button type="button" className="draft-open-link" onClick={onOpen}>继续编辑 <ArrowRight size={14} aria-hidden="true" /></button>
          <button
            type="button"
            className="draft-delete-button"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`删除草稿 ${draft.order_id}`}
          >
            <Trash2 size={14} aria-hidden="true" />
            {deleting ? "删除中…" : "删除"}
          </button>
        </div>
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

function draftIdentity(draft) {
  return JSON.stringify([draft.template_id, draft.order_id]);
}
