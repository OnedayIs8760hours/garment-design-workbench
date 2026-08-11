import React from "react";
import { firstPanel, template } from "../config.js";

// 顶部栏组件，显示项目状态和全局操作按钮。
export function Header({ status, totalElements, validation, canUndo, canReset, onUndo, onReset, onSave, onExportPackage }) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <p>裁片定制工作台</p>
        <strong>{template.name}</strong>
        <span>模板 V{template.templateVersion} · {firstPanel.logicalSize.width} x {firstPanel.logicalSize.height} · {status}</span>
      </div>
      <div className="top-metrics">
        <span>裁片 {Object.keys(template.panels).length}</span>
        <span>元素 {totalElements}</span>
        <span className={validation.passed ? "metric-ok" : "metric-error"}>{validation.passed ? "可导出" : "需修正"}</span>
      </div>
      <div className="actions">
        <button onClick={onUndo} disabled={!canUndo}>撤销</button>
        <button onClick={onReset} disabled={!canReset}>重做</button>
        <button onClick={onSave}>保存草稿</button>
        <button onClick={onExportPackage}>导出设计包</button>
      </div>
    </header>
  );
}
