// figma-pull.ts — pull The Fold's brand assets out of Figma.
//
// Usage:  bun scripts/figma-pull.ts [--inventory-only]
//
// Reads FIGMA_TOKEN from env or ../.env / ./.env. For each file below it:
//   1. fetches the document tree and writes an inventory JSON
//      (assets/figma/inventory-<name>.json) listing every frame/component/
//      group with id, name, type, and size;
//   2. exports top-level frames, components, and named vector groups —
//      SVG where Figma allows it, PNG @2x as the fallback (FigJam nodes
//      are usually PNG-only).
//
// Downloads land in assets/figma/<file-name>/<safe-name>__<node-id>.<ext>

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "assets", "figma");

const FILES = [
  { key: "DaMGa2NPeTRlfcTf8xiCvN", name: "fold-brand", kind: "design" as const },
  { key: "YXfktR3BKgWgUnSiuAKozD", name: "fold-brand-jam", kind: "figjam" as const },
];

// Node ids Jasper linked directly (design file) — always exported even if
// they aren't top-level frames. URL form "197-58" → API form "197:58".
const PINNED_DESIGN_NODES = ["197:58", "4:26", "73:10"];

function loadToken(): string {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN;
  for (const p of [join(ROOT, "..", ".env"), join(ROOT, ".env")]) {
    if (existsSync(p)) {
      const m = readFileSync(p, "utf8").match(/^FIGMA_TOKEN=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  console.error("No FIGMA_TOKEN found (env, ../.env, or ./.env).");
  process.exit(1);
}

const TOKEN = loadToken();

async function api(path: string, attempt = 0): Promise<any> {
  const res = await fetch(`https://api.figma.com${path}`, {
    headers: { "X-Figma-Token": TOKEN },
  });
  if (res.status === 429 && attempt < 5) {
    const wait = Number(res.headers.get("retry-after") ?? 15) * 1000;
    console.log(`  rate-limited, waiting ${wait / 1000}s…`);
    await new Promise((r) => setTimeout(r, wait));
    return api(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}: ${await res.text()}`);
  return res.json();
}

type Inv = { id: string; name: string; type: string; w?: number; h?: number; path: string };

function walk(node: any, crumbs: string[], out: Inv[]) {
  const path = [...crumbs, node.name].join(" / ");
  const bb = node.absoluteBoundingBox;
  out.push({ id: node.id, name: node.name, type: node.type, w: bb?.width, h: bb?.height, path });
  for (const child of node.children ?? []) walk(child, [...crumbs, node.name], out);
}

const EXPORT_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION", "GROUP", "INSTANCE"]);

function pickExports(inv: Inv[]): Inv[] {
  // Top-ish content: depth ≤ 3 (page / frame / group) of exportable types,
  // skipping pages themselves and anything tiny (< 24px) or unnamed.
  return inv.filter((n) => {
    const depth = n.path.split(" / ").length;
    return (
      EXPORT_TYPES.has(n.type) &&
      depth >= 2 &&
      depth <= 4 &&
      (n.w ?? 0) >= 24 &&
      (n.h ?? 0) >= 24
    );
  });
}

const safe = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "unnamed";

async function exportNodes(fileKey: string, dir: string, nodes: Inv[], format: "svg" | "png") {
  const chunks: Inv[][] = [];
  for (let i = 0; i < nodes.length; i += 40) chunks.push(nodes.slice(i, i + 40));
  const failed: Inv[] = [];
  for (const chunk of chunks) {
    const ids = chunk.map((n) => n.id).join(",");
    const scale = format === "png" ? "&scale=2" : "";
    let data: any;
    try {
      data = await api(`/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}${scale}`);
    } catch (e) {
      console.log(`  ${format} render failed for a chunk: ${e}`);
      failed.push(...chunk);
      continue;
    }
    for (const n of chunk) {
      const url = data.images?.[n.id];
      if (!url) { failed.push(n); continue; }
      try {
        const body = await (await fetch(url)).arrayBuffer();
        const file = join(dir, `${safe(n.name)}__${n.id.replace(":", "-")}.${format}`);
        writeFileSync(file, Buffer.from(body));
        console.log(`  ✓ ${format}  ${n.name}  (${n.id})`);
      } catch (e) {
        console.log(`  ✗ download ${n.name}: ${e}`);
        failed.push(n);
      }
    }
  }
  return failed;
}

const inventoryOnly = process.argv.includes("--inventory-only");

for (const f of FILES) {
  console.log(`\n── ${f.name} (${f.key}) ──`);
  const doc = await api(`/v1/files/${f.key}`);
  const inv: Inv[] = [];
  for (const page of doc.document.children ?? []) walk(page, [], inv);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `inventory-${f.name}.json`), JSON.stringify({ name: doc.name, lastModified: doc.lastModified, nodes: inv }, null, 2));
  console.log(`inventory: ${inv.length} nodes → inventory-${f.name}.json`);
  if (inventoryOnly) continue;

  const dir = join(OUT, f.name);
  mkdirSync(dir, { recursive: true });
  let targets = pickExports(inv);
  if (f.kind === "design") {
    const pinned = inv.filter((n) => PINNED_DESIGN_NODES.includes(n.id));
    const have = new Set(targets.map((t) => t.id));
    targets = [...targets, ...pinned.filter((p) => !have.has(p.id))];
  }
  console.log(`exporting ${targets.length} nodes…`);
  // Design files: try SVG first, PNG for whatever SVG couldn't render.
  // FigJam: straight to PNG.
  const svgFailed = f.kind === "design" ? await exportNodes(f.key, dir, targets, "svg") : targets;
  if (svgFailed.length) {
    console.log(`${svgFailed.length} nodes falling back to PNG…`);
    const gone = await exportNodes(f.key, dir, svgFailed, "png");
    if (gone.length) console.log(`unexportable: ${gone.map((n) => `${n.name} (${n.id})`).join(", ")}`);
  }
}

console.log("\nDone.");
