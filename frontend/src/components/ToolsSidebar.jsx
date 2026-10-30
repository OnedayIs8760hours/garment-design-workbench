import React from "react";
import {
  BadgeCheck,
  BookOpen,
  Box,
  Brush,
  Image,
  Layers,
  Package,
  Palette,
  Pipette,
  PenLine,
  Upload,
  WandSparkles,
} from "lucide-react";
import { garmentColors, normalizeColor } from "../config.js";
import { currentElements } from "../designStore.js";
import { elementLabel } from "../elements.js";

export function ToolsSidebar({
  design,
  addImage,
  addText,
  onUpload,
  clearAssets,
  onGenerateMaterial,
  applyPanelColor,
  applyAllPanelColors,
  collapsed,
  onExpandSidebar,
  drafts,
  onOpenDraft,
  onRefreshDrafts,
}) {
  const [activeTool, setActiveTool] = React.useState("fill");
  const [applyToAll, setApplyToAll] = React.useState(false);
  const [rgbOpen, setRgbOpen] = React.useState(false);
  const [hue, setHue] = React.useState(0);
  const [picker, setPicker] = React.useState({ s: 1, v: 1 });
  const rgbPickerRef = React.useRef(null);
  const visibleAssets = design.assets.filter((asset) => !asset.internal);
  const panelColorElement = design.panels[design.currentPanelId].elements.find((element) => element.role === "panel-color");
  const activeColor = design.assets.find((asset) => asset.assetId === panelColorElement?.assetId)?.color ?? design.garmentColor;
  const [customRgb, setCustomRgb] = React.useState(() => parseRgb(activeColor));
  const tools = [
    ["product", Package, "产品"],
    ["uploads", Upload, "素材"],
    ["text", PenLine, "文字"],
    ["saved", BookOpen, "草稿"],
    ["clipart", Image, "图形"],
    ["quick", BadgeCheck, "预设"],
    ["fill", Palette, "颜色"],
    ["layers", Layers, "图层"],
  ];
  const chooseColor = (color) => (applyToAll ? applyAllPanelColors(color) : applyPanelColor(color));
  const customColor = rgbString(customRgb);
  const hueColor = rgbString(hueToRgb(hue));
  const layers = currentElements(design).toReversed();
  const setAndChooseRgb = (rgb, syncPicker = true) => {
    setCustomRgb(rgb);
    if (syncPicker) {
      const hsv = rgbToHsv(rgb);
      setHue(hsv.h);
      setPicker({ s: hsv.s, v: hsv.v });
    }
    chooseColor(rgbString(rgb));
  };
  const pickPanelColor = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextPicker = {
      s: clamp01((event.clientX - rect.left) / rect.width),
      v: clamp01(1 - ((event.clientY - rect.top) / rect.height)),
    };
    setPicker(nextPicker);
    setAndChooseRgb(hsvToRgb(hue, nextPicker.s, nextPicker.v), false);
  };
  const pickScreenColor = async () => {
    if (!window.EyeDropper) return;
    const result = await new window.EyeDropper().open();
    setAndChooseRgb(parseRgb(normalizeColor(result.sRGBHex)));
  };

  React.useEffect(() => {
    const rgb = parseRgb(activeColor);
    const hsv = rgbToHsv(rgb);
    setCustomRgb(rgb);
    setHue(hsv.h);
    setPicker({ s: hsv.s, v: hsv.v });
  }, [activeColor]);

  React.useEffect(() => {
    if (!rgbOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rgbPickerRef.current?.contains(event.target)) setRgbOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => window.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [rgbOpen]);

  return (
    <aside className="sidebar">
      <nav className="tool-rail" aria-label="设计工具">
        {tools.map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            className={id === activeTool ? "tool-rail-button active" : "tool-rail-button"}
            onClick={() => {
              setActiveTool(id);
              if (collapsed) onExpandSidebar();
            }}
            title={label}
            aria-label={label}
          >
            <Icon className="tool-rail-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {!collapsed && (
        <div className="tool-drawer">
          {activeTool === "product" && (
            <section className="tool-panel">
              <h2>产品</h2>
              <div className="tool-summary">
                <strong>{design.size}</strong>
                <span>{design.templateId}</span>
                <span>当前裁片：{design.currentPanelId}</span>
              </div>
            </section>
          )}

          {activeTool === "uploads" && (
            <section className="tool-panel">
              <h2>素材</h2>
              {onUpload && <label className="upload upload-wide">
                <Upload size={16} aria-hidden="true" />
                上传图片
                <input type="file" accept="image/*" onChange={onUpload} />
              </label>}
              {onGenerateMaterial && <button type="button" className="material-picker-trigger" onClick={onGenerateMaterial}>
                <WandSparkles size={16} aria-hidden="true" />生成 / 选择云端素材
              </button>}
              <div className="asset-list">
                {visibleAssets.map((asset) => (
                  <button key={asset.assetId} onClick={() => addImage(asset)}>{asset.name}</button>
                ))}
              </div>
              {clearAssets && <button className="danger-button" onClick={clearAssets} disabled={!visibleAssets.length}>清空素材</button>}
            </section>
          )}

          {activeTool === "text" && (
            <section className="tool-panel">
              <h2>文字</h2>
              <button onClick={() => addText("name")}><PenLine size={16} aria-hidden="true" />添加姓名</button>
              <button onClick={() => addText("number")}><Box size={16} aria-hidden="true" />添加号码</button>
            </section>
          )}

          {activeTool === "fill" && (
            <section className="tool-panel fill-panel">
              <label className="tool-check">
                <input type="checkbox" checked={applyToAll} onChange={(event) => setApplyToAll(event.target.checked)} />
                <span>底色应用到所有裁片</span>
              </label>
              <div className="sidebar-tabs" role="tablist" aria-label="填充类型">
                <button className="active" type="button"><Palette size={14} aria-hidden="true" />颜色</button>
                <button type="button" disabled><Brush size={14} aria-hidden="true" />图形</button>
                <button type="button" disabled><Image size={14} aria-hidden="true" />图案</button>
              </div>
              <div className="swatches-wrap" ref={rgbPickerRef}>
                {rgbOpen && (
                  <div className="rgb-popover">
                    <div
                      className="rgb-field"
                      style={{
                        "--hue-color": hueColor,
                        "--cursor-x": `${picker.s * 100}%`,
                        "--cursor-y": `${(1 - picker.v) * 100}%`,
                      }}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        pickPanelColor(event);
                      }}
                      onPointerMove={(event) => {
                        if (event.buttons === 1) pickPanelColor(event);
                      }}
                    >
                      <span className="rgb-cursor" aria-hidden="true" />
                    </div>
                    <div className="rgb-controls">
                      <button
                        className="rgb-eyedropper"
                        type="button"
                        onClick={pickScreenColor}
                        aria-label="拾取屏幕颜色"
                        title="拾取屏幕颜色"
                        disabled={!window.EyeDropper}
                      >
                        <Pipette size={16} aria-hidden="true" />
                      </button>
                      <span className="rgb-preview" style={{ backgroundColor: customColor }} />
                      <input
                        className="rgb-hue"
                        type="range"
                        min="0"
                        max="360"
                        value={hue}
                        onChange={(event) => {
                          const nextHue = Number(event.target.value);
                          const rgb = hsvToRgb(nextHue, picker.s, picker.v);
                          setHue(nextHue);
                          setAndChooseRgb(rgb, false);
                        }}
                        aria-label="色相"
                      />
                    </div>
                    <div className="rgb-inputs">
                      {["r", "g", "b"].map((channel) => (
                        <label key={channel}>
                          <input
                            type="number"
                            min="0"
                            max="255"
                            value={customRgb[channel]}
                            onChange={(event) => setAndChooseRgb({ ...customRgb, [channel]: clampRgb(event.target.value) })}
                          />
                          <span>{channel.toUpperCase()}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="swatches">
                  <button
                    type="button"
                    className="swatch rgb-swatch"
                    onClick={() => setRgbOpen(!rgbOpen)}
                    aria-label="打开 RGB 取色器"
                  />
                  {garmentColors.map((color) => (
                    <button
                      key={color}
                      className={color === activeColor ? "swatch active" : "swatch"}
                      style={{ backgroundColor: color }}
                      onClick={() => chooseColor(color)}
                      aria-label={`选择颜色 ${color}`}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {["saved", "clipart", "quick"].includes(activeTool) && (
            <section className="tool-panel">
              <h2>{tools.find(([id]) => id === activeTool)?.[2]}</h2>
              {activeTool === "saved" ? (
                <>
                  <button type="button" onClick={onRefreshDrafts}>刷新草稿箱</button>
                  <div className="asset-list compact-list">
                    {drafts.map((draft) => (
                      <button key={`${draft.template_id}:${draft.order_id}`} type="button" onClick={() => onOpenDraft(draft.order_id)}>
                        <strong>{draft.order_id}</strong>
                        <span>{draft.template_id} · {formatDraftDate(draft.updated_at)}</span>
                      </button>
                    ))}
                    {!drafts.length && <span className="muted">暂无已保存草稿。</span>}
                  </div>
                </>
              ) : <p className="muted">暂无内容。</p>}
            </section>
          )}

          {activeTool === "layers" && (
            <section className="tool-panel">
              <h2>图层</h2>
              <div className="asset-list compact-list">
                {layers.map((element) => (
                  <span key={element.id}>{elementLabel(element)}</span>
                ))}
                {!layers.length && <span className="muted">当前裁片没有图层。</span>}
              </div>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

function formatDraftDate(value) {
  if (!value) return "未记录时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未记录时间" : date.toLocaleString();
}

function clampRgb(value) {
  return Math.min(255, Math.max(0, Number.parseInt(value, 10) || 0));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function parseRgb(color) {
  const normalized = normalizeColor(color);
  const match = normalized?.match(/\d+/g);
  const [r = 0, g = 0, b = 0] = match?.map(clampRgb) ?? [];
  return { r, g, b };
}

function rgbString({ r, g, b }) {
  return `rgb(${clampRgb(r)}, ${clampRgb(g)}, ${clampRgb(b)})`;
}

function hueToRgb(hue) {
  const sector = ((hue % 360) + 360) % 360 / 60;
  const x = Math.round(255 * (1 - Math.abs((sector % 2) - 1)));
  if (sector < 1) return { r: 255, g: x, b: 0 };
  if (sector < 2) return { r: x, g: 255, b: 0 };
  if (sector < 3) return { r: 0, g: 255, b: x };
  if (sector < 4) return { r: 0, g: x, b: 255 };
  if (sector < 5) return { r: x, g: 0, b: 255 };
  return { r: 255, g: 0, b: x };
}

function hsvToRgb(hue, saturation, value) {
  const pure = hueToRgb(hue);
  return {
    r: Math.round((pure.r * saturation + 255 * (1 - saturation)) * value),
    g: Math.round((pure.g * saturation + 255 * (1 - saturation)) * value),
    b: Math.round((pure.b * saturation + 255 * (1 - saturation)) * value),
  };
}

function rgbToHsv({ r, g, b }) {
  const red = clampRgb(r) / 255;
  const green = clampRgb(g) / 255;
  const blue = clampRgb(b) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (!delta) return { h: 0, s: 0, v: max };
  const hue = max === red
    ? 60 * (((green - blue) / delta) % 6)
    : max === green
      ? 60 * ((blue - red) / delta + 2)
      : 60 * ((red - green) / delta + 4);
  return {
    h: Math.round((hue + 360) % 360),
    s: max ? delta / max : 0,
    v: max,
  };
}
