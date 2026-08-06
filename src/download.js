import JSZip from "jszip";

export async function downloadZip(design, exportJson) {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(exportJson, null, 2));
  design.assets.forEach((asset) => {
    zip.file(`assets/${asset.sourceFile}`, asset.dataUrl.split(",")[1] ?? "", { base64: true });
  });
  downloadBlob("design-package.zip", await zip.generateAsync({ type: "blob" }));
}

export function downloadBlob(filename, content, type = "application/octet-stream") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
