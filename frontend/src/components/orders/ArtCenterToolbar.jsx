import React from "react";
import { CalendarDays, ChevronDown, Download, Image as ImageIcon, RefreshCw, Search, Trash2, X } from "lucide-react";

const STATUSES = ["做图中", "驳回", "待审核", "设计完成", "生产中", "已发货", "异常"];

export function ArtCenterToolbar({
  selectedDate, onDateChange, search, onSearchChange, statusFilter, onStatusFilterChange,
  workMode, onWorkModeChange, onRefresh, selectedCount, onExport, onClearWrongImages, onUploadByFilename,
}) {
  const values = Array.isArray(statusFilter) ? statusFilter : statusFilter ? [statusFilter] : [];
  return <div className="header-main"><div className="actions" role="region" aria-label="订单筛选和操作">
    <label className="art-control art-date-control"><CalendarDays size={14} aria-hidden="true" /><span>{selectedDate || "选择日期"}</span><input aria-label="筛选日期" type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />{selectedDate && <button type="button" className="art-date-clear" aria-label="清除日期" onClick={(event) => { event.preventDefault(); onDateChange(""); }}><X size={12} /></button>}</label>
    <label className="art-control art-search-control"><Search size={14} aria-hidden="true" /><input type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜订单/批次..." aria-label="搜索订单" /></label>
    <details className="art-status-select">
      <summary aria-label="订单状态">{values.length ? <><span className="art-selected-status">{values[0]}</span>{values.length > 1 && <small>+{values.length - 1}</small>}</> : <span className="art-select-placeholder">状态</span>}<ChevronDown size={14} aria-hidden="true" /></summary>
      <div className="art-status-options" role="group" aria-label="订单状态">
        {STATUSES.map((status) => <label key={status}><input type="checkbox" checked={values.includes(status)} onChange={() => onStatusFilterChange(values.includes(status) ? values.filter((value) => value !== status) : [...values, status])} />{status}</label>)}
        <button type="button" onClick={() => onStatusFilterChange([])}><X size={12} aria-hidden="true" />清空</button>
      </div>
    </details>
    <div className="art-work-mode" role="group" aria-label="任务类型">{[["all", "全部"], ["machine", "机器"], ["human", "人工"]].map(([id, label]) => <button key={id} type="button" className={workMode === id ? "active" : ""} aria-pressed={workMode === id} onClick={() => onWorkModeChange(id)}>{label}</button>)}</div>
    <button className="art-button art-refresh-button" type="button" onClick={onRefresh} aria-label="重新匹配自动单" title="重新匹配自动单"><RefreshCw size={14} /></button>
    <button className="art-button art-success-button" type="button" disabled={!selectedCount} onClick={onExport} title="导出所选订单为 Excel"><Download size={14} aria-hidden="true" />导出Excel ({selectedCount})</button>
    <button className="art-button art-danger-button" type="button" disabled={!selectedCount} onClick={onClearWrongImages}><Trash2 size={14} aria-hidden="true" />批量清空错图</button>
    <button className="art-button art-warning-button" type="button" onClick={onUploadByFilename}><ImageIcon size={14} aria-hidden="true" />全局按名字传图</button>
  </div></div>;
}
