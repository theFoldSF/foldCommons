// quilt.js — the Lattelier lattice, made vector. A coordinate grid printed on a
// hung quilt panel, but BROKEN: bent by gravity-well masses (space-time events),
// pieced with patches where the field condenses, dotted and stitched like a diagram,
// and occasionally torn open by a void spanned with chords. Where the Cloth engine
// runs this through live physics, here it's a static, distortable, export-clean SVG —
// the algorithm meeting the imperfection of analog process. Distort the panel, add
// irregularity, draw it by hand.
import { rng, makeFlow, clamp, smoothPath, el, round } from "./util.js";

const TAU = Math.PI * 2;

export default {
  id: "quilt",
  label: "Quilt block",
  blurb: "A Lattelier lattice: a coordinate grid bent by gravity-well masses, patched, stitched, and torn — quilted space-time as vector. Distort the panel, add irregularity.",
  params: [
    { key: "grid",      label: "Lattice",         min: 6, max: 26, step: 1,    default: 14 },
    { key: "warp",      label: "Space-time warp", min: 0, max: 1,  step: 0.01, default: 0.5 },
    { key: "wells",     label: "Gravity wells",   min: 1, max: 5,  step: 1,    default: 3 },
    { key: "irregular", label: "Irregularity",    min: 0, max: 1,  step: 0.01, default: 0.3 },
    { key: "patch",     label: "Patchwork",       min: 0, max: 1,  step: 0.01, default: 0.4 },
    { key: "marks",     label: "Diagram marks",   min: 0, max: 1,  step: 0.01, default: 0.55 },
    { key: "drape",     label: "Drape",           min: 0, max: 1,  step: 0.01, default: 0.25 },
    { key: "hand",      label: "Hand-drawn",      min: 0, max: 1,  step: 0.01, default: 0.3 },
  ],

  render({ w, h, p, colors, ink, ground, seed }) {
    const r = rng((seed >>> 0) * 977 + 13);
    const G = Math.round(p.grid);
    const pal = colors.length ? colors : [ink];
    const S = Math.min(w, h) * 0.82, ox = (w - S) / 2, oy = (h - S) / 2;

    // --- panel placement: UV in [0,1]² maps to a softly DRAPED, hung quilt panel.
    const sagSeed = r() - 0.5;
    const mapUV = (u, v) => {
      const narrow = 1 - p.drape * 0.12 * (1 - v);              // a hung sheet is a touch narrower up top
      const x = ox + S * (0.5 + (u - 0.5) * narrow) + p.drape * S * 0.04 * sagSeed * Math.sin(Math.PI * v);
      const y = oy + S * v + p.drape * S * 0.14 * Math.sin(Math.PI * u) * (0.3 + 0.7 * v);
      return [x, y];
    };

    // --- gravity-well masses: the space-time events the lattice bends around.
    const nm = Math.round(p.wells);
    const masses = [];
    for (let i = 0; i < nm; i++) masses.push({
      x: 0.14 + 0.72 * r(), y: 0.14 + 0.72 * r(),
      rad: 0.1 + 0.22 * r(), s: (r() < 0.55 ? -1 : 1) * (0.35 + 0.65 * r()),
    });
    const wobF = makeFlow(Math.floor(r() * 1e9) || 7);
    const nzF = makeFlow(Math.floor(r() * 1e9) || 11);
    const handF = makeFlow(Math.floor(r() * 1e9) || 5);
    const nz = (u, v) => nzF(u * 700, v * 700) / TAU;            // cheap scalar noise 0..1
    const warp = (u, v) => {
      let du = 0, dv = 0;
      for (const m of masses) {
        const vx = u - m.x, vy = v - m.y, d = Math.hypot(vx, vy) + 1e-5;
        const f = m.s * Math.exp(-(d * d) / (2 * m.rad * m.rad)) * 0.5 * p.warp * m.rad;
        du += (vx / d) * f; dv += (vy / d) * f;
      }
      const a = wobF(u * 900, v * 900), wob = 0.013 * p.warp;
      return [u + du + Math.cos(a) * wob, v + dv + Math.sin(a) * wob];
    };
    // a hand-drawn quiver, applied in UV before the warp — the analog wobble
    const hand = (u, v) => {
      if (p.hand < 0.01) return [u, v];
      const a = handF(u * 1300 + 50, v * 1300 + 50), amp = 0.006 * p.hand;
      return [u + Math.cos(a) * amp, v + Math.sin(a) * amp];
    };
    const place = (u, v) => { const [hu, hv] = hand(u, v); return warp(hu, hv); };  // UV → warped UV
    const px = (u, v) => { const wuv = place(u, v); return mapUV(wuv[0], wuv[1]); }; // UV → screen

    // --- irregular grid positions: cells aren't uniform (hand-pieced, not machined).
    const axis = (n) => {
      const a = [];
      for (let i = 0; i <= n; i++) {
        let t = i / n;
        if (i > 0 && i < n) t += (r() - 0.5) * p.irregular * 0.7 / n;   // jitter interior lines only
        a.push(clamp(t, 0, 1));
      }
      return a;
    };
    const gu = axis(G), gv = axis(G);

    // --- void event: a tear in the lattice, spanned by chords.
    const hasVoid = r() < 0.8 && p.marks > 0.12;
    const vm = hasVoid ? (masses.find((m) => m.s < 0) || masses[0]) : null;
    const voidC = vm ? place(vm.x, vm.y) : null;                  // in warped-UV space
    const voidR = vm ? (0.05 + 0.07 * r()) * (0.6 + 0.8 * p.warp) : 0;
    const inVoid = (wu, wv, k = 1) => voidC && Math.hypot(wu - voidC[0], wv - voidC[1]) < voidR * k;

    // --- the bent coordinate grid (polylines, broken across the void).
    const polyD = (pts) => "M" + pts.map(([x, y]) => `${round(x)} ${round(y)}`).join("L") + "Z";
    const SAMP = 44;
    const lineSegs = [];
    const emit = (uvAt) => {
      let cur = [];
      for (let s = 0; s <= SAMP; s++) {
        const [u, v] = uvAt(s / SAMP), wuv = place(u, v);
        if (inVoid(wuv[0], wuv[1])) { if (cur.length > 1) lineSegs.push(cur); cur = []; continue; }
        cur.push(mapUV(wuv[0], wuv[1]));
      }
      if (cur.length > 1) lineSegs.push(cur);
    };
    for (const u of gu) emit((t) => [u, t]);
    for (const v of gv) emit((t) => [t, v]);

    // --- quilt patches: denser where the field condenses (near masses).
    const patchSvg = [];
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const cu = (gu[i] + gu[i + 1]) / 2, cv = (gv[j] + gv[j + 1]) / 2;
      let boost = 0;
      for (const m of masses) { const d = Math.hypot(cu - m.x, cv - m.y); boost += Math.exp(-(d * d) / (2 * m.rad * m.rad)); }
      const prob = p.patch * (0.16 + 0.7 * nz(cu, cv) + 0.55 * boost) * 0.62;
      if (r() >= prob) continue;
      const wc = place(cu, cv);
      if (inVoid(wc[0], wc[1], 1.05)) continue;
      const E = 5, poly = [];
      const edges = [
        [gu[i], gv[j], gu[i + 1], gv[j]], [gu[i + 1], gv[j], gu[i + 1], gv[j + 1]],
        [gu[i + 1], gv[j + 1], gu[i], gv[j + 1]], [gu[i], gv[j + 1], gu[i], gv[j]],
      ];
      for (const [ua, va, ub, vb] of edges) for (let s = 0; s < E; s++) { const t = s / E; poly.push(px(ua + (ub - ua) * t, va + (vb - va) * t)); }
      const inky = r() < 0.08;
      const col = inky ? ink : pal[1 + Math.floor(r() * Math.max(1, pal.length - 1))] || pal[0];
      patchSvg.push(el("path", { d: polyD(poly), fill: col,
        "fill-opacity": round(inky ? 0.22 : 0.36 + 0.34 * r()), stroke: "none" }));
    }

    // --- diagram nodes at lattice intersections.
    const nodeSvg = [];
    for (const u of gu) for (const v of gv) {
      if (r() >= p.marks * (0.14 + 0.5 * nz(u + 0.31, v + 0.77))) continue;
      const wuv = place(u, v);
      if (inVoid(wuv[0], wuv[1])) continue;
      const [X, Y] = mapUV(wuv[0], wuv[1]);
      nodeSvg.push(el("circle", { cx: round(X), cy: round(Y), r: round(1.4 + 1.7 * r()), fill: ink, "fill-opacity": 0.8 }));
    }

    // --- stitch runs: dashed quilting along random stretches of the lattice.
    const stitchSvg = [];
    const ns = Math.round(p.marks * 8);
    for (let k = 0; k < ns; k++) {
      const vert = r() < 0.5, line = (vert ? gu : gv)[Math.floor(r() * (G + 1))];
      const t0 = r() * 0.65, len = 0.14 + 0.32 * r();
      const run = []; let hit = false;
      for (let s = 0; s <= 18; s++) {
        const t = clamp(t0 + len * (s / 18), 0, 1);
        const u = vert ? line : t, v = vert ? t : line, wuv = place(u, v);
        if (inVoid(wuv[0], wuv[1])) { hit = true; break; }
        run.push(mapUV(wuv[0], wuv[1]));
      }
      if (!hit && run.length > 1) stitchSvg.push(el("path", { d: smoothPath(run, { tension: 0.5 }), fill: "none",
        stroke: pal[0], "stroke-opacity": 0.8, "stroke-width": 1.4, "stroke-dasharray": "5 5", "stroke-linecap": "round" }));
    }

    // --- void rim + chords (straight spans, bent by the warp they cross).
    let voidSvg = "";
    if (voidC) {
      const rim = [];
      for (let s = 0; s <= 56; s++) { const a = (s / 56) * TAU; rim.push(mapUV(voidC[0] + Math.cos(a) * voidR, voidC[1] + Math.sin(a) * voidR)); }
      voidSvg += el("path", { d: smoothPath(rim, { closed: true, tension: 0.5 }), fill: ground, "fill-opacity": 0.55,
        stroke: ink, "stroke-opacity": 0.65, "stroke-width": 1.2 });
      const nc = 2 + Math.floor(r() * 4);
      for (let k = 0; k < nc; k++) {
        const a1 = r() * TAU, a2 = a1 + 0.6 + r() * 2.2;
        const p1 = mapUV(voidC[0] + Math.cos(a1) * voidR, voidC[1] + Math.sin(a1) * voidR);
        const p2 = mapUV(voidC[0] + Math.cos(a2) * voidR, voidC[1] + Math.sin(a2) * voidR);
        voidSvg += el("line", { x1: round(p1[0]), y1: round(p1[1]), x2: round(p2[0]), y2: round(p2[1]),
          stroke: ink, "stroke-opacity": 0.4, "stroke-width": 0.9 });
      }
    }

    // --- the panel backing + its binding stitch (perimeter, sampled through the warp).
    const perim = [];
    const edge = (uvAt, n) => { for (let s = 0; s < n; s++) perim.push(px(...uvAt(s / n))); };
    edge((t) => [t, 0], SAMP); edge((t) => [1, t], SAMP); edge((t) => [1 - t, 1], SAMP); edge((t) => [0, 1 - t], SAMP);
    const backing = smoothPath(perim, { closed: true, tension: 0.5 });
    const backSvg = el("path", { d: backing, fill: mix(pal[0] || ink, ground, 0.88), stroke: "none" });
    const bindSvg = el("path", { d: backing, fill: "none", stroke: ink, "stroke-opacity": 0.45,
      "stroke-width": 1.3, "stroke-dasharray": "4 6" });

    const lineSvg = lineSegs.map((seg) => el("path", { d: smoothPath(seg, { tension: 0.5 }), fill: "none",
      stroke: ink, "stroke-opacity": 0.5, "stroke-width": 1.1, "stroke-linejoin": "round", "stroke-linecap": "round" })).join("");

    return backSvg + patchSvg.join("") + lineSvg + stitchSvg.join("") + nodeSvg.join("") + voidSvg + bindSvg;
  },
};

function mix(a, b, t) {
  const pa = hx(a), pb = hx(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
function hx(h) { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
