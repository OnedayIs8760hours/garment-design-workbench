import React from "react";
import {
  CheckCircle2,
  ClipboardList,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  PencilRuler,
  Shirt,
  ShieldCheck,
  WandSparkles,
  X,
} from "lucide-react";
import "../styles/workspace.css";
import { canAccessSection } from "../permissions.js";

const NAV_ITEMS = [
  { id: "home", label: "工作台", icon: LayoutDashboard },
  { id: "products", label: "产品", icon: Shirt },
  { id: "design", label: "设计", icon: PencilRuler },
  { id: "assets", label: "素材", icon: Images },
  { id: "generate", label: "素材生成", icon: WandSparkles },
  { id: "orders", label: "订单", icon: ClipboardList },
  { id: "finished", label: "成品", icon: CheckCircle2 },
  { id: "permissions", label: "权限管理", icon: ShieldCheck },
  { id: "all_content", label: "全员作品", icon: Images },
];

export function WorkspaceShell({ activeSection, onNavigate, user, onSignOut, children }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  // 桌面和移动导航共用同一份过滤结果，避免在某个布局中泄漏无权限入口。
  const visibleNavItems = NAV_ITEMS.filter(({ id }) => canAccessSection(user, id));

  React.useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  const navigate = (section) => {
    onNavigate(section);
    setMobileNavOpen(false);
  };

  return (
    <div className={`workspace-app${visibleNavItems.some(({ id }) => id === "permissions") ? " has-permissions-nav" : ""}`}>
      <header className="workspace-topbar">
        <div className="workspace-topbar-inner">
          <a className="workspace-brand" href="#workspace" onClick={(event) => { event.preventDefault(); navigate("home"); }} aria-label="woda Design 工作台">
            <span className="workspace-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="workspace-brand-copy">woda Design<small>CREATIVE WORKSPACE</small></span>
          </a>

          <nav className="workspace-nav" aria-label="工作区主导航">
            {visibleNavItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`workspace-nav-link${activeSection === id ? " active" : ""}`}
                type="button"
                aria-current={activeSection === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>

          <div className="workspace-account">
            <span className="workspace-account-avatar" aria-hidden="true">{Array.from(user?.username || "D").slice(0, 1).join("").toUpperCase()}</span>
            <span className="workspace-account-name" title={user?.username || "设计师"}>{user?.username || "设计师"}</span>
            <button className="workspace-signout" type="button" onClick={onSignOut} title="退出登录">
              <LogOut size={15} aria-hidden="true" />
              <span>退出</span>
            </button>
            <button
              className="workspace-mobile-trigger"
              type="button"
              aria-label={mobileNavOpen ? "关闭菜单" : "打开菜单"}
              aria-expanded={mobileNavOpen}
              aria-controls="workspaceMobileNav"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <nav id="workspaceMobileNav" className={`workspace-mobile-nav${mobileNavOpen ? " open" : ""}`} aria-label="移动端工作区导航" aria-hidden={!mobileNavOpen}>
          {visibleNavItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={activeSection === id ? "active" : ""}
              type="button"
              tabIndex={mobileNavOpen ? 0 : -1}
              aria-current={activeSection === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              {label}
            </button>
          ))}
          <button className="workspace-mobile-signout" type="button" tabIndex={mobileNavOpen ? 0 : -1} onClick={() => { setMobileNavOpen(false); onSignOut(); }}>
            <LogOut size={17} aria-hidden="true" />退出登录
          </button>
        </nav>
      </header>

      <div className="workspace-content" key={activeSection}>
        {children}
      </div>
    </div>
  );
}
