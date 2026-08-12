// extract-marks.ts — isolate the wireframe fold meshes from the lockup SVGs.
// Strips <text> and background rects, measures the remaining mesh with getBBox,
// and writes cropped standalone SVGs (stroke normalized to currentColor) into
// public/marks/. Run: bun scripts/extract-marks.ts

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
// @ts-ignore — one-off local tooling; playwright borrowed from the Browser skill
import { chromium } from "/Users/jasperhall/.claude/skills/Browser/node_modules/playwright/index.mjs";

const SRC = "/Users/jasperhall/Desktop/theFold";
const OUT = join(import.meta.dir, "..", "public", "marks");
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /^theFoldLockups-\d+\.svg$/.test(f));
const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of files) {
  const raw = readFileSync(join(SRC, f), "utf8");
  await page.setContent(`<!doctype html><body>${raw}</body>`);
  const result = await page.evaluate(() => {
    const svg = document.querySelector("svg")!;
    svg.querySelectorAll("text").forEach((t) => t.remove());
    // Background rects: full-bleed fills (cls-3 etc.) — anything filled, unstroked, huge.
    const vb = svg.viewBox.baseVal;
    svg.querySelectorAll("rect, path").forEach((el) => {
      const bb = (el as SVGGraphicsElement).getBBox();
      const cs = getComputedStyle(el);
      if (bb.width > vb.width * 0.9 && bb.height > vb.height * 0.9 && cs.fill !== "none" && cs.stroke === "none")
        el.remove();
    });
    // Everything left should be the mesh. Normalize stroke to currentColor.
    let strokeW = 0.8;
    svg.querySelectorAll("*").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.stroke && cs.stroke !== "none") {
        (el as SVGElement).setAttribute("stroke", "currentColor");
        strokeW = parseFloat(cs.strokeWidth) || strokeW;
      }
      if (cs.fill && cs.fill !== "none" && cs.fill !== "rgb(0, 0, 0)") {
        // filled mesh bits (rare) also follow currentColor
        (el as SVGElement).setAttribute("fill", "currentColor");
      }
      (el as SVGElement).removeAttribute("class");
    });
    svg.querySelectorAll("defs, style").forEach((d) => d.remove());
    const g = svg as unknown as SVGGraphicsElement;
    const bb = g.getBBox();
    const pad = Math.max(bb.width, bb.height) * 0.03;
    const x = bb.x - pad, y = bb.y - pad, w = bb.width + pad * 2, h = bb.height + pad * 2;
    return {
      viewBox: `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`,
      inner: svg.innerHTML,
      strokeW,
    };
  });
  const n = f.match(/(\d+)/)![1];
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${result.viewBox}" fill="none" stroke-width="${result.strokeW}" stroke-linecap="round" stroke-linejoin="round">${result.inner}</svg>`;
  const dest = join(OUT, `fold-mesh-${n}.svg`);
  writeFileSync(dest, out);
  console.log(`✓ ${f} → fold-mesh-${n}.svg (${(out.length / 1024).toFixed(0)} KB, viewBox ${result.viewBox})`);
}

await browser.close();
