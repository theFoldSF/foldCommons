// foldNetwork.js — the name as a constellation. F, O, L, D scatter across the
// frame and something holds them together: a dotted membrane traced around the
// cluster, a taut web strung between the letters, or ridge lines dividing the
// field into a territory per letter (the Voronoi skeleton of the four points).
// Tiles > 1 renders a contact sheet of seeded variations, like the sketch page.
import { rng, smoothPath, clamp, round } from "./util.js";

const TAU = Math.PI * 2;
const LETTERS = ["F", "O", "L", "D"];

export default {
  id: "network",
  label: "F·O·L·D net",
  blurb:
    "F, O, L, D scattered and held together — by a dotted membrane, a taut web, or ridge lines carving a territory per letter.",
  params: [
    { key: "tiles", label: "Tiles (contact sheet)", min: 1, max: 4, step: 1, default: 1 },
    { key: "style", label: "Style (0 membrane · 1 web · 2 ridges · 3 mix)", min: 0, max: 3, step: 1, default: 3 },
    { key: "scatter", label: "Scatter", min: 0.3, max: 1, step: 0.01, default: 0.65 },
    { key: "size", label: "Letter size", min: 0.5, max: 1.6, step: 0.01, default: 1 },
    { key: "weight", label: "Line weight", min: 0.5, max: 2.5, step: 0.05, default: 1 },
  ],

  render({ w, h, p, colors, ink, seed }) {
    const tiles = Math.round(p.tiles);
    const tw = w / tiles;
    const th = h / tiles;
    let out = "";
    for (let ty = 0; ty < tiles; ty++)
      for (let tx = 0; tx < tiles; tx++)
        out += renderTile({
          x0: tx * tw, y0: ty * th, tw, th, p, ink,
          seed: (seed >>> 0) + tx * 131 + ty * 733,
          styleOverride: Math.round(p.style),
        });
    return `<g>${out}</g>`;
  },
};

function renderTile({ x0, y0, tw, th, p, ink, seed, styleOverride }) {
  const r = rng((seed >>> 0) * 2246822519 + 1);
  const style = styleOverride === 3 ? Math.floor(r() * 3) : styleOverride;
  const S = Math.min(tw, th);
  const fs = S * 0.11 * p.size;
  const lw = p.weight * S / 700;

  // The letters always read F→O→L→D: usually one line, sometimes FO over LD.
  // Spacing is built from the letters' own sizes, so they can never overlap —
  // scatter only loosens the gaps and the vertical drift.
  const sc = p.scatter;
  const fss = LETTERS.map(() => fs * (0.8 + r() * 0.55));
  const rows =
    r() < 0.28 && th > fs * 3.4 ? [[0, 1], [2, 3]] : [[0, 1, 2, 3]];
  const pts = [];
  const rowGap = Math.max(...fss) * 1.5 + fs * 0.5 * sc;
  rows.forEach((row, ri) => {
    // advance x by the half-widths of neighbouring letters plus a seeded gap
    const xs = [0];
    for (let k = 1; k < row.length; k++)
      xs.push(xs[k - 1] + (fss[row[k - 1]] + fss[row[k]]) * 0.42 + fs * (0.25 + r() * 1.1 * sc));
    const total = xs[xs.length - 1];
    const fit = Math.min(1, (tw * 0.82) / Math.max(1, total));
    const rowCx = x0 + tw / 2 + (rows.length > 1 ? (r() - 0.5) * tw * 0.14 * sc : 0);
    const rowCy =
      rows.length === 1
        ? y0 + th * (0.5 + (r() - 0.5) * 0.22 * sc)
        : y0 + th / 2 + (ri === 0 ? -rowGap / 2 : rowGap / 2);
    row.forEach((li, k) => {
      // vertical drift stays under half the row gap — rows can't collide
      const drift = (r() - 0.5) * Math.min(fs * 0.9 * sc, rowGap * 0.4);
      pts.push({
        x: rowCx - (total * fit) / 2 + xs[k] * fit,
        y: rowCy + drift,
        ch: LETTERS[li],
        fs: fss[li],
      });
    });
  });

  let out = "";
  if (style === 0) out += membrane(pts, r, S, ink, lw);
  else if (style === 1) out += web(pts, r, ink, lw);
  else out += ridges(pts, r, { x0, y0, tw, th }, ink, lw);

  for (const q of pts)
    out += `<text x="${round(q.x)}" y="${round(q.y)}" font-family="'Fira Code', ui-monospace, monospace" font-weight="500" font-size="${round(q.fs)}" fill="${ink}" text-anchor="middle" dominant-baseline="central">${q.ch}</text>`;
  return out;
}

// dotted amoeba(s) enclosing the letters — the silhouette of pad-radius discs
// around each cluster, marched from the cluster centroid, drawn as a beaded
// dotted stroke like the hand sketch.
function membrane(pts, r, S, ink, lw) {
  const pad = S * 0.15;
  // single-linkage clustering: letters closer than the merge distance share a blob
  const clusters = [];
  const used = new Array(pts.length).fill(false);
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    const c = [pts[i]];
    used[i] = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < pts.length; j++) {
        if (used[j]) continue;
        if (c.some((q) => Math.hypot(q.x - pts[j].x, q.y - pts[j].y) < pad * 3.4)) {
          c.push(pts[j]); used[j] = true; grew = true;
        }
      }
    }
    clusters.push(c);
  }
  let out = "";
  for (const c of clusters) {
    const cx = c.reduce((a, q) => a + q.x, 0) / c.length;
    const cy = c.reduce((a, q) => a + q.y, 0) / c.length;
    const N = 44;
    const ring = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const dx = Math.cos(a), dy = Math.sin(a);
      // farthest exit through the union of discs along this ray
      let t = pad * 0.9;
      for (const q of c) {
        const px = q.x - cx, py = q.y - cy;
        const along = px * dx + py * dy;
        const perp2 = px * px + py * py - along * along;
        const pr = pad * (1 + (q.fs / (S * 0.11)) * 0.25);
        if (perp2 < pr * pr) t = Math.max(t, along + Math.sqrt(pr * pr - perp2));
      }
      t *= 1 + (r() - 0.5) * 0.07;
      ring.push({ x: cx + dx * t, y: cy + dy * t });
    }
    out += `<path d="${smoothPath(ring, { closed: true, tension: 0.7 })}" fill="none" stroke="${ink}" stroke-width="${lw * 2.4}" stroke-dasharray="0.1 ${lw * 5.5}" stroke-linecap="round"/>`;
  }
  return out;
}

// taut web: every pair strung with a line; hull-ish edges carry more weight.
function web(pts, r, ink, lw) {
  let out = "";
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const wgt = lw * (r() < 0.4 ? 1.9 : 0.55 + r() * 0.5);
      out += `<line x1="${round(pts[i].x)}" y1="${round(pts[i].y)}" x2="${round(pts[j].x)}" y2="${round(pts[j].y)}" stroke="${ink}" stroke-width="${round(wgt * 100) / 100}" stroke-linecap="round"/>`;
    }
  return out;
}

// ridge lines: the Voronoi skeleton of the four letters — for each pair, the
// stretch of their perpendicular bisector where they are the two nearest
// letters. Drawn heavy with a hand wobble, running off the tile edges.
function ridges(pts, r, box, ink, lw) {
  const { x0, y0, tw, th } = box;
  const inBox = (x, y) =>
    x > x0 + tw * 0.03 && x < x0 + tw * 0.97 && y > y0 + th * 0.03 && y < y0 + th * 0.97;
  let out = "";
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const mx = (pts[i].x + pts[j].x) / 2, my = (pts[i].y + pts[j].y) / 2;
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
      const dl = Math.hypot(dx, dy) || 1;
      const px = -dy / dl, py = dx / dl;
      const L = Math.hypot(tw, th);
      let run = [];
      const flush = () => {
        if (run.length > 3)
          out += `<path d="${smoothPath(run, { tension: 0.5 })}" fill="none" stroke="${ink}" stroke-width="${lw * 3.2}" stroke-linecap="round"/>`;
        run = [];
      };
      for (let s = -1; s <= 1; s += 0.02) {
        const x = mx + px * s * L * 0.6;
        const y = my + py * s * L * 0.6;
        if (!inBox(x, y)) { flush(); continue; }
        // keep only where {i,j} are the two nearest letters
        const ds = pts.map((q) => Math.hypot(q.x - x, q.y - y));
        const order = ds.map((d, k) => [d, k]).sort((a, b) => a[0] - b[0]);
        const near = [order[0][1], order[1][1]];
        if (near.includes(i) && near.includes(j)) {
          run.push({ x: x + (r() - 0.5) * lw * 3, y: y + (r() - 0.5) * lw * 3 });
        } else flush();
      }
      flush();
    }
  return out;
}
