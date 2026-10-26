import React from "react";
import {
  CalendarDays, Check, ChevronDown, Download, FileImage, RefreshCw, Search, Trash2, Upload,
} from "lucide-react";

export function ArtCenterToolbar({
  onlyToday, onOnlyTodayChange, selectedDate, onDateChange, search, onSearchChange,
  statusFilter, onStatusFilterChange, workMode, onWorkModeChange, selectedCount,
  onRefresh, onExport, onClearWrongImages, onUploadByFilename,
}) {
  const uploadRef = React.useRef(null);

  const handleUpload = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length) onUploadByFilename(files);
    event.target.value = "";
  };

  return (
    <>
      <div className="art-center-toolbar" role="region" aria-label="订单筛选和操作">
        <div className="art-date-controls">
          <button type="button" className={`art-button art-today-button${onlyToday ? " active" : ""}`} onClick={() => onOnlyTodayChange(!onlyToday)}>
            {onlyToday && <Check size={14} aria-hidden="true" />}只看今天
          </button>
          <label className="art-control art-date-control">
            <CalendarDays size={15} aria-hidden="true" />
            <input aria-label="筛选日期" type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
          </label>
        </div>

        <label className="art-control art-search-control">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜订单/批次…" aria-label="搜索订单或批次" />
        </label>

        <label className="art-control art-status-control">
          <select aria-label="订单状态" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
            <option value="all">状态：全部</option>
            <option value="待处理">待处理</option>
            <option value="进行中">进行中</option>
            <option value="已传图">已传图</option>
            <option value="异常">异常订单</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>

        <div className="art-work-mode" role="group" aria-label="任务类型">
          {[ ["all", "全部"], ["machine", "机器"], ["human", "人工"] ].map(([id, label]) => (
            <button key={id} type="button" className={workMode === id ? "active" : ""} onClick={() => onWorkModeChange(id)}>{label}</button>
          ))}
        </div>

        <button className="art-button art-icon-button" type="button" onClick={onRefresh} aria-label="刷新 mock 数据" title="刷新">
          <RefreshCw size={15} aria-hidden="true" />
        </button>
        <button className="art-button art-action-export" type="button" onClick={onExport}>
          <Download size={14} aria-hidden="true" /><span>导出Excel ({selectedCount})</span>
        </button>
        <button className="art-button art-action-clear" type="button" onClick={onClearWrongImages}>
          <Trash2 size={14} aria-hidden="true" /><span>批量清空错图</span>
        </button>
        <button className="art-button art-action-upload" type="button" onClick={() => uploadRef.current?.click()}>
          <FileImage size={14} aria-hidden="true" /><span>全局按名字传图</span><Upload size={12} aria-hidden="true" />
        </button>
        <input ref={uploadRef} type="file" accept="image/*" multiple hidden onChange={handleUpload} />
      </div>
      <div className="art-center-hint"><span className="art-demo-indicator" />演示数据 · 筛选与操作仅在当前页面生效</div>
    </>
  );
}
