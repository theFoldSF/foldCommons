// render.ts — Doc → SVG. One renderer for the on-screen canvas, gallery
// thumbnails, and exports, so what you see is exactly what ships.

import { REGISTERS, TYPE_RULES, isDark, type TypeRole } from "./brand/tokens";
import { fontFamilyCss } from "./brand/fonts";
import { SIGNATURE_ENGINE, engineById } from "./engines/index";
import { framePath, ticketPath } from "./frames/index";
import { markById } from "./marks/index";
import { photoById } from "./photos/index";
import { docAccent, docGround, docSeason, docTemplate, type Doc } from "./state";
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

// --- the frame composer (poster / story / post) ------------------------------
// The board language: an organic frame holding a photo, a canon color, or a
// motif; a plain sans title; ticket-stub date chips; the chunky FOLD logotype.

let uid = 0;

const heading = () => TYPE_RULES.byRole("heading")[0];
const bodyFace = () => TYPE_RULES.byRole("body")[0];

// The signature: one F·O·L·D net mark, bottom-left of every composed layout.
// The engine renders in a small corner box; size/weight are scaled up so the
// mark reads at logotype scale, and tiles is pinned to 1 — one mark, always.
function signatureSvg(doc: Doc, x: number, y: number, w: number, h: number, ink: string): string {
  const sp = doc.comp.sig.params;
  const inner = SIGNATURE_ENGINE.render({
    w,
    h,
    p: { ...sp, tiles: 1, size: (sp.size ?? 1) * 2.2, weight: (sp.weight ?? 1) * 3 },
    colors: [],
    ink,
    ground: "none",
    seed: doc.comp.sig.seed,
  });
  return `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"
    viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" overflow="hidden">${inner}</svg>`;
}

function chipSvg(
  text: string,
  accent: string,
  right: number,
  cy: number,
  size: number,
  seed: number
): { svg: string; w: number } {
  if (!text.trim()) return { svg: "", w: 0 };
  const w = text.length * size * 0.56 + size * 1.7;
  const h = size * 1.75;
  const x = right - w;
  const ink = isDark(accent) ? "#FFF9F1" : "#03071B";
  return {
    svg: `<g transform="translate(${x.toFixed(1)} ${(cy - h / 2).toFixed(1)})">
      <path d="${ticketPath(seed, w, h)}" fill="${accent}"/>
      <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" fill="${ink}"
        font-family="${fontFamilyCss("Figtree")}" font-size="${size}" font-weight="600">${esc(text)}</text></g>`,
    w,
  };
}

// The framed window: photo (cover-fit), flat accent, or motif — clipped by an
// organic frame shape.
function frameWindow(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  content: "photo" | "fill" | "motif"
): string {
  const id = `fw${uid++}`;
  const fp = framePath(doc.comp.frame, doc.comp.frameSeed, w, h);
  const clip = `<clipPath id="${id}"><path d="${fp.d}"${fp.transform ? ` transform="${fp.transform}"` : ""}/></clipPath>`;
  let inner = "";
  if (content === "photo") {
    const src = doc.comp.upload ?? photoById(doc.comp.photo)?.src;
    if (src) {
      inner = `<image href="${src}" x="0" y="0" width="${w}" height="${h}"
        preserveAspectRatio="xMidYMid slice"/>`;
    } else content = "fill";
  }
  if (content === "fill") {
    inner = `<rect width="${w}" height="${h}" fill="${docAccent(doc, doc.comp.panelAccent)}"/>`;
  }
  if (content === "motif") {
    inner = `<rect width="${w}" height="${h}" fill="${docGround(doc).hex}"/>${motifArt(doc, w, h)}`;
  }
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><defs>${clip}</defs>
    <g clip-path="url(#${id})">${inner}</g></g>`;
}

// Raw motif art at w×h on the current ground.
function motifArt(doc: Doc, w: number, h: number): string {
  if (!doc.motif) return "";
  const e = engineById(doc.motif.engine);
  if (!e) return "";
  const g = docGround(doc);
  return e.render({
    w,
    h,
    p: doc.motif.params,
    colors: doc.motif.accents.map((i) => docAccent(doc, i)),
    ink: g.ink,
    ground: g.hex,
    seed: doc.motif.seed,
  });
}

// Full-bleed photo texture under everything, veiled by the ground color so
// ink stays readable by construction. bgFade is the veil's opacity.
function bgTextureSvg(doc: Doc, W: number, H: number): string {
  const src = photoById(doc.comp.bg)?.src;
  if (!src) return "";
  const g = docGround(doc);
  return `<image href="${src}" x="0" y="0" width="${W}" height="${H}"
      preserveAspectRatio="xMidYMid slice"/>
    <rect width="${W}" height="${H}" fill="${g.hex}" fill-opacity="${doc.comp.bgFade.toFixed(2)}"/>`;
}

function composedSvg(doc: Doc, W: number, H: number): string {
  const t = docTemplate(doc);
  const c = t.comp!;
  const g = docGround(doc);
  const ink = g.ink;
  const m = c.margin;
  const comp = doc.comp;
  const title = (doc.fields.title ?? "").trim();
  const detail = (doc.fields.detail ?? "").trim();
  const bg = bgTextureSvg(doc, W, H);

  // Bottom band: the F·O·L·D net signature left, chips right — every layout.
  const sigH = c.logoH * 2.8;
  const sigW = c.logoH * 7;
  const rowCy = H - m + m * 0.35 - sigH / 2;
  let bottom = signatureSvg(doc, m * 0.7, rowCy - sigH / 2, sigW, sigH, ink);
  let right = W - m;
  const time = chipSvg(doc.fields.time ?? "", docAccent(doc, comp.chipAccents[1]), right, rowCy, c.chipSize, comp.frameSeed + 1);
  right -= time.w ? time.w + c.chipSize * 0.6 : 0;
  const date = chipSvg(doc.fields.date ?? "", docAccent(doc, comp.chipAccents[0]), right, rowCy, c.chipSize, comp.frameSeed + 2);
  bottom += time.svg + date.svg;

  // Title block above the bottom band.
  const titleY = H - m - sigH - m * 0.35 - (detail ? c.detailSize * 1.5 : 0);
  let text = "";
  if (title)
    text += `<text x="${m}" y="${titleY}" fill="${ink}" font-family="${fontFamilyCss(heading().name)}"
      font-size="${c.titleSize}" font-weight="${heading().weight}">${esc(title)}</text>`;
  if (detail)
    text += `<text x="${m}" y="${titleY + c.detailSize * 1.6}" fill="${ink}" font-family="${fontFamilyCss(bodyFace().name)}"
      font-size="${c.detailSize}" font-weight="${bodyFace().weight}">${esc(detail)}</text>`;

  const heroTop = m;
  const heroBottom = title || detail ? titleY - c.titleSize - m * 0.5 : H - m - sigH - m * 0.35;

  if (comp.layout === "hero" || comp.layout === "panel") {
    const win = frameWindow(doc, m * 0.7, heroTop, W - m * 1.4, heroBottom - heroTop,
      comp.layout === "panel" ? "fill" : "photo");
    return bg + win + text + bottom;
  }

  if (comp.layout === "motif") {
    // full-bleed motif; the words sit right on it
    return bg + motifArt(doc, W, H) + text + bottom;
  }

  if (comp.layout === "collage") {
    // everything at once: texture wash, motif running the full frame, and a
    // framed photo floating on top of both
    const pw = W * 0.68;
    const ph = Math.min(heroBottom - m * 1.8, H * 0.52);
    const px = (W - pw) / 2;
    const py = m + (heroBottom - m - ph) * 0.42;
    const photo = frameWindow(doc, px, py, pw, ph, "photo");
    return bg + motifArt(doc, W, H) + photo + text + bottom;
  }

  // backdrop: motif pours across the top, the framed photo floats over it
  const motifH = H * 0.66;
  const motif = `<svg x="0" y="0" width="${W}" height="${motifH}" viewBox="0 0 ${W} ${motifH}"
    overflow="hidden">${motifArt(doc, W, motifH)}</svg>`;
  const pw = W * 0.72;
  const ph = Math.min(heroBottom - m * 1.6, H * 0.5);
  const px = (W - pw) / 2;
  const py = Math.max(m * 1.4, motifH - ph * 0.82);
  const photo = frameWindow(doc, px, py, pw, ph, "photo");
  return bg + motif + photo + text + bottom;
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
  const W = t.w, H = t.h;
  const style = opts.fontCss ? `<style>${opts.fontCss}</style>` : "";
  if (t.composed) {
    const g = docGround(doc);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${style}
      <rect width="${W}" height="${H}" fill="${g.hex}"/>
      ${composedSvg(doc, W, H)}
    </svg>`;
  }
  const reg = REGISTERS[doc.register];
  const ground = reg.ground;
  const ink = reg.ink;
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
