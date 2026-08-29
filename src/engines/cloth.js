// cloth.js — the brand studio's draped-quilt engine, folded into the commons
// as a static, deterministic SVG. A Verlet cloth is pinned along its top edge
// and relaxed under gravity and a seeded sideways sway; printed on the fabric
// is the Lattelier lattice — a coordinate grid bent by gravity-well masses,
// pieced with palette patches, dotted and stitched like a diagram. The cloth's
// billow warps the printed grid a second time: the algorithm meeting the
// imperfection of analog process.
import { rng, makeFlow, clamp, round } from "./util.js";

const TAU = Math.PI * 2;

function hex(hh) {
  const n = parseInt(String(hh).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}

export default {
  id: "cloth",
  label: "Draped quilt",
  blurb:
    "A quilt hung and let drape: real cloth relaxation, printed with the bent Lattelier lattice — patches, stitches, diagram dots riding the billow.",
  params: [
    { key: "cols", label: "Weave", min: 10, max: 30, step: 1, default: 20 },
    { key: "drape", label: "Drape", min: 0.3, max: 1, step: 0.01, default: 0.7 },
    { key: "sway", label: "Sway", min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "pins", label: "Pins", min: 2, max: 7, step: 1, default: 3 },
    { key: "grid", label: "Lattice density", min: 8, max: 24, step: 1, default: 14 },
    { key: "warp", label: "Space-time warp", min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: "patch", label: "Patchwork", min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: "marks", label: "Diagram marks", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "shade", label: "Shading", min: 0, max: 1, step: 0.01, default: 0.7 },
  ],

  render({ w, h, p, colors, ink, ground, seed }) {
    const r = rng((seed >>> 0) * 977 + 41);
    const pal = colors.length ? colors : [ink];

    // ---- the cloth: pinned top edge, relaxed to rest ----------------------
    const cols = Math.round(p.cols);
    const spacing = (w * 0.74) / cols;
    const rows = Math.max(6, Math.round((h * 0.72 * p.drape) / spacing));
    const ox = (w - cols * spacing) / 2;
    const oy = h * 0.08;
    const pts = [];
    const pinEvery = Math.max(1, Math.floor(cols / (Math.round(p.pins) - 1 || 1)));
    for (let y = 0; y <= rows; y++)
      for (let x = 0; x <= cols; x++) {
        const px = ox + x * spacing, py = oy + y * spacing;
        pts.push({ x: px, y: py, px, py, pin: y === 0 && (x % pinEvery === 0 || x === cols) });
      }
    const idx = (x, y) => y * (cols + 1) + x;
    const links = [];
    for (let y = 0; y <= rows; y++)
      for (let x = 0; x <= cols; x++) {
        if (x < cols) links.push([idx(x, y), idx(x + 1, y)]);
        if (y < rows) links.push([idx(x, y), idx(x, y + 1)]);
      }
    // deterministic settle: gravity + a frozen seeded sway field, then a
    // few constraint passes per step — the pose the live engine drifts around
    const ph = [r() * TAU, r() * TAU, r() * TAU];
    const STEPS = 90;
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      for (const q of pts) {
        if (q.pin) continue;
        const vx = (q.x - q.px) * 0.96, vy = (q.y - q.py) * 0.96;
        q.px = q.x; q.py = q.y;
        const fy = (q.y - oy) / (rows * spacing);
        const swayX =
          p.sway * spacing * 0.28 * (Math.sin(fy * 5 + ph[0]) * 0.6 + Math.sin(fy * 11 + ph[1]) * 0.4) * (1 - t * 0.6);
        q.x += vx + swayX;
        q.y += vy + spacing * 0.42;
      }
      for (let pass = 0; pass < 3; pass++)
        for (const [a, b] of links) {
          const A = pts[a], B = pts[b];
          const dx = B.x - A.x, dy = B.y - A.y;
          const d = Math.hypot(dx, dy) || 1;
          const diff = ((d - spacing) / d) * 0.5;
          const mx = dx * diff, my = dy * diff;
          if (!A.pin) { A.x += mx; A.y += my; }
          if (!B.pin) { B.x -= mx; B.y -= my; }
        }
    }

    // map a UV point to the settled cloth (bilinear over the grid)
    const mapUV = (u, v) => {
      const fx = clamp(u, 0, 1) * cols, fy = clamp(v, 0, 1) * rows;
      const x0 = Math.min(cols - 1, Math.floor(fx)), y0 = Math.min(rows - 1, Math.floor(fy));
      const tx = fx - x0, ty = fy - y0;
      const a = pts[idx(x0, y0)], b = pts[idx(x0 + 1, y0)], d2 = pts[idx(x0 + 1, y0 + 1)], e = pts[idx(x0, y0 + 1)];
      return [
        (a.x * (1 - tx) + b.x * tx) * (1 - ty) + (e.x * (1 - tx) + d2.x * tx) * ty,
        (a.y * (1 - tx) + b.y * tx) * (1 - ty) + (e.y * (1 - tx) + d2.y * tx) * ty,
      ];
    };

    // ---- the printed Lattelier layer (in cloth UV, warped by masses) ------
    const A = rows / Math.max(1, cols);
    const G = Math.round(p.grid), Gv = Math.max(4, Math.round(G * A));
    const nm = 2 + Math.floor(r() * 3);
    const masses = [];
    for (let i = 0; i < nm; i++)
      masses.push({ x: 0.12 + 0.76 * r(), y: 0.12 + 0.76 * r(), rad: 0.1 + 0.22 * r(), s: (r() < 0.55 ? -1 : 1) * (0.35 + 0.65 * r()) });
    const wobF = makeFlow(Math.floor(r() * 1e9) || 7);
    const nzF = makeFlow(Math.floor(r() * 1e9) || 11);
    const nz = (u, v) => nzF(u * 700, v * 700) / TAU;
    const warp = (u, v) => {
      let du = 0, dv = 0;
      for (const m of masses) {
        const vx = u - m.x, vy = v - m.y;
        const d = Math.hypot(vx, (vy) * A) + 1e-5;
        const f = m.s * Math.exp(-(d * d) / (2 * m.rad * m.rad)) * 0.5 * p.warp * m.rad;
        du += (vx / d) * f; dv += (vy / d) * f;
      }
      const a = wobF(u * 900, v * 900), wob = 0.013 * p.warp;
      return [u + du + Math.cos(a) * wob, v + dv + Math.sin(a) * wob];
    };

    let out = "";

    // fabric quads, shaded by stretch — the folds read as soft shadow
    const base = mix(pal[0], ground === "none" ? "#FFF9F1" : ground, 0.88);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const a = pts[idx(x, y)], b = pts[idx(x + 1, y)], d2 = pts[idx(x + 1, y + 1)], e = pts[idx(x, y + 1)];
        const stretch = Math.hypot(b.x - a.x, b.y - a.y) / spacing;
        const dark = Math.max(0, Math.min(1, (stretch - 1) * 1.6));
        out += `<path d="M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}L${round(d2.x)} ${round(d2.y)}L${round(e.x)} ${round(e.y)}Z" fill="${mix(base, ink, p.shade * dark * 0.32 + 0.02)}"/>`;
      }

    // quilt patches, under the lattice lines
    for (let i = 0; i < G; i++)
      for (let j = 0; j < Gv; j++) {
        const cu = (i + 0.5) / G, cv = (j + 0.5) / Gv;
        let boost = 0;
        for (const m of masses) {
          const d = Math.hypot(cu - m.x, (cv - m.y) * A);
          boost += Math.exp(-(d * d) / (2 * m.rad * m.rad));
        }
        if (r() >= p.patch * (0.16 + 0.7 * nz(cu, cv) + 0.55 * boost) * 0.6) continue;
        const edges = [
          [i / G, j / Gv, (i + 1) / G, j / Gv], [(i + 1) / G, j / Gv, (i + 1) / G, (j + 1) / Gv],
          [(i + 1) / G, (j + 1) / Gv, i / G, (j + 1) / Gv], [i / G, (j + 1) / Gv, i / G, j / Gv],
        ];
        let d = "";
        edges.forEach(([ua, va, ub, vb], ei) => {
          for (let s2 = 0; s2 < 5; s2++) {
            const t = s2 / 5;
            const [wu, wv] = warp(ua + (ub - ua) * t, va + (vb - va) * t);
            const [X, Y] = mapUV(wu, wv);
            d += `${ei === 0 && s2 === 0 ? "M" : "L"}${round(X)} ${round(Y)}`;
          }
        });
        const inky = r() < 0.08;
        const ci = 1 + Math.floor(r() * Math.max(1, pal.length - 1));
        out += `<path d="${d}Z" fill="${inky ? ink : pal[ci] || pal[0]}" fill-opacity="${inky ? 0.22 : 0.38 + 0.3 * r()}"/>`;
      }

    // the bent coordinate grid, mapped through the cloth
    const SAMP = 36;
    const emit = (uvFn, sw, op, dash) => {
      let d = "";
      for (let s2 = 0; s2 <= SAMP; s2++) {
        const [u, v] = uvFn(s2 / SAMP);
        const [wu, wv] = warp(u, v);
        const [X, Y] = mapUV(wu, wv);
        d += `${s2 === 0 ? "M" : "L"}${round(X)} ${round(Y)}`;
      }
      out += `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity="${op}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round"/>`;
    };
    const lw = Math.min(w, h) / 1000;
    for (let i = 0; i <= G; i++) emit((t) => [i / G, t], lw, 0.5);
    for (let j = 0; j <= Gv; j++) emit((t) => [t, j / Gv], lw, 0.5);

    // dashed stitch runs along random stretches of the lattice
    const ns = Math.round(p.marks * 7);
    for (let k = 0; k < ns; k++) {
      const vert = r() < 0.5, line = Math.floor(r() * ((vert ? G : Gv) + 1));
      const t0 = r() * 0.7, len = 0.12 + 0.3 * r();
      let d = "";
      for (let s2 = 0; s2 <= 14; s2++) {
        const t = clamp(t0 + len * (s2 / 14), 0, 1);
        const [wu, wv] = warp(vert ? line / G : t, vert ? t : line / Gv);
        const [X, Y] = mapUV(wu, wv);
        d += `${s2 === 0 ? "M" : "L"}${round(X)} ${round(Y)}`;
      }
      out += `<path d="${d}" fill="none" stroke="${pal[0]}" stroke-opacity="0.85" stroke-width="${1.4 * lw * 1000 / 700}" stroke-dasharray="${5 * lw * 1.4} ${5 * lw * 1.4}"/>`;
    }

    // diagram nodes at lattice intersections
    for (let i = 0; i <= G; i++)
      for (let j = 0; j <= Gv; j++) {
        const u = i / G, v = j / Gv;
        if (r() >= p.marks * (0.14 + 0.5 * nz(u + 0.31, v + 0.77))) continue;
        const [wu, wv] = warp(u, v);
        const [X, Y] = mapUV(wu, wv);
        out += `<circle cx="${round(X)}" cy="${round(Y)}" r="${round((1.1 + 1.3 * r()) * lw * 1.6)}" fill="${ink}" fill-opacity="0.8"/>`;
      }

    // perimeter binding stitch + the pins
    let d = "";
    for (let x = 0; x <= cols; x++) { const q = pts[idx(x, 0)]; d += `${x === 0 ? "M" : "L"}${round(q.x)} ${round(q.y)}`; }
    for (let y = 1; y <= rows; y++) { const q = pts[idx(cols, y)]; d += `L${round(q.x)} ${round(q.y)}`; }
    for (let x = cols - 1; x >= 0; x--) { const q = pts[idx(x, rows)]; d += `L${round(q.x)} ${round(q.y)}`; }
    for (let y = rows - 1; y >= 1; y--) { const q = pts[idx(0, y)]; d += `L${round(q.x)} ${round(q.y)}`; }
    out += `<path d="${d}Z" fill="none" stroke="${ink}" stroke-opacity="0.45" stroke-width="${1.2 * lw * 1.4}" stroke-dasharray="${4 * lw * 1.4} ${6 * lw * 1.4}"/>`;
    for (const q of pts) if (q.pin) out += `<circle cx="${round(q.x)}" cy="${round(q.y)}" r="${3 * lw * 1.4}" fill="${ink}"/>`;

    return `<g>${out}</g>`;
  },
};
