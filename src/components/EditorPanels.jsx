import React from "react";
import { getPanelStatus } from "../model.js";
import { template } from "../config.js";
import { currentElements } from "../designStore.js";
import { elementLabel } from "../elements.js";
import { PropertyPanel } from "./PropertyPanel.jsx";

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
