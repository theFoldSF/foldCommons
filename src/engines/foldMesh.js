// foldMesh.js — the identity's core mark language: a 3D sheet warped by
// gravity wells and vortices, projected and drawn as a wireframe mesh —
// the same family as the lockup logomarks. Pure deterministic SVG.
import { rng, smoothPath, el, round, clamp } from "./util.js";

export default {
  id: "mesh",
  label: "Fold mesh",
  blurb:
    "The logomark language: a wireframe sheet dimpled by gravity wells and twisted by vortices, drawn in projection.",
  params: [
    { key: "lines", label: "Mesh density", min: 8, max: 36, step: 1, default: 18 },
    { key: "warp", label: "Warp depth", min: 0.1, max: 1.5, step: 0.01, default: 1.05 },
    { key: "radius", label: "Well radius", min: 0.08, max: 0.5, step: 0.01, default: 0.22 },
    { key: "swirl", label: "Vortex swirl", min: 0, max: 2.5, step: 0.01, default: 0.9 },
    { key: "tilt", label: "View tilt", min: 0.2, max: 1.2, step: 0.01, default: 0.8 },
    { key: "persp", label: "Perspective", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "sing", label: "Singularities", min: 1, max: 5, step: 1, default: 3 },
  ],

  render({ w, h, p, colors, ink, seed }) {
    const r = rng(seed);
    const stroke = colors[0] || ink;
    const N = Math.round(p.lines);
    const RES = 64;

    // Seeded singularities: wells (dimple down/up) and vortices (swirl xy).
    const sings = Array.from({ length: Math.round(p.sing) }, () => ({
      x: 0.15 + r() * 0.7,
      y: 0.15 + r() * 0.7,
      s: (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.9),
      twist: r() < 0.45,
    }));

    const zAt = (u, v) => {
      let z = 0;
      for (const s of sings) {
        if (s.twist) continue;
        const d2 = (u - s.x) ** 2 + (v - s.y) ** 2;
        z += s.s * Math.exp(-d2 / (2 * p.radius * p.radius));
      }
      return z * p.warp;
    };

    const warpXY = (u, v) => {
      let x = u, y = v;
      for (const s of sings) {
        if (!s.twist) continue;
        const dx = x - s.x, dy = y - s.y;
        const d = Math.hypot(dx, dy);
        const a = p.swirl * s.s * Math.exp(-(d * d) / (2 * p.radius * p.radius));
        const cos = Math.cos(a), sin = Math.sin(a);
        x = s.x + dx * cos - dy * sin;
        y = s.y + dx * sin + dy * cos;
      }
      return [x, y];
    };

    // Project: tilt about x-axis, mild perspective, fit to slot.
    const margin = 0.08;
    const proj = (u, v) => {
      const [wx, wy] = warpXY(u, v);
      const z = zAt(wx, wy);
      const y3 = (wy - 0.5) * Math.cos(p.tilt) - z * Math.sin(p.tilt);
      const depth = (wy - 0.5) * Math.sin(p.tilt) + z * Math.cos(p.tilt);
      const scale = 1 / (1 + depth * p.persp * 0.6);
      const X = (0.5 + (wx - 0.5) * scale) * (1 - margin * 2) + margin;
      const Y = (0.5 + y3 * scale) * (1 - margin * 2) + margin;
      return { x: clamp(X, -0.2, 1.2) * w, y: clamp(Y, -0.2, 1.2) * h };
    };

    let out = "";
    const line = (pts) =>
      el("path", {
        d: smoothPath(pts, { tension: 0.5 }),
        fill: "none",
        stroke,
        "stroke-width": Math.max(0.8, Math.min(w, h) / 620),
        "stroke-linecap": "round",
      });

    for (let i = 0; i <= N; i++) {
      const u = i / N;
      out += line(Array.from({ length: RES + 1 }, (_, k) => proj(u, k / RES)));
      const v = i / N;
      out += line(Array.from({ length: RES + 1 }, (_, k) => proj(k / RES, v)));
    }
    return `<g>${out}</g>`;
  },
};
