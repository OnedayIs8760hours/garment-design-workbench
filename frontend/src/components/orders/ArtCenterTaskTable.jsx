import React from "react";
import { ArrowUpRight, Image as ImageIcon, QrCode } from "lucide-react";
import { ArtCenterImagePlaceholder } from "./ArtCenterImagePlaceholder.jsx";
import { formatMockDate } from "../../mock/artCenterOrders.js";

const STATUS_CLASS = {
  "待处理": "pending",
  "做图中": "working",
  "驳回": "rejected",
  "待审核": "review",
  "设计完成": "done",
  "生产中": "production",
  "已发货": "shipped",
  "异常": "error",
};

function ProductImage({ src, label }) {
  return src ? <ArtCenterImagePlaceholder label={label === "款式图" ? "款式" : "生产"} compact /> : <span className="art-image-empty"><ImageIcon size={15} aria-hidden="true" /></span>;
}

export function ArtCenterTaskTable({ orders, selectedIds, onToggle, onToggleAll, onOpenOrder }) {
  const allSelected = orders.length > 0 && orders.every((order) => selectedIds.includes(order.id));

  return (
    <section className="art-task-table-card" aria-label="美工任务订单列表">
      <div className="art-task-table-meta">
        <div><strong>沃达任务</strong><span className="art-result-count">共 {orders.length} 单</span></div>
        <span>勾选订单后可执行批量操作</span>
      </div>
      <div className="art-task-table-scroll">
        <table className="art-task-table">
          <thead><tr>
            <th className="art-check-column"><input type="checkbox" aria-label="选择当前筛选的全部订单" checked={allSelected} onChange={onToggleAll} /></th>
            <th>序列号</th><th>优先级</th><th>任务批次</th><th>生产批次</th><th>美工编码（底板）</th><th>标签序号</th>
            <th>款式图</th><th>生产图</th><th>订单二维码</th><th>备注图（1-4）</th><th>订单号</th><th>SKU / 主题</th>
            <th>状态</th><th>品名 / 款式</th><th>工艺</th><th>尺码</th><th>数量</th><th>姓名 / 号码</th><th>下单时间</th><th>快捷操作</th>
          </tr></thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="art-check-column"><input type="checkbox" aria-label={`选择订单 ${order.orderNo}`} checked={selectedIds.includes(order.id)} onChange={() => onToggle(order.id)} /></td>
                <td className="art-sequence">{order.sequence}</td>
                <td><span className={`art-priority${order.priority === "加急" ? " urgent" : ""}`}>{order.priority}</span></td>
                <td><span className="art-cell-main">{order.taskBatch}</span><small className="art-cell-sub">{order.isMachine ? "机器单" : "人工单"}</small></td>
                <td>{order.productionBatch}</td>
                <td className="art-mono">{order.artCode}</td>
                <td><span className="art-tag-number">{order.tag}</span></td>
                <td><ProductImage src={order.styleImage} label="款式图" /></td>
                <td><ProductImage src={order.productionImage} label="生产图" /></td>
                <td><span className="art-qr-placeholder" aria-label="模拟订单二维码"><QrCode size={31} strokeWidth={1.5} aria-hidden="true" /></span></td>
                <td><span className="art-note-images">{order.wrongImage ? <b className="has-note">1</b> : <span>—</span>}{!order.wrongImage && <small>无备注图</small>}</span></td>
                <td><strong className="art-order-number">{order.orderNo}</strong></td>
                <td><span className="art-cell-main">{order.sku.split(" / ")[0]}</span><small className="art-cell-sub">{order.sku.split(" / ")[1]}</small></td>
                <td><span className={`art-status-tag ${STATUS_CLASS[order.status] || "pending"}`}><i />{order.status}</span>{order.wrongImage && <small className="art-cell-sub art-error-note">图片需核对</small>}</td>
                <td><span className="art-cell-main">{order.product}</span><small className="art-cell-sub">{order.style}</small></td>
                <td><span className="art-process-tag">{order.process}</span></td>
                <td>{order.size}</td>
                <td className="art-quantity">{order.quantity}</td>
                <td><span className="art-cell-main">{order.name}</span><small className="art-cell-sub">#{order.number}</small></td>
                <td className="art-time-cell">{formatMockDate(order.createdAt)}</td>
                <td><button className="art-open-task" type="button" onClick={() => onOpenOrder(order)}>打开任务<ArrowUpRight size={14} aria-hidden="true" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <div className="art-table-empty"><ImageIcon size={25} aria-hidden="true" /><strong>暂无符合条件的任务</strong><span>试试调整日期、状态或筛选条件</span></div>}
      </div>
      <footer className="art-task-table-footer"><span>当前显示 {orders.length} 条</span><span>共 {orders.length} 条演示数据</span></footer>
    </section>
  );
}
