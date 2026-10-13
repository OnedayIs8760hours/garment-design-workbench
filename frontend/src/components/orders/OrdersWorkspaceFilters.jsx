import React from "react";
import {
  CalendarDays,
  Clock3,
  ClipboardList,
  Layers3,
  RefreshCw,
  Search,
  Shirt,
} from "lucide-react";

const dateViews = [
  { id: "all", label: "全部记录" },
  { id: "today", label: "今日更新" },
  { id: "recent", label: "近 7 天" },
];

export function OrdersWorkspaceFilters({
  search,
  onSearchChange,
  selectedTemplate,
  onTemplateChange,
  dateView,
  customDate,
  onDateViewChange,
  onCustomDateChange,
  templateChoices,
  templateCounts,
  totalCount,
  todayCount,
  recentCount,
  loading,
  onRefresh,
}) {
  const countByTemplateId = Object.fromEntries(templateCounts.map(({ templateId, count }) => [templateId, count]));

  return (
    <>
      <section className="orders-center-toolbar" aria-label="订单记录筛选">
        <label className="workspace-search orders-center-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索订单号或模板"
            aria-label="搜索订单号或模板"
          />
          {search && <button type="button" onClick={() => onSearchChange("")} aria-label="清空搜索">清除</button>}
        </label>

        <label className="orders-select-control">
          <span className="sr-only">按产品模板筛选</span>
          <Layers3 size={15} aria-hidden="true" />
          <select value={selectedTemplate} onChange={(event) => onTemplateChange(event.target.value)}>
            <option value="">全部模板</option>
            {templateChoices.map((template) => (
              <option key={template.templateId} value={template.templateId}>{template.label}</option>
            ))}
          </select>
        </label>

        <label className="orders-date-control">
          <CalendarDays size={15} aria-hidden="true" />
          <span className="sr-only">按更新时间筛选</span>
          <input
            type="date"
            value={customDate}
            aria-label="按指定更新时间筛选"
            onChange={(event) => onCustomDateChange(event.target.value)}
          />
          {customDate && <button type="button" onClick={() => onCustomDateChange("")} aria-label="清除日期筛选">清除</button>}
        </label>

        <button
          className="workspace-button secondary orders-refresh-button"
          type="button"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw size={15} aria-hidden="true" />刷新
        </button>
      </section>

      <div className="orders-view-tabs" role="group" aria-label="按更新时间筛选">
        {dateViews.map((view) => {
          const count = view.id === "today" ? todayCount : view.id === "recent" ? recentCount : totalCount;
          return (
            <button
              className={dateView === view.id && !customDate ? "active" : ""}
              type="button"
              key={view.id}
              aria-pressed={dateView === view.id && !customDate}
              onClick={() => onDateViewChange(view.id)}
            >
              {view.id === "all" ? <ClipboardList size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
              {view.label}<span>{count}</span>
            </button>
          );
        })}
        {customDate && <span className="orders-custom-date-label">指定日期：{customDate}</span>}
      </div>

      <section className="orders-template-panel" aria-labelledby="ordersTemplateFilterTitle">
        <div className="orders-template-panel-heading">
          <strong id="ordersTemplateFilterTitle"><Shirt size={15} aria-hidden="true" />产品模板</strong>
          <span>{templateChoices.length} 种</span>
        </div>
        <div className="orders-template-chips">
          <button
            type="button"
            className={!selectedTemplate ? "active" : ""}
            aria-pressed={!selectedTemplate}
            onClick={() => onTemplateChange("")}
          >
            全部模板 <b>{totalCount}</b>
          </button>
          {templateChoices.map((template) => (
            <button
              type="button"
              key={template.templateId}
              className={selectedTemplate === template.templateId ? "active" : ""}
              aria-pressed={selectedTemplate === template.templateId}
              onClick={() => onTemplateChange(selectedTemplate === template.templateId ? "" : template.templateId)}
            >
              {template.label}<b>{countByTemplateId[template.templateId] || 0}</b>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
