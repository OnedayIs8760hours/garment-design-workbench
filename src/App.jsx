import React from "react";
import { clampElement, createExportJson, validateDesign } from "./model.js";
import { currentPanel, useDesignStore } from "./designStore.js";
import { createImageElement, createTextElement } from "./elements.js";
import { downloadZip } from "./download.js";
import { Header } from "./components/Header.jsx";
import { ToolsSidebar } from "./components/ToolsSidebar.jsx";
import { PanelTabs, BottomPanels } from "./components/EditorPanels.jsx";
import { PanelStage } from "./components/PanelStage.jsx";
import { PreviewPane } from "./components/PreviewPane.jsx";

// 应用根组件，负责连接状态仓库、编辑器和预览区域。
export function App() {
  // 从全局 store 读取设计数据、选择状态和操作方法。
  const { design, selectedId, status, past, commit, undo, select, saveNow } = useDesignStore();
  // 当前设计的校验结果。
  const validation = validateDesign(design);
  // 当前选中的元素对象。
  const selected = currentPanel(design).elements.find((element) => element.id === selectedId);
  // 所有裁片上元素数量的总和。
  const totalElements = Object.values(design.panels).reduce((sum, panel) => sum + panel.elements.length, 0);
  // 当前设计的导出 JSON。
  const exportJson = createExportJson(design, validation);
  // 是否有可撤销历史。
  const canUndo = past.length > 0;
  // 是否有可清空的画布元素。
  const canReset = totalElements > 0;

  React.useEffect(() => {
    // 处理 Ctrl+Z 撤销快捷键。
    const onKeyDown = (event) => {
      // 当前键盘事件来源元素。
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (!(event.ctrlKey || event.metaKey)) return;

      // 标准化后的按键名。
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey && canUndo) {
        event.preventDefault();
        undo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, undo]);

  // 添加任意已经构造好的元素到当前裁片。
  const addElement = (element) => {
    commit((draft) => {
      // 当前 draft 中正在编辑的裁片。
      const panel = currentPanel(draft);
      panel.elements.push({ ...element, id: `element-${Date.now()}`, zIndex: panel.elements.length + 1 });
      panel.changed = true;
    });
  };

  // 添加图片素材到素材清单，并在当前裁片放置一个图片元素。
  const addImage = (asset) => {
    // 当前裁片模板，用于计算图片默认宽高比。
    const panel = currentPanel(design);
    // 将素材转换成可编辑的图片元素。
    const element = createImageElement(
      asset.assetId,
      asset.originalWidth / asset.originalHeight,
      panel.logicalSize.width / panel.logicalSize.height,
    );
    commit((draft) => {
      if (!draft.assets.some((item) => item.assetId === asset.assetId)) draft.assets.push(asset);
      // 当前 draft 中正在编辑的裁片。
      const panel = currentPanel(draft);
      panel.elements.push({ ...element, id: `element-${Date.now()}`, zIndex: panel.elements.length + 1 });
      panel.changed = true;
    });
  };

  // 添加姓名或号码文字元素。
  const addText = (role) => addElement(createTextElement(role));

  // 处理图片上传，将文件读成 dataUrl 后加入素材清单。
  const onUpload = (event) => {
    // 上传控件选中的第一个文件。
    const file = event.target.files?.[0];
    if (!file) return;
    // 浏览器文件读取器。
    const reader = new FileReader();
    reader.onload = () => {
      // 临时图片对象，用于读取原始宽高。
      const image = new Image();
      image.onload = () => {
        // 上传后写入素材清单的素材对象。
        const asset = createUploadedAsset(file, reader.result, image);
        addImage(asset);
      };
      image.onerror = () => {
        // 读取宽高失败时仍然保留素材内容。
        const asset = createUploadedAsset(file, reader.result);
        addImage(asset);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  // 更新指定元素的属性。
  const updateElement = (id, patch) => {
    commit((draft) => {
      // 当前要修改的元素。
      const element = currentPanel(draft).elements.find((item) => item.id === id);
      Object.assign(element, clampElement({ ...element, ...patch }));
      currentPanel(draft).changed = true;
    });
  };

  // 删除当前选中的元素。
  const removeSelected = () => {
    if (!selectedId) return;
    commit((draft) => {
      currentPanel(draft).elements = currentPanel(draft).elements
        .filter((element) => element.id !== selectedId)
        .map((element, index) => ({ ...element, zIndex: index + 1 }));
      currentPanel(draft).changed = true;
    });
    select(null);
  };

  // 清空所有裁片上的元素，作为“重做/重新开始”操作。
  const resetDesign = () => {
    if (!canReset) return;
    commit((draft) => {
      Object.values(draft.panels).forEach((panel) => {
        panel.elements = [];
        panel.changed = true;
      });
    });
    select(null);
  };

  // 清空素材清单，并删除画布上所有图片元素。
  const clearAssets = () => {
    if (!design.assets.length) return;
    commit((draft) => {
      draft.assets = [];
      Object.values(draft.panels).forEach((panel) => {
        panel.elements = panel.elements
          .filter((element) => element.type !== "image")
          .map((element, zIndex) => ({ ...element, zIndex: zIndex + 1 }));
        panel.changed = true;
      });
    });
    select(null);
  };

  // 调整图层顺序，direction 为 1 表示上移，-1 表示下移。
  const moveLayer = (id, direction) => {
    commit((draft) => {
      // 当前 draft 中正在编辑的裁片。
      const panel = currentPanel(draft);
      // 当前裁片按图层顺序排列后的元素列表。
      const elements = [...panel.elements].sort((a, b) => a.zIndex - b.zIndex);
      // 被移动元素在排序列表中的位置。
      const index = elements.findIndex((element) => element.id === id);
      // 移动后的目标位置。
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= elements.length) return;
      [elements[index], elements[nextIndex]] = [elements[nextIndex], elements[index]];
      panel.elements = elements.map((element, zIndex) => ({ ...element, zIndex: zIndex + 1 }));
      panel.changed = true;
    });
  };

  return (
    <div className="app">
      <Header
        status={status}
        totalElements={totalElements}
        validation={validation}
        canUndo={canUndo}
        canReset={canReset}
        onUndo={undo}
        onReset={resetDesign}
        onSave={saveNow}
        onExportPackage={() => downloadZip(design, exportJson)}
      />

      <main className="workspace">
        <ToolsSidebar design={design} commit={commit} addImage={addImage} addText={addText} onUpload={onUpload} clearAssets={clearAssets} />
        <section className="editor">
          <PanelTabs design={design} commit={commit} />
          <div className="canvas-shell">
            <PanelStage design={design} selectedId={selectedId} onSelect={select} onChange={updateElement} />
          </div>
          <BottomPanels
            design={design}
            selected={selected}
            selectedId={selectedId}
            select={select}
            updateElement={updateElement}
            moveLayer={moveLayer}
            removeSelected={removeSelected}
          />
        </section>
        <PreviewPane design={design} validation={validation} />
      </main>
    </div>
  );
}

// 根据上传文件生成素材对象。
function createUploadedAsset(file, dataUrl, image) {
  return {
    // 素材唯一 ID。
    assetId: `asset-${Date.now()}`,
    // 素材类型。
    type: "image",
    // 原始文件名。
    name: file.name,
    // 预览文件名。
    previewFile: file.name,
    // 导出时使用的源文件名。
    sourceFile: file.name,
    // 浏览器里保存的图片内容。
    dataUrl,
    // 原图宽度，用于初始等比缩放。
    originalWidth: image?.naturalWidth,
    // 原图高度，用于初始等比缩放。
    originalHeight: image?.naturalHeight,
    // 上传时间。
    uploadedAt: new Date().toISOString(),
  };
}
