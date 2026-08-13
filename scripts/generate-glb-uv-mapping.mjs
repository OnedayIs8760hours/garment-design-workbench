import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));

if (!args.model || !args.template || !args.out) {
  console.error("Usage: node scripts/generate-glb-uv-mapping.mjs --model <model.glb> --template <template.json> --out <uv_mapping.json>");
  process.exit(1);
}

const modelPath = path.resolve(args.model);
const templatePath = path.resolve(args.template);
const outPath = path.resolve(args.out);
const atlasSize = Number(args.atlasSize ?? 4096);

const glb = readGlb(modelPath);
const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
const rects = extractPanelUvRects(glb);
const parts = {};

for (const panelId of template.panelOrder ?? Object.keys(template.panels ?? {})) {
  const panel = template.panels[panelId];
  const uvRect = rects[panelId];
  if (!panel || !uvRect) continue;
  const [uMin, vMin, uMax, vMax] = uvRect;
  parts[panelId] = {
    source_file: panel.panelImage.split("/").pop(),
    source_size_px: [panel.size.width, panel.size.height],
    source_alpha_bbox_px: [0, 0, panel.size.width, panel.size.height],
    atlas_rect_px: [
      Math.round(uMin * atlasSize),
      Math.round((1 - vMax) * atlasSize),
      Math.round((uMax - uMin) * atlasSize),
      Math.round((vMax - vMin) * atlasSize),
    ],
    uv_rect: uvRect,
    transform: {
      scale_x: uMax - uMin,
      scale_y: vMax - vMin,
      rotation_deg: 0,
    },
  };
}

const mapping = {
  format: "uv-atlas-v1",
  atlas_size: [atlasSize, atlasSize],
  coordinate_notes: {
    atlas_origin: "top-left",
    uv_origin: "bottom-left",
    uv_rect_order: ["u_min", "v_min", "u_max", "v_max"],
    note: "Generated from GLB material primitives. UV rectangles describe each material island bounds in the model UV space.",
  },
  source_model: path.basename(modelPath),
  parts,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    parsed[key] = rawArgs[index + 1];
    index += 1;
  }
  return parsed;
}

function readGlb(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error(`Not a GLB file: ${filePath}`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === "JSON") json = JSON.parse(chunk.toString("utf8"));
    if (chunkType === "BIN\0") bin = chunk;
    offset += 8 + chunkLength;
  }
  if (!json || !bin) throw new Error(`Missing JSON or BIN chunk in ${filePath}`);
  return { json, bin };
}

function extractPanelUvRects({ json, bin }) {
  const rects = {};
  let globalMinV = Infinity;
  let globalMaxV = -Infinity;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const panelId = normalizePanelId(json.materials?.[primitive.material]?.name);
      const texcoordAccessorIndex = primitive.attributes?.TEXCOORD_0;
      if (!panelId || texcoordAccessorIndex == null) continue;

      const uvs = readAccessor(json, bin, texcoordAccessorIndex);
      const indices = primitive.indices == null ? null : readAccessor(json, bin, primitive.indices);
      const rect = rects[panelId] ?? [Infinity, Infinity, -Infinity, -Infinity];
      const visit = (vertexIndex) => {
        const uv = uvs[vertexIndex];
        if (!uv) return;
        rect[0] = Math.min(rect[0], uv[0]);
        rect[1] = Math.min(rect[1], uv[1]);
        rect[2] = Math.max(rect[2], uv[0]);
        rect[3] = Math.max(rect[3], uv[1]);
        globalMinV = Math.min(globalMinV, uv[1]);
        globalMaxV = Math.max(globalMaxV, uv[1]);
      };

      if (indices) indices.forEach((index) => visit(index));
      else uvs.forEach((_, index) => visit(index));
      rects[panelId] = rect;
    }
  }

  if (globalMinV < 0 && globalMaxV <= 0) {
    Object.values(rects).forEach((rect) => {
      const vMin = rect[1];
      const vMax = rect[3];
      rect[1] = -vMax;
      rect[3] = -vMin;
    });
  }

  return Object.fromEntries(
    Object.entries(rects).map(([panelId, rect]) => [panelId, rect.map((value) => Number(value.toFixed(12)))]),
  );
}

function normalizePanelId(name = "") {
  return name.replace(/_FRONT.*$/i, "").trim();
}

function readAccessor(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const component = componentReader(accessor.componentType);
  const componentCount = typeComponentCount(accessor.type);
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const byteStride = view.byteStride ?? component.byteSize * componentCount;
  const values = [];

  for (let index = 0; index < accessor.count; index += 1) {
    const itemOffset = byteOffset + index * byteStride;
    const item = [];
    for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
      item.push(component.read(bin, itemOffset + componentIndex * component.byteSize));
    }
    values.push(componentCount === 1 ? item[0] : item);
  }
  return values;
}

function componentReader(componentType) {
  const readers = {
    5121: { byteSize: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
    5123: { byteSize: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
    5125: { byteSize: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
    5126: { byteSize: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
  };
  const reader = readers[componentType];
  if (!reader) throw new Error(`Unsupported accessor component type: ${componentType}`);
  return reader;
}

function typeComponentCount(type) {
  const counts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const count = counts[type];
  if (!count) throw new Error(`Unsupported accessor type: ${type}`);
  return count;
}
