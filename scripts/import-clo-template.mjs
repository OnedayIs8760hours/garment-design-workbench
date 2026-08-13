import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));

if (!args.source || !args.templateId) {
  console.error("Usage: node scripts/import-clo-template.mjs --source <clo-export-dir> --template-id <id> [--category <english-category>] [--panel-order a,b,c]");
  process.exit(1);
}

const repoRoot = process.cwd();
const frontendRoot = path.join(repoRoot, "frontend");
const sourceRoot = path.resolve(args.source);
const templateId = args.templateId;
const category = args.category ?? templateId;
const panelOrderPreference = args.panelOrder ? args.panelOrder.split(",").map((id) => id.trim()).filter(Boolean) : null;
const templateOut = path.join(frontendRoot, "templates", category, `${templateId}.template.json`);
const publicOut = path.join(frontendRoot, "public", "templates", category);

const sourceFolders = fs.readdirSync(sourceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(sourceRoot, entry.name));

const singlePanelTemplates = sourceFolders.map((folder) => {
  const exported = JSON.parse(fs.readFileSync(path.join(folder, "template.json"), "utf8"));
  const panelId = exported.panelOrder?.[0] ?? Object.keys(exported.panels ?? {})[0];
  if (!panelId || !exported.panels?.[panelId]) throw new Error(`No panel found in ${folder}`);
  if (exported.templateId !== templateId) {
    throw new Error(`Template id mismatch in ${folder}: expected ${templateId}, got ${exported.templateId}`);
  }
  return { folder, exported, panelId, panel: exported.panels[panelId] };
});

const sourceDocument = singlePanelTemplates
  .map(({ exported }) => exported.sourceDocument)
  .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
const generatedAt = singlePanelTemplates
  .map(({ exported }) => exported.generatedAt)
  .sort()
  .at(-1);
const discoveredOrder = singlePanelTemplates.map(({ panelId }) => panelId);
const panelOrder = panelOrderPreference ?? discoveredOrder;
const byPanelId = new Map(singlePanelTemplates.map((item) => [item.panelId, item]));

for (const panelId of panelOrder) {
  if (!byPanelId.has(panelId)) throw new Error(`Panel order includes missing panel: ${panelId}`);
}

fs.mkdirSync(path.dirname(templateOut), { recursive: true });
fs.rmSync(publicOut, { recursive: true, force: true });

const panels = {};
for (const panelId of panelOrder) {
  const item = byPanelId.get(panelId);
  const panelOut = path.join(publicOut, panelId);
  fs.mkdirSync(panelOut, { recursive: true });
  copyDir(path.join(item.folder, "panels"), path.join(panelOut, "panels"));
  copyDir(path.join(item.folder, "masks"), path.join(panelOut, "masks"));
  panels[panelId] = {
    ...item.panel,
    panelImage: `${panelId}/${item.panel.panelImage}`,
    maskImage: `${panelId}/${item.panel.maskImage}`,
  };
}

const aggregate = {
  schemaVersion: 1,
  templateId,
  templateVersion: Math.max(...singlePanelTemplates.map(({ exported }) => exported.templateVersion ?? 1)),
  generatedAt,
  sourceDocument,
  panelOrder,
  panels,
};

fs.writeFileSync(templateOut, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(repoRoot, templateOut)}`);
console.log(`Copied assets to ${path.relative(repoRoot, publicOut)}`);

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

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}
