import React from "react";
import { clampElement, createExportJson, validateDesign } from "./model.js";
import { currentPanel, useDesignStore } from "./designStore.js";
import { createImageElement, createTextElement } from "./elements.js";
import { downloadZip } from "./download.js";
import { Header } from "./components/Header.jsx";
import { ToolsSidebar } from "./components/ToolsSidebar.jsx";
import { EditorRibbon, PanelTabs, BottomPanels } from "./components/EditorPanels.jsx";
import { PanelStage } from "./components/PanelStage.jsx";
import { PreviewPane } from "./components/PreviewPane.jsx";

export function App() {
  const { design, selectedId, status, past, future, commit, undo, redo, select, saveNow } = useDesignStore();
  const validation = validateDesign(design);
  const selected = currentPanel(design).elements.find((element) => element.id === selectedId);
  const totalElements = Object.values(design.panels).reduce((sum, panel) => sum + panel.elements.length, 0);
  const exportJson = createExportJson(design, validation);
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  React.useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (!(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey && canRedo) {
        event.preventDefault();
        redo();
      } else if (key === "y" && canRedo) {
        event.preventDefault();
        redo();
      } else if (key === "z" && canUndo) {
        event.preventDefault();
        undo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canRedo, canUndo, redo, undo]);

  const addElement = (element) => {
    commit((draft) => {
      const panel = currentPanel(draft);
      panel.elements.push({ ...element, id: `element-${Date.now()}`, zIndex: panel.elements.length + 1 });
      panel.changed = true;
    });
  };

  const addImage = (asset) => {
    const panel = currentPanel(design);
    addElement(createImageElement(
      asset.assetId,
      asset.originalWidth / asset.originalHeight,
      panel.logicalSize.width / panel.logicalSize.height,
    ));
  };
  const addText = (role) => addElement(createTextElement(role));

  const onUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const asset = createUploadedAsset(file, reader.result, image);
        commit((draft) => draft.assets.push(asset));
        addImage(asset);
      };
      image.onerror = () => {
        const asset = createUploadedAsset(file, reader.result);
        commit((draft) => draft.assets.push(asset));
        addImage(asset);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const updateElement = (id, patch) => {
    commit((draft) => {
      const element = currentPanel(draft).elements.find((item) => item.id === id);
      Object.assign(element, clampElement({ ...element, ...patch }));
      currentPanel(draft).changed = true;
    });
  };

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

  const moveLayer = (id, direction) => {
    commit((draft) => {
      const panel = currentPanel(draft);
      const elements = [...panel.elements].sort((a, b) => a.zIndex - b.zIndex);
      const index = elements.findIndex((element) => element.id === id);
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
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onSave={saveNow}
        onExportPackage={() => downloadZip(design, exportJson)}
      />

      <main className="workspace">
        <ToolsSidebar design={design} commit={commit} addImage={addImage} addText={addText} onUpload={onUpload} />
        <section className="editor">
          <EditorRibbon />
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

function createUploadedAsset(file, dataUrl, image) {
  return {
    assetId: `asset-${Date.now()}`,
    type: "image",
    name: file.name,
    previewFile: file.name,
    sourceFile: file.name,
    dataUrl,
    originalWidth: image?.naturalWidth,
    originalHeight: image?.naturalHeight,
    uploadedAt: new Date().toISOString(),
  };
}
