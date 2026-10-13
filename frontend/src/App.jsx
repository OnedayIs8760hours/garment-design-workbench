import React from "react";
import { PanelLeftClose } from "lucide-react";
import { clampElement, createExportJson, validateDesign } from "./model.js";
import { currentPanel, useDesignStore } from "./designStore.js";
import { createImageElement, createTextElement } from "./elements.js";
import { downloadZip } from "./download.js";
import { Header } from "./components/Header.jsx";
import { ToolsSidebar } from "./components/ToolsSidebar.jsx";
import { PanelTabs, BottomPanels } from "./components/EditorPanels.jsx";
import { PanelStage } from "./components/PanelStage.jsx";
import { PreviewPane } from "./components/PreviewPane.jsx";
import { PsdUploadDialog } from "./components/PsdUploadDialog.jsx";
import { uploadPsdFile } from "./psdUpload.js";
import { activeTemplateId, resolveTemplateId, selectedTemplateIdFromLocation, templateSelectionStorageKey } from "../templates/index.js";
import { LoginPrototype } from "./pages/LoginPrototype.jsx";
import { RegisterPrototype } from "./pages/RegisterPrototype.jsx";
import { PersonalHome } from "./pages/PersonalHome.jsx";
import { WorkspaceShell } from "./components/WorkspaceShell.jsx";
import { WorkspaceOverview } from "./pages/WorkspaceOverview.jsx";
import { TemplateLibrary } from "./pages/TemplateLibrary.jsx";
import { AssetLibrary } from "./pages/AssetLibrary.jsx";
import { OrdersWorkspace } from "./pages/OrdersWorkspace.jsx";
import { FinishedWorkspace } from "./pages/FinishedWorkspace.jsx";
import {
  clearAccessToken,
  deleteDesignAsset,
  getAccessToken,
  getCurrentUser,
  getDesignDraft,
  listDesignDrafts,
  logoutUser,
  uploadDesignAsset,
} from "./api.js";

// 应用根组件，负责连接状态仓库、编辑器和预览区域。
export function App() {
  const [auth, setAuth] = React.useState(() => ({
    status: getAccessToken() ? "checking" : "anonymous",
    user: null,
  }));
  // 当前认证界面：login 为登录页，register 为注册页。
  const [authScreen, setAuthScreen] = React.useState("login");
  // 注册完成后带回的用户名，用于登录页预填。
  const [pendingUsername, setPendingUsername] = React.useState("");
  // 登录后默认进入个人草稿首页，只有打开或新建后才进入编辑工作台。
  const [workspace, setWorkspace] = React.useState(() => readInitialWorkspace());
  // 工作台内的模块导航与编辑器独立，避免影响现有编辑器 URL 和状态。
  const [activeSection, setActiveSection] = React.useState("home");

  const openWorkspace = React.useCallback((draft, options = {}) => {
    const targetTemplateId = resolveTemplateId(options.templateId || draft?.template_id || selectedTemplateIdFromLocation() || activeTemplateId);
    const currentTemplateId = selectedTemplateIdFromLocation();
    const nextWorkspace = {
      orderId: draft?.order_id || null,
      isNewDesign: Boolean(options.newDesign),
    };
    if (targetTemplateId !== currentTemplateId) {
      localStorage.setItem(templateSelectionStorageKey, targetTemplateId);
      sessionStorage.setItem("woda-pending-workspace", JSON.stringify({ ...nextWorkspace, templateId: targetTemplateId }));
      const url = new URL(window.location.href);
      url.searchParams.set("template", targetTemplateId);
      window.location.assign(url.toString());
      return;
    }
    // 同模板的新建设计先在内存中生成全新的订单号和空白状态，
    // 再进入工作台；这样首屏不会短暂显示旧草稿，也不会覆盖旧订单。
    if (options.newDesign) {
      const newDesign = useDesignStore.getState().startNewDesign();
      nextWorkspace.orderId = newDesign.orderId;
      nextWorkspace.isNewDesign = false;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("screen", "editor");
    url.searchParams.set("template", targetTemplateId);
    window.history.replaceState(null, "", url.toString());
    setWorkspace(nextWorkspace);
  }, []);

  React.useEffect(() => {
    if (auth.status !== "checking") return undefined;

    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setAuth({ status: "authenticated", user });
      })
      .catch(() => {
        clearAccessToken();
        if (!cancelled) setAuth({ status: "anonymous", user: null });
      });

    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  if (auth.status === "checking") {
    return <main className="auth-loading">正在验证登录状态...</main>;
  }

  if (auth.status === "anonymous") {
    if (authScreen === "register") {
      return (
        <RegisterPrototype
          onBackToLogin={(username) => {
            setPendingUsername(username || "");
            setAuthScreen("login");
          }}
        />
      );
    }
    return (
      <LoginPrototype
        initialUsername={pendingUsername}
        initialMessage={pendingUsername ? "账号创建成功，请登录。" : undefined}
        onRegister={() => {
          setPendingUsername("");
          setAuthScreen("register");
        }}
        onLogin={({ user }) => {
          setAuth({ status: "authenticated", user });
        }}
      />
    );
  }

  const signOut = async () => {
    try {
      await logoutUser();
    } catch {
      clearAccessToken();
    }
    setWorkspace(null);
    setActiveSection("home");
    returnToHome();
    setAuth({ status: "anonymous", user: null });
  };

  if (!workspace) {
    return (
      <WorkspaceShell
        activeSection={activeSection}
        onNavigate={setActiveSection}
        user={auth.user}
        onSignOut={signOut}
      >
        {activeSection === "home" ? (
          <WorkspaceOverview
            user={auth.user}
            onNavigate={setActiveSection}
            onOpenDraft={(draft) => openWorkspace(draft)}
            onNewDesign={() => openWorkspace(null, { newDesign: true })}
          />
        ) : activeSection === "products" ? (
          <TemplateLibrary onStartDesign={(templateId) => openWorkspace(null, { newDesign: true, templateId })} />
        ) : activeSection === "design" ? (
          <PersonalHome
            user={auth.user}
            embedded
            onOpenDraft={(draft) => openWorkspace(draft)}
            onNewDesign={() => openWorkspace(null, { newDesign: true })}
            onSignOut={signOut}
          />
        ) : activeSection === "assets" ? (
          <AssetLibrary
            onOpenDraft={(draft) => openWorkspace(draft)}
            onNavigate={setActiveSection}
          />
        ) : activeSection === "orders" ? (
          <OrdersWorkspace onOpenDraft={(draft) => openWorkspace(draft)} />
        ) : (
          <FinishedWorkspace onNavigate={setActiveSection} />
        )}
      </WorkspaceShell>
    );
  }

  return (
    <EditorApp
      user={auth.user}
      draftOrderId={workspace.orderId}
      isNewDesign={workspace.isNewDesign}
      onBackHome={async () => {
        await useDesignStore.getState().saveNow();
        returnToHome();
        setActiveSection("design");
        setWorkspace(null);
      }}
      onSignOut={signOut}
    />
  );
}

function readPendingWorkspace() {
  try {
    const raw = sessionStorage.getItem("woda-pending-workspace");
    if (!raw) return null;
    sessionStorage.removeItem("woda-pending-workspace");
    const pending = JSON.parse(raw);
    return pending?.templateId === selectedTemplateIdFromLocation() ? pending : null;
  } catch {
    return null;
  }
}

function readInitialWorkspace() {
  const pending = readPendingWorkspace();
  if (pending) return pending;
  const screen = new URLSearchParams(window.location.search).get("screen");
  return screen === "editor" ? { orderId: null, isNewDesign: false } : null;
}

function openEditor() {
  const url = new URL(window.location.href);
  url.searchParams.set("screen", "editor");
  window.history.replaceState(null, "", url.toString());
}

function returnToHome() {
  const url = new URL(window.location.href);
  // 草稿箱是应用的固定入口，不把当前编辑器的模板和 screen 参数带回去。
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function EditorApp({ user, draftOrderId, isNewDesign, onBackHome, onSignOut }) {
  // 从全局 store 读取设计数据、选择状态和操作方法。
  const { design, selectedId, status, past, commit, undo, select, saveNow, hydrateDesign, startNewDesign } = useDesignStore();
  const templateId = design.templateId;
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [drafts, setDrafts] = React.useState([]);
  const [psdUpload, setPsdUpload] = React.useState(null);
  const psdFileInputRef = React.useRef(null);

  const refreshDrafts = React.useCallback(() => {
    return listDesignDrafts(templateId)
      .then((items) => setDrafts(Array.isArray(items) ? items : []))
      .catch(() => setDrafts([]));
  }, [templateId]);

  React.useEffect(() => {
    let cancelled = false;
    useDesignStore.setState({ status: "正在加载云端设计..." });
    if (isNewDesign) {
      startNewDesign();
      void saveNow();
      void refreshDrafts();
      return () => {
        cancelled = true;
      };
    }
    getDesignDraft(templateId, draftOrderId)
      .then((draft) => {
        if (cancelled) return;
        if (draft?.design) {
          hydrateDesign(draft.design);
        } else {
          void saveNow();
        }
      })
      .catch(() => {
        if (!cancelled) useDesignStore.setState({ status: "云端读取失败，使用本地草稿" });
      });
    void refreshDrafts();
    return () => {
      cancelled = true;
    };
  }, [templateId, draftOrderId, isNewDesign, hydrateDesign, saveNow, startNewDesign, refreshDrafts]);
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

  const handleSave = async () => {
    await saveNow();
    await refreshDrafts();
  };

  const handleNewDesign = async () => {
    startNewDesign();
    await saveNow();
    await refreshDrafts();
  };

  const handleOpenDraft = async (orderId) => {
    const draft = await getDesignDraft(templateId, orderId);
    if (draft?.design) hydrateDesign(draft.design);
  };

  const switchTemplate = (templateId) => {
    const nextTemplateId = resolveTemplateId(templateId);
    if (nextTemplateId === design.templateId) return;
    localStorage.setItem(templateSelectionStorageKey, nextTemplateId);
    const url = new URL(window.location.href);
    url.searchParams.set("template", nextTemplateId);
    window.location.assign(url.toString());
  };

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

  const applyPanelColor = (color, panelIds = [design.currentPanelId]) => {
    const panelColors = panelIds.map((panelId) => {
      const panel = design.panels[panelId];
      return {
        panelId,
        assetId: `asset-panel-color-${panelId}`,
        dataUrl: createColorCanvasDataUrl(color, panel.logicalSize.width, panel.logicalSize.height),
        width: panel.logicalSize.width,
        height: panel.logicalSize.height,
      };
    });
    commit((draft) => {
      panelColors.forEach(({ panelId, assetId, dataUrl, width, height }) => {
        const draftPanel = draft.panels[panelId];
        const asset = {
          assetId,
          type: "image",
          name: `${panelId}底色`,
          previewFile: `${panelId}-color.png`,
          sourceFile: `${panelId}-color.png`,
          dataUrl,
          color,
          originalWidth: width,
          originalHeight: height,
          internal: true,
        };
        const assetIndex = draft.assets.findIndex((item) => item.assetId === assetId);
        if (assetIndex >= 0) draft.assets[assetIndex] = asset;
        else draft.assets.push(asset);

        const colorElement = {
          id: `element-panel-color-${panelId}`,
          type: "image",
          role: "panel-color",
          assetId,
          centerX: 0.5,
          centerY: 0.5,
          width: 1,
          height: 1,
          rotation: 0,
          opacity: 1,
          flipX: false,
          flipY: false,
          visible: true,
          locked: true,
          zIndex: 1,
        };
        draftPanel.elements = [colorElement, ...draftPanel.elements.filter((element) => element.id !== colorElement.id)]
          .map((element, index) => ({ ...element, zIndex: index + 1 }));
        draftPanel.changed = true;
      });
    });
  };

  const applyAllPanelColors = (color) => applyPanelColor(color, Object.keys(design.panels));

  // 处理图片上传：原文件写入 RustFS，设计状态只保留对象键和临时预览 URL。
  const onUpload = async (event) => {
    // 上传控件选中的第一个文件。
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const localUrl = URL.createObjectURL(file);
    useDesignStore.setState({ status: "正在上传图片到 RustFS..." });
    try {
      const [storage, image] = await Promise.all([
        uploadDesignAsset(file, design.orderId),
        loadBrowserImage(localUrl).catch(() => null),
      ]);
      addImage(createUploadedAsset(file, storage, image));
      useDesignStore.setState({ status: "图片已保存到 RustFS" });
    } catch (error) {
      useDesignStore.setState({ status: error?.message || "图片上传失败" });
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  };

  // 打开 PSD 文件选择框。
  const onImportPsd = () => {
    psdFileInputRef.current?.click();
  };

  // 处理 PSD 大文件：分片并发上传到 RustFS，用弹窗展示进度。
  const onUploadPsd = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPsdUpload({ phase: "uploading", uploaded: 0, total: 0, message: "正在初始化 PSD 上传会话..." });
    try {
      const result = await uploadPsdFile({
        file,
        orderId: design.orderId,
        onProgress: (uploaded, total) =>
          setPsdUpload((state) => ({ ...state, phase: "uploading", uploaded, total, message: `正在分片上传 ${file.name}...` })),
      });
      setPsdUpload({ phase: "done", uploaded: result.size || 0, total: 1, message: `PSD 上传并合并完成`, result });
    } catch (error) {
      setPsdUpload({ phase: "error", message: error?.message || "PSD 上传失败" });
    }
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
  const clearAssets = async () => {
    const removedAssets = design.assets.filter((asset) => !asset.internal);
    if (!removedAssets.length) return;
    commit((draft) => {
      draft.assets = draft.assets.filter((asset) => asset.internal);
      Object.values(draft.panels).forEach((panel) => {
        panel.elements = panel.elements
          .filter((element) => element.type !== "image" || element.role === "panel-color")
          .map((element, zIndex) => ({ ...element, zIndex: zIndex + 1 }));
        panel.changed = true;
      });
    });
    select(null);
    await Promise.allSettled(
      removedAssets.filter((asset) => asset.objectKey).map((asset) => deleteDesignAsset(asset.objectKey)),
    );
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
        onSave={handleSave}
        onNewDesign={handleNewDesign}
        onBackHome={onBackHome}
        onExportPackage={() => downloadZip(design, exportJson)}
        onImportPsd={onImportPsd}
        onTemplateChange={switchTemplate}
        onSignOut={onSignOut}
        user={user}
      />

      <main className={sidebarCollapsed ? "workspace sidebar-collapsed" : "workspace"}>
        <ToolsSidebar
          design={design}
          addImage={addImage}
          addText={addText}
          onUpload={onUpload}
          clearAssets={clearAssets}
          applyPanelColor={applyPanelColor}
          applyAllPanelColors={applyAllPanelColors}
          collapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          drafts={drafts}
          onOpenDraft={handleOpenDraft}
          onRefreshDrafts={refreshDrafts}
        />
        {!sidebarCollapsed && (
          <button
            className="sidebar-collapse-button"
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="收起素材面板"
            title="收起素材面板"
          >
            <PanelLeftClose size={18} aria-hidden="true" />
          </button>
        )}
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

      <input
        ref={psdFileInputRef}
        type="file"
        accept=".psd"
        hidden
        onChange={onUploadPsd}
      />
      {psdUpload && <PsdUploadDialog state={psdUpload} onClose={() => setPsdUpload(null)} />}
    </div>
  );
}

// 根据上传文件生成素材对象。
function createUploadedAsset(file, storage, image) {
  return {
    // 素材唯一 ID。
    assetId: storage.asset_id,
    // 素材类型。
    type: "image",
    // 原始文件名。
    name: file.name,
    // 预览文件名。
    previewFile: file.name,
    // 导出时使用的源文件名。
    sourceFile: file.name,
    // RustFS 对象引用；dataUrl 是本次会话使用的临时签名 URL，不会写入数据库。
    objectKey: storage.object_key,
    bucket: storage.bucket,
    storageProvider: "rustfs",
    contentType: storage.content_type,
    size: storage.size,
    etag: storage.etag,
    dataUrl: storage.url,
    // 原图宽度，用于初始等比缩放。
    originalWidth: image?.naturalWidth,
    // 原图高度，用于初始等比缩放。
    originalHeight: image?.naturalHeight,
    // 上传时间。
    uploadedAt: new Date().toISOString(),
  };
}

function loadBrowserImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function createColorCanvasDataUrl(color, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}
