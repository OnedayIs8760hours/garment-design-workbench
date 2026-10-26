import React from "react";
import { ArrowRight, CheckCircle2, Download } from "lucide-react";

export function FinishedWorkspace({ onNavigate }) {
  return (
    <main className="workspace-page" aria-labelledby="finishedWorkspaceTitle">
      <header className="workspace-page-heading">
        <div><p className="workspace-eyebrow">FINISHED WORKS</p><h1 id="finishedWorkspaceTitle">成品</h1><p>查看已归档的设计成果与导出记录。</p></div>
      </header>
      <section className="workspace-empty-state finished-empty" aria-labelledby="finishedEmptyTitle">
        <div className="workspace-empty-icon"><CheckCircle2 size={22} aria-hidden="true" /></div>
        <h2 id="finishedEmptyTitle">成品归档尚未接入</h2>
        <p>当前系统保存设计草稿，导出的设计包会下载到本地，暂时没有成品状态或归档记录可供展示。</p>
        <div className="finished-empty-actions">
          <button className="workspace-button primary" type="button" onClick={() => onNavigate("design")}>继续编辑草稿<ArrowRight size={15} aria-hidden="true" /></button>
          <span><Download size={15} aria-hidden="true" />设计包可从编辑器导出到本地</span>
        </div>
      </section>
    </main>
  );
}
