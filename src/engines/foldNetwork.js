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

  // The letters always read F→O→L→D — but loosely, like the sketch page:
  // each letter random-walks up or down while its x-advance is derived from
  // the pair's sizes and that vertical drop, so a letter can tuck diagonally
  // under its neighbour (the way O drops below F–L–D on the boards) without
  // ever touching it. A relaxation pass then guarantees clearance between
  // non-adjacent letters too, and the whole cluster is fit-scaled to the tile.
  const sc = p.scatter;
  const fss = LETTERS.map(() => fs * (0.72 + r() * 0.7));
  const rows =
    r() < 0.25 && th > fs * 3.4 ? [[0, 1], [2, 3]] : [[0, 1, 2, 3]];
  const pts = [];
  const rowGap = Math.max(...fss) * 1.6 + fs * 0.6 * sc;
  const minDist = (a, b) => (a + b) * 0.58;
  rows.forEach((row, ri) => {
    let x = 0;
    let y = (rows.length > 1 ? (ri === 0 ? -rowGap / 2 : rowGap / 2) : 0);
    row.forEach((li, k) => {
      if (k > 0) {
        const prev = row[k - 1];
        const dy = (r() - 0.5) * fs * 2.6 * sc;
        const D = minDist(fss[prev], fss[li]) + fs * (0.1 + r() * 0.9 * sc);
        // the diagonal drop buys back horizontal room, but x always advances
        const dx = Math.max(Math.sqrt(Math.max(0, D * D - dy * dy)), (fss[prev] + fss[li]) * 0.3);
        x += dx;
        y += dy;
      }
      pts.push({ x, y, ch: LETTERS[li], fs: fss[li] });
    });
  });
  // clearance for NON-adjacent pairs: small symmetric pushes apart — too
  // small to reorder the reading direction, enough to never collide
  for (let it = 0; it < 24; it++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const need = minDist(pts[i].fs, pts[j].fs);
        let dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= need) continue;
        if (d < 1e-6) { dx = 1; dy = 0; }
        const push = (need - Math.max(d, 1e-6)) / 2;
        const ux = dx / Math.max(d, 1e-6), uy = dy / Math.max(d, 1e-6);
        pts[i].x -= ux * push; pts[i].y -= uy * push;
        pts[j].x += ux * push; pts[j].y += uy * push;
        moved = true;
      }
    if (!moved) break;
  }
  // fit the cluster (letter extents included) into the tile, centered with a
  // seeded nudge
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  for (const q of pts) {
    mnx = Math.min(mnx, q.x - q.fs * 0.6);
    mxx = Math.max(mxx, q.x + q.fs * 0.6);
    mny = Math.min(mny, q.y - q.fs * 0.6);
    mxy = Math.max(mxy, q.y + q.fs * 0.6);
  }
  const fitK = Math.min(1, (tw * 0.86) / Math.max(1, mxx - mnx), (th * 0.86) / Math.max(1, mxy - mny));
  const cx = x0 + tw / 2 + (r() - 0.5) * tw * 0.05 * sc;
  const cy = y0 + th / 2 + (r() - 0.5) * th * 0.08 * sc;
  for (const q of pts) {
    q.x = cx + (q.x - (mnx + mxx) / 2) * fitK;
    q.y = cy + (q.y - (mny + mxy) / 2) * fitK;
    q.fs *= fitK;
  }

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
