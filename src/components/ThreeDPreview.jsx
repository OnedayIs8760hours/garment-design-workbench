import React from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import uvMapping from "../templates/M-2XL.uv_mapping.json";
import { template } from "../config.js";

const imageCache = new Map();
const defaultPanelRects = Object.fromEntries(Object.entries(uvMapping.parts).map(([panelId, part]) => [panelId, part.uv_rect]));

export function ThreeDPreview({ design }) {
  const hostRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const modelRef = React.useRef(null);
  const textureRef = React.useRef(null);
  const applyTextureRef = React.useRef(() => {});
  const [modelUrl, setModelUrl] = React.useState("/models/soccer-new-rename.glb");
  const [panelRects, setPanelRects] = React.useState(defaultPanelRects);
  const [message, setMessage] = React.useState("选择 CLO 导出的 .glb/.gltf 模型");

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f7f5);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(35, host.clientWidth / host.clientHeight, 0.01, 100);
    camera.position.set(0, 1.4, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd7d7d7, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 4, 3);
    scene.add(key);

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

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    let active = true;
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
        const nextRects = getPanelRects(gltf.scene);
        setPanelRects(Object.keys(nextRects).length ? nextRects : defaultPanelRects);
        applyTextureRef.current(textureRef.current);
        setMessage("实时 3D 预览");
      },
      undefined,
      () => setMessage("模型加载失败，请确认文件是 .glb/.gltf"),
    );
  }, [modelUrl]);

  React.useEffect(() => {
    let cancelled = false;
    createDesignTexture(design, panelRects).then((texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      textureRef.current?.dispose();
      textureRef.current = texture;
      applyTextureRef.current(texture);
    });
    return () => {
      cancelled = true;
    };
  }, [design, panelRects]);

  const chooseModel = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (modelUrl?.startsWith("blob:")) URL.revokeObjectURL(modelUrl);
    setModelUrl(URL.createObjectURL(file));
  };

  return (
    <section className="model-preview">
      <div className="model-toolbar">
        <strong>{message}</strong>
        <label className="upload model-upload">
          导入模型
          <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={chooseModel} />
        </label>
      </div>
      <div ref={hostRef} className="model-canvas" />
      <p className="model-empty">材质名前缀需对应裁片 ID，例如 front、back、left-sleeve。</p>
    </section>
  );
}

async function createDesignTexture(design, panelRects) {
  const size = 2048;
  const atlas = document.createElement("canvas");
  atlas.width = size;
  atlas.height = size;
  const ctx = atlas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  for (const [panelId, uvRect] of Object.entries(panelRects)) {
    const panel = template.panels[panelId];
    const panelDesign = design.panels[panelId];
    if (!panel || !panelDesign) continue;

    const [uMin, vMin, uMax, vMax] = uvRect;
    const rect = {
      x: Math.round(uMin * size),
      y: Math.round(vMin * size),
      width: Math.max(1, Math.round((uMax - uMin) * size)),
      height: Math.max(1, Math.round((vMax - vMin) * size)),
    };

    const panelCanvas = document.createElement("canvas");
    panelCanvas.width = rect.width;
    panelCanvas.height = rect.height;
    const panelCtx = panelCanvas.getContext("2d");
    panelCtx.fillStyle = design.garmentColor;
    panelCtx.fillRect(0, 0, rect.width, rect.height);

    for (const element of panelDesign.elements.filter((item) => item.visible).sort((a, b) => a.zIndex - b.zIndex)) {
      await drawElement(panelCtx, element, design.assets, rect);
    }

    const mask = await loadImage(panel.maskImage);
    panelCtx.globalCompositeOperation = "destination-in";
    panelCtx.drawImage(mask, 0, 0, rect.width, rect.height);
    panelCtx.globalCompositeOperation = "source-over";
    ctx.drawImage(panelCanvas, rect.x, rect.y);
  }

  const texture = new THREE.CanvasTexture(atlas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

async function drawElement(ctx, element, assets, rect) {
  ctx.save();
  ctx.globalAlpha = element.opacity;
  ctx.translate(element.centerX * rect.width, element.centerY * rect.height);
  ctx.rotate((element.rotation * Math.PI) / 180);
  const width = element.width * rect.width;
  const height = element.height * rect.height;

  if (element.type === "image") {
    const asset = assets.find((item) => item.assetId === element.assetId);
    const image = await loadImage(asset?.dataUrl);
    if (image) ctx.drawImage(image, -width / 2, -height / 2, width, height);
  } else {
    ctx.font = `900 ${Math.max(10, height * 0.72)}px Microsoft YaHei, Arial, sans-serif`;
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

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 2.4 / Math.max(size.x, size.y, size.z, 0.01);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale + 1, -center.z * scale);
}

function getPanelRects(model) {
  const rects = {};
  model.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.uv) return;
    const geometry = object.geometry;
    const uv = geometry.attributes.uv;
    const index = geometry.index;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const groups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: index ? index.count : uv.count, materialIndex: 0 }];

    groups.forEach((group) => {
      const panelId = normalizePanelId(materials[group.materialIndex]?.name);
      if (!panelId || !template.panels[panelId]) return;
      const rect = rects[panelId] ?? [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = group.start; i < group.start + group.count; i += 1) {
        const vertexIndex = index ? index.getX(i) : i;
        const u = uv.getX(vertexIndex);
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

function normalizePanelId(name = "") {
  return name.replace(/_FRONT.*$/i, "").trim();
}

function normalizeModelUvs(model) {
  model.traverse((object) => {
    const uv = object.isMesh ? object.geometry?.attributes?.uv : null;
    if (!uv) return;
    let minV = Infinity;
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
