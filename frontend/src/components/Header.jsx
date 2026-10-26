import React from "react";
import { ArrowLeft, Download, FilePlus2, LogOut, RotateCcw, Save, Undo2, Upload, WandSparkles } from "lucide-react";
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
  onNewDesign,
  onBackHome,
  onExportPackage,
  onImportPsd,
  onGenerateMaterial,
  onTemplateChange,
  onSignOut,
  user,
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
        <span>
          模板 V{template.templateVersion} · {firstPanel.logicalSize.width} x {firstPanel.logicalSize.height} · {status}
          {user?.username ? ` · ${user.username}` : ""}
        </span>
      </div>
      <div className="top-metrics">
        <span>裁片 {Object.keys(template.panels).length}</span>
        <span>元素 {totalElements}</span>
        <span className={validation.passed ? "metric-ok" : "metric-error"}>{validation.passed ? "可导出" : "需检查"}</span>
      </div>
      <div className="actions">
        <button type="button" onClick={onGenerateMaterial}>
          <WandSparkles size={16} aria-hidden="true" />素材生成
        </button>
        <button type="button" onClick={onBackHome}>
          <ArrowLeft size={16} aria-hidden="true" />
          我的草稿
        </button>
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
        <button type="button" onClick={onNewDesign}>
          <FilePlus2 size={16} aria-hidden="true" />
          新建设计
        </button>
        <button type="button" className="primary-action" onClick={onExportPackage}>
          <Download size={16} aria-hidden="true" />
          导出压缩包
        </button>
        <button type="button" onClick={onImportPsd}>
          <Upload size={16} aria-hidden="true" />
          导入 PSD
        </button>
        <button type="button" onClick={onSignOut}>
          <LogOut size={16} aria-hidden="true" />
          退出登录
        </button>
      </div>
    </header>
  );
}
