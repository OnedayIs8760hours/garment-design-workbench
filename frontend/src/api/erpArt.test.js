import assert from "node:assert/strict";
import test from "node:test";
import { createErpArtClient, parseErpJson } from "./erpArt.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
test("ERP 数字雪花 ID 在 JSON 解析前保留精度，字符串和小数不变", () => {
  const parsed = parseErpJson('{"id":9223372036854775800,"name":"order 9223372036854775800 \\"test\\"","quantity":2,"ratio":0.1234567890123456,"exp":1e20}');
  assert.equal(parsed.id, "9223372036854775800"); assert.equal(parsed.quantity, 2);
  assert.equal(parsed.name, 'order 9223372036854775800 "test"'); assert.equal(parsed.ratio, 0.1234567890123456); assert.equal(parsed.exp, 1e20);
});
function fixture(handler, onUnauthorized = () => {}) {
  const calls = [];
  const client = createErpArtClient({ base: "/erp", getToken: () => "erp-only-token", onUnauthorized, fetcher: async (url, options) => {
    const call = { url, ...options, json: typeof options.body === "string" ? JSON.parse(options.body) : undefined }; calls.push(call);
    return handler(call, calls);
  } });
  return { client, calls };
}
test("Python/Java 共享 ERP 专用认证，登录匿名，Java 解包", async () => {
  const { client, calls } = fixture((call) => call.url.endsWith("/login") ? json({ access_token: "new-erp" }) : call.url.includes("/java-api/") ? json({ success: true, data: { woda: 12 } }) : json({ items: [], total: 0 }));
  await client.login("designer", "test-password"); await client.tasks("page=2&size=20");
  assert.deepEqual(await client.counts(), { woda: 12 });
  assert.equal(calls[0].url, "/erp/api/v1/system/login"); assert.equal(calls[0].headers.has("Authorization"), false);
  assert.equal(calls[1].headers.get("Authorization"), "Bearer erp-only-token");
  assert.equal(calls[2].url, "/erp/java-api/api/v1/orders/art/my-tasks/counts");
  assert.equal(calls.every((call) => call.credentials === "omit"), true);
});
test("401 只通知 ERP 会话失效，权限错误保留会话并显示服务端消息", async () => {
  let expired = 0;
  const { client } = fixture((call) => call.url.includes("counts") ? json({ message: "缺少任务权限" }, 403) : json({ detail: "登录失效" }, 401), () => expired++);
  await assert.rejects(client.me(), /登录失效/); assert.equal(expired, 1);
  await assert.rejects(client.counts(), /缺少任务权限/); assert.equal(expired, 1);
  await assert.rejects(client.login("u", "p"), /登录失效/); assert.equal(expired, 1);
});
test("错误 HTML 代理响应不能当作空订单成功", async () => {
  const { client } = fixture(() => new Response("<html>SPA</html>"));
  await assert.rejects(client.tasks("page=1"), /无效响应/);
});
test("清图、自动匹配和单单传图使用原始 ERP 合约", async () => {
  const { client, calls } = fixture(() => json({ message: "ok" }));
  await client.clearImages(["9223372036854775800"]); await client.autoMatch("2026-10-28");
  await client.uploadImage("42", new File(["a"], "42-上.png", { type: "image/png" }), "上");
  assert.deepEqual(calls[0].json, { order_ids: ["9223372036854775800"] });
  assert.equal(calls[0].url, "/erp/api/v1/orders/art/batch-clear-images");
  assert.equal(calls[1].url, "/erp/api/v1/orders/auto-batch/unassigned-machine?date=2026-10-28");
  assert.equal(calls[2].url, "/erp/api/v1/orders/art/42/upload-image");
  assert.equal(calls[2].body.get("panel_position"), "上"); assert.equal(calls[2].body.get("file").name, "42-上.png");
  assert.equal(calls[2].headers.has("Content-Type"), false);
});
test("PSD 分片合并有序，外部 PUT 不携带 ERP 凭证，最后进度 100", async () => {
  const progress = [];
  const { client, calls } = fixture((call) => {
    if (call.url.endsWith("/init")) return json({ session_id: "s1", part_count: 3, part_size_bytes: 2 });
    if (call.url.endsWith("/part-url")) return json({ url: `https://storage.example/${call.json.part_number}` });
    if (call.method === "PUT") return new Response("", { headers: { ETag: `"${call.url.at(-1)}"` } });
    return json({ message: "done", psd_task_id: "t1" });
  });
  await client.uploadPsd("42", new File(["abcdef"], "42.psd", { lastModified: 20 }), (value) => progress.push(value));
  const puts = calls.filter((call) => call.method === "PUT"); assert.equal(puts.length, 3);
  puts.forEach((call) => assert.equal(new Headers(call.headers).has("Authorization"), false));
  assert.deepEqual(calls.at(-1).json.parts, [1, 2, 3].map((part_number) => ({ part_number, etag: `"${part_number}"` })));
  assert.equal(progress.at(-1), 100); assert.equal(calls.some((call) => call.url.endsWith("/abort")), false);
});
test("PSD 缺少 ETag 时等待工作线程结束再 abort", async () => {
  const { client, calls } = fixture(async (call) => {
    if (call.url.endsWith("/init")) return json({ session_id: "s1", part_count: 2, part_size_bytes: 2 });
    if (call.url.endsWith("/part-url")) return json({ url: `https://storage.example/${call.json.part_number}` });
    if (call.method === "PUT") { await new Promise((resolve) => setTimeout(resolve, 5)); return new Response(""); }
    return json({ message: "aborted" });
  });
  await assert.rejects(client.uploadPsd("42", new File(["abcd"], "42.psd")), /ETag/);
  assert.equal(calls.at(-1).url.endsWith("/abort"), true); assert.equal(calls.some((call) => call.url.endsWith("/complete")), false);
});
test("PSD complete 失败结果不确定时不会重试或 abort", async () => {
  const { client, calls } = fixture((call) => {
    if (call.url.endsWith("/init")) return json({ session_id: "s1", part_count: 1, part_size_bytes: 2 });
    if (call.url.endsWith("/part-url")) return json({ url: "https://storage.example/1" });
    if (call.method === "PUT") return new Response("", { headers: { ETag: '"e1"' } });
    return json({ detail: "完成响应超时" }, 504);
  });
  await assert.rejects(client.uploadPsd("42", new File(["ab"], "42.psd")), /先刷新订单核对/);
  assert.equal(calls.filter((call) => call.url.endsWith("/complete")).length, 1);
  assert.equal(calls.some((call) => call.url.endsWith("/abort")), false);
});
test("全局补图由 Java 匹配，部分失败不进入 complete，直传无令牌", async () => {
  const { client, calls } = fixture((call) => {
    if (call.url.endsWith("/presign")) return json({ success: true, data: { max_presign_upload_urls: 6, files: [
      { file_name: "1.png", success: true, object_key: "k1", upload_url: "https://storage.example/1", content_type: "image/png" },
      { file_name: "bad.png", success: false, message: "未匹配到订单" },
    ] } });
    if (call.method === "PUT") return new Response("");
    return json({ success: true, data: { count: 1, files: [{ file_name: "1.png", success: true, message: "已更新" }] } });
  });
  const results = [];
  await client.patchImages([new File(["1"], "1.png"), new File(["x"], "bad.png")], false, (file, success, message) => results.push([file.name, success, message]));
  assert.deepEqual(results, [["bad.png", false, "未匹配到订单"], ["1.png", true, "已更新"]]);
  assert.equal(calls[0].url, "/erp/java-api/api/v1/orders/patch-images/presign");
  assert.deepEqual(calls.at(-1).json.files.map((item) => item.file_name), ["1.png"]);
  assert.equal(new Headers(calls.find((call) => call.method === "PUT").headers).has("Authorization"), false);
});
test("全局补图拒绝权限时不绕过或继续上传，complete 不会自动重试", async () => {
  const { client, calls } = fixture(() => json({ message: "禁止补图" }, 403));
  await assert.rejects(client.patchImages(Array.from({ length: 8 }, (_, index) => new File(["x"], `${index}.png`)), true), /禁止补图/);
  assert.equal(calls.length, 1); assert.match(calls[0].url, /patch-split-images\/presign$/);
});
