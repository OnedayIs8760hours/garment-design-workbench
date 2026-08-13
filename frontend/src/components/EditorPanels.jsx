import React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
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
  const selectedAsset = design.assets.find((asset) => asset.assetId === selected?.assetId);

  return (
    <div className="bottom-panels">
      <section>
        <h2>Properties</h2>
        {selected ? (
          <PropertyPanel
            element={selected}
            panel={design.panels[design.currentPanelId]}
            asset={selectedAsset}
            updateElement={updateElement}
          />
        ) : <p className="muted">Select an element on the canvas to edit its properties.</p>}
      </section>

      <section>
        <h2>Layers</h2>
        <div className="layer-list">
          {currentElements(design).toReversed().map((element) => (
            <div key={element.id} className={element.id === selectedId ? "layer active" : "layer"}>
              <button onClick={() => select(element.id)}>{elementLabel(element)}</button>
              <button onClick={() => moveLayer(element.id, 1)} aria-label="Move layer up"><ArrowUp size={15} aria-hidden="true" /></button>
              <button onClick={() => moveLayer(element.id, -1)} aria-label="Move layer down"><ArrowDown size={15} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <button disabled={!selectedId} onClick={removeSelected}>
          <Trash2 size={16} aria-hidden="true" />
          Delete selected
        </button>
      </section>
    </div>
  );
}
