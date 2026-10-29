import React from "react";
import { ArrowLeft, ArrowRight, Copy, FilePlus2, Trash2, Upload } from "lucide-react";
import { ArtCenterDialog } from "./ArtCenterDialog.jsx";
import { ArtCenterImagePlaceholder } from "./ArtCenterImagePlaceholder.jsx";
import { STATUS_CLASS } from "./artCenterModel.js";
import { canClearImages, uploadBlockReason } from "./erpOrderModel.js";

export function ArtCenterOrderDetail({ order, tasks, onSelect, onClose, onUpload, onUploadPsd, onClear }) {
  const [activePane, setActivePane] = React.useState("style");
  const [scales, setScales] = React.useState({ style: 1, production: 1 });
  const [leftKind, setLeftKind] = React.useState("styleImages");
  const [imageIndexes, setImageIndexes] = React.useState({ style: 0, production: 0 });
  const [qrMessage, setQrMessage] = React.useState("");
  const [copyingQr, setCopyingQr] = React.useState(false);
  React.useEffect(() => { setScales({ style: 1, production: 1 }); setImageIndexes({ style: 0, production: 0 }); setQrMessage(""); }, [order.id]);
  const index = tasks.findIndex((task) => task.id === order.id);
  const scale = scales[activePane];
  const zoom = (delta) => setScales((current) => ({ ...current, [activePane]: Math.max(.25, Math.min(3, current[activePane] + delta)) }));
  const fields = [
    ["前名", order.frontName, true], ["前号", order.frontNumber, true], ["后名", order.backName, true], ["后号", order.backNumber, true],
    ["肩号", order.shoulderNumber, true], ["袖号", order.sleeveNumber, true], ["裤号", order.pantNumber, true], ["文字样式", order.textStyle, true], ["文字颜色", order.textColor, true, true],
    ["品类", order.category, true], ["款式", order.style, true], ["工艺", order.process, true], ["尺码", order.size, true],
    ["数量", order.quantity], ["颜色", order.color], ["SKU/主题", order.sku, false, true], ["产品描述", order.productInfo, false, true],
    ["任务批次", order.taskBatch, false, true], ["生产批次", order.productionBatch, true, true], ["美工编号", order.artCode], ["标签序号", order.tag],
    ["订单号", order.orderNo, false, true], ["ASIN", order.asin], ["店铺", order.shop], ["运单号", order.waybill, false, true],
  ];
  const imagePane = (pane, label, images) => { const current = Math.min(imageIndexes[pane], Math.max(0, images.length - 1)); const src = images[current]; return <section className="preview-pane">
    <div className="preview-pane-header">{pane === "style" ? <select aria-label="参考图片类型" value={leftKind} onChange={(event) => { setLeftKind(event.target.value); setImageIndexes((value) => ({ ...value, style: 0 })); }}><option value="styleImages">款式图</option><option value="psdImages">PSD预览图</option><option value="remarkImages">备注图</option></select> : <span>{label}</span>}<span className="art-preview-count">{images.length} 张</span></div>
    <button type="button" className={`image-preview-wrapper image-preview-wrapper--split${activePane === pane ? " is-active" : ""}`} onClick={() => setActivePane(pane)} aria-label={`选择${label}预览`}>
      {src ? <span className="art-zoom-image" style={{ transform: `scale(${scales[pane]})` }}><ArtCenterImagePlaceholder src={src} label={label} /></span> : <span className="preview-empty">暂无{label}</span>}
    </button>
    {images.length > 1 && <div className="art-image-pagination"><button type="button" className="art-button art-small-button" disabled={current === 0} onClick={() => setImageIndexes((value) => ({ ...value, [pane]: current - 1 }))}>上一张</button><span>{current + 1}/{images.length}</span><button type="button" className="art-button art-small-button" disabled={current === images.length - 1} onClick={() => setImageIndexes((value) => ({ ...value, [pane]: current + 1 }))}>下一张</button></div>}
  </section>; };
  const copyQr = async () => {
    setCopyingQr(true); setQrMessage("");
    try {
      if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error("当前浏览器不支持复制图片，请打开二维码后保存");
      const response = await fetch(order.qrImages[0] || order.qrImage, { credentials: "omit" });
      if (!response.ok) throw new Error("二维码读取失败");
      let blob = await response.blob();
      if (blob.type !== "image/png") {
        const bitmap = await createImageBitmap(blob); const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close(); blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); setQrMessage("二维码已复制");
    } catch (error) { setQrMessage(error.message || "复制失败，请打开二维码后保存"); }
    finally { setCopyingQr(false); }
  };
  const leftLabel = { styleImages: "款式图", psdImages: "PSD预览图", remarkImages: "备注图" }[leftKind];
  return <ArtCenterDialog title="美工任务工作台" onClose={onClose} className="art-workbench-dialog">
    <section className="task-workbench">
      <aside className="task-list-panel">
        <div className="task-list-header"><div><div className="panel-title">任务列表</div><div className="panel-subtitle">当前页 {tasks.length} 单</div></div><button type="button" className="art-button art-small-button" onClick={onClose}>返回表格</button></div>
        <div className="task-list-wheel"><div className="task-list">{tasks.map((task) => <button key={task.id} type="button" className={`task-list-item${task.id === order.id ? " is-active" : ""}`} onClick={() => onSelect(task)}>
          <span className="task-list-item__image"><ArtCenterImagePlaceholder src={task.styleImage} label="款式图" compact /></span><div className="task-list-item__content"><span className="task-code">{task.artCode || "未映射"}</span><div className="task-list-item__tags"><span className={`art-status-tag light ${STATUS_CLASS[task.status]}`}>{task.status}</span><span className="art-priority urgent">序列号 {task.sequence}</span></div></div>
        </button>)}</div></div>
      </aside>
      <main className="task-detail-panel"><div className="audit-preview-shell">
        <div className="audit-preview-toolbar">
          <div className="audit-preview-meta"><span className="meta-item"><span className="meta-label">序列号</span><span className="meta-value">{order.sequence}</span></span><span className="meta-divider">|</span><span className="meta-item"><span className="meta-label">订单号</span><span className="meta-value">{order.orderNo}</span></span><span className="meta-divider">|</span><span className="meta-item"><span className="meta-label">标签序号</span><span className="meta-value">{order.tag}</span></span></div>
          <div className="task-nav-controls"><button type="button" className="art-button art-small-button" disabled={index <= 0} onClick={() => onSelect(tasks[index - 1])}><ArrowLeft size={12} />上一单</button><span className="task-position">{index + 1}/{tasks.length}</span><button type="button" className="art-button art-small-button" disabled={index >= tasks.length - 1} onClick={() => onSelect(tasks[index + 1])}>下一单<ArrowRight size={12} /></button></div>
          <div className="audit-preview-toolbar-right"><div className="preview-zoom-controls"><span className="art-task-batch">{activePane === "style" ? leftLabel : "生产图"}</span><button type="button" className="art-button art-small-button" disabled={scale <= .25} onClick={() => zoom(-.25)}>缩小</button><span className="preview-zoom-value">{Math.round(scale * 100)}%</span><button type="button" className="art-button art-small-button" disabled={scale >= 3} onClick={() => zoom(.25)}>放大</button><button type="button" className="art-button art-small-button" onClick={() => setScales((current) => ({ ...current, [activePane]: 1 }))}>重置</button></div><div className="preview-actions"><button type="button" className="art-button art-primary-button art-small-button" disabled={Boolean(uploadBlockReason(order))} title={uploadBlockReason(order)} onClick={() => onUpload(order)}><Upload size={12} />上传</button><button type="button" className="art-button art-warning-button art-small-button" disabled={Boolean(uploadBlockReason(order))} title={uploadBlockReason(order)} onClick={() => onUploadPsd(order)}><FilePlus2 size={12} />PSD</button><button type="button" className="art-button art-danger-button art-small-button" disabled={!canClearImages(order)} onClick={() => onClear(order)}><Trash2 size={12} />清空</button></div></div>
        </div>
        <div className="audit-preview-layout">
          {imagePane("style", leftLabel, order[leftKind] || [])}
          <section className="audit-info-column">
            {(order.feedback || uploadBlockReason(order)) && <section className="order-issue-card"><div className="order-issue-title">订单问题信息</div><div className="order-issue-content">{order.feedback || uploadBlockReason(order)}</div></section>}
            <section className="audit-info-card"><div className="card-title">订单详情</div><div className="info-grid">{fields.map(([label, value, emphasis, wide]) => <div className={`info-item${wide ? " info-item--full" : ""}`} key={label}><span className="info-label">{label}</span><span className={`info-value${wide ? " info-value--multiline" : ""}${emphasis && value !== "" && value != null ? " is-highlight" : ""}`}>{value === "" || value == null ? "-" : value}</span></div>)}</div></section>
            <section className="order-qr-card"><div className="order-qr-card__header"><span>订单二维码</span><button type="button" className="art-button art-small-button" disabled={!order.qrImage || copyingQr} onClick={copyQr}><Copy size={12} />{copyingQr ? "正在复制…" : "复制二维码图片"}</button></div>{order.qrImage ? <a href={order.qrImages[0] || order.qrImage} target="_blank" rel="noreferrer"><ArtCenterImagePlaceholder src={order.qrImage} label="订单二维码" /></a> : <div className="order-qr-empty">暂无订单二维码</div>}{qrMessage && <p role="status">{qrMessage}</p>}</section>
          </section>
          {imagePane("production", "生产图", order.productionImages || [])}
        </div>
      </div></main>
    </section>
  </ArtCenterDialog>;
}
