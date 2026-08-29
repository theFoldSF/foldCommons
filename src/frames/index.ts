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
  const r = rng((seed >>> 0) * 15485863 + id.length * 97);
  const m = Math.min(w, h);

  if (id === "scallop") {
    // The source comps build this from overlapping rounded-corner rectangles:
    // each edge a run of soft lobes. Quieter than a cloud edge — modest lobes,
    // irregular widths, shallow arcs. The inset is derived from the deepest
    // possible bulge so a lobe can never leave the slot and get clipped.
    const lobe = m * (0.085 + r() * 0.04);
    const F_MIN = 1.25; // shallowest radius factor → deepest bulge
    const maxBulge = (lobe * 1.35 * 0.5) * (F_MIN - Math.sqrt(F_MIN * F_MIN - 1));
    const inset = maxBulge + m * 0.012;
    const iw = w - inset * 2;
    const ih = h - inset * 2;
    const stations: Pt[] = [];
    const edge = (a: Pt, b: Pt) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nSeg = Math.max(2, Math.round(len / lobe));
      // irregular lobe widths: jittered weights, normalized to span the edge
      const wts = Array.from({ length: nSeg }, () => 0.72 + r() * 0.63);
      const total = wts.reduce((s, v) => s + v, 0);
      let acc = 0;
      for (let i = 0; i < nSeg; i++) {
        const t = acc / total;
        stations.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        acc += wts[i];
      }
    };
    edge({ x: inset, y: inset }, { x: inset + iw, y: inset });
    edge({ x: inset + iw, y: inset }, { x: inset + iw, y: inset + ih });
    edge({ x: inset + iw, y: inset + ih }, { x: inset, y: inset + ih });
    edge({ x: inset, y: inset + ih }, { x: inset, y: inset });
    let d = `M ${stations[0].x.toFixed(1)} ${stations[0].y.toFixed(1)}`;
    for (let i = 1; i <= stations.length; i++) {
      const q = stations[i % stations.length];
      const prev = stations[i - 1];
      const seg = Math.hypot(q.x - prev.x, q.y - prev.y);
      // well over half the chord → wide, shallow, round-cornered lobes
      const rad = (seg / 2) * (F_MIN + r() * 0.5);
      d += ` A ${rad.toFixed(1)} ${rad.toFixed(1)} 0 0 1 ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    }
    return { d: d + " Z" };
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
