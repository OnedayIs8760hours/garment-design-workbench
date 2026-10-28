import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createOrdersWorkbook } from "./erpOrderExport.js";

test("Excel 导出符合 ERP 列顺序，编号按文本保留并转义用户输入", async () => {
  const bytes = await createOrdersWorkbook([{ sequence: "0001", frontName: '=HYPERLINK("bad")', frontNumber: 0, backName: "后名<&>", backNumber: "09" }]);
  const zip = await JSZip.loadAsync(bytes);
  const sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(sheet, /r="A1"[^>]*><is><t[^>]*>文件名/); assert.match(sheet, /r="A2" t="inlineStr"><is><t[^>]*>0001/);
  assert.match(sheet, /r="J2" t="inlineStr"><is><t[^>]*>0/); assert.match(sheet, /r="L2" t="inlineStr"><is><t[^>]*>09/);
  assert.match(sheet, /=HYPERLINK\(&quot;bad&quot;\)/); assert.match(sheet, /后名&lt;&amp;&gt;/); assert.doesNotMatch(sheet, /<f[\s>]/);
  assert.match(await zip.file("xl/workbook.xml").async("string"), /name="我的任务"/);
  assert.equal(zip.file("[Content_Types].xml") !== null, true); assert.equal(zip.file("_rels/.rels") !== null, true);
});
