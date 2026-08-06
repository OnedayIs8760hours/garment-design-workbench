import React from "react";

export function QuickGarmentPreview({ design, panelId }) {
  const panel = design.panels[panelId];
  return (
    <div className="garment-preview">
      <div className="shirt-shape" style={{ backgroundColor: design.garmentColor }}>
        <div className="shirt-art-target">
          {panel.elements
            .filter((element) => element.visible)
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((element) => (
              <GarmentElement key={element.id} element={element} asset={design.assets.find((asset) => asset.assetId === element.assetId)} />
            ))}
        </div>
        <div className="shirt-neck" />
        <div className="shirt-light side" />
        <div className="shirt-light vertical" />
      </div>
    </div>
  );
}

function GarmentElement({ element, asset }) {
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
