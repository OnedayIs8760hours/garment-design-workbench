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
        <p>服装定制工作台</p>
        <label className="template-switcher">
          <span>模板</span>
          <select value={template.templateId} onChange={(event) => onTemplateChange(event.target.value)}>
            {templateOptions.map((option) => (
              <option key={option.templateId} value={option.templateId}>{option.label}</option>
            ))}
          </select>
        </label>
        <span>模板 V{template.templateVersion} · {firstPanel.logicalSize.width} x {firstPanel.logicalSize.height} · {status}</span>
      </div>
      <div className="top-metrics">
        <span>裁片 {Object.keys(template.panels).length}</span>
        <span>元素 {totalElements}</span>
        <span className={validation.passed ? "metric-ok" : "metric-error"}>{validation.passed ? "可导出" : "需检查"}</span>
      </div>
      <div className="actions">
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={16} aria-hidden="true" />
          撤销
        </button>
        <button type="button" onClick={onReset} disabled={!canReset}>
          <RotateCcw size={16} aria-hidden="true" />
          重置
        </button>
        <button type="button" onClick={onSave}>
          <Save size={16} aria-hidden="true" />
          保存草稿
        </button>
        <button type="button" className="primary-action" onClick={onExportPackage}>
          <Download size={16} aria-hidden="true" />
          导出压缩包
        </button>
      </div>
    </header>
  );
}
