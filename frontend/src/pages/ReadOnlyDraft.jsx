import React from "react";
import { getDesignDraft } from "../api.js";
import { oversightApi } from "../api/oversight.js";
import { PanelPreview } from "../components/PanelPreview.jsx";
import { createTemplate } from "../model.js";
import { templateDefinitions } from "../../templates/index.js";
import "../styles/permissions.css";

// 独立读取和展示草稿，不挂载编辑器或写入全局设计 store，避免触发自动保存。
export function ReadOnlyDraft({ draft, onBack }) {
  const [design, setDesign] = React.useState(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let cancelled = false;
    setDesign(null);
    setError("");
    // 全员入口由独立的后端最高权限校验保护，并明确绑定制作者，避免同单号混淆。
    const request = draft.scope === "all" ? oversightApi.design(draft) : getDesignDraft(draft.template_id, draft.order_id);
    request
      .then((value) => {
        if (!cancelled) {
          if (value?.design) setDesign(value.design);
          else setError("草稿不存在或尚未保存。");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      // 切换草稿后忽略上一份草稿的响应，避免错误展示旧设计。
      cancelled = true;
    };
  }, [draft.template_id, draft.order_id, draft.owner_user_id, draft.scope]);
  // 使用草稿所属模板的元数据，不依赖编辑器当前选中的模板或硬编码裁片尺寸。
  const definition = templateDefinitions[draft.template_id];
  const template = definition ? createTemplate(definition) : null;
  return (
    <main className="workspace-page read-only-draft">
      <header className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow">READ ONLY</p>
          <h1>{draft.order_id || "设计预览"}</h1>
          <p>{draft.scope === "all" ? `制作人：${draft.owner_username} · 用户 ID ${draft.owner_user_id}。此页仅预览，不修改原设计。` : "当前账号仅可查看，不能修改或保存此设计。"}</p>
        </div>
        <button
          type="button"
          className="workspace-button secondary"
          onClick={onBack}
        >
          返回工作台
        </button>
      </header>
      {error ? (
        <p role="alert" className="workspace-inline-error">
          {error}
        </p>
      ) : !design ? (
        <p role="status">正在读取设计…</p>
      ) : template ? (
        <section className="read-only-panels" aria-label="设计裁片预览">
          {Object.entries(template.panels)
            .filter(([id]) => design.panels?.[id])
            .map(([id, panel]) => (
              <PanelPreview
                key={id}
                title={panel.name || id}
                design={design}
                panelId={id}
                templateDefinition={template}
              />
            ))}
        </section>
      ) : (
        <p role="status">该设计使用的模板当前不可用。</p>
      )}
    </main>
  );
}
