import React from "react";
import { ClipboardList, Clock3, Layers3 } from "lucide-react";

const cards = [
  { id: "drafts", label: "设计记录", note: "当前账号保存的草稿", Icon: ClipboardList, tone: "" },
  { id: "today", label: "今日更新", note: "按本地日期统计", Icon: Clock3, tone: "is-blue" },
  { id: "templates", label: "使用模板", note: "已有草稿关联的模板", Icon: Layers3, tone: "is-warm" },
];

export function OrdersWorkspaceSummary({ total, updatedToday, usedTemplates, loading, error }) {
  const values = { drafts: total, today: updatedToday, templates: usedTemplates };

  return (
    <section className="orders-center-stats" aria-label="设计记录概览">
      {cards.map(({ id, label, note, Icon, tone }) => (
        <article className={`orders-center-stat-card ${tone}`} key={id}>
          <span className="orders-center-stat-icon"><Icon size={17} aria-hidden="true" /></span>
          <div><span>{label}</span><strong>{loading ? "…" : error ? "—" : values[id]}</strong></div>
          <small>{note}</small>
        </article>
      ))}
    </section>
  );
}
