import {
  abortPsdUpload,
  completePsdUpload,
  getPsdUploadStatus,
  initPsdUpload,
  uploadPsdPartRaw,
} from "./api";

const DEFAULT_CONCURRENCY = 4;
const MAX_PART_RETRIES = 3;

/**
 * 把大 PSD 文件切片并高并发上传到后端，支持失败重试与断点续传。
 *
 * @param {Object} options
 * @param {File} options.file 用户选择的 PSD 文件。
 * @param {string} [options.orderId] 关联的订单号。
 * @param {number} [options.concurrency=4] 同时进行的并发上传请求数（多线程）。
 * @param {string} [options.sessionId] 已存在的中断会话 ID，用于断点续传。
 * @param {Function} [options.onProgress] 进度回调 (uploadedParts, totalParts, partSize)。
 * @param {Function} [options.onPartUploaded] 单分片成功后回调 (partNumber)。
 * @returns {Promise<{asset_id, object_key, bucket, url, etag, size}>} 合并后的对象信息。
 */
export async function uploadPsdFile({
  file,
  orderId,
  concurrency = DEFAULT_CONCURRENCY,
  sessionId,
  onProgress,
  onPartUploaded,
}) {
  if (!file) throw new Error("没有选择文件。");
  if (!/\.psd$/i.test(file.name)) throw new Error("只支持 .psd 文件。");

  const liveConcurrency = Math.max(1, Math.floor(concurrency) || DEFAULT_CONCURRENCY);

  // 初始化会话：新开或复用中断会话。无论哪种都拿到同一套切片参数。
  const init =
    sessionId == null
      ? await initPsdUpload({
          filename: file.name,
          size: file.size,
          content_type: file.type || "application/octet-stream",
          order_id: orderId,
        })
      : await restoreSession(sessionId, file, orderId);
  const { session_id: sid, part_size: partSize, total_parts: totalParts } = init;

  // 断点续传：跳过已经上传到后端的分片。
  const completed = new Set(
    (Array.isArray(init.completed_parts) ? init.completed_parts : []).map((p) => p.part_number)
  );
  const pending = [];
  for (let n = 1; n <= totalParts; n += 1) {
    if (!completed.has(n)) pending.push(n);
  }
  if (pending.length === 0) {
    return completePsdUpload(sid);
  }

  let successCount = 0;
  let nextTaskIndex = 0;
  const running = [];

  // 工作池：最多 liveConcurrency 个并发，每个从队列取一个分片号上传。
  const worker = async () => {
    while (nextTaskIndex < pending.length) {
      const partNumber = pending[nextTaskIndex];
      nextTaskIndex += 1;

      const blob = file.slice((partNumber - 1) * partSize, partNumber * partSize);
      await uploadWithRetry(sid, partNumber, blob);
      successCount += 1;
      onPartUploaded?.(partNumber);
      onProgress?.(successCount, totalParts, partSize);
    }
  };

  try {
    for (let i = 0; i < liveConcurrency; i += 1) running.push(worker());
    await Promise.all(running);
  } catch (error) {
    // 任一 worker 失败：立即中止该次上传，避免留下半成品 multipart 占用 RustFS。
    try {
      await abortPsdUpload(sid);
    } finally {
      throw error;
    }
  }

  return completePsdUpload(sid);
}

async function uploadWithRetry(sid, partNumber, blob) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt += 1) {
    try {
      await uploadPsdPartRaw(sid, partNumber, blob);
      return;
    } catch (error) {
      lastError = error;
      // 网络抖动或瞬时不稳定的分片直接重传；最后一次重试失败则向上抛。
    }
  }
  throw lastError;
}

// 复用既有会话：后端返回的参数一致，只需补齐会话状态以支持续传。
async function restoreSession(sessionId, file, orderId) {
  const status = await getPsdUploadStatus(sessionId);
  return {
    session_id: status.session_id,
    part_size: status.part_size,
    total_parts: status.total_parts,
    completed_parts: status.completed_parts,
  };
}