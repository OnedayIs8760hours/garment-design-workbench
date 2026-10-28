import React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, FilePlus2, Trash2 } from "lucide-react";
import { ArtCenterImagePlaceholder } from "./ArtCenterImagePlaceholder.jsx";
import { STATUS_CLASS } from "./artCenterModel.js";
import { canClearImages, uploadBlockReason } from "./erpOrderModel.js";

const COLUMNS = [
  ["selection", "", 45, true], ["sequence", "序列号", 90, true], ["priority", "优先级", 82, true],
  ["taskBatch", "任务批次", 130, true, true], ["productionBatch", "生产批次", 150, true, true], ["artCode", "美工编码(底板)", 140, true, true],
  ["tag", "标签序号", 110, false, true], ["styleImage", "款式图", 80], ["psdPreview", "PSD预览图", 105], ["productionImage", "生产图", 95],
  ["qrImage", "订单二维码", 90], ["remarkImages", "备注图(1-4)", 160], ["orderNo", "订单号", 130, false, true], ["sku", "SKU/主题", 150], ["asin", "ASIN", 120],
  ["status", "状态", 90, false, true], ["category", "品名", 90, false, true], ["style", "款式", 90, false, true], ["process", "工艺", 90, false, true], ["size", "尺码", 70, false, true],
  ["quantity", "数量", 70], ["frontName", "正面名字", 100], ["frontNumber", "正面号码", 90], ["backName", "背面名字", 100], ["backNumber", "背面号码", 90],
  ["shoulderNumber", "肩膀号码", 90], ["productInfo", "产品信息", 120], ["feedback", "反馈/备注", 160], ["actions", "快捷操作", 170],
];
const TABLE_WIDTH = COLUMNS.reduce((sum, column) => sum + column[2], 0);

export function ArtCenterTaskTable({
  orders, total, page, pageSize, onPageChange, onPageSizeChange, selectedIds, onToggle, onToggleAll,
  onOpenOrder, onCopy, onClearOrder, onUploadOrder, filters, filterOptions, onColumnFilter, loading = false,
}) {
  const checkRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const barRef = React.useRef(null);
  const allSelected = orders.length > 0 && orders.every((order) => selectedIds.includes(order.id));
  const someSelected = orders.some((order) => selectedIds.includes(order.id));
  React.useEffect(() => { if (checkRef.current) checkRef.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const [jump, setJump] = React.useState(String(page));
  React.useEffect(() => setJump(String(page)), [page]);
  const syncScroll = (from, to) => { if (from.current && to.current && Math.abs(from.current.scrollLeft - to.current.scrollLeft) > 1) to.current.scrollLeft = from.current.scrollLeft; };
  const cell = (order, key) => {
    if (key === "selection") return <input type="checkbox" aria-label={`选择订单 ${order.orderNo}`} checked={selectedIds.includes(order.id)} onChange={() => onToggle(order.id)} onClick={(event) => event.stopPropagation()} />;
    if (key === "priority") return <span className={`art-priority ${order.priority === "加急" ? "urgent" : ""}`}>{order.priority || "-"}</span>;
    if (key === "taskBatch") return <span className="art-task-batch">{order.taskBatch || "调度派发单"}</span>;
    if (key === "productionBatch" || key === "artCode") return <button type="button" className={`art-code-cell ${key}`} onClick={(event) => { event.stopPropagation(); onCopy(order[key]); }} title="点击复制"><b className="art-code-text">{order[key] || (key === "artCode" ? "未映射" : "未分批")}</b><Copy size={12} aria-hidden="true" /></button>;
    if (["styleImage", "productionImage", "psdPreview", "qrImage"].includes(key)) {
      const label = key === "styleImage" ? "款式图" : key === "productionImage" ? "生产图" : key === "qrImage" ? "订单二维码" : "PSD预览图";
      if (!order[key]) return key === "productionImage" ? <span className="art-task-batch">未上传</span> : <span className="art-text-gray">{key === "psdPreview" ? "暂无预览" : "-"}</span>;
      return <button className={`art-thumbnail-button${key === "productionImage" ? " production" : ""}`} type="button" aria-label={`查看订单 ${order.sequence} 的${label}`} onClick={(event) => { event.stopPropagation(); onOpenOrder(order); }}><ArtCenterImagePlaceholder src={key === "productionImage" ? order.productionThumbnail : order[key]} label={label} compact /></button>;
    }
    if (key === "remarkImages") return order.remarkImages?.length ? <div className="art-remark-images">{order.remarkImages.map((src, index) => <button key={`${src}-${index}`} type="button" className="art-thumbnail-button" aria-label={`查看备注图 ${index + 1}`} onClick={(event) => { event.stopPropagation(); onOpenOrder(order); }}><ArtCenterImagePlaceholder src={src} label={`备注图 ${index + 1}`} compact /></button>)}</div> : <span className="art-text-gray">-</span>;
    if (key === "status") return <span className={`art-status-tag ${STATUS_CLASS[order.status] || "pending"}`}>{order.status}</span>;
    if (key === "frontName" || key === "backName") return order[key] || "-";
    if (key === "frontNumber" || key === "backNumber") return <b className="art-text-primary">{order[key] ?? "-"}</b>;
    if (key === "shoulderNumber") return order.shoulderNumber || <span className="art-text-gray">-</span>;
    if (key === "productInfo") return order.productInfo || `${order.product} / ${order.size}`;
    if (key === "feedback") return order.feedback ? <span className={order.status === "驳回" ? "art-error-note" : ""}>{order.feedback}</span> : <span className="art-text-gray">-</span>;
    if (key === "actions") return <div className="art-quick-actions">
      <button type="button" className="art-button art-warning-button" title={uploadBlockReason(order) || "上传这单的PSD"} disabled={Boolean(uploadBlockReason(order))} aria-label={`上传订单 ${order.sequence} 的PSD`} onClick={(event) => { event.stopPropagation(); onUploadOrder(order); }}><FilePlus2 size={12} /></button>
      <button type="button" className="art-button art-danger-button" title="清空生产图并撤回" aria-label={`清空订单 ${order.sequence} 的生产图`} disabled={!canClearImages(order)} onClick={(event) => { event.stopPropagation(); onClearOrder(order); }}><Trash2 size={12} /></button>
      <button type="button" className="art-button art-info-button" title="一键复制序列号" aria-label={`复制序列号 ${order.sequence}`} onClick={(event) => { event.stopPropagation(); onCopy(order.sequence); }}><Copy size={12} /></button>
    </div>;
    return order[key] ?? "-";
  };
  let left = 0;
  const columns = COLUMNS.map(([key, label, width, fixed, filter]) => { const column = { key, label, width, fixed, filter, left: fixed ? left : undefined }; if (fixed) left += width; return column; });
  return <>
    <div className="art-task-table-shell">
      <div ref={scrollRef} className="art-task-table-scroll" tabIndex={0} role="region" aria-label="美工任务表格" onScroll={() => syncScroll(scrollRef, barRef)}>
        <table className="art-task-table" style={{ width: TABLE_WIDTH }}>
          <colgroup>{columns.map(({ key, width }) => <col key={key} style={{ width }} />)}</colgroup>
          <thead><tr>{columns.map(({ key, label, fixed, left: offset, filter }) => <th key={key} scope="col" className={`${fixed ? "fixed-left" : ""}${key === "actions" ? " fixed-right" : ""}`} style={fixed ? { left: offset } : undefined}>
            {key === "selection" ? <input ref={checkRef} type="checkbox" aria-label="选择当前页全部订单" checked={allSelected} disabled={!orders.length} onChange={onToggleAll} /> : <div className="art-column-title">{label}{filter && <label className={`art-column-filter${filters.columnFilters[key] || filters[key]?.length ? " active" : ""}`}><ChevronDown size={12} aria-hidden="true" /><select aria-label={`按 ${label} 过滤`} value={filters.columnFilters[key] || (["category", "productionBatch", "status"].includes(key) && filters[key]?.length === 1 ? filters[key][0] : "")} onChange={(event) => onColumnFilter(key, event.target.value)}><option value="">全部</option>{(filterOptions[key] || []).map((option) => <option key={option.value} value={option.value}>{option.text}{option.count == null ? "" : ` (${option.count})`}</option>)}</select></label>}</div>}
          </th>)}</tr></thead>
          <tbody>{orders.map((order, index) => <tr key={order.id} className={`${index % 2 ? "striped " : ""}${order.status === "异常" ? "abnormal-row " : ""}${order.machineLogo ? "machine-logo-row " : ""}${order.status === "驳回" ? "rejected-row " : ""}${selectedIds.includes(order.id) ? "is-selected" : ""}`} onClick={() => onOpenOrder(order)}>{columns.map(({ key, fixed, left: offset }) => <td key={key} className={`${fixed ? "fixed-left" : ""}${key === "actions" ? " fixed-right" : ""}`} style={fixed ? { left: offset } : undefined} title={typeof order[key] === "string" ? order[key] : undefined}><div className="art-cell-content">{cell(order, key)}</div></td>)}</tr>)}</tbody>
        </table>
        {orders.length === 0 && <div className="art-table-empty">{loading ? "正在加载 ERP 订单…" : "暂无数据"}</div>}
      </div>
      <div ref={barRef} className="art-sticky-scrollbar" role="region" aria-label="我的任务横向滚动条" tabIndex={0} onScroll={() => syncScroll(barRef, scrollRef)}><div style={{ width: TABLE_WIDTH, height: 1 }} /></div>
    </div>
    <footer className="pagination-wrapper"><span>共 {total} 条</span><select aria-label="每页条数" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{[20, 50, 100].map((size) => <option key={size} value={size}>{size}条/页</option>)}</select>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="上一页"><ChevronLeft size={14} /></button><button type="button" className="current-page" aria-label={`第 ${page} 页`}>{page}</button><button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="下一页"><ChevronRight size={14} /></button>
      <label>前往 <input type="number" aria-label="前往页码" min="1" max={pageCount} value={jump} onChange={(event) => setJump(event.target.value)} onBlur={() => { const value = Math.max(1, Math.min(pageCount, Number(jump) || 1)); onPageChange(value); setJump(String(value)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> 页</label>
    </footer>
  </>;
}
