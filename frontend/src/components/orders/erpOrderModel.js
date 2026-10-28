export const COLUMN_FIELDS = {
  tag: "label_seq_no", taskBatch: "design_batch_no", productionBatch: "production_batch_no",
  artCode: "art_code", orderNo: "order_no", status: "status", category: "category",
  style: "product_style", process: "process", size: "size",
};
const QUERY_FIELDS = {
  tag: "label_seq_nos", taskBatch: "design_batch_nos", productionBatch: "production_batch_no",
  artCode: "art_codes", orderNo: "order_nos", status: "status", category: "category",
  style: "product_styles", process: "processes", size: "size_filters",
};

export function taskQuery(filters, page, size) {
  const query = new URLSearchParams({ page: String(page), size: String(size),
    tab: ({ pending: "unfinished", uploaded: "completed", exception: "abnormal" })[filters.tab] || "all",
    board_filter: filters.scope === "machine" ? "machine" : filters.workMode === "human" ? "manual" : filters.workMode,
    order_source: filters.scope === "woda" ? "woda" : "all" });
  const moduleScope = { domestic: "DOMESTIC", overseas: "OVERSEAS", alibaba: "ALI", bulk: "BULK" }[filters.scope];
  if (moduleScope) query.set("module_scope", moduleScope);
  if (filters.routeCategory) query.set("order_route_category", filters.routeCategory);
  if (filters.date) query.set("date", filters.date);
  if (filters.search.trim()) query.set("q", filters.search.trim());
  for (const [field, target] of [["status", "status"], ["category", "category"], ["productionBatch", "production_batch_no"], ["process", "craft_group"]]) {
    if (filters[field]?.length) query.set(target, filters[field].join(","));
  }
  for (const [field, value] of Object.entries(filters.columnFilters || {})) {
    if (value && QUERY_FIELDS[field]) query.set(QUERY_FIELDS[field], value);
  }
  return query;
}

export function imageReferences(value, base = "/erp") {
  return String(value || "").split(/[,，]/).map((entry) => entry.trim()).filter(Boolean).map((url) => {
    if (/^https?:\/\//i.test(url)) return url;
    if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("//")) return "";
    return `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  }).filter(Boolean);
}

export function normalizeOrder(raw, base = "/erp") {
  const images = (value) => imageReferences(value, base);
  const productionImages = images(raw.production_image);
  const styleImages = images(raw.image_url);
  const psdImages = images(raw.psd_preview_file);
  const qrImages = images(raw.waybill_qr_image);
  const productionThumb = images(raw.production_image_thumb)[0];
  const resource = (url) => String(url || "").split(/[?#]/)[0];
  const remarks = [1, 2, 3, 4].flatMap((number) => images(raw[`remark_image_${number}`]));
  return {
    raw, id: String(raw.id), sequence: raw.serial_no ?? "", orderNo: raw.order_no ?? "",
    taskBatch: raw.design_batch_no ?? "", productionBatch: raw.production_batch_no ?? "", artCode: raw.art_code ?? "",
    priority: raw.task_priority_label ?? "", tag: raw.label_seq_no ?? "", status: raw.status ?? "",
    category: raw.category ?? "", product: raw.category ?? "", style: raw.product_style ?? "", process: raw.process ?? "",
    size: raw.size ?? "", quantity: raw.product_quantity ?? 0, sku: raw.sku_team_theme ?? "", asin: raw.asin ?? "",
    frontName: raw.front_name ?? "", frontNumber: raw.front_number ?? "", backName: raw.back_name ?? "", backNumber: raw.back_number ?? "",
    shoulderNumber: raw.shoulder_number ?? "", sleeveNumber: raw.sleeve_number ?? "", pantNumber: raw.pant_number ?? "",
    textStyle: raw.txt_style ?? "", textColor: raw.txt_color ?? "", color: raw.prod_color_name ?? raw.prod_dominant_color ?? "",
    productInfo: raw.product_info ?? "", feedback: raw.problem_description ?? "", shop: raw.shop_name ?? "", waybill: raw.waybill_no ?? "",
    createdAt: raw.created_at, isMachine: Boolean(raw.is_machine_order), machineLogo: Boolean(raw.is_machine_logo_order),
    styleImages, productionImages, psdImages, qrImages, remarkImages: remarks,
    styleImage: images(raw.image_thumb_url)[0] || styleImages[0], productionImage: images(raw.production_image_thumb)[0] || productionImages[0],
    productionThumbnail: productionThumb && resource(productionThumb) !== resource(productionImages[0]) ? productionThumb : undefined,
    psdPreview: psdImages[0], qrImage: images(raw.waybill_qr_image_thumb)[0] || qrImages[0], uploaded: productionImages.length > 0,
  };
}

export function canClearImages(order, now = Date.now()) {
  if (!order.raw.production_image) return false;
  if (["驳回", "做图中"].includes(order.status)) return true;
  const elapsed = now - new Date(order.raw.updated_at).getTime();
  return order.status === "待审核" && elapsed >= 0 && elapsed <= 5 * 60 * 1000;
}

export function uploadBlockReason(order) {
  const raw = order.raw;
  for (const key of ["rewrite_upload_block_reason", "upload_block_reason", "production_upload_block_reason", "block_reason", "block_reasons"]) {
    const reason = Array.isArray(raw[key]) ? raw[key].filter(Boolean).join("；") : typeof raw[key] === "string" ? raw[key].trim() : "";
    if (reason) return reason;
  }
  if ((raw.original_order_unit_id || raw.change_request_id || raw.late_stage_flag)
    && Object.hasOwn(raw, "rewrite_upload_confirmed_at") && !raw.rewrite_upload_confirmed_at) return "后置改单需美工确认后才能上传生产图";
  return "";
}

export function validateProductionFile(order, file, panel) {
  if (uploadBlockReason(order)) return uploadBlockReason(order);
  if (!/\.(png|jpe?g)$/i.test(file.name)) return "请选择 JPG、JPEG 或 PNG 图片";
  if (Number(order.raw.production_image_required_count) === 2) {
    if (!["上", "下"].includes(panel)) return "请选择上片或下片";
    const stem = file.name.replace(/\.[^.]+$/, "");
    const suffix = [`-${panel}`, `_${panel}`].find((value) => stem.endsWith(value));
    if (!suffix) return `文件名必须以 -${panel} 结尾，例如 ${order.sequence}-${panel}.png`;
    const serial = stem.slice(0, -suffix.length).trim();
    if (![order.sequence, order.tag, order.orderNo].map(String).includes(serial)) return `文件名序号必须匹配当前订单，例如 ${order.sequence}-${panel}.png`;
  }
  return "";
}

export function columnOptions(response = {}) {
  return Object.fromEntries(Object.entries(COLUMN_FIELDS).map(([key, raw]) => [key,
    (response[raw] || []).map((item) => typeof item === "string" ? { value: item, text: item } : { ...item, value: String(item.value), text: item.text || String(item.value) })]));
}
