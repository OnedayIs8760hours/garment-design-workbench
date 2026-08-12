import React from "react";
import { template } from "../config.js";
import { textFontFor } from "../fontMap.js";
import { textFontSizeForBox } from "../textMetrics.js";

// 快速 2D 裁片预览，使用 mask 把元素限制在裁片内。
export function QuickGarmentPreview({ design, panelId }) {
  // 当前裁片的设计状态。
  const panel = design.panels[panelId];
  // 当前裁片的模板数据。
  const panelTemplate = template.panels[panelId];
  // CSS mask 样式，让素材只显示在裁片区域。
  const maskStyle = {
    WebkitMaskImage: `url(${panelTemplate.maskImage})`,
    maskImage: `url(${panelTemplate.maskImage})`,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };

  return (
    <div className="garment-preview" style={{ aspectRatio: `${panelTemplate.logicalSize.width} / ${panelTemplate.logicalSize.height}` }}>
      <img className="garment-preview-bg" src={panelTemplate.templateImage} alt="" />
      <GuideOverlay panel={panelTemplate} />
      <div className="garment-preview-elements" style={maskStyle}>
        {panel.elements
          .filter((element) => element.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((element) => (
            <GarmentElement key={element.id} element={element} asset={design.assets.find((asset) => asset.assetId === element.assetId)} />
          ))}
      </div>
    </div>
  );
}

// 在预览中绘制裁片辅助线。
function GuideOverlay({ panel }) {
  return (
    <svg className="garment-preview-guides" viewBox={`0 0 ${panel.logicalSize.width} ${panel.logicalSize.height}`} aria-hidden="true">
      {panel.guides?.map((guide) => {
        // 当前辅助线样式。
        const style = guide.style ?? {};
        // SVG 辅助线通用属性。
        const common = {
          fill: "none",
          stroke: style.stroke ?? "#0f766e",
          strokeWidth: style.strokeWidth ?? 1,
          strokeDasharray: (style.dash ?? []).join(" "),
          vectorEffect: "non-scaling-stroke",
        };

        if (guide.type === "line") {
          return <line key={guide.id} x1={guide.from[0]} y1={guide.from[1]} x2={guide.to[0]} y2={guide.to[1]} {...common} />;
        }

        if (guide.type === "path") {
          // path 辅助线转换后的 SVG points 字符串。
          const points = guide.points.map(([x, y]) => `${x},${y}`).join(" ");
          return guide.closed ? (
            <polygon key={guide.id} points={points} {...common} />
          ) : (
            <polyline key={guide.id} points={points} {...common} />
          );
        }

        return null;
      })}
    </svg>
  );
}

// 快速预览里的单个图片或文字元素。
function GarmentElement({ element, asset }) {
  // 文字元素 DOM 引用，用于测量实际显示尺寸。
  const textRef = React.useRef(null);
  // 文字元素当前显示盒子尺寸。
  const [textBox, setTextBox] = React.useState({ width: 0, height: 0 });
  // 元素相对坐标转换后的 CSS 定位样式。
  const style = {
    left: `${element.centerX * 100}%`,
    top: `${element.centerY * 100}%`,
    width: `${element.width * 100}%`,
    height: `${element.height * 100}%`,
    opacity: element.opacity,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
    zIndex: element.zIndex,
  };

  React.useEffect(() => {
    if (!textRef.current || typeof ResizeObserver === "undefined") return;
    // 监听文字盒子尺寸变化以同步字体大小和描边。
    const observer = new ResizeObserver(([entry]) => {
      setTextBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(textRef.current);
    return () => observer.disconnect();
  }, []);

  if (element.type === "image") return <img className="preview-element" style={style} src={asset?.dataUrl} alt="" />;

  // 根据盒子高度计算文字大小。
  const fontSize = textBox.height ? textFontSizeForBox(textBox.height, 8) : 20;
  // 根据盒子宽度计算文字描边宽度。
  const strokeWidth = Math.max(1, (textBox.width || 0) * (element.strokeWidth ?? 0.01));
  const font = textFontFor(element);

  return (
    <div
      ref={textRef}
      className="preview-element preview-text"
      style={{
        ...style,
        color: element.fill,
        fontFamily: font.cssFamily,
        fontWeight: font.cssWeight,
        fontSize,
        WebkitTextStroke: `${strokeWidth}px ${element.stroke}`,
      }}
    >
      {element.text}
    </div>
  );
}
