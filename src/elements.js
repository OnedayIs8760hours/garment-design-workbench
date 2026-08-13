import { defaultTextFontId, textFontFields } from "./fontMap.js";

// 创建图片元素，并在有原始宽高比时按比例计算默认尺寸。
export function createImageElement(assetId, imageAspectRatio, panelAspectRatio = 1) {
  // 图片元素默认占裁片宽度的比例。
  let width = 0.42;
  // 图片元素默认占裁片高度的比例。
  let height = 0.3;

  // 用图片宽高比和裁片宽高比换算相对高度。
  if (imageAspectRatio > 0 && panelAspectRatio > 0) {
    height = width * panelAspectRatio / imageAspectRatio;
    if (height > 0.3) {
      height = 0.3;
      width = height * imageAspectRatio / panelAspectRatio;
    }
  }

  return {
    // 元素类型，用于决定画布渲染图片还是文字。
    type: "image",
    // 指向 design.assets 中的素材 ID。
    assetId,
    // 元素中心点 X，相对裁片宽度。
    centerX: 0.5,
    // 元素中心点 Y，相对裁片高度。
    centerY: 0.42,
    // 元素宽度，相对裁片宽度。
    width,
    // 元素高度，相对裁片高度。
    height,
    // 元素旋转角度。
    rotation: 0,
    // 元素透明度。
    opacity: 1,
    // 是否水平翻转。
    flipX: false,
    // 是否垂直翻转。
    flipY: false,
    // 是否显示元素。
    visible: true,
    // 是否锁定拖拽编辑。
    locked: false,
  };
}

export function fillPanelSize(imageAspectRatio, panelAspectRatio = 1) {
  if (!(imageAspectRatio > 0) || !(panelAspectRatio > 0)) return { width: 1, height: 1 };
  const height = panelAspectRatio / imageAspectRatio;
  return height >= 1 ? { width: 1, height } : { width: 1 / height, height: 1 };
}

// 创建文字元素，role 决定是姓名还是号码。
export function createTextElement(role) {
  const element = {
    // 元素类型。
    type: "text",
    // 文字用途：姓名或号码。
    role,
    // 默认显示文本。
    text: role === "number" ? "00" : "YOUR NAME",
    // 字体配置 ID。
    fontId: defaultTextFontId,
    // 元素中心点 X。
    centerX: 0.5,
    // 元素中心点 Y。
    centerY: role === "number" ? 0.45 : 0.22,
    // 元素宽度。
    width: role === "number" ? 0.18 : 0.5,
    // 元素高度。
    height: role === "number" ? 0.12 : 0.08,
    // 元素旋转角度。
    rotation: 0,
    // 文字填充颜色。
    fill: role === "number" ? "#D72145" : "#FFFFFF",
    // 文字描边颜色。
    stroke: "#111827",
    // 文字描边宽度，相对裁片宽度。
    strokeWidth: 0.01,
    // 元素透明度。
    opacity: 1,
    // 是否显示元素。
    visible: true,
    // 是否锁定编辑。
    locked: false,
  };
  return { ...element, ...textFontFields(element) };
}

// 返回图层列表里展示的元素名称。
export function elementLabel(element) {
  if (element.role === "panel-color") return "裁片底色";
  if (element.type === "image") return "图片素材";
  return element.role === "number" ? `号码 ${element.text}` : `文字 ${element.text}`;
}
