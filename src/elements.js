export function createImageElement(assetId, imageAspectRatio, panelAspectRatio = 1) {
  let width = 0.42;
  let height = 0.3;

  if (imageAspectRatio > 0 && panelAspectRatio > 0) {
    height = width * panelAspectRatio / imageAspectRatio;
    if (height > 0.3) {
      height = 0.3;
      width = height * imageAspectRatio / panelAspectRatio;
    }
  }

  return {
    type: "image",
    assetId,
    centerX: 0.5,
    centerY: 0.42,
    width,
    height,
    rotation: 0,
    opacity: 1,
    flipX: false,
    flipY: false,
    visible: true,
    locked: false,
  };
}

export function createTextElement(role) {
  return {
    type: "text",
    role,
    text: role === "number" ? "00" : "YOUR NAME",
    fontId: role === "number" ? "font-number-01" : "font-college-01",
    centerX: 0.5,
    centerY: role === "number" ? 0.45 : 0.22,
    width: role === "number" ? 0.34 : 0.5,
    height: role === "number" ? 0.16 : 0.08,
    rotation: 0,
    fill: role === "number" ? "#D72145" : "#FFFFFF",
    stroke: "#111827",
    strokeWidth: 0.01,
    opacity: 1,
    visible: true,
    locked: false,
  };
}

export function elementLabel(element) {
  if (element.type === "image") return "图片素材";
  return element.role === "number" ? `号码 ${element.text}` : `文字 ${element.text}`;
}
