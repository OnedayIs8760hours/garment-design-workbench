import React from "react";
import { template } from "../config.js";
import { QuickGarmentPreview } from "./QuickGarmentPreview.jsx";

export function PreviewPane({ design, validation }) {
  return (
    <aside className="preview">
      <div className="preview-head">
        <h2>整体预览</h2>
        <div className="segmented">
          <button className="active">正背</button>
          <button>单面</button>
        </div>
      </div>
      <div className="preview-grid">
        {Object.entries(template.panels).map(([panelId, panel]) => (
          <div className="panel-preview" key={panelId}>
            <h3>{panel.name}</h3>
            <QuickGarmentPreview design={design} panelId={panelId} />
          </div>
        ))}
      </div>
      <p className="hint">当前为快速预览，最终真实效果以高清效果图为准。</p>
      <section className="tool-panel">
        <h2>校验</h2>
        {validation.errors.length ? validation.errors.map((error) => <p className="error" key={error}>{error}</p>) : <p className="ok">基础校验通过</p>}
        {validation.warnings.map((warning) => <p className="warn" key={warning}>{warning}</p>)}
      </section>
    </aside>
  );
}
