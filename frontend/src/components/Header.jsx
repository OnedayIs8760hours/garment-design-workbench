import React from "react";
import { Download, RotateCcw, Save, Undo2 } from "lucide-react";
import { firstPanel, template } from "../config.js";
import { templateOptions } from "../../templates/index.js";

export function Header({
  status,
  totalElements,
  validation,
  canUndo,
  canReset,
  onUndo,
  onReset,
  onSave,
  onExportPackage,
  onTemplateChange,
}) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <p>Garment customization studio</p>
        <label className="template-switcher">
          <span>Template</span>
          <select value={template.templateId} onChange={(event) => onTemplateChange(event.target.value)}>
            {templateOptions.map((option) => (
              <option key={option.templateId} value={option.templateId}>{option.label}</option>
            ))}
          </select>
        </label>
        <span>Template V{template.templateVersion} · {firstPanel.logicalSize.width} x {firstPanel.logicalSize.height} · {status}</span>
      </div>
      <div className="top-metrics">
        <span>Panels {Object.keys(template.panels).length}</span>
        <span>Elements {totalElements}</span>
        <span className={validation.passed ? "metric-ok" : "metric-error"}>{validation.passed ? "Export ready" : "Needs review"}</span>
      </div>
      <div className="actions">
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={16} aria-hidden="true" />
          Undo
        </button>
        <button type="button" onClick={onReset} disabled={!canReset}>
          <RotateCcw size={16} aria-hidden="true" />
          Reset
        </button>
        <button type="button" onClick={onSave}>
          <Save size={16} aria-hidden="true" />
          Save draft
        </button>
        <button type="button" className="primary-action" onClick={onExportPackage}>
          <Download size={16} aria-hidden="true" />
          Export package
        </button>
      </div>
    </header>
  );
}
