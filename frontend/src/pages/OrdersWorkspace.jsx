import React from "react";
import {
  AlertTriangle, CalendarCheck, CheckCircle2, ChevronRight, ClipboardList, Clock3, Factory,
  Image as ImageIcon, Layers3, PenTool, X,
} from "lucide-react";
import { ArtCenterSidebar } from "../components/orders/ArtCenterSidebar.jsx";
import { ArtCenterImagePlaceholder } from "../components/orders/ArtCenterImagePlaceholder.jsx";
import { ArtCenterTaskTable } from "../components/orders/ArtCenterTaskTable.jsx";
import { ArtCenterToolbar } from "../components/orders/ArtCenterToolbar.jsx";
import {
  ART_CENTER_BATCHES, ART_CENTER_CATEGORIES, ART_CENTER_PROCESSES, formatMockDate,
  getMockDateKey, INITIAL_ART_CENTER_ORDERS,
} from "../mock/artCenterOrders.js";

const TODAY = getMockDateKey(new Date());
const STATUS_TABS = [
  { id: "all", label: "全部记录", icon: ClipboardList },
  { id: "pending", label: "待处理", icon: Clock3 },
  { id: "uploaded", label: "已传图", icon: CheckCircle2 },
  { id: "exception", label: "异常订单", icon: AlertTriangle },
];

function matchesTab(order, tab) {
  if (tab === "pending") return ["待处理", "做图中", "驳回", "待审核"].includes(order.status);
  if (tab === "uploaded") return order.uploaded;
  if (tab === "exception") return order.status === "异常" || order.wrongImage;
  return true;
}
function matchesStatus(order, status) {
  if (status === "all") return true;
  if (status === "进行中") return ["做图中", "待审核", "设计完成", "生产中"].includes(order.status);
  return order.status === status;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(orders) {
  const columns = [
    ["序列号", "sequence"], ["订单号", "orderNo"], ["状态", "status"], ["产品类别", "category"],
    ["任务批次", "taskBatch"], ["生产批次", "productionBatch"], ["美工编码", "artCode"], ["SKU / 主题", "sku"],
    ["工艺", "process"], ["尺码", "size"], ["数量", "quantity"], ["姓名", "name"], ["号码", "number"], ["下单时间", "createdAt"],
  ];
  const rows = [columns.map(([label]) => escapeCsv(label)).join(","), ...orders.map((order) => columns.map(([, key]) => escapeCsv(key === "createdAt" ? formatMockDate(order[key]) : order[key])).join(","))];
  const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `woda-art-center-${TODAY}.csv`;
  link.click();
  URL.revokeObjectURL(href);
}

function FilterChipRow({ icon: Icon, title, values, active, onChange, orders, field, label }) {
  return (
    <div className="art-filter-row">
      <div className="art-filter-label"><Icon size={14} aria-hidden="true" /><strong>{title}</strong></div>
      <div className="art-filter-chips">
        {values.map((value) => {
          const count = orders.filter((order) => order[field] === value).length;
          return <button type="button" key={value} className={active === value ? "active" : ""} onClick={() => onChange(active === value ? "" : value)}>
            <span>{label?.(value) || value}</span><b>{count}</b>
          </button>;
        })}
      </div>
    </div>
  );
}

function OrderDetail({ order, onClose }) {
  if (!order) return null;
  return (
    <div className="art-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="art-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="artDetailTitle">
        <header><div><span>演示任务详情</span><h2 id="artDetailTitle">{order.orderNo}</h2></div><button type="button" onClick={onClose} aria-label="关闭任务详情"><X size={19} /></button></header>
        <div className="art-detail-status"><span className={`art-status-tag ${order.status === "异常" ? "error" : order.uploaded ? "done" : "pending"}`}><i />{order.status}</span><span>{order.category} · {order.process}</span></div>
        <div className="art-detail-images"><figure><ProductImage src={order.styleImage} label="款式图" /><figcaption>款式图</figcaption></figure><figure><ProductImage src={order.productionImage} label="生产图" /><figcaption>生产图</figcaption></figure></div>
        <dl className="art-detail-grid">
          <div><dt>生产批次</dt><dd>{order.productionBatch}</dd></div><div><dt>任务批次</dt><dd>{order.taskBatch}</dd></div>
          <div><dt>美工编码</dt><dd>{order.artCode}</dd></div><div><dt>SKU / 主题</dt><dd>{order.sku}</dd></div>
          <div><dt>品名 / 款式</dt><dd>{order.product} · {order.style}</dd></div><div><dt>尺码 / 数量</dt><dd>{order.size} / {order.quantity}</dd></div>
          <div><dt>姓名 / 号码</dt><dd>{order.name} / {order.number}</dd></div><div><dt>下单时间</dt><dd>{formatMockDate(order.createdAt)}</dd></div>
        </dl>
        <footer><span>页面仅演示美工中心布局与交互</span><button type="button" className="art-button art-detail-close" onClick={onClose}>关闭</button></footer>
      </section>
    </div>
  );
}

function ProductImage({ src, label }) {
  return src ? <ArtCenterImagePlaceholder label={label} /> : <span className="art-image-empty"><ImageIcon size={19} aria-hidden="true" /></span>;
}

export function OrdersWorkspace() {
  const [orders, setOrders] = React.useState(() => INITIAL_ART_CENTER_ORDERS.map((order) => ({ ...order })));
  const [activeNav, setActiveNav] = React.useState("woda");
  const [onlyToday, setOnlyToday] = React.useState(true);
  const [selectedDate, setSelectedDate] = React.useState(TODAY);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [workMode, setWorkMode] = React.useState("all");
  const [activeTab, setActiveTab] = React.useState("pending");
  const [category, setCategory] = React.useState("");
  const [batch, setBatch] = React.useState("");
  const [process, setProcess] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [notice, setNotice] = React.useState("");
  const [detailOrder, setDetailOrder] = React.useState(null);
  const noticeTimer = React.useRef(null);

  React.useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  const notify = (message) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3200);
  };

  const filteredBeforeTab = React.useMemo(() => orders.filter((order) => {
    if ((onlyToday || selectedDate) && getMockDateKey(order.createdAt) !== (selectedDate || TODAY)) return false;
    if (search.trim()) {
      const term = search.trim().toLocaleLowerCase();
      const searchable = [order.orderNo, order.productionBatch, order.taskBatch, order.sku, order.artCode, order.name].join(" ").toLocaleLowerCase();
      if (!searchable.includes(term)) return false;
    }
    if (!matchesStatus(order, statusFilter)) return false;
    if (workMode === "machine" && !order.isMachine) return false;
    if (workMode === "human" && order.isMachine) return false;
    if (category && order.category !== category) return false;
    if (batch && order.productionBatch !== batch) return false;
    if (process && order.process !== process) return false;
    return true;
  }), [orders, onlyToday, selectedDate, search, statusFilter, workMode, category, batch, process]);
  const filteredOrders = React.useMemo(() => filteredBeforeTab.filter((order) => matchesTab(order, activeTab)), [filteredBeforeTab, activeTab]);

  const tabCounts = React.useMemo(() => ({
    all: filteredBeforeTab.length,
    pending: filteredBeforeTab.filter((order) => matchesTab(order, "pending")).length,
    uploaded: filteredBeforeTab.filter((order) => matchesTab(order, "uploaded")).length,
    exception: filteredBeforeTab.filter((order) => matchesTab(order, "exception")).length,
  }), [filteredBeforeTab]);
  const todayOrders = orders.filter((order) => getMockDateKey(order.createdAt) === TODAY);
  const selectedCount = selectedIds.length;

  const toggleOrder = (id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const toggleAll = () => {
    const currentIds = filteredOrders.map((order) => order.id);
    const allSelected = currentIds.length && currentIds.every((id) => selectedIds.includes(id));
    setSelectedIds((ids) => allSelected ? ids.filter((id) => !currentIds.includes(id)) : [...new Set([...ids, ...currentIds])]);
  };
  const refreshMock = () => {
    setOrders((current) => current.map((order) => ({ ...order })));
    notify("演示订单已刷新");
  };
  const clearWrongImages = () => {
    const affected = orders.filter((order) => order.wrongImage && (!selectedIds.length || selectedIds.includes(order.id)));
    if (!affected.length) return notify(selectedIds.length ? "所选订单没有标记错图" : "当前没有标记错图的订单");
    setOrders((current) => current.map((order) => affected.some((item) => item.id === order.id) ? { ...order, wrongImage: false } : order));
    notify(`已在演示数据中清除 ${affected.length} 条错图标记`);
  };
  const exportOrders = () => {
    const rows = selectedCount ? orders.filter((order) => selectedIds.includes(order.id)) : filteredOrders;
    if (!rows.length) return notify("当前没有可导出的订单");
    downloadCsv(rows);
    notify(`已导出 ${rows.length} 条演示订单（CSV，可用 Excel 打开）`);
  };
  const uploadByFilename = (files) => {
    notify(`已选择 ${files.length} 张图片。演示模式下不会上传或保存文件。`);
  };
  const statCards = [
    { label: "今日分派任务总数", value: todayOrders.length, icon: Layers3, tone: "blue", note: "根据本地演示任务统计" },
    { label: "今日已传图", value: todayOrders.filter((order) => order.uploaded).length, icon: CheckCircle2, tone: "green", note: "模拟生产图已上传状态" },
    { label: "机器单需 Logo", value: todayOrders.filter((order) => order.isMachine && order.machineLogo).length, icon: Factory, tone: "amber", note: "机器订单的 Logo 需求" },
  ];

  return (
    <main className="art-center-page" aria-label="订单中心美工任务板">
      <ArtCenterSidebar activeItem={activeNav} onSelect={setActiveNav} />
      <section className="art-center-main">
        <div className="art-center-breadcrumb"><span>订单</span><ChevronRight size={14} aria-hidden="true" /><strong>{activeNav === "woda" ? "沃达任务" : "美工任务"}</strong></div>
        <header className="art-center-titlebar">
          <div><p className="art-center-eyebrow">ART CENTER / TASK BOARD</p><h1>美工中心</h1><p>集中查看订单任务、生产批次与图片状态。</p></div>
          <div className="art-demo-badge"><span />Mock 数据</div>
        </header>

        <div className="art-center-board">
          <ArtCenterToolbar
            onlyToday={onlyToday}
            onOnlyTodayChange={(next) => { setOnlyToday(next); setSelectedDate(next ? TODAY : ""); }}
            selectedDate={selectedDate}
            onDateChange={(value) => { setSelectedDate(value); setOnlyToday(Boolean(value)); }}
            search={search} onSearchChange={setSearch} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
            workMode={workMode} onWorkModeChange={setWorkMode} selectedCount={selectedCount}
            onRefresh={refreshMock} onExport={exportOrders} onClearWrongImages={clearWrongImages} onUploadByFilename={uploadByFilename}
          />

          <nav className="art-status-tabs" aria-label="任务状态">
            {STATUS_TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>
              <Icon size={14} aria-hidden="true" /><span>{label}</span><b>{tabCounts[id]}</b>
            </button>)}
          </nav>

          <section className="art-filter-panel" aria-label="任务分类筛选">
            <FilterChipRow icon={Layers3} title="品类任务" values={ART_CENTER_CATEGORIES} active={category} onChange={setCategory} orders={filteredBeforeTab} field="category" />
            <FilterChipRow icon={ClipboardList} title="生产批次" values={ART_CENTER_BATCHES} active={batch} onChange={setBatch} orders={filteredBeforeTab} field="productionBatch" />
            <FilterChipRow icon={PenTool} title="工艺筛选" values={ART_CENTER_PROCESSES} active={process} onChange={setProcess} orders={filteredBeforeTab} field="process" />
          </section>

          <section className="art-stat-grid" aria-label="今日任务统计">
            {statCards.map(({ label, value, icon: Icon, tone, note }) => <article key={label} className={`art-stat-card ${tone}`}>
              <span className="art-stat-icon"><Icon size={18} aria-hidden="true" /></span><div><span>{label}</span><small>{note}</small></div><strong>{value}</strong>
            </article>)}
          </section>

          <ArtCenterTaskTable orders={filteredOrders} selectedIds={selectedIds} onToggle={toggleOrder} onToggleAll={toggleAll} onOpenOrder={setDetailOrder} />
          <div className="art-board-footnote"><CalendarCheck size={13} aria-hidden="true" />日期、筛选项、状态、图片与任务操作均为前端模拟数据。</div>
        </div>
      </section>
      {notice && <div className="art-toast" role="status">{notice}</div>}
      <OrderDetail order={detailOrder} onClose={() => setDetailOrder(null)} />
    </main>
  );
}
