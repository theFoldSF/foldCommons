// dither.js — the folded sheet rendered as GRAIN. Same family of math as the
// fold mesh (a membrane dimpled by gravity wells, tilted and projected), but
// instead of wireframe lines the surface is shaded: light falls across it and
// the shading is stippled into thousands of seeded dots — a dithered veil.
// Pure deterministic SVG; the dots are one path so the file stays lean.
import { rng, clamp } from "./util.js";

const norm3 = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

export default {
  id: "dither",
  label: "Dither shade",
  blurb:
    "The membrane as grain: a warped sheet lit from above-left, its shading stippled into seeded dots instead of drawn as lines.",
  params: [
    { key: "warp", label: "Warp depth", min: 0.2, max: 1.8, step: 0.01, default: 1.0 },
    { key: "radius", label: "Well radius", min: 0.1, max: 0.5, step: 0.01, default: 0.26 },
    { key: "tilt", label: "View tilt", min: 0.2, max: 1.2, step: 0.01, default: 0.7 },
    { key: "persp", label: "Perspective", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "grain", label: "Grain density", min: 0.3, max: 1.8, step: 0.01, default: 1 },
    { key: "contrast", label: "Contrast", min: 0.4, max: 2.2, step: 0.01, default: 1.2 },
    { key: "sing", label: "Singularities", min: 1, max: 4, step: 1, default: 2 },
  ],

  render({ w, h, p, colors, ink, seed }) {
    const r = rng((seed >>> 0) * 48271 + 5);
    const col = ink;

    const sings = Array.from({ length: Math.round(p.sing) }, () => ({
      x: 0.15 + r() * 0.7,
      y: 0.15 + r() * 0.7,
      s: (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.9),
    }));

    const zAt = (u, v) => {
      let z = 0;
      for (const s of sings) {
        const d2 = (u - s.x) ** 2 + (v - s.y) ** 2;
        z += s.s * Math.exp(-d2 / (2 * p.radius * p.radius));
      }
      return z * p.warp * 0.5;
    };

    // Same projection family as the fold mesh: tilt about x, mild perspective.
    const margin = 0.1;
    const proj = (u, v) => {
      const z = zAt(u, v);
      const y3 = (v - 0.5) * Math.cos(p.tilt) - z * Math.sin(p.tilt);
      const depth = (v - 0.5) * Math.sin(p.tilt) + z * Math.cos(p.tilt);
      const scale = 1 / (1 + depth * p.persp * 0.6);
      const X = (0.5 + (u - 0.5) * scale) * (1 - margin * 2) + margin;
      const Y = (0.5 + y3 * scale) * (1 - margin * 2) + margin;
      return [clamp(X, -0.2, 1.2) * w, clamp(Y, -0.2, 1.2) * h];
    };

    // Lambert shading from the analytic-ish surface normal (finite differences),
    // then stipple: keep a dot wherever the seeded hash falls under the local
    // darkness. Density carries the tone — no grays, only dots of ink.
    const L = norm3(-0.42, -0.58, 0.7);
    const RES = 132;
    const eps = 1 / RES;
    const dotR = Math.max(0.8, Math.min(w, h) / 460);
    let d = "";
    let dotCount = 0;
    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) {
        const u = i / RES + (r() - 0.5) * eps;
        const v = j / RES + (r() - 0.5) * eps;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const z = zAt(u, v);
        const sx = (zAt(u + eps, v) - z) / eps;
        const sy = (zAt(u, v + eps) - z) / eps;
        const n = norm3(-sx * 1.6, -sy * 1.6, 1);
        const lam = clamp(n[0] * L[0] + n[1] * L[1] + n[2] * L[2], 0, 1);
        // flat sheet sits at mid-tone; folds swing toward black or paper
        const darkness = clamp(Math.pow(1 - lam * 0.92, p.contrast), 0, 1);
        if (r() < darkness * p.grain * 0.85) {
          const [X, Y] = proj(u, v);
          d += `M${Math.round(X * 10) / 10} ${Math.round(Y * 10) / 10}h0`;
          dotCount++;
        }
      }
    }
    if (!dotCount) return "<g></g>";
    return `<g><path d="${d}" fill="none" stroke="${col}" stroke-width="${dotR * 1.5}" stroke-linecap="round" stroke-opacity="0.85"/></g>`;
  },
};
