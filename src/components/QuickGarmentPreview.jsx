import React from "react";
import { template } from "../config.js";

export function QuickGarmentPreview({ design, panelId }) {
  const panel = design.panels[panelId];
  const panelTemplate = template.panels[panelId];
  const maskStyle = {
    WebkitMaskImage: `url(${panelTemplate.maskImage})`,
    maskImage: `url(${panelTemplate.maskImage})`,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };

  return (
    <div className="garment-preview">
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

function GuideOverlay({ panel }) {
  return (
    <svg className="garment-preview-guides" viewBox={`0 0 ${panel.logicalSize.width} ${panel.logicalSize.height}`} aria-hidden="true">
      {panel.guides?.map((guide) => {
        const style = guide.style ?? {};
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

function GarmentElement({ element, asset }) {
  const textRef = React.useRef(null);
  const [textBox, setTextBox] = React.useState({ width: 0, height: 0 });
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

  const fontSize = Math.max(8, textBox.height * 0.72 || 20);
  const strokeWidth = Math.max(1, (textBox.width || 0) * (element.strokeWidth ?? 0.01));

  return (
    <div
      ref={textRef}
      className="preview-element preview-text"
      style={{
        ...style,
        color: element.fill,
        fontSize,
        WebkitTextStroke: `${strokeWidth}px ${element.stroke}`,
      }}
    >
      {element.text}
    </div>
  );
}
