// util.js — shared math + SVG helpers for the generative engines.

// Seeded PRNG (mulberry32). Deterministic so a given seed always reproduces the
// same mark — preview and exported SVG stay identical, and the team can share a seed.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round = (n) => Math.round(n * 100) / 100;

// Build an SVG path "d" from points using a Catmull-Rom -> cubic Bézier spline.
// This is what turns scattered/hand-drawn points into clean organic curves.
export function smoothPath(points, { closed = false, tension = 0.5 } = {}) {
  if (points.length < 2) return "";
  const p = points.map((pt) => (Array.isArray(pt) ? { x: pt[0], y: pt[1] } : pt));
  const n = p.length;
  const get = (i) => {
    if (closed) return p[(i + n) % n];
    return p[clamp(i, 0, n - 1)];
  };
  let d = `M ${round(p[0].x)} ${round(p[0].y)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2.x)} ${round(p2.y)}`;
  }
  if (closed) d += " Z";
  return d;
}

// Cheap 2D value-noise flow field (no deps). Returns angle at (x,y).
export function makeFlow(seed, scale = 0.004) {
  const r = rng(seed);
  const grid = [];
  const G = 16;
  for (let i = 0; i < G * G; i++) grid.push(r() * Math.PI * 2);
  const at = (gx, gy) => grid[((gy % G) + G) % G * G + (((gx % G) + G) % G)];
  return (x, y) => {
    const fx = x * scale, fy = y * scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    const top = lerp(a, b, tx), bot = lerp(c, d, tx);
    return lerp(top, bot, ty);
  };
}

// Convex hull (Andrew's monotone chain) — used by the point-fold engine to wrap
// a curved outline around placed points.
export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// SVG element string helper.
export function el(tag, attrs = {}, children = "") {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  return `<${tag} ${a}>${children}</${tag}>`;
}
