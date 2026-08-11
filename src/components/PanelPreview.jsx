import React from "react";
import { template } from "../config.js";
import { cssClipPath } from "../geometry.js";

// 单个裁片的小尺寸 2D 预览。
export function PanelPreview({ title, design, panelId }) {
  // 当前裁片的编辑状态。
  const panelState = design.panels[panelId];
  // 当前裁片的模板元数据。
  const panelTemplate = template.panels[panelId];
  return (
    <div className="panel-preview">
      <h3>{title}</h3>
      <div className="panel-preview-canvas" style={{ aspectRatio: `${panelTemplate.logicalSize.width} / ${panelTemplate.logicalSize.height}` }}>
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

// 裁片预览里的单个元素渲染。
function PreviewElement({ element, asset }) {
  // 将元素相对坐标转换成 CSS 定位样式。
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
