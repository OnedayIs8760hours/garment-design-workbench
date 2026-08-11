import React from "react";
import { garmentColors } from "../config.js";

// 左侧工具栏，负责上传素材、添加文字、切换颜色和复用素材。
export function ToolsSidebar({ design, addImage, addText, onUpload, clearAssets, applyPanelColor }) {
  const visibleAssets = design.assets.filter((asset) => !asset.internal);
  const panelColorElement = design.panels[design.currentPanelId].elements.find((element) => element.role === "panel-color");
  const activeColor = design.assets.find((asset) => asset.assetId === panelColorElement?.assetId)?.color ?? design.garmentColor;

  return (
    <aside className="sidebar">
      <section className="tool-panel">
        <h2>素材</h2>
        <label className="upload">
          上传图片
          <input type="file" accept="image/*" onChange={onUpload} />
        </label>
      </section>

      <section className="tool-panel accent-panel">
        <h2>文字</h2>
        <button onClick={() => addText("name")}>添加姓名</button>
        <button onClick={() => addText("number")}>添加号码</button>
      </section>

      <section className="tool-panel">
        <h2>服装颜色</h2>
        <div className="swatches">
          {garmentColors.map((color) => (
            <button
              key={color}
              className={color === activeColor ? "swatch active" : "swatch"}
              style={{ backgroundColor: color }}
              onClick={() => applyPanelColor(color)}
              aria-label={`选择颜色 ${color}`}
            />
          ))}
        </div>
      </section>

      <section className="tool-panel">
        <h2>素材清单</h2>
        <button className="danger-button" onClick={clearAssets} disabled={!visibleAssets.length}>清空素材清单</button>
        <div className="asset-list">
          {visibleAssets.map((asset) => (
            <button key={asset.assetId} onClick={() => addImage(asset)}>{asset.name}</button>
          ))}
        </div>
      </section>
    </aside>
  );
}
