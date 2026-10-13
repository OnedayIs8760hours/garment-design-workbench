import React from "react";
import { ArrowRight, Layers3, Search, Shirt } from "lucide-react";
import { createTemplate } from "../model.js";
import { templateDefinitions } from "../../templates/index.js";

export function TemplateLibrary({ onStartDesign }) {
  const [search, setSearch] = React.useState("");
  const templates = Object.entries(templateDefinitions).map(([templateId, definition]) => {
    const template = createTemplate(definition);
    return {
      templateId,
      definition,
      template,
      preview: template.panels[template.defaultPanelId]?.templateImage,
      panelCount: Object.keys(template.panels).length,
    };
  });
  const filteredTemplates = templates.filter(({ templateId, definition }) =>
    `${templateId} ${definition.label || ""} ${(definition.sizes || []).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <main className="workspace-page" aria-labelledby="templateLibraryTitle">
      <header className="workspace-page-heading">
        <div><p className="workspace-eyebrow">PRODUCT LIBRARY</p><h1 id="templateLibraryTitle">产品模板</h1><p>从已导入的服装模板开始设计。模板信息来自项目资源目录。</p></div>
        <div className="workspace-heading-stat"><strong>{templates.length}</strong><span>个可用模板</span></div>
      </header>

      <label className="workspace-search">
        <Search size={17} aria-hidden="true" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、模板编号或尺码" aria-label="搜索产品模板" />
        {search && <button type="button" onClick={() => setSearch("")} aria-label="清空搜索">清除</button>}
      </label>

      {filteredTemplates.length ? (
        <section className="template-grid" aria-label="可用服装模板">
          {filteredTemplates.map(({ templateId, definition, template, preview, panelCount }) => (
            <article className="template-card" key={templateId}>
              <div className="template-preview">{preview ? <img src={preview} alt={`${definition.label || templateId}裁片预览`} /> : <Shirt size={36} aria-hidden="true" />}</div>
              <div className="template-card-content">
                <div className="template-card-meta"><span>{templateId}</span><span>V{template.templateVersion}</span></div>
                <h2>{definition.label || templateId}</h2>
                <div className="template-facts"><span>{(definition.sizes || []).join(" / ")}</span><span><Layers3 size={14} aria-hidden="true" />{panelCount} 个裁片</span></div>
                <button className="workspace-button primary" type="button" onClick={() => onStartDesign(templateId)}>使用此模板<ArrowRight size={16} aria-hidden="true" /></button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="workspace-empty-state" role="status"><div className="workspace-empty-icon"><Search size={21} aria-hidden="true" /></div><h2>没有匹配的模板</h2><p>试试模板名称、编号或尺码。</p><button className="workspace-button secondary" type="button" onClick={() => setSearch("")}>清除搜索</button></section>
      )}
    </main>
  );
}
