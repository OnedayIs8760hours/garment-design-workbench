import React from "react";
import { getPanelStatus } from "../model.js";
import { template } from "../config.js";
import { currentElements } from "../designStore.js";
import { elementLabel } from "../elements.js";
import { PropertyPanel } from "./PropertyPanel.jsx";

export function EditorRibbon() {
  return (
    <div className="editor-ribbon">
      <div>
        <strong>真实前片模板已加载</strong>
        <span>素材会裁切在绿色前片区域内，导出 JSON 记录相对坐标和原始模板尺寸。</span>
      </div>
      <div className="ribbon-stats">
        <span>相对坐标</span>
        <span>本地草稿</span>
        <span>Konva</span>
      </div>
    </div>
  );
}

export function PanelTabs({ design, commit }) {
  return (
    <div className="panel-tabs">
      {Object.entries(template.panels).map(([panelId, panel]) => (
        <button
          key={panelId}
          className={panelId === design.currentPanelId ? "active" : ""}
          onClick={() => commit((draft) => { draft.currentPanelId = panelId; })}
        >
          {panel.name}
          <span>{getPanelStatus(design.panels[panelId])}</span>
        </button>
      ))}
    </div>
  );
}

export function BottomPanels({ design, selected, selectedId, select, updateElement, moveLayer, removeSelected }) {
  return (
    <div className="bottom-panels">
      <section>
        <h2>属性</h2>
        {selected ? <PropertyPanel element={selected} updateElement={updateElement} /> : <p className="muted">选择画布元素后编辑属性</p>}
      </section>

      <section>
        <h2>图层</h2>
        <div className="layer-list">
          {currentElements(design).toReversed().map((element) => (
            <div key={element.id} className={element.id === selectedId ? "layer active" : "layer"}>
              <button onClick={() => select(element.id)}>{elementLabel(element)}</button>
              <button onClick={() => moveLayer(element.id, 1)}>上移</button>
              <button onClick={() => moveLayer(element.id, -1)}>下移</button>
            </div>
          ))}
        </div>
        <button disabled={!selectedId} onClick={removeSelected}>删除选中</button>
      </section>
    </div>
  );
}
