// render.ts — Doc → SVG. One renderer for the on-screen canvas, gallery
// thumbnails, and exports, so what you see is exactly what ships.

import { REGISTERS, TYPE_RULES, type TypeRole } from "./brand/tokens";
import { fontFamilyCss } from "./brand/fonts";
import { engineById } from "./engines/index";
import { markById } from "./marks/index";
import { docAccent, docSeason, docTemplate, type Doc } from "./state";
import type { TextZone } from "./templates/index";

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// Approximate glyph width as a fraction of font size, per role — good enough
// for wrapping; SVG <text> has no layout engine.
const CHAR_W: Record<TypeRole, number> = { display: 0.56, heading: 0.55, body: 0.52, mono: 0.62 };

function wrap(text: string, zone: TextZone): string[] {
  const perLine = Math.max(4, Math.floor(zone.w / (zone.size * (CHAR_W[zone.role] + (zone.tracking ?? 0)))));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (cand.length > perLine && line) {
        out.push(line);
        line = word;
      } else line = cand;
    }
    if (line) out.push(line);
  }
  return out.slice(0, zone.lines ?? 3);
}

function textZoneSvg(doc: Doc, zone: TextZone, ink: string): string {
  const raw = doc.fields[zone.id] ?? zone.default;
  const content = zone.uppercase ? raw.toUpperCase() : raw;
  const accIdx = doc.fieldAccents[zone.id];
  const fill = zone.colorable && accIdx !== undefined && accIdx >= 0 ? docAccent(doc, accIdx) : ink;
  const face = TYPE_RULES.byRole(zone.role)[0];
  const lines = wrap(content, zone);
  const lh = zone.size * 1.18;
  const tspans = lines
    .map((l, i) => `<tspan x="${zone.x}" dy="${i === 0 ? 0 : lh}">${esc(l)}</tspan>`)
    .join("");
  return `<text x="${zone.x}" y="${zone.y}" text-anchor="${zone.align}" fill="${fill}"
    font-family="${fontFamilyCss(face.name)}" font-size="${zone.size}" font-weight="${face.weight}"
    letter-spacing="${(zone.tracking ?? 0) * zone.size}">${tspans}</text>`;
}

function lineMotifSvg(doc: Doc, W: number, H: number): string {
  const t = docTemplate(doc);
  if (!t.line || !doc.lineOn) return "";
  const y0 = t.line.y * H;
  const amp = doc.line.amp * H;
  const N = 160;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * W;
    const y = y0 + Math.sin((i / N) * Math.PI * 2 * doc.line.periods) * amp;
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `<path d="${pts.join(" ")}" fill="none" stroke="${docSeason(doc).accent}"
    stroke-width="${doc.line.sw}" stroke-linecap="round"/>`;
}

function motifSvg(doc: Doc, W: number, H: number): string {
  const t = docTemplate(doc);
  if (!doc.motif || !t.motifSlot) return "";
  const e = engineById(doc.motif.engine);
  if (!e) return "";
  const reg = REGISTERS[doc.register];
  const slot = t.motifSlot === "backdrop" ? { x: 0, y: 0, w: W, h: H } : t.motifSlot;
  const colors = doc.motif.accents.map((i) => docAccent(doc, i));
  const inner = e.render({
    w: slot.w,
    h: slot.h,
    p: doc.motif.params,
    colors,
    ink: reg.ink,
    ground: reg.ground,
    seed: doc.motif.seed,
  });
  const dim = t.motifSlot === "backdrop" ? ` opacity="0.5"` : "";
  return `<svg x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}"
    viewBox="0 0 ${slot.w} ${slot.h}" overflow="hidden"${dim}>${inner}</svg>`;
}

function wordmarkSvg(doc: Doc, ink: string): string {
  const { wordmark } = docTemplate(doc);
  const wm = TYPE_RULES.wordmark;
  return `<text x="${wordmark.x}" y="${wordmark.y}" text-anchor="${wordmark.align}" fill="${ink}"
    font-family="${fontFamilyCss(wm.face)}" font-size="${wordmark.size}" font-weight="${wm.weight}"
    letter-spacing="${wm.tracking * wordmark.size}">${wm.text}</text>`;
}

// --- diagram kit -------------------------------------------------------------

function diagramSvg(doc: Doc, W: number, H: number, ink: string, ground: string): string {
  const d = doc.diagram;
  if (!d.nodes.length) return "";
  const face = TYPE_RULES.byRole("mono")[0];
  const boxH = 88;
  const gap = 72;
  const pad = 34;
  const widths = d.nodes.map((n) => Math.max(150, n.label.length * 13.5 + pad * 2));
  const total =
    d.dir === "lr" ? widths.reduce((a, b) => a + b, 0) + gap * (d.nodes.length - 1) : 0;
  let cx = (W - total) / 2;
  const centers: { x: number; y: number; w: number }[] = [];
  d.nodes.forEach((n, i) => {
    if (d.dir === "lr") {
      centers.push({ x: cx + widths[i] / 2, y: H * 0.55, w: widths[i] });
      cx += widths[i] + gap;
    } else {
      const y0 = H * 0.3 + i * (boxH + gap);
      centers.push({ x: W / 2, y: y0, w: widths[i] });
    }
  });
  let out = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
    markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>
  </marker></defs>`;
  for (const [a, b] of d.edges) {
    const A = centers[a], B = centers[b];
    if (!A || !B) continue;
    let x1, y1, x2, y2;
    if (d.dir === "lr") {
      const leftFirst = A.x < B.x;
      x1 = A.x + (leftFirst ? A.w / 2 : -A.w / 2); y1 = A.y;
      x2 = B.x + (leftFirst ? -B.w / 2 - 8 : B.w / 2 + 8); y2 = B.y;
    } else {
      const downFirst = A.y < B.y;
      x1 = A.x; y1 = A.y + (downFirst ? boxH / 2 : -boxH / 2);
      x2 = B.x; y2 = B.y + (downFirst ? -boxH / 2 - 8 : boxH / 2 + 8);
    }
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const sag = d.dir === "lr" ? 26 : 0;
    out += `<path d="M ${x1} ${y1} Q ${mx} ${my + sag}, ${x2} ${y2}" fill="none"
      stroke="${ink}" stroke-width="2.4" marker-end="url(#arrow)"/>`;
  }
  d.nodes.forEach((n, i) => {
    const c = centers[i];
    const accent = docAccent(doc, n.accent);
    out += `<rect x="${c.x - c.w / 2}" y="${c.y - boxH / 2}" width="${c.w}" height="${boxH}"
      rx="6" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-width="2.5"/>`;
    out += `<text x="${c.x}" y="${c.y + 6}" text-anchor="middle" fill="${ink}"
      font-family="${fontFamilyCss(face.name)}" font-size="24" font-weight="${face.weight}"
      letter-spacing="1">${esc(n.label.toUpperCase())}</text>`;
  });
  return out;
}

// --- sticker sheet -----------------------------------------------------------

function stickersSvg(doc: Doc, W: number, H: number): string {
  const ids = doc.stickers.ids;
  const cols = ids.length <= 4 ? 2 : 3;
  const rows = Math.ceil(ids.length / cols);
  const cell = Math.min(W / cols, (H * 0.9) / rows);
  const ox = (W - cols * cell) / 2;
  const oy = (H * 0.92 - rows * cell) / 2;
  let out = "";
  ids.forEach((id, i) => {
    const m = markById(id);
    if (!m) return;
    const col = i % cols, row = Math.floor(i / cols);
    const pad = cell * 0.12;
    const color = docAccent(doc, doc.stickers.accent + i);
    out += `<svg x="${ox + col * cell + pad}" y="${oy + row * cell + pad}"
      width="${cell - pad * 2}" height="${cell - pad * 2}" viewBox="${m.viewBox}"
      color="${color}">${m.svg}</svg>`;
  });
  return out;
}

// --- top level ---------------------------------------------------------------

export function renderDoc(doc: Doc, opts: { fontCss?: string } = {}): string {
  const t = docTemplate(doc);
  const reg = REGISTERS[doc.register];
  const ground = reg.ground;
  const ink = reg.ink;
  const W = t.w, H = t.h;
  const style = opts.fontCss ? `<style>${opts.fontCss}</style>` : "";
  const body =
    t.kind === "diagram"
      ? diagramSvg(doc, W, H, ink, ground)
      : t.kind === "stickers"
        ? stickersSvg(doc, W, H)
        : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${style}
    <rect width="${W}" height="${H}" fill="${ground}"/>
    ${motifSvg(doc, W, H)}
    ${lineMotifSvg(doc, W, H)}
    ${body}
    ${t.zones.map((z) => textZoneSvg(doc, z, ink)).join("\n")}
    ${wordmarkSvg(doc, ink)}
  </svg>`;
}
