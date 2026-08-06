import React from "react";
import { garmentColors, sampleAsset } from "../config.js";

export function ToolsSidebar({ design, commit, addImage, addText, onUpload }) {
  return (
    <aside className="sidebar">
      <section className="tool-panel">
        <h2>素材</h2>
        <label className="upload">
          上传图片
          <input type="file" accept="image/*" onChange={onUpload} />
        </label>
        <button onClick={() => addImage(sampleAsset)}>添加示例图案</button>
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
              className={color === design.garmentColor ? "swatch active" : "swatch"}
              style={{ backgroundColor: color }}
              onClick={() => commit((draft) => { draft.garmentColor = color; })}
              aria-label={`选择颜色 ${color}`}
            />
          ))}
        </div>
      </section>

      <section className="tool-panel">
        <h2>素材清单</h2>
        <div className="asset-list">
          {design.assets.map((asset) => (
            <button key={asset.assetId} onClick={() => addImage(asset)}>{asset.name}</button>
          ))}
        </div>
      </section>
    </aside>
  );
}
