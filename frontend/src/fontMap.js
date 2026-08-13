import textFonts from "./fontMap.json" with { type: "json" };

export const defaultTextFontId = "font-nfl-seahawks-flat";
export { textFonts };

export function textFontFor(element) {
  return textFonts[element.fontId] ?? textFonts[defaultTextFontId];
}

export function textFontFields(element) {
  const font = textFontFor(element);
  return {
    fontFamily: font.cssFamily,
    fontWeight: font.cssWeight,
    photoshopFont: font.photoshopFont,
  };
}
