import React from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Line } from "react-konva";
import { clampElement } from "../model.js";
import { getStageSize, template } from "../config.js";
import { currentElements } from "../designStore.js";

function useImage(src) {
  const [image, setImage] = React.useState(null);
  React.useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  return image;
}

export function PanelStage({ design, selectedId, onSelect, onChange }) {
  const transformerRef = React.useRef(null);
  const nodeRefs = React.useRef({});
  const elements = currentElements(design);
  const panel = template.panels[design.currentPanelId];
  const stageSize = getStageSize(panel);
  const panelImage = useImage(panel.templateImage);
  const maskImage = useImage(panel.maskImage);

  React.useEffect(() => {
    transformerRef.current?.nodes(selectedId ? [nodeRefs.current[selectedId]].filter(Boolean) : []);
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selectedId, elements]);

  return (
    <Stage
      width={stageSize.width}
      height={stageSize.height}
      onMouseDown={(event) => {
        if (event.target === event.target.getStage()) onSelect(null);
      }}
    >
      <Layer>
        <Rect width={stageSize.width} height={stageSize.height} fill="#ffffff" />
        <KonvaImage image={panelImage} width={stageSize.width} height={stageSize.height} listening={false} />
        {panel.guides?.map((guide) => (
          <GuideLine key={guide.id} guide={guide} panel={panel} stageSize={stageSize} />
        ))}
        <Text text={panel.name} x={14} y={12} fontSize={18} fill="#111827" />
      </Layer>
      <Layer>
        {elements.map((element) => (
          <CanvasElement
            key={element.id}
            element={element}
            asset={design.assets.find((asset) => asset.assetId === element.assetId)}
            selected={element.id === selectedId}
            stageSize={stageSize}
            setRef={(node) => {
              nodeRefs.current[element.id] = node;
            }}
            onSelect={() => onSelect(element.id)}
            onChange={(patch) => onChange(element.id, patch)}
          />
        ))}
        {maskImage ? (
          <KonvaImage
            image={maskImage}
            width={stageSize.width}
            height={stageSize.height}
            globalCompositeOperation="destination-in"
            listening={false}
          />
        ) : null}
      </Layer>
      <Layer>
        <Transformer ref={transformerRef} rotateEnabled enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} />
      </Layer>
    </Stage>
  );
}

function GuideLine({ guide, panel, stageSize }) {
  const style = guide.style ?? {};
  const common = {
    stroke: style.stroke ?? "#0f766e",
    strokeWidth: style.strokeWidth ?? 1,
    dash: style.dash ?? [],
    listening: false,
  };

  if (guide.type === "line") {
    return <Line {...common} points={[...scalePoint(guide.from, panel, stageSize), ...scalePoint(guide.to, panel, stageSize)]} />;
  }

  if (guide.type === "path") {
    return <Line {...common} points={guide.points.flatMap((point) => scalePoint(point, panel, stageSize))} closed={guide.closed} />;
  }

  return null;
}

function scalePoint([x, y], panel, stageSize) {
  return [(x / panel.logicalSize.width) * stageSize.width, (y / panel.logicalSize.height) * stageSize.height];
}

function CanvasElement({ element, asset, selected, stageSize, setRef, onSelect, onChange }) {
  const image = useImage(asset?.dataUrl);
  const common = {
    ref: setRef,
    x: element.centerX * stageSize.width,
    y: element.centerY * stageSize.height,
    width: element.width * stageSize.width,
    height: element.height * stageSize.height,
    rotation: element.rotation,
    opacity: element.opacity,
    visible: element.visible,
    draggable: !element.locked,
    offsetX: (element.width * stageSize.width) / 2,
    offsetY: (element.height * stageSize.height) / 2,
    onMouseDown: onSelect,
    onTap: onSelect,
    onDragEnd: (event) => {
      onChange({ centerX: event.target.x() / stageSize.width, centerY: event.target.y() / stageSize.height });
    },
    onTransformEnd: (event) => {
      const node = event.target;
      const width = Math.max(24, node.width() * node.scaleX());
      const height = Math.max(24, node.height() * node.scaleY());
      node.scaleX(1);
      node.scaleY(1);
      onChange(clampElement({
        centerX: node.x() / stageSize.width,
        centerY: node.y() / stageSize.height,
        width: width / stageSize.width,
        height: height / stageSize.height,
        rotation: node.rotation(),
      }));
    },
  };

  if (!element.visible) return null;
  if (element.type === "image") {
    return <KonvaImage {...common} image={image} stroke={selected ? "#111827" : undefined} strokeWidth={selected ? 1 : 0} />;
  }
  return (
    <Text
      {...common}
      text={element.text}
      fill={element.fill}
      stroke={element.stroke}
      strokeWidth={element.strokeWidth * stageSize.width}
      fontSize={Math.max(18, element.height * stageSize.height * 0.72)}
      fontStyle="bold"
      align="center"
      verticalAlign="middle"
    />
  );
}
