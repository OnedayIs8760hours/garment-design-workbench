import JSZip from "jszip";
import { localDateKey } from "./artCenterModel.js";

const COLUMNS = [["文件名", "sequence"], ["美工编号", "artCode"], ["标签序号", "tag"], ["品名", "category"], ["产品款式", "style"], ["尺码", "size"],
  ["运单号", "waybill"], ["主题名", "sku"], ["正面名字", "frontName"], ["正面号码", "frontNumber"], ["背面名字", "backName"], ["背面号码", "backNumber"], ["字体颜色", "textColor"], ["字体名称", "textStyle"]];
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const escapeXml = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);

export async function createOrdersWorkbook(orders) {
  const zip = new JSZip();
  const rows = [COLUMNS.map(([title]) => title), ...orders.map((order) => COLUMNS.map(([, key]) => order[key]))];
  // inlineStr 保留前导零与长编号，也不会把用户输入当成公式执行。
  const sheet = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, index) => `<c r="${String.fromCharCode(65 + index)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`).join("")}</row>`).join("");
  zip.file("[Content_Types].xml", `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.file("_rels/.rels", `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="我的任务" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="14" width="20" customWidth="1"/></cols><sheetData>${sheet}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function downloadOrdersWorkbook(orders) {
  const bytes = await createOrdersWorkbook(orders);
  const href = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = href;
  link.download = `工作台导出_${localDateKey(new Date())}.xlsx`;
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
