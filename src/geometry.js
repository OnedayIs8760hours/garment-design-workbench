import { firstPanel, stageSize } from "./config.js";

// 返回裁片裁切轮廓，缺省时使用完整矩形。
export function panelShape(panel = firstPanel) {
  return panel.clipPath ?? [
    [0, 0],
    [panel.logicalSize.width, 0],
    [panel.logicalSize.width, panel.logicalSize.height],
    [0, panel.logicalSize.height],
  ];
}

// 把模板逻辑坐标转换成画布显示坐标。
export function scalePoint([x, y], panel = firstPanel) {
  return [(x / panel.logicalSize.width) * stageSize.width, (y / panel.logicalSize.height) * stageSize.height];
}

// 返回裁切轮廓在画布上的扁平坐标数组。
export function scaledClipPoints(panel = firstPanel) {
  return panelShape(panel).flatMap((point) => scalePoint(point, panel));
}

// 在 canvas context 上绘制裁片裁切路径。
export function drawClipPath(context, panel = firstPanel) {
  // 裁片轮廓转换后的画布坐标点。
  const points = panelShape(panel).map((point) => scalePoint(point, panel));
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.closePath();
}

// 生成 CSS clip-path polygon 字符串。
export function cssClipPath(panel = firstPanel) {
  return `polygon(${panelShape(panel)
    .map(([x, y]) => `${(x / panel.logicalSize.width) * 100}% ${(y / panel.logicalSize.height) * 100}%`)
    .join(", ")})`;
}

// 生成向内收缩后的裁切点，给可视辅助轮廓使用。
export function insetClipPoints(panel = firstPanel, ratio = 0.035) {
  return scaledClipPoints(panel).map((value, index) => {
    // 当前坐标所在轴的最大画布尺寸。
    const max = index % 2 === 0 ? stageSize.width : stageSize.height;
    // 当前坐标向内收缩的距离。
    const inset = max * ratio;
    return Math.max(24, Math.min(max - 24, value + (value < max / 2 ? inset : -inset)));
  });
}
