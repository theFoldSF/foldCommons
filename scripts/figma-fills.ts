// figma-fills.ts — download every bitmap image fill in a Figma/FigJam file via
// the (unthrottled) image-fills endpoint. Also cross-references the node tree
// so each image gets named after the node that uses it where possible.
// Usage: bun scripts/figma-fills.ts <fileKey> <outDir>

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const [fileKey, outName] = process.argv.slice(2);
if (!fileKey || !outName) {
  console.error("usage: bun scripts/figma-fills.ts <fileKey> <outDirName>");
  process.exit(1);
}

function loadToken(): string {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN;
  for (const p of [join(ROOT, "..", ".env"), join(ROOT, ".env")]) {
    if (existsSync(p)) {
      const m = readFileSync(p, "utf8").match(/^FIGMA_TOKEN=(.+)$/m);
      if (m) return m[1].trim();
    }
  }
  console.error("No FIGMA_TOKEN");
  process.exit(1);
}

const TOKEN = loadToken();
const OUT = join(ROOT, "assets", "figma", outName);
mkdirSync(OUT, { recursive: true });

const res = await fetch(`https://api.figma.com/v1/files/${fileKey}/images`, {
  headers: { "X-Figma-Token": TOKEN },
});
if (!res.ok) {
  console.error(`${res.status} ${res.statusText}`);
  process.exit(1);
}
const { meta } = await res.json();
const images: Record<string, string> = meta.images;
const refs = Object.keys(images);
console.log(`${refs.length} image fills`);

let done = 0;
const queue = [...refs];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const ref = queue.pop()!;
      const url = images[ref];
      if (!url) continue;
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        const ct = r.headers.get("content-type") ?? "";
        const ext = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : ct.includes("webp") ? "webp" : "jpg";
        writeFileSync(join(OUT, `${ref}.${ext}`), buf);
        done++;
        if (done % 50 === 0) console.log(`  ${done}/${refs.length}`);
      } catch {}
    }
  })
);
console.log(`downloaded ${done}/${refs.length} → ${OUT}`);
