// trace-sketches.ts — turn the Brand Jam sketches into clean, recolorable
// vector marks. potrace produces filled outlines; we normalize to
// fill="currentColor" and a tight viewBox. Run: bun scripts/trace-sketches.ts

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
// @ts-ignore
import potrace from "potrace";

const ROOT = join(import.meta.dir, "..");
const JAM = join(ROOT, "assets", "figma", "jam-images");
const OUT = join(ROOT, "public", "marks");
mkdirSync(OUT, { recursive: true });

const SKETCHES = [
  {
    src: "22cbbfc910c63e8d58594420a2ea87221dee6eae.png",
    out: "cootie-catcher.svg",
    name: "Cootie catcher",
    threshold: 180,
    turdSize: 30,
  },
  {
    src: "085d9b6e749184ce7dfafbc0269928798862a59c.png",
    out: "fold-script.svg",
    name: "fold (hand script)",
    threshold: 200,
    turdSize: 20,
  },
  {
    src: "438b4d3e3022166bd4b623bffd0d408bd2b821bd.png",
    out: "tf-ligature.svg",
    name: "TF ligature",
    threshold: 128,
    turdSize: 30,
  },
];

const trace = (file: string, opts: object) =>
  new Promise<string>((res, rej) =>
    potrace.trace(file, opts, (err: Error | null, svg: string) => (err ? rej(err) : res(svg)))
  );

for (const s of SKETCHES) {
  const svg = await trace(join(JAM, s.src), {
    threshold: s.threshold,
    turdSize: s.turdSize,
    optTolerance: 0.4,
    color: "currentColor",
  });
  // potrace emits <svg width height viewBox><path .../></svg>; keep as-is but
  // ensure fill is currentColor and strip fixed size.
  const cleaned = svg
    .replace(/width="[^"]*"\s+height="[^"]*"/, "")
    .replace(/fill="[^"]*"/g, 'fill="currentColor"')
    .replace(/stroke="[^"]*"/g, "");
  writeFileSync(join(OUT, s.out), cleaned);
  console.log(`✓ ${s.name} → ${s.out} (${(cleaned.length / 1024).toFixed(1)} KB)`);
}
