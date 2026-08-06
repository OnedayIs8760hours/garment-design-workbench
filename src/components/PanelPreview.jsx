import React from "react";
import { template } from "../config.js";
import { cssClipPath } from "../geometry.js";

export function PanelPreview({ title, design, panelId }) {
  const panelState = design.panels[panelId];
  const panelTemplate = template.panels[panelId];
  return (
    <div className="panel-preview">
      <h3>{title}</h3>
      <div className="panel-preview-canvas">
        <img className="panel-preview-bg" src={panelTemplate.templateImage} alt="" />
        <div className="panel-preview-elements" style={{ clipPath: cssClipPath(panelTemplate) }}>
          {panelState.elements
            .filter((element) => element.visible)
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((element) => (
              <PreviewElement key={element.id} element={element} asset={design.assets.find((asset) => asset.assetId === element.assetId)} />
            ))}
        </div>
      </div>
    </div>
  );
}

function PreviewElement({ element, asset }) {
  const style = {
    left: `${element.centerX * 100}%`,
    top: `${element.centerY * 100}%`,
    width: `${element.width * 100}%`,
    height: `${element.height * 100}%`,
    opacity: element.opacity,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
    zIndex: element.zIndex,
  };
  if (element.type === "image") return <img className="preview-element" style={style} src={asset?.dataUrl} alt="" />;
  return (
    <div className="preview-element preview-text" style={{ ...style, color: element.fill, WebkitTextStroke: `1px ${element.stroke}` }}>
      {element.text}
    </div>
  );
}
