const today = new Date();
const dayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("");

const jerseyFront = "/templates/football-jersey/panels/front.png";
const jerseyBack = "/templates/football-jersey/panels/back.png";
const cropFront = "/templates/football-jersey-crop-top-two-tone/up-front/panels/front.png";
const cropBack = "/templates/football-jersey-crop-top-two-tone/up-back/panels/up-back.png";

export const ART_CENTER_CATEGORIES = ["橄榄球衣", "露脐款", "训练背心"];
export const ART_CENTER_BATCHES = ["沃达-1013-A", "沃达-1013-B", "返单-1009"];
export const ART_CENTER_PROCESSES = ["刺绣", "烫画", "漫天", "印染", "印染+logo"];

const sampleOrders = [
  {
    id: "task-001", sequence: "0001", priority: "加急", tag: "W-041", taskBatch: "沃达任务-1013", productionBatch: ART_CENTER_BATCHES[0],
    artCode: "WD-20261013-001", styleImage: jerseyFront, productionImage: jerseyBack, orderNo: `ORDER-${dayKey}0918-3370C`,
    sku: "W-M / 橄榄球衣", asin: "B0WODA001", status: "待处理", category: ART_CENTER_CATEGORIES[0], process: "印染+logo", size: "M", quantity: 2,
    product: "定制橄榄球衣", style: "经典拼色款", name: "BAO", number: "08", isMachine: false, machineLogo: false, uploaded: false, wrongImage: false, createdAt: today,
  },
  {
    id: "task-002", sequence: "0002", priority: "普通", tag: "W-042", taskBatch: "沃达任务-1013", productionBatch: ART_CENTER_BATCHES[0],
    artCode: "WD-20261013-002", styleImage: cropFront, productionImage: cropBack, orderNo: `ORDER-${dayKey}0926-3371A`,
    sku: "W-M / 露脐双拼", asin: "B0WODA002", status: "已传图", category: ART_CENTER_CATEGORIES[1], process: "刺绣", size: "S", quantity: 1,
    product: "露脐橄榄球衣", style: "黑白双拼款", name: "MIA", number: "21", isMachine: true, machineLogo: true, uploaded: true, wrongImage: false, createdAt: today,
  },
  {
    id: "task-003", sequence: "0003", priority: "普通", tag: "W-043", taskBatch: "沃达任务-1013", productionBatch: ART_CENTER_BATCHES[1],
    artCode: "WD-20261013-003", styleImage: jerseyBack, productionImage: null, orderNo: `ORDER-${dayKey}1011-3372B`,
    sku: "M-2XL / 球衣", asin: "B0WODA003", status: "做图中", category: ART_CENTER_CATEGORIES[0], process: "烫画", size: "XL", quantity: 3,
    product: "队服短袖", style: "客场白色款", name: "WOLVES", number: "17", isMachine: false, machineLogo: false, uploaded: false, wrongImage: false, createdAt: today,
  },
  {
    id: "task-004", sequence: "0004", priority: "加急", tag: "W-044", taskBatch: "沃达任务-1013", productionBatch: ART_CENTER_BATCHES[1],
    artCode: "WD-20261013-004", styleImage: cropBack, productionImage: jerseyFront, orderNo: `ORDER-${dayKey}1040-3373D`,
    sku: "W-L / 露脐双拼", asin: "B0WODA004", status: "异常", category: ART_CENTER_CATEGORIES[1], process: "漫天", size: "L", quantity: 1,
    product: "露脐橄榄球衣", style: "红黑渐变款", name: "JUNE", number: "03", isMachine: true, machineLogo: false, uploaded: false, wrongImage: true, createdAt: today,
  },
  {
    id: "task-005", sequence: "0005", priority: "普通", tag: "W-039", taskBatch: "沃达任务-1012", productionBatch: ART_CENTER_BATCHES[2],
    artCode: "WD-20261012-018", styleImage: jerseyFront, productionImage: jerseyBack, orderNo: "ORDER-202610120858-3370C",
    sku: "W-M / 橄榄球衣", asin: "B0WODA005", status: "设计完成", category: ART_CENTER_CATEGORIES[0], process: "印染", size: "M", quantity: 2,
    product: "定制橄榄球衣", style: "经典拼色款", name: "BAO", number: "08", isMachine: false, machineLogo: false, uploaded: true, wrongImage: false, createdAt: new Date(today.getTime() - 86400000),
  },
  {
    id: "task-006", sequence: "0006", priority: "普通", tag: "W-038", taskBatch: "沃达任务-1012", productionBatch: ART_CENTER_BATCHES[2],
    artCode: "WD-20261012-017", styleImage: cropFront, productionImage: null, orderNo: "ORDER-202610121032-3381F",
    sku: "W-XL / 露脐双拼", asin: "B0WODA006", status: "驳回", category: ART_CENTER_CATEGORIES[1], process: "刺绣", size: "XL", quantity: 1,
    product: "露脐橄榄球衣", style: "蓝白拼色款", name: "LILY", number: "11", isMachine: true, machineLogo: true, uploaded: false, wrongImage: false, createdAt: new Date(today.getTime() - 86400000),
  },
  {
    id: "task-007", sequence: "0007", priority: "普通", tag: "W-037", taskBatch: "沃达任务-1012", productionBatch: ART_CENTER_BATCHES[2],
    artCode: "WD-20261012-016", styleImage: jerseyBack, productionImage: jerseyFront, orderNo: "ORDER-202610121110-3382G",
    sku: "M-2XL / 球衣", asin: "B0WODA007", status: "生产中", category: ART_CENTER_CATEGORIES[2], process: "烫画", size: "2XL", quantity: 4,
    product: "训练背心", style: "深蓝训练款", name: "TIGERS", number: "24", isMachine: false, machineLogo: false, uploaded: true, wrongImage: false, createdAt: new Date(today.getTime() - 86400000),
  },
  {
    id: "task-008", sequence: "0008", priority: "普通", tag: "W-036", taskBatch: "沃达任务-1011", productionBatch: ART_CENTER_BATCHES[2],
    artCode: "WD-20261011-022", styleImage: cropFront, productionImage: cropBack, orderNo: "ORDER-202610111428-3390K",
    sku: "W-S / 露脐双拼", asin: "B0WODA008", status: "异常", category: ART_CENTER_CATEGORIES[1], process: "印染+logo", size: "S", quantity: 1,
    product: "露脐橄榄球衣", style: "紫白拼色款", name: "NOVA", number: "09", isMachine: true, machineLogo: false, uploaded: false, wrongImage: true, createdAt: new Date(today.getTime() - 2 * 86400000),
  },
];

// 来源仅用于迁移前的页面预览；真实来源由 ERP 任务接口返回。
export const INITIAL_ART_CENTER_ORDERS = sampleOrders.map((order, index) => ({
  ...order,
  source: ["woda", "woda", "woda", "woda", "domestic", "overseas", "alibaba", "bulk"][index],
}));

export function formatMockDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replaceAll("/", "-");
}

export function getMockDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
