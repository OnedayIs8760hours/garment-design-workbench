import { create } from "zustand";
import { createInitialDesign, draftKey, normalizeDesignColors, template } from "./config.js";
import { clampElement } from "./model.js";
import { getAccessToken, saveDesignDraft } from "./api.js";

const removedSampleAssetId = "asset-sample-mark";
const maxDraftBytes = 20 * 1024 * 1024;

// 深拷贝设计状态，保证 undo 历史不会被后续修改污染。
function clone(value) {
  return structuredClone(value);
}

// 从浏览器 localStorage 读取并校验草稿。
function readDraft() {
  try {
    // localStorage 中保存的上一次草稿。
    const rawDraft = localStorage.getItem(draftKey);
    if (!rawDraft || rawDraft.length > maxDraftBytes) return null;
    return deserializeDesignState(rawDraft);
  } catch {
    return null;
  }
}

// 将设计状态转成可持久化的 JSON 快照，切断 Zustand 状态对象与请求体之间的引用。
export function serializeDesignState(design) {
  const snapshot = JSON.parse(JSON.stringify(design));
  snapshot.assets = (snapshot.assets ?? []).map(({ dataUrl, url, storageUnavailable, ...asset }) => asset);
  return snapshot;
}

// 将 localStorage/PostgreSQL/Redis 中的 JSON 快照恢复成可供工作台使用的状态。
// 同时按当前模板补齐固定元数据，并过滤已移除素材，避免脏数据破坏编辑器。
export function deserializeDesignState(payload) {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (!parsed || typeof parsed !== "object" || parsed.templateId !== template.templateId) return null;
    if (!parsed.currentPanelId || !template.panels[parsed.currentPanelId]) return null;

    const base = createInitialDesign(template);
    const restored = {
      ...base,
      ...clone(parsed),
      assets: Array.isArray(parsed.assets)
        ? parsed.assets
            .filter((asset) => asset && asset.assetId !== removedSampleAssetId)
            .map(restoreRuntimeAssetData)
        : [],
      panels: {},
    };

    Object.entries(template.panels).forEach(([panelId, templatePanel]) => {
      const savedPanel = parsed.panels?.[panelId] ?? {};
      const elements = Array.isArray(savedPanel.elements)
        ? savedPanel.elements
            .filter((element) => element && element.assetId !== removedSampleAssetId)
            .map((element, index) => ({ ...clampElement(element), zIndex: index + 1 }))
        : [];
      restored.panels[panelId] = {
        ...base.panels[panelId],
        ...savedPanel,
        logicalSize: templatePanel.logicalSize,
        templateImage: templatePanel.templateImage,
        maskImage: templatePanel.maskImage,
        sourceFile: templatePanel.sourceFile,
        bounds: templatePanel.bounds,
        guides: templatePanel.guides,
        elements,
      };
    });

    return normalizeDesignColors(restored);
  } catch {
    return null;
  }
}

// 延迟保存用的定时器句柄。
let saveTimer = null;

// 合并短时间内的频繁修改，延迟写入 localStorage。
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void useDesignStore.getState().saveNow(), 500);
}

// 页面启动时恢复的草稿。
const restoredDraft = readDraft();

// 全局设计状态仓库，集中管理草稿、选择项和撤销历史。
export const useDesignStore = create((set, get) => ({
  // 当前完整设计数据。
  design: restoredDraft ?? createInitialDesign(),
  // 当前选中的画布元素 ID。
  selectedId: null,
  // 撤销栈，保存每次 commit 前的设计快照。
  past: [],
  // 顶栏保存状态文案。
  status: restoredDraft ? "已恢复草稿" : "未保存",
  // 用一个可变 draft 修改设计，并把修改前状态推入撤销栈。
  commit(mutator) {
    // 修改前的设计快照。
    const before = clone(get().design);
    // 即将被 mutator 修改的新设计。
    const next = clone(before);
    mutator(next);
    set({ design: next, past: [...get().past, before].slice(-40), status: "未保存" });
    scheduleSave();
  },
  // 回到上一个设计快照。
  undo() {
    // 当前可用的撤销历史。
    const past = get().past;
    if (!past.length) return;
    set({
      design: past[past.length - 1],
      past: past.slice(0, -1),
      selectedId: null,
      status: "未保存",
    });
    scheduleSave();
  },
  // 设置当前选中的元素。
  select(selectedId) {
    set({ selectedId });
  },
  // 恢复服务端返回的设计，并清空当前撤销历史。
  hydrateDesign(remoteDesign) {
    const restored = deserializeDesignState(remoteDesign);
    if (!restored) {
      return false;
    }
    set({ design: restored, past: [], selectedId: null, status: "已从服务器恢复" });
    try {
      localStorage.setItem(draftKey, JSON.stringify(serializeDesignState(restored)));
    } catch {
      // 本地缓存只是兜底，写入失败不影响服务端数据。
    }
    return true;
  },
  // 创建同一模板下的新设计，保留旧设计在服务端的独立订单草稿中。
  startNewDesign() {
    // 新工作台必须切断旧设计尚未执行的延迟保存，避免旧数据在新设计创建后回写。
    clearTimeout(saveTimer);
    saveTimer = null;
    const next = createInitialDesign(template);
    set({ design: next, past: [], selectedId: null, status: "新设计未保存" });
    try {
      localStorage.setItem(draftKey, JSON.stringify(serializeDesignState(next)));
    } catch {
      // 本地缓存只是兜底，写入失败不影响后续云端保存。
    }
    return next;
  },
  // 立即保存本地兜底，并在已登录时保存到 PostgreSQL/Redis。
  async saveNow() {
    // runtimeDesign 保留本次会话的临时图片 URL；snapshot 才是持久化 JSON。
    const runtimeDesign = { ...get().design, savedAt: new Date().toISOString() };
    const snapshot = serializeDesignState(runtimeDesign);
    try {
      localStorage.setItem(draftKey, JSON.stringify(snapshot));
    } catch {
      // 大图片素材可能超过浏览器配额，服务端保存仍可继续。
    }
    set({ design: runtimeDesign, status: "保存中..." });
    if (!getAccessToken()) {
      set({ status: `已保存本地草稿 ${new Date(runtimeDesign.savedAt).toLocaleTimeString()}` });
      return runtimeDesign;
    }
    try {
      const response = await saveDesignDraft(snapshot.templateId, snapshot);
      const savedDesign = deserializeDesignState(response?.design ?? runtimeDesign) ?? runtimeDesign;
      set({ design: savedDesign, status: `已保存云端 ${new Date(response.updated_at ?? runtimeDesign.savedAt).toLocaleTimeString()}` });
      return savedDesign;
    } catch {
      set({ status: "本地已保存，云端保存失败" });
      return runtimeDesign;
    }
  },
}));

function restoreRuntimeAssetData(asset) {
  if (asset.dataUrl || !asset.internal || !asset.color || typeof document === "undefined") return asset;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Number(asset.originalWidth) || 1);
  canvas.height = Math.max(1, Number(asset.originalHeight) || 1);
  const context = canvas.getContext("2d");
  context.fillStyle = asset.color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { ...asset, dataUrl: canvas.toDataURL("image/png") };
}

// 获取当前正在编辑的裁片状态。
export function currentPanel(design) {
  return design.panels[design.currentPanelId];
}

// 获取当前裁片元素，并按图层顺序排序。
export function currentElements(design) {
  return [...currentPanel(design).elements].sort((a, b) => a.zIndex - b.zIndex);
}
