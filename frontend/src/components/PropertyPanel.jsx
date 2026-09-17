import React from "react";
import { Maximize } from "lucide-react";
import { fillPanelSize } from "../elements.js";

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
        <button type="button" onClick={fillPanel}>
          <Maximize size={16} aria-hidden="true" />
          铺满裁片
        </button>
      )}
      {element.type === "text" && (
        <label>
          内容
          <input value={element.text} onChange={(event) => updateElement(element.id, { text: event.target.value })} />
        </label>
      )}
      <NumberInput label="X" value={element.centerX} onChange={(centerX) => updateElement(element.id, { centerX })} />
      <NumberInput label="Y" value={element.centerY} onChange={(centerY) => updateElement(element.id, { centerY })} />
      <NumberInput label="宽度" value={element.width} onChange={(width) => updateElement(element.id, { width })} />
      <NumberInput label="高度" value={element.height} onChange={(height) => updateElement(element.id, { height })} />
      <NumberInput label="旋转" value={Math.round(element.rotation)} step="1" onChange={(rotation) => updateElement(element.id, { rotation })} />
      <label>
        不透明度
        <input type="range" min="0.1" max="1" step="0.05" value={element.opacity} onChange={(event) => updateElement(element.id, { opacity: Number(event.target.value) })} />
      </label>
      {element.type === "text" && (
        <>
          <label>
            填充
            <ColorInput value={element.fill} onCommit={(fill) => updateElement(element.id, { fill })} />
          </label>
          <label>
            描边
            <ColorInput value={element.stroke} onCommit={(stroke) => updateElement(element.id, { stroke })} />
          </label>
        </>
      )}
    </div>
  );
}

function NumberInput({ label, value, step = "0.01", onChange }) {
  return (
    <label>
      {label}
      <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ColorInput({ value, onCommit }) {
  const [draft, setDraft] = React.useState(value);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  const scheduleCommit = (next) => {
    setDraft(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (next !== value) onCommit(next);
    }, 300);
  };

  const flushCommit = () => {
    clearTimeout(timerRef.current);
    if (draft !== value) onCommit(draft);
  };

  return <input type="color" value={draft} onChange={(event) => scheduleCommit(event.target.value)} onBlur={flushCommit} />;
}
