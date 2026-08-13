import React from "react";
import { Maximize2, X } from "lucide-react";
import { template } from "../config.js";
import { QuickGarmentPreview } from "./QuickGarmentPreview.jsx";
import { ThreeDPreview } from "./ThreeDPreview.jsx";

export function PreviewPane({ design, validation }) {
  const [mode, setMode] = React.useState("2d");
  const [modelUrl, setModelUrl] = React.useState(template.threeD?.defaultModelUrl ?? "");
  const [isModelExpanded, setIsModelExpanded] = React.useState(false);

  return (
    <>
      <aside className="preview">
        <div className="preview-head">
          <h2>Live preview</h2>
          <div className="segmented" role="tablist" aria-label="Preview mode">
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
            <p className="hint">Fast panel preview. Final production output should be checked against the exported package.</p>
          </>
        )}

        <section className="tool-panel validation-panel">
          <h2>Validation</h2>
          {validation.errors.length
            ? validation.errors.map((error) => <p className="error" key={error}>{error}</p>)
            : <p className="ok">Basic validation passed</p>}
          {validation.warnings.map((warning) => <p className="warn" key={warning}>{warning}</p>)}
        </section>
      </aside>

      {isModelExpanded && (
        <div className="model-modal" role="dialog" aria-modal="true" aria-label="Large 3D model preview">
          <div className="model-modal-head">
            <h2>3D model preview</h2>
            <button type="button" onClick={() => setIsModelExpanded(false)}>
              <X size={16} aria-hidden="true" />
              Close
            </button>
          </div>
          <ThreeDPreview design={design} modelUrl={modelUrl} setModelUrl={setModelUrl} large />
        </div>
      )}
    </>
  );
}
