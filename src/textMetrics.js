export const textFontSizeRatio = 0.72;

export function textFontSizeForBox(heightPx, minimum = 8) {
  return Math.max(minimum, heightPx * textFontSizeRatio);
}
