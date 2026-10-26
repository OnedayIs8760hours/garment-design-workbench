import React from "react";
import { Maximize2, Upload } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createTemplate } from "../model.js";
import { templateDefinitionFor } from "../../templates/index.js";
import { textFontFor } from "../fontMap.js";
import { textFontSizeForBox } from "../textMetrics.js";
import { fetchDesignAssetBlob } from "../api.js";

// 图片加载缓存，避免 3D 贴图生成时重复解码同一素材。
const imageCache = new Map();
// 模板自带的裁片 UV 区域。

// 3D 服装预览组件，负责加载模型并把当前设计绘制成贴图。
export function ThreeDPreview({ design, modelUrl, setModelUrl, onExpand, large = false }) {
  // 3D 画布容器 DOM 引用。
  const hostRef = React.useRef(null);
  // Three.js 场景引用。
  const sceneRef = React.useRef(null);
  // 当前加载的模型引用。
  const modelRef = React.useRef(null);
  // 当前应用到模型上的贴图引用。
  const textureRef = React.useRef(null);
  // 将贴图应用到模型材质的函数引用。
  const applyTextureRef = React.useRef(() => {});
  const template = React.useMemo(() => createTemplate(templateDefinitionFor(design.templateId)), [design.templateId]);
  const defaultPanelRects = React.useMemo(() => template.threeD?.uvRects ?? {}, [template]);
  // 当前模型各裁片对应的 UV 区域。
  const [panelRects, setPanelRects] = React.useState(defaultPanelRects);
  // 预览区提示文案。
  const [message, setMessage] = React.useState("请加载 CLO 导出的 .glb 或 .gltf 模型");

  React.useEffect(() => {
    setPanelRects(defaultPanelRects);
  }, [defaultPanelRects]);

  React.useEffect(() => {
    // 3D 容器 DOM。
    const host = hostRef.current;
    if (!host) return;

    // Three.js 场景对象。
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f7f5);
    sceneRef.current = scene;

    // 透视相机。
    const camera = new THREE.PerspectiveCamera(35, host.clientWidth / host.clientHeight, 0.01, 100);
    camera.position.set(0, 1.4, 4.2);

    // WebGL 渲染器。
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    // 鼠标旋转缩放控制器。
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd7d7d7, 2.2));
    // 主方向光。
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 4, 3);
    scene.add(key);

    // 将生成的设计贴图写入模型所有 mesh 材质。
    applyTextureRef.current = (texture) => {
      modelRef.current?.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!material) return;
          material.map = texture;
          material.color.set("#ffffff");
          material.roughness = 0.9;
          material.metalness = 0;
          material.needsUpdate = true;
        });
      });
    };

    // 根据容器大小同步相机比例和渲染器尺寸。
    const resize = () => {
      // 容器宽度。
      const width = host.clientWidth || 1;
      // 容器高度。
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    // 控制动画循环是否继续运行。
    let active = true;
    // 每帧刷新控制器并渲染场景。
    const tick = () => {
      if (!active) return;
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("resize", resize);

    return () => {
      active = false;
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      textureRef.current?.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  React.useEffect(() => {
    if (!modelUrl || !sceneRef.current) return;
    // GLTF/GLB 模型加载器。
    const loader = new GLTFLoader();
    setMessage("模型加载中");

    loader.load(
      modelUrl,
      (gltf) => {
        if (modelRef.current) sceneRef.current.remove(modelRef.current);
        modelRef.current = gltf.scene;
        normalizeModelUvs(gltf.scene);
        fitModel(gltf.scene);
        sceneRef.current.add(gltf.scene);
        // 从模型材质和 UV 中反推裁片区域。
        const nextRects = getPanelRects(gltf.scene, template);
        setPanelRects(Object.keys(nextRects).length ? nextRects : defaultPanelRects);
        applyTextureRef.current(textureRef.current);
        setMessage("实时 3D 预览");
      },
      undefined,
      () => setMessage("模型加载失败，请使用 .glb 或 .gltf 文件。"),
    );
  }, [modelUrl, defaultPanelRects, template]);

  React.useEffect(() => {
    // 防止异步贴图生成完成后写入已卸载组件。
    let cancelled = false;
    const timer = setTimeout(() => {
      createDesignTexture(design, panelRects, template).then((texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        textureRef.current?.dispose();
        textureRef.current = texture;
        applyTextureRef.current(texture);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [design, panelRects, template]);

  // 处理用户导入本地 3D 模型。
  const chooseModel = (event) => {
    // 用户选择的模型文件。
    const file = event.target.files?.[0];
    if (!file) return;
    if (modelUrl?.startsWith("blob:")) URL.revokeObjectURL(modelUrl);
    setModelUrl(URL.createObjectURL(file));
  };

  return (
    <section className={`model-preview${large ? " large" : ""}`}>
      <div className="model-toolbar">
        <strong>{message}</strong>
        <div className="model-actions">
          {onExpand && (
            <button type="button" className="model-expand" onClick={onExpand}>
              <Maximize2 size={15} aria-hidden="true" />
              放大
            </button>
          )}
          <label className="upload model-upload">
            <Upload size={15} aria-hidden="true" />
            导入模型
            <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={chooseModel} />
          </label>
        </div>
      </div>
      <div ref={hostRef} className="model-canvas" />
      <p className="model-empty">材质名前缀需与裁片 ID 匹配，例如 front、back 或 left-sleeve。</p>
    </section>
  );
}

// 把所有裁片设计绘制到一张 UV 图集贴图上。
async function createDesignTexture(design, panelRects, template) {
  // 贴图画布尺寸。
  const size = 2048;
  // UV 图集画布。
  const atlas = document.createElement("canvas");
  atlas.width = size;
  atlas.height = size;
  // UV 图集绘图上下文。
  const ctx = atlas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  for (const [panelId, uvRect] of Object.entries(panelRects)) {
    // 当前裁片模板。
    const panel = template.panels[panelId];
    // 当前裁片设计状态。
    const panelDesign = design.panels[panelId];
    if (!panel || !panelDesign) continue;

    // 当前裁片 UV 边界。
    const [uMin, vMin, uMax, vMax] = uvRect;
    // 当前裁片在图集画布上的像素矩形。
    const rect = {
      x: Math.round(uMin * size),
      y: Math.round((1 - vMax) * size),
      width: Math.max(1, Math.round((uMax - uMin) * size)),
      height: Math.max(1, Math.round((vMax - vMin) * size)),
    };

    // 单裁片离屏画布。
    const panelCanvas = document.createElement("canvas");
    panelCanvas.width = rect.width;
    panelCanvas.height = rect.height;
    // 单裁片绘图上下文。
    const panelCtx = panelCanvas.getContext("2d");
    panelCtx.fillStyle = design.garmentColor;
    panelCtx.fillRect(0, 0, rect.width, rect.height);

    for (const element of panelDesign.elements.filter((item) => item.visible).sort((a, b) => a.zIndex - b.zIndex)) {
      await drawElement(panelCtx, element, design.assets, rect);
    }

    ctx.drawImage(panelCanvas, rect.x, rect.y);
  }

  // 由图集画布生成的 Three.js 贴图。
  const texture = new THREE.CanvasTexture(atlas);
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// 将一个设计元素绘制到裁片画布上。
async function drawElement(ctx, element, assets, rect) {
  ctx.save();
  ctx.globalAlpha = element.opacity;
  ctx.translate(element.centerX * rect.width, element.centerY * rect.height);
  ctx.rotate((element.rotation * Math.PI) / 180);
  // 元素在裁片画布上的像素宽度。
  const width = element.width * rect.width;
  // 元素在裁片画布上的像素高度。
  const height = element.height * rect.height;

  if (element.type === "image") {
    // 图片元素引用的素材。
    const asset = assets.find((item) => item.assetId === element.assetId);
    // 已加载的图片对象。
    const image = await loadImage(asset?.dataUrl, asset?.objectKey);
    if (image) ctx.drawImage(image, -width / 2, -height / 2, width, height);
  } else {
    const font = textFontFor(element);
    ctx.font = `${font.cssWeight} ${textFontSizeForBox(height, 10)}px ${font.cssFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = element.stroke;
    ctx.lineWidth = Math.max(1, element.strokeWidth * rect.width);
    ctx.fillStyle = element.fill;
    ctx.strokeText(element.text, 0, 0, width);
    ctx.fillText(element.text, 0, 0, width);
  }
  ctx.restore();
}

// 加载图片并缓存 Promise。
function loadImage(src, objectKey) {
  if (!src && !objectKey) return Promise.resolve(null);
  // RustFS 预签名 URL 可能没有允许当前开发端口的 CORS 响应；
  // 先经同源后端流式读取为 Blob，再交给 Image 解码，Canvas 不会被跨域污染。
  const cacheKey = objectKey ? `object:${objectKey}` : src;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
  // 当前图片加载任务。
  const promise = new Promise((resolve) => {
    const decode = (imageSrc) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = imageSrc;
    };
    if (objectKey) {
      fetchDesignAssetBlob(objectKey)
        .then((blob) => decode(URL.createObjectURL(blob)))
        .catch(() => resolve(null));
    } else {
      decode(src);
    }
  });
  imageCache.set(cacheKey, promise);
  return promise;
}

// 将模型缩放并移动到预览视野中心。
function fitModel(model) {
  // 模型包围盒。
  const box = new THREE.Box3().setFromObject(model);
  // 模型尺寸。
  const size = box.getSize(new THREE.Vector3());
  // 模型中心点。
  const center = box.getCenter(new THREE.Vector3());
  // 让模型适配预览框的缩放比例。
  const scale = 2.4 / Math.max(size.x, size.y, size.z, 0.01);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale + 1, -center.z * scale);
}

// 根据模型材质名和 UV 坐标推导每个裁片的 UV 矩形。
function getPanelRects(model, template) {
  // 裁片 ID 到 UV 矩形的映射。
  const rects = {};
  model.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.uv) return;
    // 当前 mesh 的几何体。
    const geometry = object.geometry;
    // 当前 mesh 的 UV 属性。
    const uv = geometry.attributes.uv;
    // 当前 mesh 的索引数据。
    const index = geometry.index;
    // 当前 mesh 的材质列表。
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    // 当前 mesh 的材质分组。
    const groups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: index ? index.count : uv.count, materialIndex: 0 }];

    groups.forEach((group) => {
      // 当前 group 对应的裁片 ID。
      const panelId = normalizePanelId(materials[group.materialIndex]?.name);
      if (!panelId || !template.panels[panelId]) return;
      // 当前裁片累计的 UV 矩形。
      const rect = rects[panelId] ?? [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = group.start; i < group.start + group.count; i += 1) {
        // 当前三角索引对应的顶点索引。
        const vertexIndex = index ? index.getX(i) : i;
        // 当前顶点 U 坐标。
        const u = uv.getX(vertexIndex);
        // 当前顶点 V 坐标。
        const v = uv.getY(vertexIndex);
        rect[0] = Math.min(rect[0], u);
        rect[1] = Math.min(rect[1], v);
        rect[2] = Math.max(rect[2], u);
        rect[3] = Math.max(rect[3], v);
      }
      rects[panelId] = rect;
    });
  });
  return rects;
}

// 从材质名中取出能匹配模板裁片的 ID。
function normalizePanelId(name = "") {
  return name.replace(/_FRONT.*$/i, "").trim();
}

// 修正部分模型导出时整体为负的 V 坐标。
function normalizeModelUvs(model) {
  model.traverse((object) => {
    // 当前 mesh 的 UV 属性。
    const uv = object.isMesh ? object.geometry?.attributes?.uv : null;
    if (!uv) return;
    // 当前 UV 集合的最小 V 值。
    let minV = Infinity;
    // 当前 UV 集合的最大 V 值。
    let maxV = -Infinity;
    for (let i = 0; i < uv.count; i += 1) {
      minV = Math.min(minV, uv.getY(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    if (minV < 0 && maxV <= 0) {
      for (let i = 0; i < uv.count; i += 1) uv.setY(i, -uv.getY(i));
      uv.needsUpdate = true;
    }
  });
}
