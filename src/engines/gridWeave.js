// gridWeave.js — the whiteboard doodle made canon: a hand-ruled lattice with a
// meandering thread looped around it, ducking under alternate grid lines like
// a weave. Node dots pin the intersections; a couple pick up the accent.
// Deterministic SVG.
import { rng, smoothPath, round } from "./util.js";

const TAU = Math.PI * 2;

export default {
  id: "weave",
  label: "Woven grid",
  blurb:
    "A hand-ruled lattice with a meandering thread knotted around it — over, under, around — the fold as a weave.",
  params: [
    { key: "cells", label: "Grid cells", min: 3, max: 8, step: 1, default: 4 },
    { key: "lobes", label: "Meander lobes", min: 4, max: 10, step: 1, default: 6 },
    { key: "amp", label: "Meander swing", min: 0.1, max: 0.55, step: 0.01, default: 0.3 },
    { key: "strands", label: "Strands", min: 1, max: 3, step: 1, default: 2 },
    { key: "hand", label: "Hand-drawn", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "weight", label: "Thread weight", min: 1, max: 5, step: 0.05, default: 2.4 },
    { key: "cuts", label: "Under-passes", min: 0, max: 1, step: 1, default: 0 },
  ],

  render({ w, h, p, colors, ink, seed }) {
    const r = rng((seed >>> 0) * 1103515245 + 9);
    const accent = colors[0] || ink;
    const S = Math.min(w, h) * 0.68;
    const cx = w / 2, cy = h / 2;
    const G = Math.round(p.cells);
    const step = S / G;
    const U = Math.min(w, h) / 1000;
    const jit = () => (r() - 0.5) * p.hand * step * 0.14;
    const over = step * 0.28; // grid lines run a touch past the outer nodes
    let out = "";

    // --- hand-ruled lattice: each rule a gently wobbling spline
    const xs = [], ys = [];
    for (let i = 0; i <= G; i++) {
      xs.push(cx - S / 2 + i * step);
      ys.push(cy - S / 2 + i * step);
    }
    const rule = (pts) =>
      `<path d="${smoothPath(pts, { tension: 0.6 })}" fill="none" stroke="${ink}" stroke-width="${1.6 * U}" stroke-linecap="round"/>`;
    for (const x of xs) {
      const pts = [];
      for (let k = 0; k <= 6; k++)
        pts.push({ x: x + jit(), y: ys[0] - over + (S + over * 2) * (k / 6) + jit() });
      out += rule(pts);
    }
    for (const y of ys) {
      const pts = [];
      for (let k = 0; k <= 6; k++)
        pts.push({ x: xs[0] - over + (S + over * 2) * (k / 6) + jit(), y: y + jit() });
      out += rule(pts);
    }

    // --- node dots; a few take the accent (the marked crossings in the sketch)
    for (const x of xs)
      for (const y of ys) {
        if (r() < 0.18) continue;
        const acc = r() < 0.08;
        out += `<circle cx="${round(x + jit())}" cy="${round(y + jit())}" r="${(acc ? 4 : 2.8) * U}" fill="${acc ? accent : ink}"/>`;
      }

    // --- the meander: closed loops around the lattice, radius swinging in and
    // out; the thread breaks at alternate grid crossings to read as an
    // under-pass, so the loop genuinely weaves instead of sitting on top.
    const tw = p.weight * U * 2.1;
    for (let sIdx = 0; sIdx < Math.round(p.strands); sIdx++) {
      const N = 260;
      const phase = r() * TAU;
      const R0 = S * (0.5 - sIdx * 0.035);
      const wob = r() * TAU;
      const pts = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        const swing =
          Math.sin(a * Math.round(p.lobes) + phase) * p.amp +
          Math.sin(a * 3 + wob) * p.amp * 0.35 * p.hand;
        const rad = R0 * (1 + swing);
        pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
      }
      // Continuous by default: the thread rides over the lattice as one
      // unbroken loop. Under-passes (the woven over/under read) are opt-in.
      if (!p.cuts) {
        out += `<path d="${smoothPath(pts.map(([x, y]) => ({ x, y })), { closed: true, tension: 0.6 })}" fill="none" stroke="${ink}" stroke-width="${tw}" stroke-linecap="round"/>`;
        continue;
      }
      // find grid-line crossings along the loop; every other one (rate-limited
      // so dense crossing stretches don't erase the thread) becomes an
      // under-pass — a short break where the loop ducks beneath the rule.
      const gap = tw * 1.3;
      const gapN = Math.max(1, Math.round((gap / (TAU * R0)) * N));
      const cuts = [];
      let crossing = 0;
      let lastCut = -1e9;
      const minSpacing = gapN * 9 + 12;
      for (let i = 0; i < N; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % N];
        let crossed = false;
        for (const gx of xs) if ((x1 - gx) * (x2 - gx) < 0 && Math.min(y1, y2) > ys[0] - over && Math.max(y1, y2) < ys[G] + over) crossed = true;
        for (const gy of ys) if ((y1 - gy) * (y2 - gy) < 0 && Math.min(x1, x2) > xs[0] - over && Math.max(x1, x2) < xs[G] + over) crossed = true;
        if (crossed) {
          crossing++;
          if ((crossing + sIdx) % 3 === 0 && i - lastCut > minSpacing) {
            cuts.push(i);
            lastCut = i;
          }
        }
      }
      // drop samples near the under-crossings, then draw the surviving runs
      const cut = new Array(N).fill(false);
      for (const c of cuts)
        for (let k = -gapN; k <= gapN; k++) cut[(c + k + N) % N] = true;
      let run = [];
      const runs = [];
      const start = cut.findIndex(Boolean);
      const order = start < 0 ? [...Array(N).keys()] : Array.from({ length: N }, (_, k) => (start + k) % N);
      for (const i of order) {
        if (cut[i]) {
          if (run.length > 2) runs.push(run);
          run = [];
        } else run.push({ x: pts[i][0], y: pts[i][1] });
      }
      if (run.length > 2) runs.push(run);
      if (start < 0 && runs.length === 1) {
        out += `<path d="${smoothPath(runs[0], { closed: true, tension: 0.6 })}" fill="none" stroke="${ink}" stroke-width="${tw}" stroke-linecap="round"/>`;
      } else {
        for (const seg of runs)
          out += `<path d="${smoothPath(seg, { tension: 0.6 })}" fill="none" stroke="${ink}" stroke-width="${tw}" stroke-linecap="round"/>`;
      }
    }

    return `<g>${out}</g>`;
  },
};
