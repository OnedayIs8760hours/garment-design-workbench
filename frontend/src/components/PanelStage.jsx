import React from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Line } from "react-konva";
import { clampElement } from "../model.js";
import { getStageSize, template } from "../config.js";
import { currentElements } from "../designStore.js";
import { textFontFor } from "../fontMap.js";
import { textFontSizeForBox } from "../textMetrics.js";

// 加载图片资源并返回浏览器 Image 对象。
function useImage(src) {
  // 当前已加载的图片对象。
  const [image, setImage] = React.useState(null);
  React.useEffect(() => {
    if (!src) return;
    // 临时图片对象，用于触发加载。
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  return image;
}

// Konva 主编辑画布，负责裁片底图、元素和变换框。
export function PanelStage({ design, selectedId, onSelect, onChange }) {
  // Konva Transformer 实例引用。
  const transformerRef = React.useRef(null);
  // 每个元素 ID 对应的 Konva 节点引用。
  const nodeRefs = React.useRef({});
  // 当前裁片按图层排序后的元素。
  const elements = currentElements(design);
  // 当前裁片模板。
  const panel = template.panels[design.currentPanelId];
  // 当前裁片画布显示尺寸。
  const stageSize = getStageSize(panel);
  // 当前裁片底图。
  const panelImage = useImage(panel.templateImage);
  // 当前裁片遮罩图。
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
        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio={true}
          enabledAnchors={["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]}
        />
      </Layer>
    </Stage>
  );
}

// 渲染模板里的辅助线。
function GuideLine({ guide, panel, stageSize }) {
  // 辅助线样式配置。
  const style = guide.style ?? {};
  // Konva 线条通用属性。
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

// 把模板逻辑坐标转换成当前 Konva 舞台坐标。
function scalePoint([x, y], panel, stageSize) {
  return [(x / panel.logicalSize.width) * stageSize.width, (y / panel.logicalSize.height) * stageSize.height];
}

// 渲染并处理单个图片或文字元素。
function CanvasElement({ element, asset, selected, stageSize, setRef, onSelect, onChange }) {
  // 图片元素对应的已加载素材。
  const image = useImage(asset?.dataUrl);
  // 图片和文字共享的 Konva 属性。
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
      // 正在被变换的 Konva 节点。
      const node = event.target;
      // 变换后的像素宽度。
      const width = Math.max(24, node.width() * node.scaleX());
      // 变换后的像素高度。
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
  const font = textFontFor(element);
  return (
    <Text
      {...common}
      text={element.text}
      fill={element.fill}
      stroke={element.stroke}
      strokeWidth={element.strokeWidth * stageSize.width}
      fontFamily={font.cssFamily}
      fontSize={textFontSizeForBox(element.height * stageSize.height, 18)}
      fontStyle={font.cssStyle}
      align="center"
      verticalAlign="middle"
    />
  );
}
