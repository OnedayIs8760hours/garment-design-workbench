import React from "react";
import { erpArt } from "../../api/erpArt.js";
import { ArtCenterDialog } from "./ArtCenterDialog.jsx";
import { validateProductionFile } from "./erpOrderModel.js";

export function ArtCenterActions({ action, onClose, onDone }) {
  const [files, setFiles] = React.useState([]);
  const [panel, setPanel] = React.useState("");
  const [split, setSplit] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [attempted, setAttempted] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [results, setResults] = React.useState({});
  const submitting = React.useRef(false);
  const order = action.orders?.[0];
  const title = { clear: "清空生产图并撤回", image: "上传生产图", psd: "上传 PSD", global: "全局按名字传图", match: "重新匹配自动单" }[action.kind];
  const needsFiles = ["image", "psd", "global"].includes(action.kind);
  const close = () => { if (!submitting.current) onClose(); };
  const chooseFiles = (event) => {
    const chosen = Array.from(event.target.files || []);
    if (new Set(chosen.map((file) => file.name)).size !== chosen.length) { setError("存在重名文件，请分别上传"); event.target.value = ""; return; }
    setFiles(chosen); setResults({}); setError("");
  };
  const start = async () => {
    if (submitting.current || attempted) return;
    if (needsFiles && !files.length) return setError("请先选择文件");
    if (action.kind === "image") {
      const reason = validateProductionFile(order, files[0], panel);
      if (reason) return setError(reason);
    }
    if (action.kind === "psd" && !/\.psd$/i.test(files[0].name)) return setError("请选择 PSD 文件");
    if (action.kind === "global" && files.some((file) => !/\.(png|jpe?g)$/i.test(file.name))) return setError("全局补图请选择 JPG、JPEG 或 PNG 图片");
    submitting.current = true; setBusy(true); setError(""); setAttempted(true);
    try {
      let result;
      if (action.kind === "clear") result = await erpArt.clearImages(action.orders.map((item) => item.raw.id));
      if (action.kind === "match") result = await erpArt.autoMatch(action.date);
      if (action.kind === "image") result = await erpArt.uploadImage(order.raw.id, files[0], panel);
      if (action.kind === "psd") result = await erpArt.uploadPsd(order.raw.id, files[0], setProgress);
      if (action.kind === "global") {
        await erpArt.patchImages(files, split, (file, success, detail) => setResults((current) => ({ ...current, [file.name]: { success, detail } })));
        setMessage("本次上传已结束，请逐项核对结果。失败项需核对后重新选择上传。");
      } else setMessage(result?.message || (action.kind === "psd" ? "PSD 已提交 ERP 处理" : "操作成功，正在刷新 ERP 订单"));
    } catch (failure) { setError(`${failure.message}${action.kind === "global" ? "" : "。请刷新订单核对处理结果。"}`); }
    finally { submitting.current = false; setBusy(false); onDone(); }
  };
  return <ArtCenterDialog title={title} subtitle={order ? `序列号 ${order.sequence} · 订单号 ${order.orderNo}` : "ERP 美工中心"} onClose={close} className="art-operation-dialog" footer={<>
    <span>{busy ? "正在提交 ERP，请等待处理完成" : attempted ? "处理结果以 ERP 最新订单为准" : "确认后将提交到 ERP"}</span>
    <div><button className="art-button" type="button" disabled={busy} onClick={close}>{attempted ? "关闭" : "取消"}</button>{!attempted && <button className={`art-button ${action.kind === "clear" ? "art-danger-button" : "art-primary-button"}`} type="button" disabled={busy || (needsFiles && !files.length)} onClick={start}>{needsFiles ? "开始上传" : "确认执行"}</button>}</div>
  </>}>
    {action.kind === "clear" && <><p>将清空以下 {action.orders.length} 单的生产图并撤回。仅包含 ERP 当前规则允许清图的订单。</p><ul>{action.orders.map((item) => <li key={item.id}>{item.sequence} · {item.orderNo} · {item.status}</li>)}</ul></>}
    {action.kind === "match" && <p>重新匹配 {action.date || "全部日期"} 的未分配机器单，完成后刷新任务列表。</p>}
    {action.kind === "global" && <><p>ERP 按文件名中的序列号匹配全部订单。选择文件后，点击“开始上传”提交。</p><label className="art-operation-field"><input type="checkbox" checked={split} disabled={attempted} onChange={(event) => setSplit(event.target.checked)} />拆片补图（文件名为序列号-上.png / 序列号-下.png）</label></>}
    {action.kind === "image" && Number(order.raw.production_image_required_count) === 2 && <label className="art-operation-field">拆片位置<select value={panel} onChange={(event) => setPanel(event.target.value)} disabled={attempted}><option value="">请选择</option><option value="上">上片</option><option value="下">下片</option></select><span>文件名：{order.sequence}-{panel || "上/下"}.png</span></label>}
    {needsFiles && <label className="art-operation-field">选择{action.kind === "psd" ? " PSD" : "图片"}<input type="file" accept={action.kind === "psd" ? ".psd" : ".png,.jpg,.jpeg"} multiple={action.kind === "global"} disabled={attempted} onChange={chooseFiles} /></label>}
    {files.length > 0 && <table className="art-upload-table"><thead><tr><th>文件名</th><th>大小</th><th>状态</th></tr></thead><tbody>{files.map((file) => <tr key={file.name}><td>{file.name}</td><td>{(file.size / 1024 / 1024).toFixed(2)} MB</td><td>{results[file.name] ? `${results[file.name].success === true ? "成功" : results[file.name].success === false ? "失败" : "待核对"} · ${results[file.name].detail}` : busy ? "处理中…" : attempted ? "未完成，请核对" : "待上传"}</td></tr>)}</tbody></table>}
    {action.kind === "psd" && attempted && <label className="art-operation-field">上传进度 {progress}%<progress value={progress} max="100" /></label>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="art-api-error">{error}</p>}
  </ArtCenterDialog>;
}
