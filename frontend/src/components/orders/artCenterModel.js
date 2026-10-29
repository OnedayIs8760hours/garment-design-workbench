export const STATUS_CLASS = {
  待处理: "pending", 做图中: "working", 驳回: "rejected", 待审核: "review",
  已传图: "done", 设计完成: "done", 生产中: "production", 已发货: "shipped", 异常: "issue",
};

export const TASK_SOURCES = [
  { id: "woda", label: "沃达任务" }, { id: "domestic", label: "国内任务" },
  { id: "overseas", label: "海外任务" }, { id: "alibaba", label: "阿里任务" },
  { id: "bulk", label: "大货任务" },
];

export function matchesTab(order, tab) {
  if (tab === "pending") return ["待处理", "做图中", "驳回", "待审核"].includes(order.status);
  if (tab === "uploaded") return order.uploaded;
  if (tab === "exception") return order.status === "异常" || order.status === "驳回" || order.wrongImage;
  return true;
}

export function matchesScope(order, scope) {
  if (scope === "machine") return order.isMachine;
  return scope === "all" || order.source === scope;
}

export function filterOrders(orders, filters, { omit = "", includeTab = true } = {}) {
  const term = (filters.search || "").trim().toLocaleLowerCase();
  return orders.filter((order) => {
    if (!matchesScope(order, filters.scope)) return false;
    if (filters.date && localDateKey(order.createdAt) !== filters.date) return false;
    if (term && ![
      order.sequence, order.orderNo, order.productionBatch, order.taskBatch, order.sku,
      order.artCode, order.name, order.number, order.product, order.asin, order.tag,
    ].join(" ").toLocaleLowerCase().includes(term)) return false;
    if (filters.workMode === "machine" && !order.isMachine) return false;
    if (filters.workMode === "human" && order.isMachine) return false;
    const statuses = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status] : [];
    if (statuses.length && !statuses.some((status) => status === "已传图" ? order.uploaded : order.status === status)) return false;
    for (const field of ["category", "productionBatch", "process"]) {
      const values = Array.isArray(filters[field]) ? filters[field] : filters[field] ? [filters[field]] : [];
      if (field !== omit && values.length && !values.includes(order[field])) return false;
    }
    if (Object.entries(filters.columnFilters || {}).some(([field, value]) => value && order[field] !== value)) return false;
    return !includeTab || matchesTab(order, filters.tab);
  });
}

export function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function taskCounts(orders) {
  return Object.fromEntries(["all", "pending", "uploaded", "exception"].map((tab) => [tab, orders.filter((order) => matchesTab(order, tab)).length]));
}

export function csvCell(value) {
  const text = String(value ?? "");
  // Excel 会把以这些字符开头的用户输入解释成公式。
  const safe = /^[\s]*[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function matchImageFiles(files, orders) {
  return files.map((file) => {
    const basename = file.name.replace(/\.[^.]+$/, "").toLocaleLowerCase();
    const matches = orders.filter((order) => [order.sequence, order.orderNo, order.artCode].some((key) => key?.toLocaleLowerCase() === basename));
    return { file, matches, valid: file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name) };
  });
}
