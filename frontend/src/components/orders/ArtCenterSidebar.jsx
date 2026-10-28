import React from "react";
import { ChevronDown, ClipboardList, Cpu, Globe2, Hand, House, LayoutGrid, List, PenTool, Settings, Store, UserCheck } from "lucide-react";

export function ArtCenterSidebar({ activeItem, activeCategory, categories = [], onSelect, counts, onUnavailable }) {
  const [centerOpen, setCenterOpen] = React.useState(true);
  const [tasksOpen, setTasksOpen] = React.useState(true);
  const [grabOpen, setGrabOpen] = React.useState(false);
  const item = (id, label, Icon, nested = false) => <button key={id} type="button" className={`art-center-nav-item${nested ? " nested" : ""}${activeItem === id && !activeCategory ? " active" : ""}`} onClick={() => onSelect(id)} aria-current={activeItem === id && !activeCategory ? "page" : undefined}>
    <Icon size={16} aria-hidden="true" /><span>{label}</span>{counts && <b className={`art-nav-count${counts[id] ? "" : " is-empty"}`}>{counts[id] ?? "—"}</b>}
  </button>;
  const categoryItems = (scope, group) => activeItem === scope && categories.filter((category) => category.module_group === group && category.is_active !== false).sort((a, b) => a.sort_order - b.sort_order).map((category) => <button key={category.id ?? category.category_key} className={`art-center-nav-item nested art-route-category${activeCategory === category.category_key ? " active" : ""}`} type="button" aria-current={activeCategory === category.category_key ? "page" : undefined} onClick={() => onSelect(scope, category.category_key)}><span>{category.display_name}</span><b className="art-nav-count">{counts[`${group}:${category.category_key}`] ?? "—"}</b></button>);
  return <aside className="art-center-sidebar" aria-label="美工中心导航">
    <button type="button" className="art-nav-group art-center-group" onClick={() => setCenterOpen((open) => !open)} aria-expanded={centerOpen}><PenTool size={16} aria-hidden="true" /><span>美工中心</span><ChevronDown size={12} className={centerOpen ? "opened" : ""} /></button>
    {centerOpen && <nav aria-label="美工中心菜单" className="art-center-nav">
      <button type="button" className="art-center-nav-item" onClick={() => onUnavailable("订单全局")}><LayoutGrid size={16} aria-hidden="true" /><span>订单全局</span></button>
      <button type="button" className="art-nav-group" onClick={() => setGrabOpen((open) => !open)} aria-expanded={grabOpen}><Hand size={16} aria-hidden="true" /><span>抢单大厅</span><ChevronDown size={12} className={grabOpen ? "opened" : ""} /></button>
      {grabOpen && <div className="art-center-nav-children">{["沃达", "国内", "海外", "阿里", "大货"].map((label) => <button key={label} type="button" className="art-center-nav-item nested" onClick={() => onUnavailable(`抢单大厅 · ${label}`)}><ClipboardList size={16} aria-hidden="true" /><span>{label}</span></button>)}</div>}
      <button type="button" className="art-center-nav-item" onClick={() => onUnavailable("订单指派")}><UserCheck size={16} aria-hidden="true" /><span>订单指派</span></button>
      <button type="button" className="art-center-nav-item" onClick={() => onUnavailable("美工管理")}><Settings size={16} aria-hidden="true" /><span>美工管理</span></button>
      <button type="button" className="art-nav-group" onClick={() => setTasksOpen((open) => !open)} aria-expanded={tasksOpen}><List size={16} aria-hidden="true" /><span>我的任务（新）</span><b className={`art-nav-count${counts.all ? "" : " is-empty"}`}>{counts.all ?? "—"}</b><ChevronDown size={12} className={tasksOpen ? "opened" : ""} /></button>
      {tasksOpen && <div className="art-center-nav-children">
        {item("all", "全局", LayoutGrid, true)}
        {item("woda", "沃达", Store, true)}
        {item("domestic", "国内", House, true)}
        {categoryItems("domestic", "DOMESTIC")}
        {item("overseas", "海外", Globe2, true)}
        {categoryItems("overseas", "OVERSEAS")}
        {item("alibaba", "阿里", PenTool, true)}
        {item("bulk", "大货", ClipboardList, true)}
      </div>}
      {item("machine", "机器任务", Cpu)}
    </nav>}
  </aside>;
}
