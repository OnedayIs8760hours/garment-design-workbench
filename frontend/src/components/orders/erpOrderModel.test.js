import assert from "node:assert/strict";
import test from "node:test";
import { canClearImages, columnOptions, imageReferences, normalizeOrder, taskQuery, uploadBlockReason, validateProductionFile } from "./erpOrderModel.js";

const filters = { scope: "woda", date: "2026-10-28", search: " A-9 ", tab: "pending", workMode: "human", status: [], category: [], productionBatch: [], process: [], columnFilters: {} };
test("任务参数沿用 ERP 服务端语义，分页和异常页签不在客户端重算", () => {
  const query = taskQuery(filters, 3, 50);
  assert.equal(query.get("board_filter"), "manual"); assert.equal(query.get("tab"), "unfinished");
  assert.equal(query.get("order_source"), "woda"); assert.equal(query.get("q"), "A-9"); assert.equal(query.get("page"), "3");
  const abnormal = taskQuery({ ...filters, tab: "exception", scope: "overseas", routeCategory: "亚马逊-SDS海外", date: "" }, 1, 20);
  assert.equal(abnormal.get("tab"), "abnormal"); assert.equal(abnormal.get("module_scope"), "OVERSEAS");
  assert.equal(abnormal.get("order_route_category"), "亚马逊-SDS海外"); assert.equal(abnormal.has("date"), false);
  assert.equal(taskQuery({ ...filters, scope: "machine" }, 1, 20).get("board_filter"), "machine");
});
test("多选工艺和表头使用 ERP 各自参数名", () => {
  const query = taskQuery({ ...filters, process: ["印染", "印染+logo"], category: ["球衣", "裤子"], columnFilters: { tag: "007", taskBatch: "B-1", process: "热转印", size: "L", artCode: "A" } }, 1, 20);
  assert.equal(query.get("craft_group"), "印染,印染+logo"); assert.equal(query.get("category"), "球衣,裤子");
  assert.equal(query.get("label_seq_nos"), "007"); assert.equal(query.get("design_batch_nos"), "B-1");
  assert.equal(query.get("processes"), "热转印"); assert.equal(query.get("size_filters"), "L"); assert.equal(query.get("art_codes"), "A");
});
test("订单保留长 ID、零号码和独立正背面字段，图片走同源 ERP 前缀", () => {
  const row = normalizeOrder({ id: "9223372036854775800", serial_no: "001", front_name: "Front", back_name: "Back", front_number: 0, back_number: "09", product_quantity: 0,
    production_image: "/static/up.png，https://storage.example/down.png", image_url: "/static/style.png", image_thumb_url: "/static/thumb.png", waybill_qr_image: "/static/qr.png", remark_image_2: "/static/note.png" });
  assert.equal(row.id, "9223372036854775800"); assert.equal(row.frontNumber, 0); assert.equal(row.backNumber, "09"); assert.equal(row.quantity, 0);
  assert.equal(row.frontName, "Front"); assert.equal(row.backName, "Back"); assert.equal(row.styleImage, "/erp/static/thumb.png");
  assert.deepEqual(row.productionImages, ["/erp/static/up.png", "https://storage.example/down.png"]); assert.equal(row.qrImage, "/erp/static/qr.png");
  assert.deepEqual(row.remarkImages, ["/erp/static/note.png"]);
  assert.deepEqual(imageReferences("javascript:alert(1),//untrusted.example/x"), []);
});
test("清图仅允许 ERP 规定状态和待审核五分钟窗口", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  const row = (status, minutes, image = "a.png") => normalizeOrder({ id: 1, status, production_image: image, updated_at: new Date(now - minutes * 60000).toISOString() });
  assert.equal(canClearImages(row("做图中", 100), now), true); assert.equal(canClearImages(row("驳回", 100), now), true);
  assert.equal(canClearImages(row("待审核", 5), now), true); assert.equal(canClearImages(row("待审核", 6), now), false);
  assert.equal(canClearImages(row("待审核", -1), now), false); assert.equal(canClearImages(row("设计完成", 1), now), false);
  assert.equal(canClearImages(row("驳回", 1, ""), now), false);
});
test("上传遵守后置改单阻断与拆片文件名规则", () => {
  const raw = { id: 1, serial_no: "001", label_seq_no: "L-1", order_no: "ORDER", production_image_required_count: 2 };
  assert.equal(validateProductionFile(normalizeOrder(raw), { name: "001-上.png" }, "上"), "");
  assert.equal(validateProductionFile(normalizeOrder(raw), { name: "L-1_下.JPG" }, "下"), "");
  assert.match(validateProductionFile(normalizeOrder(raw), { name: "wrong-上.png" }, "上"), /序号必须匹配/);
  assert.match(validateProductionFile(normalizeOrder(raw), { name: "001-上.png" }, ""), /请选择/);
  assert.equal(uploadBlockReason(normalizeOrder({ ...raw, block_reasons: ["审核未确认", "请联系美工"] })), "审核未确认；请联系美工");
  assert.match(uploadBlockReason(normalizeOrder({ ...raw, original_order_unit_id: 1, rewrite_upload_confirmed_at: null })), /确认后/);
});
test("表头选项保留后端数量与未出现在当前页的值", () => {
  const options = columnOptions({ art_code: ["A", { value: "B", text: "B 底板", count: 90 }] });
  assert.deepEqual(options.artCode, [{ value: "A", text: "A" }, { value: "B", text: "B 底板", count: 90 }]);
  assert.deepEqual(options.style, []);
});
