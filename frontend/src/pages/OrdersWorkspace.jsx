import React from "react";
import { ClipboardList } from "lucide-react";
import { listDesignDrafts } from "../api.js";
import {
  countDraftsUpdatedToday,
  countDraftsUpdatedWithinDays,
  filterOrderDrafts,
  getDraftTemplateCounts,
  orderTemplateChoiceById,
  orderTemplateChoices,
} from "../ordersWorkspaceModel.js";
import { OrderDraftTable } from "../components/orders/OrderDraftTable.jsx";
import { OrdersWorkspaceFilters } from "../components/orders/OrdersWorkspaceFilters.jsx";
import { OrdersWorkspaceSummary } from "../components/orders/OrdersWorkspaceSummary.jsx";

export function OrdersWorkspace({ onOpenDraft }) {
  const [drafts, setDrafts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selectedTemplate, setSelectedTemplate] = React.useState("");
  const [dateView, setDateView] = React.useState("all");
  const [customDate, setCustomDate] = React.useState("");
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

  const filteredDrafts = React.useMemo(() => filterOrderDrafts(drafts, {
    search,
    templateId: selectedTemplate,
    dateView,
    customDate,
  }), [drafts, search, selectedTemplate, dateView, customDate]);
  const templateCounts = React.useMemo(() => getDraftTemplateCounts(drafts), [drafts]);
  const todayCount = React.useMemo(() => countDraftsUpdatedToday(drafts), [drafts]);
  const recentCount = React.useMemo(() => countDraftsUpdatedWithinDays(drafts, 7), [drafts]);
  const usedTemplateCount = templateCounts.filter((item) => item.count > 0).length;
  const hasActiveFilters = Boolean(search.trim() || selectedTemplate || dateView !== "all" || customDate);

  const selectDateView = (view) => {
    setDateView(view);
    setCustomDate("");
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedTemplate("");
    setDateView("all");
    setCustomDate("");
  };

  return (
    <main className="workspace-page orders-center" aria-labelledby="ordersWorkspaceTitle">
      <header className="workspace-page-heading orders-center-heading">
        <div>
          <p className="workspace-eyebrow">ORDER CENTER</p>
          <h1 id="ordersWorkspaceTitle">订单中心</h1>
          <p>按订单号和产品模板查找已保存的设计，继续编辑或核对最近更新。</p>
        </div>
        <div className="workspace-heading-stat">
          <strong>{loading ? "…" : error ? "—" : drafts.length}</strong>
          <span>份设计记录</span>
        </div>
      </header>

      <div className="orders-data-note" role="note">
        <ClipboardList size={17} aria-hidden="true" />
        <span>订单号用于定位设计草稿。ERP 美工任务状态、生产批次、工艺和生产图尚未接入此工作台。</span>
      </div>

      <OrdersWorkspaceFilters
        search={search}
        onSearchChange={setSearch}
        selectedTemplate={selectedTemplate}
        onTemplateChange={setSelectedTemplate}
        dateView={dateView}
        customDate={customDate}
        onDateViewChange={selectDateView}
        onCustomDateChange={(value) => { setCustomDate(value); setDateView("all"); }}
        templateChoices={orderTemplateChoices}
        templateCounts={templateCounts}
        totalCount={drafts.length}
        todayCount={todayCount}
        recentCount={recentCount}
        loading={loading}
        onRefresh={() => setReloadKey((key) => key + 1)}
      />

      <OrdersWorkspaceSummary
        total={drafts.length}
        updatedToday={todayCount}
        usedTemplates={usedTemplateCount}
        loading={loading}
        error={error}
      />

      {error && (
        <div className="workspace-inline-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)}>重试</button>
        </div>
      )}

      {loading ? (
        <div className="workspace-loading" role="status">正在读取已保存的设计记录…</div>
      ) : filteredDrafts.length ? (
        <OrderDraftTable
          drafts={filteredDrafts}
          templateChoiceById={orderTemplateChoiceById}
          onOpenDraft={onOpenDraft}
        />
      ) : !error ? (
        <section className="workspace-empty-state orders-center-empty" role="status">
          <div className="workspace-empty-icon"><ClipboardList size={21} aria-hidden="true" /></div>
          <h2>{hasActiveFilters ? "没有符合筛选条件的记录" : "还没有设计记录"}</h2>
          <p>{hasActiveFilters ? "调整订单号、模板或更新时间后再试。" : "保存设计草稿后，关联订单会显示在这里。"}</p>
          {hasActiveFilters && <button className="workspace-button secondary" type="button" onClick={clearFilters}>清除筛选</button>}
        </section>
      ) : null}
    </main>
  );
}
