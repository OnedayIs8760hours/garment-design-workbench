import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, filterOrders, localDateKey, matchImageFiles, taskCounts } from "./artCenterModel.js";

const base = { scope: "all", tab: "all", workMode: "all" };
const orders = [
  { id: "a", sequence: "0001", orderNo: "ORDER-A", artCode: "ART-1", source: "woda", category: "球衣", process: "印染", productionBatch: "B-1", status: "待处理", uploaded: false, createdAt: new Date(2026, 9, 28, 8), isMachine: false },
  { id: "b", sequence: "0002", orderNo: "ORDER-B", artCode: "ART-2", source: "woda", category: "露脐款", process: "刺绣", productionBatch: "B-1", status: "设计完成", uploaded: true, createdAt: new Date(2026, 9, 28, 9), isMachine: true },
  { id: "c", sequence: "0003", orderNo: "ORDER-C", artCode: "ART-3", source: "overseas", category: "球衣", process: "印染", productionBatch: "B-2", status: "驳回", uploaded: false, createdAt: new Date(2026, 9, 27, 10), isMachine: true },
  { id: "d", sequence: "0004", orderNo: "ORDER-D", artCode: "ART-4", source: "domestic", category: "露脐款", process: "印染", productionBatch: "B-2", status: "异常", uploaded: false, wrongImage: true, createdAt: new Date(2026, 9, 27, 11), isMachine: false },
];

test("来源与机器类型筛选实际限制结果", () => {
  assert.deepEqual(filterOrders(orders, { ...base, scope: "woda", workMode: "machine" }).map((row) => row.id), ["b"]);
  assert.deepEqual(filterOrders(orders, { ...base, scope: "machine" }).map((row) => row.id), ["b", "c"]);
});

test("今天和历史日期使用同一日期条件，清除后恢复全部", () => {
  assert.equal(localDateKey(orders[0].createdAt), "2026-10-28");
  assert.deepEqual(filterOrders(orders, { ...base, date: "2026-10-27" }).map((row) => row.id), ["c", "d"]);
  assert.equal(filterOrders(orders, { ...base, date: "" }).length, 4);
});

test("已传图包含后续设计完成状态，状态和页签结果一致", () => {
  assert.deepEqual(filterOrders(orders, { ...base, status: "已传图" }), filterOrders(orders, { ...base, tab: "uploaded" }));
  assert.equal(filterOrders(orders, { ...base, status: "已传图" })[0].id, "b");
});

test("返工可同时出现在待处理与异常中，计数与列表一致", () => {
  const counts = taskCounts(orders);
  assert.deepEqual(counts, { all: 4, pending: 2, uploaded: 1, exception: 2 });
  for (const tab of Object.keys(counts)) assert.equal(counts[tab], filterOrders(orders, { ...base, tab }).length);
});

test("分类计数排除自身条件，保留其他筛选与页签", () => {
  const filters = { ...base, category: "球衣", process: "印染" };
  assert.deepEqual(filterOrders(orders, filters).map((row) => row.id), ["a", "c"]);
  assert.deepEqual(filterOrders(orders, filters, { omit: "category" }).map((row) => row.id), ["a", "c", "d"]);
});

test("编码搜索不区分大小写，支持完整序列号", () => {
  assert.equal(filterOrders(orders, { ...base, search: "  art-3  " })[0].id, "c");
  assert.equal(filterOrders(orders, { ...base, search: "0002" })[0].id, "b");
  assert.equal(filterOrders(orders, { ...base, search: "unknown" }).length, 0);
});

test("图片匹配使用完整编码并暴露重名与不支持格式", () => {
  const files = [{ name: "0001.png", type: "image/png" }, { name: "art-2.JPG", type: "" }, { name: "ORDER.png", type: "image/png" }, { name: "0003.txt", type: "text/plain" }];
  const matches = matchImageFiles(files, orders);
  assert.equal(matches[0].matches[0].id, "a");
  assert.equal(matches[1].matches[0].id, "b");
  assert.equal(matches[1].valid, true);
  assert.equal(matches[2].matches.length, 0);
  assert.equal(matches[3].valid, false);
  assert.equal(matchImageFiles([files[0]], [...orders, { ...orders[0], id: "duplicate" }])[0].matches.length, 2);
});

test("CSV 转义引号换行，并阻止用户输入被当成 Excel 公式", () => {
  assert.equal(csvCell('A,"B"\nC'), '"A,""B""\nC"');
  assert.equal(csvCell("=HYPERLINK(1)"), '"\'=HYPERLINK(1)"');
  assert.equal(csvCell(" @SUM(1)"), '"\' @SUM(1)"');
  assert.equal(csvCell("0001"), '"0001"');
});

test("ERP 多选筛选同组取并集，分组之间取交集", () => {
  const result = filterOrders(orders, { ...base, category: ["球衣", "露脐款"], status: ["待处理", "驳回"], process: ["印染"] });
  assert.deepEqual(result.map((order) => order.id), ["a", "c"]);
  assert.equal(filterOrders(orders, { ...base, category: [], status: [], process: [] }).length, 4);
});

test("表头条件在分页前与页面筛选一起生效", () => {
  assert.deepEqual(filterOrders(orders, { ...base, category: ["球衣"], columnFilters: { productionBatch: "B-2" } }).map((order) => order.id), ["c"]);
  assert.equal(filterOrders(orders, { ...base, columnFilters: { status: "待审核" } }).length, 0);
});
