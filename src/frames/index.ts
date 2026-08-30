// Frame shapes — the organic windows that photos, color panels, and motifs
// live inside. Two designer-drawn shapes traced from the exploration boards
// (blob, drape) plus seeded generators in the same hand (wobble, scallop,
// swoop). framePath() returns a closed path d fitted to a w×h slot.

import { rng, smoothPath, clamp } from "../engines/util.js";
import { DESIGNER_SHAPES } from "./designerShapes";

export interface FrameDef {
  id: string;
  label: string;
}

export const FRAMES: FrameDef[] = [
  { id: "wobble", label: "Hand-cut" },
  { id: "blob", label: "Blob" },
  { id: "scallop", label: "Scallop" },
  { id: "swoop", label: "Swoop" },
  { id: "drape", label: "Drape" },
];

export const frameById = (id: string) => FRAMES.find((f) => f.id === id) ?? FRAMES[0];

// Word-plate frames — shared by the title's contrast plate and every text
// box. Narrower than the full FRAMES set: the designer shapes (blob/swoop/
// drape) read as photo-frame moves, not word marks, so they're left off;
// "rect" restores the plain rounded-rectangle plate the title always used
// before frame choice existed, and "scallop-chip" is the small bumpy-cloud
// shape shared with the date/time chips (not the window-scale "scallop"
// frame's many tilted lobes) so a scalloped word plate reads as the same
// mark language as the chip row, not the photo/motif window's shape family.
export const PLATE_FRAMES: FrameDef[] = [
  { id: "rect", label: "Rounded" },
  { id: "wobble", label: "Hand-cut" },
  { id: "scallop-chip", label: "Scallop" },
];

// Designer shapes (blob/drape) keep their own aspect ratio — designerFit()
// below letterboxes them inside a mismatched box instead of stretching, so
// callers that want the shape to fill its box exactly (text/title plates)
// should size the box to this aspect first. null for generated shapes, which
// have no fixed aspect of their own.
export function frameAspect(id: string): number | null {
  const s = DESIGNER_SHAPES.find((sh) => sh.id === id);
  return s ? s.w / s.h : null;
}

// The scallop generator shrinks its tabbed rect a few percent before tilting
// it a few degrees, so the rotated bounding box still clears the outer w×h
// slot it's handed. Callers that need to size CONTENT (e.g. centered text) to
// the shape's own pre-tilt interior — not the outer slot — use this to get
// that shrink factor. It depends only on the box's aspect ratio, so it's
// valid to call with either the outer slot or the desired interior box.
export function scallopShrink(seed: number, w: number, h: number): number {
  const r = rng((seed >>> 0) * 15485863 + "scallop".length * 97);
  const tilt = (r() - 0.5) * 6;
  const rad = (Math.abs(tilt) * Math.PI) / 180;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);
  return Math.min(1, w / (w * cosA + h * sinA), h / (w * sinA + h * cosA));
}

// Scale a designer path (absolute coords, mixed commands) into the slot.
// Returned as a transform on a <path> group instead of rewriting the d.
function designerFit(id: string, w: number, h: number): { d: string; transform: string } {
  const s = DESIGNER_SHAPES.find((sh) => sh.id === id)!;
  const k = Math.min(w / s.w, h / s.h);
  const tx = (w - s.w * k) / 2 - s.x * k;
  const ty = (h - s.h * k) / 2 - s.y * k;
  return { d: s.d, transform: `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(4)})` };
}

type Pt = { x: number; y: number };

// Shared tab-run generator: each edge of a w×h rect gets a run of adjoining
// rounded-rectangle tabs (quarter-arc up, flat run, quarter-arc down) of
// varying length but uniform height `hgt` and radius `hgt`, protruding
// outward from a baseline inset by `inset`. Used at frame scale (many small
// tabs, soft semicircle read) and chip scale (few chunky tabs).
function tabbedRectPath(
  seed: number,
  w: number,
  h: number,
  hgt: number,
  inset: number,
  minLen: number,
  maxLen: number
): string {
  const rc = hgt;
  const r = rng((seed >>> 0) * 15485863 + 31);
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const ARC_SEG = 8;
  const edgeTabs = (a: Pt, b: Pt, n: Pt): Pt[] => {
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    const ux = ex / len, uy = ey / len;
    const toXY = (u: number, v: number): Pt => ({ x: a.x + ux * u + n.x * v, y: a.y + uy * u + n.y * v });
    const widths: number[] = [];
    let sum = 0;
    while (sum < len) {
      const wl = minLen + r() * (maxLen - minLen);
      widths.push(wl);
      sum += wl;
    }
    const k = len / sum;
    const pts: Pt[] = [];
    let u0 = 0;
    for (const wRaw of widths) {
      const tw2 = Math.max(wRaw * k, rc * 2.02);
      const cRc = Math.min(rc, tw2 / 2);
      for (let i = 0; i <= ARC_SEG; i++) {
        const ang = Math.PI - (Math.PI / 2) * (i / ARC_SEG);
        pts.push(toXY(u0 + cRc + Math.cos(ang) * cRc, Math.sin(ang) * cRc));
      }
      pts.push(toXY(u0 + tw2 - cRc, hgt));
      for (let i = 0; i <= ARC_SEG; i++) {
        const ang = Math.PI / 2 - (Math.PI / 2) * (i / ARC_SEG);
        pts.push(toXY(u0 + tw2 - cRc + Math.cos(ang) * cRc, Math.sin(ang) * cRc));
      }
      u0 += tw2;
    }
    return pts;
  };
  const corners: Pt[] = [
    { x: inset, y: inset },
    { x: inset + iw, y: inset },
    { x: inset + iw, y: inset + ih },
    { x: inset, y: inset + ih },
  ];
  const normals: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  let all: Pt[] = [];
  for (let i = 0; i < 4; i++) all = all.concat(edgeTabs(corners[i], corners[(i + 1) % 4], normals[i]));
  let d = `M ${all[0].x.toFixed(1)} ${all[0].y.toFixed(1)}`;
  for (let i = 1; i < all.length; i++) d += ` L ${all[i].x.toFixed(1)} ${all[i].y.toFixed(1)}`;
  return d + " Z";
}

// Chip-scale scallop: a "bumpy cloud rectangle" — a couple of fat, soft tabs
// per edge instead of many small ones, large radius, but modest — sticks out
// just a little past the chip's own w×h box, not a big bloom. Used by
// chipSvg's "scallop" chip style and by the diagram's "scallop" node style.
const SCALLOP_CHIP_HGT = 0.16, SCALLOP_CHIP_INSET = 0.09;

export function scallopChipPath(seed: number, w: number, h: number): string {
  return tabbedRectPath(seed, w, h, h * SCALLOP_CHIP_HGT, h * SCALLOP_CHIP_INSET, h * 0.5, h * 1.7);
}

// How far a chip-scale scallop's tabs reach past the nominal w×h box —
// callers space adjoining scallop chips apart by (at least) twice this so
// their bumps don't collide.
export function scallopChipProtrusion(h: number): number {
  return h * (SCALLOP_CHIP_HGT - SCALLOP_CHIP_INSET);
}

// Walk a rect perimeter at roughly even spacing, returning points plus each
// point's outward normal — the generators displace along the normal.
function perimeter(w: number, h: number, step: number): { p: Pt; n: Pt; corner: boolean }[] {
  const out: { p: Pt; n: Pt; corner: boolean }[] = [];
  const edges: [Pt, Pt, Pt][] = [
    [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: 0, y: -1 }],
    [{ x: w, y: 0 }, { x: w, y: h }, { x: 1, y: 0 }],
    [{ x: w, y: h }, { x: 0, y: h }, { x: 0, y: 1 }],
    [{ x: 0, y: h }, { x: 0, y: 0 }, { x: -1, y: 0 }],
  ];
  for (const [a, b, n] of edges) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(2, Math.round(len / step));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      out.push({ p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, n, corner: i === 0 });
    }
  }
  return out;
}

// framePath: closed path d for the given frame in a w×h slot (0,0 origin).
// Same (id, seed, w, h) always yields the same shape.
export function framePath(id: string, seed: number, w: number, h: number): { d: string; transform?: string } {
  if (id === "blob" || id === "drape") return designerFit(id, w, h);

  // Plain rounded rectangle — the title plate's original look, before it had
  // a frame choice at all. Same shape regardless of seed.
  if (id === "rect") {
    const rx = Math.min(Math.min(w, h) * 0.22, w / 2, h / 2);
    return {
      d: `M ${rx.toFixed(1)} 0 H ${(w - rx).toFixed(1)} A ${rx.toFixed(1)} ${rx.toFixed(1)} 0 0 1 ${w.toFixed(1)} ${rx.toFixed(1)} V ${(h - rx).toFixed(1)} A ${rx.toFixed(1)} ${rx.toFixed(1)} 0 0 1 ${(w - rx).toFixed(1)} ${h.toFixed(1)} H ${rx.toFixed(1)} A ${rx.toFixed(1)} ${rx.toFixed(1)} 0 0 1 0 ${(h - rx).toFixed(1)} V ${rx.toFixed(1)} A ${rx.toFixed(1)} ${rx.toFixed(1)} 0 0 1 ${rx.toFixed(1)} 0 Z`,
    };
  }

  // Chip-scale scallop — identical generator to the date/time chips'
  // "scallop" chip style, at no tilt, so a title plate reads as the same
  // mark language as the chip row (unlike the frame family's own "scallop",
  // which is tuned window-scale with many tilted lobes).
  if (id === "scallop-chip") return { d: scallopChipPath(seed, w, h) };

  const r = rng((seed >>> 0) * 15485863 + id.length * 97);
  const m = Math.min(w, h);

  if (id === "scallop") {
    // Each edge is a run of rounded-rectangle tabs of varying length but
    // uniform height and corner radius, protruding outward from an inset
    // baseline: quarter-arc up (radius rc), a straight top run, quarter-arc
    // down, immediately into the next tab — a run of adjoining bumps, not
    // circular scallops. Corner radius equals the tab height, so the arc
    // alone carries the baseline up to the top run with no vertical wall.
    // Tuned so a ~1000px frame reads as ~6-9 soft lobes per edge.
    const hgt = m * 0.032;
    const minLen = m * 0.09, maxLen = m * 0.16;
    // A slight seeded tilt (±3°) from the frame seed, keeps the piece from
    // reading too rigid. The tabbed shape is generated in a box shrunk just
    // enough that its rotated bounding box still fits the original w×h slot
    // — the tilt can never clip at the slot edges.
    const tilt = (r() - 0.5) * 6;
    const rad = (Math.abs(tilt) * Math.PI) / 180;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    const shrink = Math.min(1, w / (w * cosA + h * sinA), h / (w * sinA + h * cosA));
    const bw = w * shrink, bh = h * shrink;
    const inset = hgt + m * 0.012;
    const d = tabbedRectPath(seed, bw, bh, hgt, inset, minLen, maxLen);
    const ox = (w - bw) / 2, oy = (h - bh) / 2;
    const transform = `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) rotate(${tilt.toFixed(2)} ${(bw / 2).toFixed(2)} ${(bh / 2).toFixed(2)})`;
    return { d, transform };
  }

  if (id === "swoop") {
    // gently S-curving edges with softly rounded corners (story-4's window)
    const inset = m * 0.05;
    const pts: Pt[] = [];
    for (const { p, n, corner } of perimeter(w - inset * 2, h - inset * 2, m * 0.16)) {
      const k = corner
        ? -m * (0.02 + r() * 0.02) // corners tuck in → rounded
        : Math.sin((p.x / w + p.y / h) * Math.PI * 2 + r() * 0.5) * m * 0.022 + (r() - 0.5) * m * 0.015;
      pts.push({ x: inset + p.x + n.x * k, y: inset + p.y + n.y * k });
    }
    return { d: smoothPath(pts, { closed: true, tension: 0.85 }) };
  }

  // "wobble": near-straight hand-cut edges, corners slightly off-square
  const inset = m * 0.03;
  const pts: Pt[] = [];
  for (const { p, n, corner } of perimeter(w - inset * 2, h - inset * 2, m * 0.22)) {
    const k = (r() - 0.5) * m * (corner ? 0.05 : 0.028);
    pts.push({ x: inset + p.x + n.x * k, y: inset + p.y + n.y * k });
  }
  return { d: smoothPath(pts, { closed: true, tension: 0.16 }) };
}

// Ticket-stub outline for the date/time chips — a rounded rect whose edge is
// nibbled by semicircular notches, like a ripped ticket. Fitted to w×h.
export function ticketPath(seed: number, w: number, h: number): string {
  const r = rng((seed >>> 0) * 2654435761 + 17);
  const pts: Pt[] = [];
  const bump = h * 0.14;
  for (const { p, n } of perimeter(w, h, h * 0.42)) {
    const k = Math.abs(Math.sin(((p.x + p.y) / (h * 0.42)) * Math.PI)) * bump * (0.5 + r() * 0.8);
    pts.push({ x: clamp(p.x + n.x * k, -bump, w + bump), y: clamp(p.y + n.y * k, -bump, h + bump) });
  }
  return smoothPath(pts, { closed: true, tension: 0.85 });
}
