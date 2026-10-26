import React from "react";
import {
  Activity, Archive, BadgeCheck, ChevronDown, ChevronRight, ClipboardList, Cpu,
  Globe2, Hand, House, LayoutGrid, PenTool, Settings, UserRound, Users,
} from "lucide-react";

const MAIN_LINKS = [
  { id: "global", label: "订单全局", icon: LayoutGrid },
  { id: "grab", label: "抢单大厅", icon: Hand, expandable: true },
  { id: "assignment", label: "订单指派", icon: UserRound },
  { id: "management", label: "美工管理", icon: Settings },
  { id: "base-check", label: "基码核查", icon: Archive },
];

const TASK_LINKS = [
  { id: "all", label: "全局", icon: LayoutGrid },
  { id: "woda", label: "沃达", icon: BadgeCheck },
  { id: "domestic", label: "国内", icon: House, expandable: true },
  { id: "overseas", label: "海外", icon: Globe2, expandable: true },
  { id: "alibaba", label: "阿里", icon: PenTool },
  { id: "bulk", label: "大货", icon: Archive },
];

export function ArtCenterSidebar({ activeItem, onSelect }) {
  const [taskGroupOpen, setTaskGroupOpen] = React.useState(true);
  const [newTasksOpen, setNewTasksOpen] = React.useState(true);
  const [mineOpen, setMineOpen] = React.useState(true);

  return (
    <aside className="art-center-sidebar" aria-label="美工中心导航">
      <button type="button" className="art-center-sidebar-heading" onClick={() => setTaskGroupOpen((open) => !open)} aria-expanded={taskGroupOpen}>
        <ClipboardList size={16} aria-hidden="true" />
        <span>订单中心</span>
        {taskGroupOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
      </button>
      {taskGroupOpen && <>
        <button type="button" className="art-center-group-title" onClick={() => setTaskGroupOpen(false)}>
          <PenTool size={15} aria-hidden="true" /><span>美工中心</span><ChevronDown size={13} aria-hidden="true" />
        </button>
        <nav className="art-center-nav" aria-label="美工中心菜单">
          {MAIN_LINKS.map(({ id, label, icon: Icon, expandable }) => (
            <button key={id} type="button" className={`art-center-nav-item${activeItem === id ? " active" : ""}`} onClick={() => onSelect(id)}>
              <Icon size={15} aria-hidden="true" /><span>{label}</span>{expandable && <ChevronDown size={13} className="art-nav-chevron" aria-hidden="true" />}
            </button>
          ))}
          <button type="button" className="art-center-nav-item" onClick={() => setMineOpen((open) => !open)} aria-expanded={mineOpen}>
            <Users size={15} aria-hidden="true" /><span>我的任务</span><b className="art-nav-count">0</b>
            {mineOpen ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
          </button>
          {mineOpen && <button type="button" className="art-center-nav-item art-center-nav-sub" onClick={() => onSelect("mine")}>
            <ClipboardList size={14} aria-hidden="true" /><span>我的任务列表</span>
          </button>}
          <button type="button" className="art-center-nav-item" onClick={() => setNewTasksOpen((open) => !open)} aria-expanded={newTasksOpen}>
            <ClipboardList size={15} aria-hidden="true" /><span>我的任务（新）</span>
            {newTasksOpen ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
          </button>
          {newTasksOpen && <div className="art-center-nav-children">
            {TASK_LINKS.map(({ id, label, icon: Icon, expandable }) => (
              <button key={id} type="button" className={`art-center-nav-item art-center-nav-sub${activeItem === id ? " active" : ""}`} onClick={() => onSelect(id)}>
                <Icon size={14} aria-hidden="true" /><span>{label}</span>{expandable && <ChevronDown size={12} className="art-nav-chevron" aria-hidden="true" />}
              </button>
            ))}
          </div>}
        </nav>
      </>}
      <div className="art-center-sidebar-footer">
        <button type="button" className={`art-center-nav-item${activeItem === "machine" ? " active" : ""}`} onClick={() => onSelect("machine")}>
          <Cpu size={15} aria-hidden="true" /><span>机器任务</span><b className="art-nav-pill">99+</b>
        </button>
        <button type="button" className={`art-center-nav-item${activeItem === "monitor" ? " active" : ""}`} onClick={() => onSelect("monitor")}>
          <Activity size={15} aria-hidden="true" /><span>机器状态监控</span>
        </button>
      </div>
    </aside>
  );
}
