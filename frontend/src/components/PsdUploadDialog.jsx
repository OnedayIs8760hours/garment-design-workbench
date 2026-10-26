import React from "react";
import { AlertTriangle, Check, CloudUpload, Loader2, X } from "lucide-react";

// PSD 大文件分片上传进度弹窗。state 由调用方维护：
//   null 表示隐藏；{ phase:'uploading'|'done'|'error', uploaded, total, message, result }
export function PsdUploadDialog({ state, onClose }) {
  const { phase, uploaded = 0, total = 0, message } = state;
  const uploading = phase === "uploading";
  const percent = total > 0 ? Math.min(100, Math.round((uploaded / total) * 100)) : 0;

  return (
    <div className="psd-upload-backdrop" role="dialog" aria-modal="true" aria-label="PSD 上传">
      <div className="psd-upload-dialog">
        <div className="psd-upload-head">
          <h2>PSD 上传</h2>
          <button
            type="button"
            className="psd-upload-close"
            disabled={uploading}
            onClick={onClose}
            aria-label="关闭"
            title={uploading ? "上传中，请稍候" : "关闭"}
          >
            {phase === "uploading" ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
          </button>
        </div>

        <div className="psd-upload-status">
          {phase === "done" && <Check size={20} aria-hidden="true" />}
          {phase === "error" && <AlertTriangle size={20} aria-hidden="true" />}
          {phase === "uploading" && <CloudUpload size={20} aria-hidden="true" />}
          <span>{message || (uploading ? "正在分片上传..." : "")}</span>
        </div>

        {uploading && (
          <>
            <div className="psd-upload-track">
              <div className="psd-upload-bar" style={{ width: `${percent}%` }} />
            </div>
            <div className="psd-upload-meta">
              <span>{percent}%</span>
              <span>
                分片 {Math.min(uploaded, total)} / {total}
              </span>
            </div>
          </>
        )}

        {phase === "done" && (
          <p className="psd-upload-note">已合并，对象键：{state.result?.object_key || "--"}</p>
        )}
      </div>
    </div>
  );
}