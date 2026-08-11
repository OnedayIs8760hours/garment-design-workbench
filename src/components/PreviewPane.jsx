import React from "react";
import { template } from "../config.js";
import { QuickGarmentPreview } from "./QuickGarmentPreview.jsx";
import { ThreeDPreview } from "./ThreeDPreview.jsx";

// 右侧整体预览区域，负责在 3D 和 2D 预览间切换。
export function PreviewPane({ design, validation }) {
  // 当前预览模式。
  const [mode, setMode] = React.useState("3d");
  const [modelUrl, setModelUrl] = React.useState(template.threeD?.defaultModelUrl ?? "");
  const [isModelExpanded, setIsModelExpanded] = React.useState(false);

  return (
    <>
      <aside className="preview">
        <div className="preview-head">
          <h2>整体预览</h2>
          <div className="segmented">
            <button className={mode === "3d" ? "active" : ""} onClick={() => setMode("3d")}>3D</button>
            <button className={mode === "2d" ? "active" : ""} onClick={() => setMode("2d")}>2D</button>
          </div>
        </div>

        {mode === "3d" ? (
          <ThreeDPreview design={design} modelUrl={modelUrl} setModelUrl={setModelUrl} onExpand={() => setIsModelExpanded(true)} />
        ) : (
          <>
            <div className="preview-grid">
              {Object.entries(template.panels).map(([panelId, panel]) => (
                <div className="panel-preview" key={panelId}>
                  <h3>{panel.name}</h3>
                  <QuickGarmentPreview design={design} panelId={panelId} />
                </div>
              ))}
            </div>
            <p className="hint">当前为快速预览，最终真实效果以高清效果图为准。</p>
          </>
        )}

        <section className="tool-panel">
          <h2>校验</h2>
          {validation.errors.length ? validation.errors.map((error) => <p className="error" key={error}>{error}</p>) : <p className="ok">基础校验通过</p>}
          {validation.warnings.map((warning) => <p className="warn" key={warning}>{warning}</p>)}
        </section>
      </aside>

      {isModelExpanded && (
        <div className="model-modal" role="dialog" aria-modal="true" aria-label="3D模型大预览">
          <div className="model-modal-head">
            <h2>3D模型预览</h2>
            <button onClick={() => setIsModelExpanded(false)}>关闭</button>
          </div>
          <ThreeDPreview design={design} modelUrl={modelUrl} setModelUrl={setModelUrl} large />
        </div>
      )}
    </>
  );
}
