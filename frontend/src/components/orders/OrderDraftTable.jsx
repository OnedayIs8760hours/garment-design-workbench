import React from "react";
import { ArrowRight, FileImage, Shirt } from "lucide-react";
import { formatWorkspaceDate } from "../../workspaceData.js";

export function OrderDraftTable({ drafts, templateChoiceById, onOpenDraft }) {
  return (
    <section className="orders-results" aria-label="订单设计记录">
      <div className="orders-results-heading">
        <div><FileImage size={16} aria-hidden="true" /><strong>设计记录</strong><span>{drafts.length} 条</span></div>
        <p>按最近更新时间排列</p>
      </div>
      <div className="orders-table-wrap orders-center-table-wrap">
        <table className="orders-table orders-center-table">
          <thead>
            <tr>
              <th scope="col">序号</th>
              <th scope="col">订单号</th>
              <th scope="col">产品模板</th>
              <th scope="col">尺码</th>
              <th scope="col">裁片</th>
              <th scope="col">版本</th>
              <th scope="col">最近更新</th>
              <th scope="col">状态</th>
              <th scope="col"><span className="sr-only">快捷操作</span></th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft, index) => {
              const template = templateChoiceById[draft.template_id];
              return (
                <tr key={`${draft.template_id}:${draft.order_id}`}>
                  <td className="orders-row-index">{String(index + 1).padStart(2, "0")}</td>
                  <td><strong className="orders-order-id">{draft.order_id}</strong></td>
                  <td>
                    <div className="orders-template-cell">
                      <span className="orders-template-thumb">
                        {template?.preview ? <img src={template.preview} alt="" /> : <Shirt size={17} aria-hidden="true" />}
                      </span>
                      <span><strong>{template?.label || draft.template_id}</strong><small>{draft.template_id}</small></span>
                    </div>
                  </td>
                  <td>{template?.sizes.join(" / ") || "—"}</td>
                  <td>{template?.panelCount ?? "—"}</td>
                  <td>V{draft.template_version ?? "—"}</td>
                  <td><time dateTime={draft.updated_at || undefined}>{formatWorkspaceDate(draft.updated_at)}</time></td>
                  <td><span className="orders-draft-status"><i aria-hidden="true" />已保存</span></td>
                  <td>
                    <button className="workspace-text-action" type="button" onClick={() => onOpenDraft(draft)}>
                      打开设计<ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="orders-results-footer">共 {drafts.length} 条设计记录</footer>
    </section>
  );
}
