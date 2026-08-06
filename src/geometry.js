import { firstPanel, stageSize } from "./config.js";

export function panelShape(panel = firstPanel) {
  return panel.clipPath ?? [
    [0, 0],
    [panel.logicalSize.width, 0],
    [panel.logicalSize.width, panel.logicalSize.height],
    [0, panel.logicalSize.height],
  ];
}

export function scalePoint([x, y], panel = firstPanel) {
  return [(x / panel.logicalSize.width) * stageSize.width, (y / panel.logicalSize.height) * stageSize.height];
}

export function scaledClipPoints(panel = firstPanel) {
  return panelShape(panel).flatMap((point) => scalePoint(point, panel));
}

export function drawClipPath(context, panel = firstPanel) {
  const points = panelShape(panel).map((point) => scalePoint(point, panel));
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.closePath();
}

export function cssClipPath(panel = firstPanel) {
  return `polygon(${panelShape(panel)
    .map(([x, y]) => `${(x / panel.logicalSize.width) * 100}% ${(y / panel.logicalSize.height) * 100}%`)
    .join(", ")})`;
}

export function insetClipPoints(panel = firstPanel, ratio = 0.035) {
  return scaledClipPoints(panel).map((value, index) => {
    const max = index % 2 === 0 ? stageSize.width : stageSize.height;
    const inset = max * ratio;
    return Math.max(24, Math.min(max - 24, value + (value < max / 2 ? inset : -inset)));
  });
}
