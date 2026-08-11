import { create } from "zustand";
import { createInitialDesign, draftKey, template } from "./config.js";

function clone(value) {
  return structuredClone(value);
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey));
    if (!draft || draft.templateId !== template.templateId || !template.panels[draft.currentPanelId]) return null;
    return draft;
  } catch {
    return null;
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => useDesignStore.getState().saveNow(), 500);
}

const restoredDraft = readDraft();

export const useDesignStore = create((set, get) => ({
  design: restoredDraft ?? createInitialDesign(),
  selectedId: null,
  past: [],
  status: restoredDraft ? "已恢复草稿" : "未保存",
  commit(mutator) {
    const before = clone(get().design);
    const next = clone(before);
    mutator(next);
    set({ design: next, past: [...get().past, before].slice(-40), status: "未保存" });
    scheduleSave();
  },
  undo() {
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
  select(selectedId) {
    set({ selectedId });
  },
  saveNow() {
    const design = { ...get().design, savedAt: new Date().toISOString() };
    localStorage.setItem(draftKey, JSON.stringify(design));
    set({ design, status: `已保存 ${new Date(design.savedAt).toLocaleTimeString()}` });
  },
}));

export function currentPanel(design) {
  return design.panels[design.currentPanelId];
}

export function currentElements(design) {
  return [...currentPanel(design).elements].sort((a, b) => a.zIndex - b.zIndex);
}
