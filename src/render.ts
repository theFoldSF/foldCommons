// render.ts — Doc → SVG. One renderer for the on-screen canvas, gallery
// thumbnails, and exports, so what you see is exactly what ships.

import { TYPE_RULES, isDark, type TypeRole } from "./brand/tokens";
import { fontFamilyCss } from "./brand/fonts";
import { SIGNATURE_ENGINE, engineById } from "./engines/index";
import { framePath, ticketPath, scallopChipPath, scallopChipProtrusion } from "./frames/index";
import { rng, smoothPath } from "./engines/util.js";
import { markById } from "./marks/index";
import { photoById } from "./photos/index";
import { ARRANGEMENTS, docAccent, docGround, docSeason, docTemplate, type ChipStyle, type Doc, type XfKey } from "./state";
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
  const g = docGround(doc);
  const slot = t.motifSlot === "backdrop" ? { x: 0, y: 0, w: W, h: H } : t.motifSlot;
  const colors = doc.motif.accents.map((i) => docAccent(doc, i));
  const inner = e.render({
    w: slot.w,
    h: slot.h,
    p: doc.motif.params,
    colors,
    ink: g.ink,
    ground: g.hex,
    seed: doc.motif.seed,
  });
  const dim = t.motifSlot === "backdrop" ? ` opacity="0.5"` : "";
  return `<svg x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}"
    viewBox="0 0 ${slot.w} ${slot.h}" overflow="hidden"${dim}>${inner}</svg>`;
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

// A single date/time chip. `anchor` is either the chip's right edge
// (align "end", the default — matches the original ticket-stub layout) or
// its left edge (align "start" — used by left-aligned words layouts).
function chipSvg(
  text: string,
  accent: string,
  anchor: number,
  cy: number,
  size: number,
  seed: number,
  style: ChipStyle,
  align: "start" | "end" = "end"
): { svg: string; w: number } {
  if (!text.trim()) return { svg: "", w: 0 };
  const w = text.length * size * 0.56 + size * 1.7;
  const h = size * 1.75;
  const x = align === "end" ? anchor - w : anchor;
  const ink = isDark(accent) ? "#FFF9F1" : "#03071B";
  const pathD = style === "scallop" ? scallopChipPath(seed, w, h) : ticketPath(seed, w, h);
  return {
    svg: `<g transform="translate(${x.toFixed(1)} ${(cy - h / 2).toFixed(1)})">
      <path d="${pathD}" fill="${accent}"/>
      <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" fill="${ink}"
        font-family="${fontFamilyCss("Figtree")}" font-size="${size}" font-weight="600">${esc(text)}</text></g>`,
    w,
  };
}

// "line" chip style: date and time as plain ink text (no fill shape), a
// small hand-drawn squiggle connecting them, and a small fully-rounded color
// pill beneath each — one composed unit (both accent pickers still drive the
// pill colors). `anchor`/`align` place the unit's outer edge, same contract
// as chipSvg.
function lineChipsSvg(
  dateText: string,
  timeText: string,
  dateAccent: string,
  timeAccent: string,
  anchor: number,
  cy: number,
  size: number,
  seed: number,
  ink: string,
  align: "start" | "end" = "end"
): { svg: string; w: number } {
  const hasDate = dateText.trim().length > 0;
  const hasTime = timeText.trim().length > 0;
  if (!hasDate && !hasTime) return { svg: "", w: 0 };
  const charW = size * 0.54;
  const dateW = hasDate ? dateText.length * charW : 0;
  const timeW = hasTime ? timeText.length * charW : 0;
  const gap = size * 1.6;
  const pillW = size * 0.95, pillH = size * 0.2;
  const textY = cy - size * 0.35; // baseline
  const squiggleY = textY - size * 0.35; // vertical center of the text (it only spans the gap between the two texts, so it never runs under a glyph)
  const pillY = cy + size * 0.34; // close under the text

  // Always lay out left→right (date, then time); compute each element's own
  // left edge directly so "start"/"end" only shifts the whole unit, never
  // the internal reading order.
  let dateLeft: number, timeLeft: number;
  if (align === "end") {
    const timeRight = anchor;
    timeLeft = timeRight - timeW;
    const dateRight = hasTime ? timeLeft - gap : timeRight;
    dateLeft = dateRight - dateW;
  } else {
    dateLeft = anchor;
    const dateRight = dateLeft + dateW;
    timeLeft = hasDate ? dateRight + gap : dateLeft;
  }

  const one = (text: string, left: number, w: number, accent: string, pillLeft: number) => {
    if (!text.trim()) return "";
    return `<text x="${left.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="start" fill="${ink}"
      font-family="${fontFamilyCss("Figtree")}" font-size="${size}" font-weight="600">${esc(text)}</text>
      <rect x="${pillLeft.toFixed(1)}" y="${(pillY - pillH / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(pillH / 2).toFixed(1)}" fill="${accent}"/>`;
  };
  let svg = "";
  if (hasDate && hasTime) {
    // a gentle hand-drawn connector, not a jagged squiggle — small amplitude,
    // smoothed, sitting clear of both the text above and the pills below
    const rr = rng(seed >>> 0);
    const x1 = dateLeft + dateW + size * 0.1;
    const x2 = timeLeft - size * 0.1;
    const n = 3;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const x = x1 + (x2 - x1) * (i / n);
      const y = i === 0 || i === n ? squiggleY : squiggleY + (rr() - 0.5) * size * 0.1;
      pts.push([x, y]);
    }
    svg += `<path d="${smoothPath(pts, { tension: 0.6 })}" fill="none" stroke="${ink}" stroke-opacity="0.5"
      stroke-width="${Math.max(1.3, size * 0.045)}" stroke-linecap="round"/>`;
  }
  // Pills align to the text's own edge: the date pill's left edge under the
  // date text's start, the time pill's right edge under the time text's end.
  svg += one(dateText, dateLeft, pillW, dateAccent, dateLeft);
  svg += one(timeText, timeLeft, pillW, timeAccent, timeLeft + timeW - pillW);
  const leftEdge = Math.min(hasDate ? dateLeft : Infinity, hasTime ? Math.min(timeLeft, timeLeft + timeW - pillW) : Infinity);
  const rightEdge = Math.max(hasDate ? dateLeft + Math.max(dateW, pillW) : -Infinity, hasTime ? timeLeft + timeW : -Infinity);
  return { svg: `<g>${svg}</g>`, w: rightEdge - leftEdge };
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

// Photoshop-style free transform on a composed element: translate in canvas
// units, uniform scale, rotation in degrees, pivoting on the element's own
// untransformed center (cx,cy) — the literal center of the geometry passed in.
// Wrapped in a <g data-el="KEY"> so the transform-tool overlay (main.ts) can
// find and measure it via getBBox(); identity when no xf is stored.
function xfWrap(doc: Doc, key: XfKey, cx: number, cy: number, inner: string): string {
  const xf = doc.comp.xf?.[key];
  const dx = xf?.dx ?? 0, dy = xf?.dy ?? 0, s = xf?.s ?? 1, rot = xf?.rot ?? 0;
  const t =
    dx || dy || s !== 1 || rot
      ? ` transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${s.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)}) translate(${dx.toFixed(2)} ${dy.toFixed(2)})"`
      : "";
  return `<g data-el="${key}"${t}>${inner}</g>`;
}

// The date/time chip row (or the "line" unit), anchored at `anchor` — its
// right edge for align "end" (band/corners), its left edge for align "start"
// (stack). The nearer-to-anchor element renders first, both keep reading
// left→right. Returns the far edge reached, so a neighboring title can clear
// it, and whether anything rendered at all.
function chipsRow(
  doc: Doc,
  dateText: string,
  timeText: string,
  dateAccent: string,
  timeAccent: string,
  chipStyle: ChipStyle,
  anchor: number,
  cy: number,
  size: number,
  seedBase: number,
  ink: string,
  align: "start" | "end"
): { svg: string; farEdge: number; hasAny: boolean } {
  if (chipStyle === "line") {
    const unit = lineChipsSvg(dateText, timeText, dateAccent, timeAccent, anchor, cy, size, seedBase, ink, align);
    if (!unit.svg) return { svg: "", farEdge: anchor, hasAny: false };
    const cx = align === "end" ? anchor - unit.w / 2 : anchor + unit.w / 2;
    return {
      svg: xfWrap(doc, "date", cx, cy, unit.svg),
      farEdge: align === "end" ? anchor - unit.w : anchor + unit.w,
      hasAny: true,
    };
  }
  const nearKey: XfKey = align === "end" ? "time" : "date";
  const farKey: XfKey = align === "end" ? "date" : "time";
  const nearText = nearKey === "time" ? timeText : dateText;
  const nearAccent = nearKey === "time" ? timeAccent : dateAccent;
  const farText = farKey === "time" ? timeText : dateText;
  const farAccent = farKey === "time" ? timeAccent : dateAccent;
  // scallop chips bulge past their nominal w×h box — space them apart by
  // enough that the two chips' bumps can't collide
  const h = size * 1.75;
  const chipGap = chipStyle === "scallop" ? size * 0.6 + scallopChipProtrusion(h) * 2 : size * 0.6;
  let svg = "";
  let cursor = anchor;
  const near = chipSvg(nearText, nearAccent, anchor, cy, size, seedBase, chipStyle, align);
  if (near.svg) {
    const cx = align === "end" ? anchor - near.w / 2 : anchor + near.w / 2;
    svg += xfWrap(doc, nearKey, cx, cy, near.svg);
    cursor = align === "end" ? anchor - near.w - chipGap : anchor + near.w + chipGap;
  }
  const far = chipSvg(farText, farAccent, cursor, cy, size, seedBase + 1, chipStyle, align);
  let farEdge = near.svg ? cursor : anchor;
  if (far.svg) {
    const cx = align === "end" ? cursor - far.w / 2 : cursor + far.w / 2;
    svg += xfWrap(doc, farKey, cx, cy, far.svg);
    farEdge = align === "end" ? cursor - far.w : cursor + far.w;
  }
  return { svg, farEdge, hasAny: !!(near.svg || far.svg) };
}

// Real glyph-width measurement (canvas measureText) instead of a fixed
// char-count heuristic — the heuristic runs ~13% wide on real proportional
// text, which is invisible for plain baseline text but reads as visibly
// off-center once a title sits on a tight-fitted plate. Falls back to the
// heuristic if canvas isn't available (non-DOM context).
let measureCtx: CanvasRenderingContext2D | null | undefined;
function measureTextWidth(text: string, fontFamily: string, weight: number, size: number): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return text.length * size * 0.55;
  measureCtx.font = `${weight} ${size}px ${fontFamily}`;
  const w = measureCtx.measureText(text).width;
  return w > 0 ? w : text.length * size * 0.55;
}

function fitTitle(title: string, size0: number, maxW: number, minFactor = 0.45): { size: number; w: number } {
  const face = heading();
  const fam = fontFamilyCss(face.name);
  const w0 = measureTextWidth(title, fam, face.weight, size0);
  if (w0 <= maxW) return { size: size0, w: w0 };
  const size = Math.max(size0 * minFactor, size0 * (maxW / w0));
  return { size, w: measureTextWidth(title, fam, face.weight, size) };
}

function titleTextSvg(text: string, x: number, yBaseline: number, align: "start" | "end", size: number, ink: string): string {
  return `<text x="${x.toFixed(1)}" y="${yBaseline.toFixed(1)}" text-anchor="${align}" fill="${ink}"
    font-family="${fontFamilyCss(heading().name)}" font-size="${size.toFixed(1)}"
    font-weight="${heading().weight}">${esc(text)}</text>`;
}

// Contrast-plate metrics, as fractions of the title's font size — ascent/
// descent measured directly off the rendered heading face's real glyph ink
// (tall ascenders like b/d/h/l/t reach ~0.95em, not the ~0.72em a generic
// cap-height guess would assume), with equal, modest padding on every side.
const TITLE_PLATE = { padX: 0.4, padY: 0.14, ascent: 0.96, descent: 0.28 };

function titlePlatePadX(size: number): number {
  return size * TITLE_PLATE.padX;
}
// How far the plate reaches above/below the baseline — used both to draw it
// and to keep neighboring elements (the chip row) clear of it.
function titlePlateAboveBaseline(size: number): number {
  return size * (TITLE_PLATE.ascent + TITLE_PLATE.padY);
}
function titlePlateBelowBaseline(size: number): number {
  return size * (TITLE_PLATE.descent + TITLE_PLATE.padY);
}

// Title text on a big rounded-outline plate — the contrast card a title
// needs when it sits directly over a photo/motif instead of on plain ground
// (the "corners" and "stack" words layouts). Centered on the text: equal
// padding above the cap-height and below the deepest descender.
function titlePlateSvg(str: string, x: number, yBaseline: number, align: "start" | "end", size: number, w: number, ink: string, ground: string): string {
  const padX = titlePlatePadX(size);
  const left = align === "start" ? x - padX : x - w - padX;
  const right = align === "start" ? x + w + padX : x + padX;
  const top = yBaseline - titlePlateAboveBaseline(size);
  const bottom = yBaseline + titlePlateBelowBaseline(size);
  const rx = Math.min(size * 0.42, (bottom - top) / 2);
  const plate = `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${(right - left).toFixed(1)}" height="${(bottom - top).toFixed(1)}"
    rx="${rx.toFixed(1)}" fill="${ground}" stroke="${ink}" stroke-width="2"/>`;
  return plate + titleTextSvg(str, x, yBaseline, align, size, ink);
}

// Motif layers live in a bounded, padded window — a nested svg clips them, so
// no engine can ever spill past the canvas or crowd the words.
function motifWindowSvg(doc: Doc, b: { x: number; y: number; w: number; h: number }): string {
  // an invisible full-box hit rect first — many motif engines are sparse
  // (thin strokes, lots of empty space), and the transform-tool hover needs
  // to trigger anywhere over the box, not just on painted pixels
  const hit = `<rect width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" fill="#000" fill-opacity="0"/>`;
  return `<svg x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}"
    viewBox="0 0 ${b.w.toFixed(1)} ${b.h.toFixed(1)}" overflow="hidden">${hit}${motifArt(doc, b.w, b.h)}</svg>`;
}

// Horizontal-movement geometry for backdrop/collage: which corner (or side)
// the motif box and the photo frame anchor to, per comp.arrange. Fraction
// sizes and photo aspect are seeded off frameSeed so a given doc always
// redraws the same asymmetry.
function arrangeBoxes(
  arrangeIdx: number,
  frameSeed: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { motif: { x: number; y: number; w: number; h: number }; photo: { x: number; y: number; w: number; h: number } } {
  const v = ARRANGEMENTS[((arrangeIdx % ARRANGEMENTS.length) + ARRANGEMENTS.length) % ARRANGEMENTS.length];
  const w = x1 - x0, h = y1 - y0;
  const rr = rng(((frameSeed >>> 0) * 2654435761 + arrangeIdx * 97 + 11) >>> 0);
  const motifFrac = 0.55 + rr() * 0.2; // 55–75% of the bounded area
  const photoWFrac = 0.5 + rr() * 0.15; // 50–65% width, seeded
  const photoAspect = 0.7 + rr() * 0.3;
  const anchor = (which: "full" | "tl" | "tr" | "bl" | "br" | "center", bw: number, bh: number) => {
    let x = x0 + (w - bw) / 2, y = y0 + (h - bh) / 2;
    if (which === "tl") { x = x0; y = y0; }
    if (which === "tr") { x = x1 - bw; y = y0; }
    if (which === "bl") { x = x0; y = y1 - bh; }
    if (which === "br") { x = x1 - bw; y = y1 - bh; }
    return { x, y, w: bw, h: bh };
  };
  const motif = v.motif === "full" ? { x: x0, y: y0, w, h } : anchor(v.motif, w * motifFrac, h * motifFrac);
  const photoW = w * photoWFrac;
  const photoH = Math.min(h * 0.85, photoW * photoAspect);
  const photo = anchor(v.photo, photoW, photoH);
  return { motif, photo };
}

function composedSvg(doc: Doc, W: number, H: number): string {
  const t = docTemplate(doc);
  const c = t.comp!;
  const g = docGround(doc);
  const ink = g.ink;
  const m = c.margin;
  const comp = doc.comp;
  const title = (doc.fields.title ?? "").trim();
  const dateText = doc.fields.date ?? "";
  const timeText = doc.fields.time ?? "";
  const dateAccent = docAccent(doc, comp.chipAccents[0]);
  const timeAccent = docAccent(doc, comp.chipAccents[1]);
  const chipStyle = comp.chipStyle;
  const bg = bgTextureSvg(doc, W, H);

  const sigH = c.logoH * 2.1, sigW = c.logoH * 4.6;

  // --- words: signature, title, date/time chips — one of three base
  // arrangements. Every element still keeps its own xf transform on top;
  // these are just the seed positions the transform pivots on.
  let wordsSvg = "";
  let heroBottom: number;
  let proseDefault: { x: number; y: number; w: number };

  if (comp.words === "corners") {
    const sigX = m * 0.6, sigY = m * 0.6;
    wordsSvg += xfWrap(doc, "sig", sigX + sigW / 2, sigY + sigH / 2, signatureSvg(doc, sigX, sigY, sigW, sigH, ink));
    const chipH = c.chipSize * 1.75;
    const chipCy = H - m * 0.8 - chipH / 2;
    const row = chipsRow(doc, dateText, timeText, dateAccent, timeAccent, chipStyle, W - m, chipCy, c.chipSize, comp.frameSeed + 1, ink, "end");
    wordsSvg += row.svg;
    if (title) {
      const size0 = c.titleSize * 1.3;
      const edgeMargin = m * 0.5; // clearance from the plate to the canvas edge
      const padXReserve = titlePlatePadX(size0);
      const maxW = W - edgeMargin * 2 - padXReserve * 2;
      const { size, w } = fitTitle(title, size0, maxW);
      const titleX = edgeMargin + padXReserve;
      // over full-bleed art, so the title rides on a contrast plate — sized
      // to clear the chip row beneath it, never just the bare 25%-up default
      const belowExtent = titlePlateBelowBaseline(size);
      const chipRowTop = chipCy - chipH / 2;
      const desiredBaseline = H - H * 0.25 + size * 0.34; // 25% up from the bottom
      const baseline = Math.min(desiredBaseline, chipRowTop - m * 0.3 - belowExtent);
      const plateTop = baseline - titlePlateAboveBaseline(size);
      const plateBottom = baseline + belowExtent;
      wordsSvg += xfWrap(doc, "title", titleX + w / 2, (plateTop + plateBottom) / 2,
        titlePlateSvg(title, titleX, baseline, "start", size, w, ink, g.hex));
    }
    heroBottom = H - m * 0.35;
    proseDefault = { x: (W - W * 0.6) / 2, y: 0, w: W * 0.6 };
  } else if (comp.words === "stack") {
    const sigX = m * 0.6, sigY = m * 0.6;
    wordsSvg += xfWrap(doc, "sig", sigX + sigW / 2, sigY + sigH / 2, signatureSvg(doc, sigX, sigY, sigW, sigH, ink));
    const chipH = c.chipSize * 1.75;
    const chipCy = H - m * 0.55 - chipH / 2;
    const row = chipsRow(doc, dateText, timeText, dateAccent, timeAccent, chipStyle, m * 0.6, chipCy, c.chipSize, comp.frameSeed + 1, ink, "start");
    wordsSvg += row.svg;
    if (title) {
      const size0 = c.titleSize * 1.4;
      const edgeMargin = m * 0.5; // clearance from the plate to the canvas edge
      const padXReserve = titlePlatePadX(size0);
      const maxW = W - edgeMargin * 2 - padXReserve * 2;
      const { size, w } = fitTitle(title, size0, maxW);
      const titleX = edgeMargin + padXReserve;
      // over full-bleed art, so the title rides on a contrast plate — placed
      // so the PLATE (not just the bare baseline) keeps its gap above the chips
      const belowExtent = titlePlateBelowBaseline(size);
      const chipRowTop = chipCy - chipH / 2;
      const baseline = chipRowTop - m * 0.3 - belowExtent;
      const plateTop = baseline - titlePlateAboveBaseline(size);
      const plateBottom = baseline + belowExtent;
      wordsSvg += xfWrap(doc, "title", titleX + w / 2, (plateTop + plateBottom) / 2,
        titlePlateSvg(title, titleX, baseline, "start", size, w, ink, g.hex));
    }
    heroBottom = H - m * 0.35;
    proseDefault = { x: (W - W * 0.6) / 2, y: 0, w: W * 0.6 };
  } else {
    // "band": the original single-row bottom band
    const bandH = Math.max(sigH, c.titleSize * 1.1);
    const rowCy = H - m * 0.8 - bandH / 2;
    const bandTop = rowCy - bandH / 2;
    const sigX = m * 0.55, sigY = rowCy - sigH / 2;
    wordsSvg += xfWrap(doc, "sig", sigX + sigW / 2, sigY + sigH / 2, signatureSvg(doc, sigX, sigY, sigW, sigH, ink));
    const row = chipsRow(doc, dateText, timeText, dateAccent, timeAccent, chipStyle, W - m, rowCy, c.chipSize, comp.frameSeed + 1, ink, "end");
    wordsSvg += row.svg;
    if (title) {
      const titleBoundary = row.hasAny ? row.farEdge - c.chipSize * 0.8 : row.farEdge;
      const titleX = m * 0.55 + sigW + c.titleSize * 0.5;
      const maxW = Math.max(60, titleBoundary - titleX);
      const { size, w } = fitTitle(title, c.titleSize, maxW);
      wordsSvg += xfWrap(doc, "title", titleX + w / 2, rowCy, titleTextSvg(title, titleX, rowCy + size * 0.34, "start", size, ink));
    }
    heroBottom = H - m * 0.8 - bandH - m * 0.45;
    proseDefault = { x: m, y: bandTop - m * 0.45, w: W - m * 2 };
  }

  // Prose card — multi-line body copy in its own frame. It floats at a
  // sensible default position and does not shrink the hero/motif area; the
  // transform tool moves it from there like any other element.
  const prose = (doc.fields.prose ?? "").trim();
  let proseSvgOut = "";
  if (prose) {
    const pad = c.detailSize * 1.15;
    const pw = proseDefault.w;
    const perLine = Math.max(8, Math.floor((pw - pad * 2) / (c.detailSize * 0.5)));
    const lines: string[] = [];
    for (const para of prose.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const cand = line ? `${line} ${word}` : word;
        if (cand.length > perLine && line) {
          lines.push(line);
          line = word;
        } else line = cand;
      }
      lines.push(line);
    }
    const shown = lines.slice(0, 10);
    const lh = c.detailSize * 1.5;
    const ph = pad * 2 + shown.length * lh;
    const py = comp.words === "band" ? proseDefault.y - ph : (H - ph) / 2;
    const px = proseDefault.x;
    // designer shapes keep their own aspect — the card needs a stretchy frame
    const cardFrame = comp.frame === "blob" || comp.frame === "drape" ? "wobble" : comp.frame;
    const fp = framePath(cardFrame, comp.frameSeed + 9, pw, ph);
    const tspans = shown
      .map((l, i) => `<tspan x="${pad}" dy="${i === 0 ? 0 : lh}">${esc(l)}</tspan>`)
      .join("");
    const proseSvg = `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
      <path d="${fp.d}"${fp.transform ? ` transform="${fp.transform}"` : ""} fill="${g.hex}" stroke="${ink}" stroke-width="2"/>
      <text x="${pad}" y="${pad + c.detailSize * 0.85}" fill="${ink}"
        font-family="${fontFamilyCss(bodyFace().name)}" font-size="${c.detailSize}"
        font-weight="${bodyFace().weight}">${tspans}</text></g>`;
    proseSvgOut = xfWrap(doc, "prose", px + pw / 2, py + ph / 2, proseSvg);
  }

  const heroTop = m;

  if (comp.layout === "hero" || comp.layout === "panel") {
    const winX = m * 0.7, winY = heroTop, winW = W - m * 1.4, winH = heroBottom - heroTop;
    const win = xfWrap(doc, "photo", winX + winW / 2, winY + winH / 2,
      frameWindow(doc, winX, winY, winW, winH, comp.layout === "panel" ? "fill" : "photo"));
    return bg + win + proseSvgOut + wordsSvg;
  }

  const mp = m * 0.45; // motif padding off the canvas edge

  if (comp.layout === "motif") {
    // the motif runs the frame, padded off the edges
    const b = { x: mp, y: mp, w: W - mp * 2, h: heroBottom - mp * 2 };
    const motifLayer = xfWrap(doc, "motif", b.x + b.w / 2, b.y + b.h / 2, motifWindowSvg(doc, b));
    return bg + motifLayer + proseSvgOut + wordsSvg;
  }

  // collage & backdrop: a bounded motif window and a framed photo, both
  // placed per comp.arrange — several seeded anchor pairings so the two
  // elements lean into corners/sides instead of always stacking centered.
  const area = { x0: mp, y0: mp, x1: W - mp, y1: heroBottom - mp };
  const { motif: mb, photo: pb } = arrangeBoxes(comp.arrange, comp.frameSeed, area.x0, area.y0, area.x1, area.y1);
  const motifLayer = xfWrap(doc, "motif", mb.x + mb.w / 2, mb.y + mb.h / 2, motifWindowSvg(doc, mb));
  const photoLayer = xfWrap(doc, "photo", pb.x + pb.w / 2, pb.y + pb.h / 2, frameWindow(doc, pb.x, pb.y, pb.w, pb.h, "photo"));
  return bg + motifLayer + photoLayer + proseSvgOut + wordsSvg;
}

// --- diagram kit -------------------------------------------------------------

// Seeded free placement for the "scatter" flow mode: rejection-sampled node
// centers that avoid overlapping their label-width boxes (with padding),
// falling back to whichever candidate cleared the most space if nothing
// found a fully clean spot. Deterministic for a given scatterSeed.
function scatterCenters(seed: number, W: number, H: number, widths: number[], boxH: number): { x: number; y: number }[] {
  const r = rng(seed >>> 0);
  const marginX = W * 0.09, marginY = H * 0.14;
  const padGap = 30;
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const out: { x: number; y: number }[] = [];
  for (const w of widths) {
    let best = { x: W / 2, y: H / 2 };
    let bestScore = -Infinity;
    let found = false;
    for (let tries = 0; tries < 80 && !found; tries++) {
      const x = marginX + w / 2 + r() * Math.max(1, W - marginX * 2 - w);
      const y = marginY + boxH / 2 + r() * Math.max(1, H * 0.78 - marginY * 2 - boxH);
      let minClearance = Infinity;
      let overlap = false;
      for (const p of placed) {
        const dx = Math.abs(x - p.x) - (w + p.w) / 2 - padGap;
        const dy = Math.abs(y - p.y) - (boxH + p.h) / 2 - padGap;
        const clearance = Math.max(dx, dy);
        if (dx < 0 && dy < 0) overlap = true;
        minClearance = Math.min(minClearance, clearance);
      }
      if (!overlap) { best = { x, y }; found = true; break; }
      if (minClearance > bestScore) { bestScore = minClearance; best = { x, y }; }
    }
    placed.push({ x: best.x, y: best.y, w, h: boxH });
    out.push(best);
  }
  return out;
}

// One diagram node in the chosen treatment — the same three the chips use:
// a ticket-stub chip, a chunky scallop chip, or plain text with a small
// rounded color pill beneath.
function nodeSvg(style: "ticket" | "scallop" | "plain", label: string, accent: string, cx: number, cy: number, w: number, h: number, fsize: number, ink: string, seed: number): string {
  if (style === "plain") {
    const pillW = Math.min(w * 0.6, fsize * 3.4), pillH = fsize * 0.26;
    return `<text x="${cx.toFixed(1)}" y="${(cy - h * 0.1).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${ink}"
      font-family="${fontFamilyCss("Figtree")}" font-size="${fsize}" font-weight="600">${esc(label)}</text>
      <rect x="${(cx - pillW / 2).toFixed(1)}" y="${(cy + h * 0.24 - pillH / 2).toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(pillH / 2).toFixed(1)}" fill="${accent}"/>`;
  }
  const chipInk = isDark(accent) ? "#FFF9F1" : "#03071B";
  const pathD = style === "scallop" ? scallopChipPath(seed, w, h) : ticketPath(seed, w, h);
  return `<g transform="translate(${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)})">
    <path d="${pathD}" fill="${accent}"/>
    <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" fill="${chipInk}"
      font-family="${fontFamilyCss("Figtree")}" font-size="${fsize}" font-weight="600">${esc(label)}</text></g>`;
}

function diagramSvg(doc: Doc, W: number, H: number, ink: string, ground: string): string {
  const d = doc.diagram;
  if (!d.nodes.length) return "";
  const fsize = 26;
  const boxH = 84;
  const gap = 84;
  const pad = 30;
  const widths = d.nodes.map((n) => Math.max(150, n.label.length * fsize * 0.56 + pad * 2));
  const total =
    d.dir === "lr" ? widths.reduce((a, b) => a + b, 0) + gap * (d.nodes.length - 1) : 0;
  let cx = (W - total) / 2;
  const centers: { x: number; y: number; w: number }[] = [];
  if (d.dir === "scatter") {
    for (const [i, p] of scatterCenters(d.scatterSeed, W, H, widths, boxH).entries())
      centers.push({ x: p.x, y: p.y, w: widths[i] });
  } else {
    d.nodes.forEach((n, i) => {
      if (d.dir === "lr") {
        centers.push({ x: cx + widths[i] / 2, y: H * 0.55, w: widths[i] });
        cx += widths[i] + gap;
      } else {
        const y0 = H * 0.3 + i * (boxH + gap);
        centers.push({ x: W / 2, y: y0, w: widths[i] });
      }
    });
  }
  let out = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5"
    markerHeight="6.5" orient="auto-start-reverse">
    <path d="M 0 1.5 L 9 5 L 0 8.5" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </marker></defs>`;
  for (const [a, b] of d.edges) {
    const A = centers[a], B = centers[b];
    if (!A || !B) continue;
    let x1, y1, x2, y2, sag;
    if (d.dir === "scatter") {
      // curved arrows between box edges at any angle: aim along the
      // center-to-center direction, clip to each box's rectangle, bow the
      // curve out along the perpendicular
      const dx = B.x - A.x, dy = B.y - A.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const edgeT = (hw: number, hh: number, dirx: number, diry: number) => {
        const tx = dirx !== 0 ? hw / Math.abs(dirx) : Infinity;
        const ty = diry !== 0 ? hh / Math.abs(diry) : Infinity;
        return Math.min(tx, ty);
      };
      const t1 = edgeT(A.w / 2 + 8, boxH / 2 + 8, ux, uy);
      x1 = A.x + ux * t1; y1 = A.y + uy * t1;
      const t2 = edgeT(B.w / 2 + 8, boxH / 2 + 8, -ux, -uy);
      x2 = B.x - ux * t2; y2 = B.y - uy * t2;
      sag = dist * 0.12 * (a % 2 === 0 ? 1 : -1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const nx = -uy, ny = ux;
      out += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${(mx + nx * sag).toFixed(1)} ${(my + ny * sag).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none"
        stroke="${ink}" stroke-width="2.4" marker-end="url(#arrow)"/>`;
      continue;
    }
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
    sag = d.dir === "lr" ? 26 : 0;
    out += `<path d="M ${x1} ${y1} Q ${mx} ${my + sag}, ${x2} ${y2}" fill="none"
      stroke="${ink}" stroke-width="2.4" marker-end="url(#arrow)"/>`;
  }
  // nodes in the chosen treatment — same language as the date/time chips
  d.nodes.forEach((n, i) => {
    const c = centers[i];
    const accent = docAccent(doc, n.accent);
    out += nodeSvg(d.nodeStyle, n.label, accent, c.x, c.y, c.w, boxH, fsize, ink, i * 131 + 7);
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
    const gap = cell * 0.05;
    const color = docAccent(doc, doc.stickers.accent + i);
    // die-cut backing: a scalloped cream shape with a cut line, mark inside
    const bx = ox + col * cell + gap;
    const by = oy + row * cell + gap;
    const bs = cell - gap * 2;
    const back = framePath("scallop", i * 271 + 11, bs, bs);
    const pad = cell * 0.19;
    out += `<g transform="translate(${bx.toFixed(1)} ${by.toFixed(1)})">
      <path d="${back.d}"${back.transform ? ` transform="${back.transform}"` : ""} fill="#FFF9F1" stroke="#03071B" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="7 6"/>
    </g>
    <svg x="${(ox + col * cell + pad).toFixed(1)}" y="${(oy + row * cell + pad).toFixed(1)}"
      width="${(cell - pad * 2).toFixed(1)}" height="${(cell - pad * 2).toFixed(1)}" viewBox="${m.viewBox}"
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
  // diagram & stickers share the composed language: any canon ground, the
  // net signature in the corner, chips and die-cuts instead of plain boxes.
  const g = docGround(doc);
  const ground = g.hex;
  const ink = g.ink;
  const body =
    t.kind === "diagram"
      ? diagramSvg(doc, W, H, ink, ground)
      : t.kind === "stickers"
        ? stickersSvg(doc, W, H)
        : "";
  const logoBase = Math.min(W, H) * 0.028;
  const sig = signatureSvg(doc, W * 0.035, H - W * 0.035 - logoBase * 2.1, logoBase * 4.6, logoBase * 2.1, ink);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${style}
    <rect width="${W}" height="${H}" fill="${ground}"/>
    ${motifSvg(doc, W, H)}
    ${lineMotifSvg(doc, W, H)}
    ${body}
    ${t.zones.map((z) => textZoneSvg(doc, z, ink)).join("\n")}
    ${sig}
  </svg>`;
}
