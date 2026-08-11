import { create } from "zustand";
import { createInitialDesign, draftKey, template } from "./config.js";

const removedSampleAssetId = "asset-sample-mark";

// 深拷贝设计状态，保证 undo 历史不会被后续修改污染。
function clone(value) {
  return structuredClone(value);
}

// 从浏览器 localStorage 读取并校验草稿。
function readDraft() {
  try {
    // localStorage 中保存的上一次草稿。
    const draft = JSON.parse(localStorage.getItem(draftKey));
    if (!draft || draft.templateId !== template.templateId || !template.panels[draft.currentPanelId]) return null;
    draft.assets = (draft.assets ?? []).filter((asset) => asset.assetId !== removedSampleAssetId);
    Object.values(draft.panels).forEach((panel) => {
      panel.elements = (panel.elements ?? [])
        .filter((element) => element.assetId !== removedSampleAssetId)
        .map((element, index) => ({ ...element, zIndex: index + 1 }));
    });
    return draft;
  } catch {
    return null;
  }
}

// 延迟保存用的定时器句柄。
let saveTimer = null;

// 合并短时间内的频繁修改，延迟写入 localStorage。
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => useDesignStore.getState().saveNow(), 500);
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
  // 立即把当前设计写入 localStorage。
  saveNow() {
    // 带最新保存时间的设计对象。
    const design = { ...get().design, savedAt: new Date().toISOString() };
    localStorage.setItem(draftKey, JSON.stringify(design));
    set({ design, status: `已保存 ${new Date(design.savedAt).toLocaleTimeString()}` });
  },
}));

// 获取当前正在编辑的裁片状态。
export function currentPanel(design) {
  return design.panels[design.currentPanelId];
}

// 获取当前裁片元素，并按图层顺序排序。
export function currentElements(design) {
  return [...currentPanel(design).elements].sort((a, b) => a.zIndex - b.zIndex);
}
