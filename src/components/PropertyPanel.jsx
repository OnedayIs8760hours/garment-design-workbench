import React from "react";
import { fillPanelSize } from "../elements.js";

// 属性面板组件，用于编辑当前选中元素的通用属性。
export function PropertyPanel({ element, panel, asset, updateElement }) {
  const fillPanel = () => {
    updateElement(element.id, {
      centerX: 0.5,
      centerY: 0.5,
      rotation: 0,
      ...fillPanelSize(asset?.originalWidth / asset?.originalHeight, panel.logicalSize.width / panel.logicalSize.height),
    });
  };

  return (
    <div className="props">
      {element.type === "image" && (
        <button type="button" onClick={fillPanel}>铺满</button>
      )}
      {element.type === "text" && (
        <label>
          内容
          <input value={element.text} onChange={(event) => updateElement(element.id, { text: event.target.value })} />
        </label>
      )}
      <NumberInput label="X" value={element.centerX} onChange={(centerX) => updateElement(element.id, { centerX })} />
      <NumberInput label="Y" value={element.centerY} onChange={(centerY) => updateElement(element.id, { centerY })} />
      <NumberInput label="宽" value={element.width} onChange={(width) => updateElement(element.id, { width })} />
      <NumberInput label="高" value={element.height} onChange={(height) => updateElement(element.id, { height })} />
      <NumberInput label="旋转" value={Math.round(element.rotation)} step="1" onChange={(rotation) => updateElement(element.id, { rotation })} />
      <label>
        透明度
        <input type="range" min="0.1" max="1" step="0.05" value={element.opacity} onChange={(event) => updateElement(element.id, { opacity: Number(event.target.value) })} />
      </label>
      {element.type === "text" && (
        <>
          <label>
            填充
            <input type="color" value={element.fill} onChange={(event) => updateElement(element.id, { fill: event.target.value })} />
          </label>
          <label>
            描边
            <input type="color" value={element.stroke} onChange={(event) => updateElement(element.id, { stroke: event.target.value })} />
          </label>
        </>
      )}
    </div>
  );
}

// 数字输入控件，统一处理属性面板里的数值字段。
function NumberInput({ label, value, step = "0.01", onChange }) {
  return (
    <label>
      {label}
      <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
