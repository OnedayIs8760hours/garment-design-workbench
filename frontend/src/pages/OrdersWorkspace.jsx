import React from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Info, PenTool, X } from "lucide-react";
import { ArtCenterSidebar } from "../components/orders/ArtCenterSidebar.jsx";
import { ArtCenterTaskTable } from "../components/orders/ArtCenterTaskTable.jsx";
import { ArtCenterToolbar } from "../components/orders/ArtCenterToolbar.jsx";
import { ArtCenterOrderDetail } from "../components/orders/ArtCenterOrderDetail.jsx";
import { ArtCenterActions } from "../components/orders/ArtCenterActions.jsx";
import { ErpConnection } from "../components/orders/ErpConnection.jsx";
import { localDateKey, TASK_SOURCES } from "../components/orders/artCenterModel.js";
import { canClearImages, columnOptions, normalizeOrder, taskQuery, uploadBlockReason } from "../components/orders/erpOrderModel.js";
import { clearErpSession, erpArt, ERP_BASE, ERP_FRONTEND, getErpToken } from "../api/erpArt.js";
import { downloadOrdersWorkbook } from "../components/orders/erpOrderExport.js";
import "../styles/orders.css";

function createFilters(scope = "woda", routeCategory = "") {
  return { scope, routeCategory, date: localDateKey(new Date()), search: "", status: [], workMode: scope === "machine" ? "all" : "human", tab: "all", category: [], productionBatch: [], process: [], columnFilters: {} };
}
const STATUS_TABS = [
  { id: "all", label: "📅 全部记录", icon: ClipboardList }, { id: "pending", label: "🚨 待处理", icon: AlertTriangle },
  { id: "uploaded", label: "✅ 已传图", icon: CheckCircle2 }, { id: "exception", label: "⚠️ 异常订单", icon: AlertTriangle },
];
const EMPTY_DATA = { orders: [], total: 0, total_today: 0, completed_today: 0, machine_logo_count: 0 };
const ERP_MENU_PATHS = {
  订单全局: "/art-order-global", 订单指派: "/order-assignment", 美工管理: "/artwork-management",
  "抢单大厅 · 沃达": "/grab-orders-new/domestic/woda", "抢单大厅 · 国内": "/grab-orders-new/domestic/sds",
  "抢单大厅 · 海外": "/grab-orders-new/overseas/sds", "抢单大厅 · 阿里": "/grab-orders-new/ali", "抢单大厅 · 大货": "/grab-orders-new/bulk",
};

function FilterChipRow({ title, field, summary = [], valueKey, filters, onChange, craft = false }) {
  const activeValues = filters[field];
  const total = summary.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const toggle = (value) => onChange(field, activeValues.includes(value) ? activeValues.filter((item) => item !== value) : [...activeValues, value]);
  return <div className={`task-filter-row${craft ? " craft-filter-row" : ""}`}>
    <div className="category-task-panel__summary"><span className="category-task-title">{craft ? <PenTool size={13} /> : <ClipboardList size={13} />}{title}</span>{!craft && <span className="art-summary-tag">共 {summary.length} {field === "category" ? "类" : "批"}</span>}</div>
    <div className={craft ? "craft-filter-list" : "category-task-list"} role="group" aria-label={title}>
      {!craft && <button type="button" className={`art-filter-button${activeValues.length ? "" : " active"}`} aria-pressed={!activeValues.length} onClick={() => onChange(field, [])}>全部 {total}</button>}
      {summary.map((item) => <button type="button" key={item[valueKey]} className={craft ? `craft-filter-tag${activeValues.includes(item[valueKey]) ? " is-checked" : ""}` : `art-filter-button${activeValues.includes(item[valueKey]) ? " active" : ""}`} aria-pressed={activeValues.includes(item[valueKey])} onClick={() => toggle(item[valueKey])}><span className="category-task-name">{item[valueKey]}</span><span className={craft ? "craft-filter-count" : "category-task-count"}>{item.count}</span></button>)}
    </div>
  </div>;
}

export function OrdersWorkspace() {
  const [user, setUser] = React.useState(null);
  const [checking, setChecking] = React.useState(() => Boolean(getErpToken()));
  const [sessionError, setSessionError] = React.useState("");
  const [data, setData] = React.useState(EMPTY_DATA);
  const [filters, setFilters] = React.useState(createFilters);
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [counts, setCounts] = React.useState({});
  const [categories, setCategories] = React.useState([]);
  const [sidebarError, setSidebarError] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const [notice, setNotice] = React.useState("");
  const [detail, setDetail] = React.useState(null);
  const [action, setAction] = React.useState(null);
  const noticeTimer = React.useRef(null);
  React.useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  React.useEffect(() => {
    const expired = () => { setUser(null); setData(EMPTY_DATA); setCounts({}); setCategories([]); setDetail(null); setSelectedIds([]); setSessionError("ERP 登录已过期，请重新连接"); };
    window.addEventListener("erp-session-expired", expired);
    const controller = new AbortController();
    if (getErpToken()) erpArt.me({ signal: controller.signal }).then((value) => { if (!controller.signal.aborted) setUser(value); }).catch((failure) => {
      if (!controller.signal.aborted) setSessionError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => { controller.abort(); window.removeEventListener("erp-session-expired", expired); };
  }, []);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => window.clearTimeout(timer);
  }, [filters.search]);
  const query = taskQuery({ ...filters, search: debouncedSearch }, page, pageSize).toString();
  React.useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setSelectedIds([]);
    erpArt.tasks(query, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(response.items) || !Number.isFinite(response.total)) throw new Error("ERP 订单响应格式不正确");
      const orders = response.items.map((raw) => normalizeOrder(raw, ERP_BASE));
      const lastPage = Math.max(1, Math.ceil(response.total / pageSize));
      if (page > lastPage) { setPage(lastPage); return; }
      setData({ ...response, orders });
      setDetail((current) => current ? orders.find((order) => order.id === current.id) || null : null);
    }).catch((failure) => { if (!controller.signal.aborted) { setData(EMPTY_DATA); setError(failure.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user, query, revision, page, pageSize]);
  React.useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    Promise.allSettled([erpArt.counts(controller.signal), erpArt.sidebarCounts(controller.signal), erpArt.categories(controller.signal)]).then(([taskCounts, sidebarCounts, routeCategories]) => {
      if (controller.signal.aborted) return;
      const nextCounts = {};
      if (taskCounts.status === "fulfilled") {
        const source = taskCounts.value;
        Object.assign(nextCounts, { woda: source.woda, domestic: source.domestic, overseas: source.overseas, alibaba: source.ali, bulk: source.bulk });
        nextCounts.all = [source.woda, source.domestic, source.overseas, source.ali, source.bulk].reduce((sum, value) => sum + Number(value || 0), 0);
        for (const item of source.routeCategoryCounts || []) nextCounts[`${item.moduleGroup}:${item.categoryKey}`] = item.count;
      }
      if (sidebarCounts.status === "fulfilled") nextCounts.machine = sidebarCounts.value.machine_tasks_pending;
      setCounts(nextCounts);
      setCategories(routeCategories.status === "fulfilled" && Array.isArray(routeCategories.value) ? routeCategories.value : []);
      setSidebarError([taskCounts, sidebarCounts, routeCategories].some((result) => result.status === "rejected") ? "部分来源数量或分类未能加载，请刷新重试。" : "");
    });
    return () => controller.abort();
  }, [user, revision]);
  const notify = (message) => { setNotice(message); window.clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(""), 5000); };
  const refresh = () => setRevision((value) => value + 1);
  const updateFilter = (field, value) => {
    setFilters((current) => {
      const columnFilters = { ...current.columnFilters };
      if (["status", "category", "productionBatch"].includes(field)) delete columnFilters[field];
      if (field === "tab") delete columnFilters.status;
      return { ...current, columnFilters, [field]: value, ...(field === "status" ? { tab: "all" } : field === "tab" ? { status: [] } : {}) };
    });
    setSelectedIds([]); setDetail(null); setPage(1);
  };
  const changeScope = (scope, routeCategory = "") => { setFilters(createFilters(scope, routeCategory)); setDebouncedSearch(""); setSelectedIds([]); setData(EMPTY_DATA); setDetail(null); setPage(1); };
  const selectedOrders = data.orders.filter((order) => selectedIds.includes(order.id));
  const scopeLabel = filters.routeCategory || (filters.scope === "all" ? "我的任务全局" : filters.scope === "machine" ? "机器任务" : TASK_SOURCES.find((source) => source.id === filters.scope)?.label);
  const detailOrder = detail && (data.orders.find((order) => order.id === detail.id) || detail);
  const toggleAll = () => setSelectedIds((ids) => data.orders.every((order) => ids.includes(order.id)) ? [] : data.orders.map((order) => order.id));
  const clearOrders = (orders) => {
    const allowed = orders.filter((order) => canClearImages(order));
    if (!allowed.length) return notify("没有可清空的生产图；仅做图中、驳回或传图后 5 分钟内的待审核订单可清图");
    setAction({ kind: "clear", orders: allowed });
  };
  const uploadOrder = (order, kind) => { const reason = uploadBlockReason(order); if (reason) return notify(reason); setAction({ kind, orders: [order] }); };
  const copyValue = async (value) => { try { await navigator.clipboard.writeText(String(value ?? "")); notify("复制成功"); } catch { notify("无法写入剪贴板，请选择文本复制"); } };
  const stats = [["今日分派任务总数", data.total_today, ""], ["今日已传图", data.completed_today, "success-card"], ["机器单需 Logo", data.machine_logo_count, "machine-logo-card"]];
  const rejectedCount = data.orders.filter((order) => order.status === "驳回").length;
  return <main className="art-center-page" aria-label="订单中心美工任务板">
    <ArtCenterSidebar activeItem={filters.scope} activeCategory={filters.routeCategory} categories={categories} onSelect={changeScope} counts={counts} onUnavailable={(label) => window.open(`${ERP_FRONTEND}${ERP_MENU_PATHS[label] || "/"}`, "_blank", "noopener,noreferrer")} />
    <section className="art-center-main">
      <nav className="art-center-breadcrumb" aria-label="面包屑"><span>ERP</span><b>/</b><span>{scopeLabel}</span>{user && <span className="art-erp-session">{user.real_name || user.name || user.username}<button type="button" className="art-button art-small-button" onClick={() => { clearErpSession(); setUser(null); setData(EMPTY_DATA); setSelectedIds([]); setDetail(null); setCounts({}); setCategories([]); setSessionError(""); }}>切换 ERP 账号</button></span>}</nav>
      {checking ? <p className="art-api-state" role="status">正在验证 ERP 登录…</p> : !user ? <ErpConnection initialError={sessionError} onConnected={(value) => { setSessionError(""); setUser(value); }} /> : <div className="art-erp-page"><div className="dashboard-container">
        <fieldset className="art-live-controls" disabled={loading || Boolean(action)}>
          <div className="page-header">
            <ArtCenterToolbar selectedDate={filters.date} onDateChange={(value) => updateFilter("date", value)} search={filters.search} onSearchChange={(value) => updateFilter("search", value)} statusFilter={filters.status} onStatusFilterChange={(value) => updateFilter("status", value)}
              workMode={filters.workMode} onWorkModeChange={(value) => updateFilter("workMode", value)} onRefresh={() => setAction({ kind: "match", date: filters.date })} selectedCount={selectedOrders.length}
              onExport={async () => { try { await downloadOrdersWorkbook(selectedOrders); notify(`已导出 ${selectedOrders.length} 条 ERP 订单`); } catch (failure) { notify(`导出失败：${failure.message}`); } }} onClearWrongImages={() => clearOrders(selectedOrders)} onUploadByFilename={() => setAction({ kind: "global" })} />
            <nav className="art-status-tabs" aria-label="任务状态">{STATUS_TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={filters.tab === id ? "active" : ""} aria-pressed={filters.tab === id} onClick={() => updateFilter("tab", id)}><Icon size={14} /><span>{label}</span>{id === "pending" && filters.tab === "pending" && data.total > 0 && <b>{data.total}</b>}</button>)}</nav>
            <section className="category-task-panel" aria-label="任务分类筛选">
              <FilterChipRow title="品类任务" field="category" summary={data.category_counts} valueKey="category" filters={filters} onChange={updateFilter} />
              <FilterChipRow title="生产批次" field="productionBatch" summary={data.production_batch_counts} valueKey="production_batch_no" filters={filters} onChange={updateFilter} />
              <FilterChipRow title="工艺筛选" field="process" summary={data.craft_group_counts} valueKey="craft_group" filters={filters} onChange={updateFilter} craft />
            </section>
          </div>
        </fieldset>
        <section className="stats" aria-label="今日任务统计">{stats.map(([label, value, tone]) => <article key={label} className={`stat-card ${tone}`}><span>{label}</span><strong>{loading || error ? "—" : value ?? 0}</strong></article>)}</section>
        {(error || sidebarError) && <div className="art-api-error" role="alert">{error || sidebarError}<button className="art-button art-small-button" type="button" onClick={refresh} disabled={loading}>刷新重试</button></div>}
        {loading && <p role="status" className="art-api-state">正在加载 ERP 订单…</p>}
        {rejectedCount > 0 && !loading && <div className="art-rejected-alert" role="alert"><AlertTriangle size={16} />注意：当前列表中有 {rejectedCount} 个订单被审核员驳回！请优先查看【反馈/备注】并重新上传生产图。</div>}
        <fieldset className="art-live-controls" disabled={loading || Boolean(action)} aria-busy={loading}>
          <ArtCenterTaskTable loading={loading} orders={loading ? [] : data.orders} total={data.total} page={page} pageSize={pageSize} onPageChange={(value) => { setPage(value); setSelectedIds([]); }} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }}
            selectedIds={selectedIds} onToggle={(id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])} onToggleAll={toggleAll} onOpenOrder={setDetail} onCopy={copyValue} onClearOrder={(order) => clearOrders([order])} onUploadOrder={(order) => uploadOrder(order, "psd")}
            filters={filters} filterOptions={columnOptions(data.filter_options)} onColumnFilter={(field, value) => {
              if (["category", "productionBatch", "status"].includes(field)) { updateFilter(field, value ? [value] : []); return; }
              updateFilter("columnFilters", { ...filters.columnFilters, [field]: value });
            }} />
        </fieldset>
        <p className="art-board-footnote"><Info size={13} />数据来自 ERP 美工中心<button type="button" className="art-button art-small-button" onClick={refresh} disabled={loading}>刷新订单</button></p>
      </div></div>}
    </section>
    {notice && <div className="art-toast" role="status"><Info size={16} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="关闭提示"><X size={14} /></button></div>}
    {user && detailOrder && <ArtCenterOrderDetail order={detailOrder} tasks={data.orders} onSelect={setDetail} onClose={() => setDetail(null)} onUpload={(order) => uploadOrder(order, "image")} onUploadPsd={(order) => uploadOrder(order, "psd")} onClear={(order) => clearOrders([order])} />}
    {action && <ArtCenterActions action={action} onClose={() => { setAction(null); refresh(); }} onDone={refresh} />}
  </main>;
}
