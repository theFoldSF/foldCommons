// dotField.js — the survey field from the exploration boards: overlapping
// patches of measurement grids (fine lattice, dot grids at different gauges,
// halftone dots) overwritten by wandering contour squiggles in the accent
// color, with circled datum points ◉ pinned across the field like a site
// survey. Deterministic SVG.
import { rng, smoothPath, clamp, round } from "./util.js";

const TAU = Math.PI * 2;

export default {
  id: "dotfield",
  label: "Survey field",
  blurb:
    "A site survey of folded space: patches of dot grids and fine lattice, wandering contour squiggles, circled datum points.",
  params: [
    { key: "patches", label: "Grid patches", min: 2, max: 5, step: 1, default: 3 },
    { key: "density", label: "Grid density", min: 10, max: 30, step: 1, default: 18 },
    { key: "scale", label: "Dot scale", min: 0.5, max: 2, step: 0.05, default: 1 },
    { key: "blobs", label: "Contours", min: 1, max: 4, step: 1, default: 2 },
    { key: "markers", label: "Datum points", min: 3, max: 18, step: 1, default: 10 },
    { key: "wobble", label: "Wander", min: 0, max: 1, step: 0.01, default: 0.45 },
  ],

  render({ w, h, p, colors, ink, seed }) {
    const r = rng((seed >>> 0) * 69621 + 3);
    const accent = colors[0] || ink;
    const U = Math.min(w, h) / 1000;
    let out = "";

    // --- grid patches: each an overlapping rect filled with one gauge of marks.
    const cell = Math.min(w, h) / p.density;
    const nP = Math.round(p.patches);
    const patchPts = [];
    for (let k = 0; k < nP; k++) {
      const pw = w * (0.3 + r() * 0.42);
      const ph = h * (0.3 + r() * 0.42);
      const px = clamp(r() * (w - pw), 0, w);
      const py = clamp(r() * (h - ph), 0, h);
      const style = k === 0 ? 2 : Math.floor(r() * 4); // always one fine lattice
      patchPts.push([px + pw / 2, py + ph / 2]);
      if (style === 2) {
        // fine cross lattice
        let d = "";
        const s = cell * 0.55;
        for (let x = px; x <= px + pw; x += s) d += `M${round(x)} ${round(py)}V${round(py + ph)}`;
        for (let y = py; y <= py + ph; y += s) d += `M${round(px)} ${round(y)}H${round(px + pw)}`;
        out += `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${0.9 * U}" opacity="0.28"/>`;
      } else {
        // dot grids at three gauges: fine · medium · halftone (size varies)
        const s = cell * (style === 0 ? 0.55 : 0.9);
        const base = (style === 0 ? 2.4 : 4.8) * p.scale * U;
        let d = "";
        for (let y = py; y <= py + ph; y += s) {
          for (let x = px; x <= px + pw; x += s) {
            const rad =
              style === 3 ? base * (0.35 + 1.3 * r()) : base * (0.85 + 0.3 * r());
            d += `M${round(x - rad)} ${round(y)}a${round(rad)} ${round(rad)} 0 1 0 ${round(rad * 2)} 0a${round(rad)} ${round(rad)} 0 1 0 ${round(-rad * 2)} 0`;
          }
        }
        out += `<path d="${d}" fill="${ink}" opacity="${style === 0 ? 0.38 : 0.3}"/>`;
      }
    }

    // --- contour squiggles: closed amoebae wandering across the field, drawn
    // finely dashed in the accent — the surveyor's freehand overlay.
    const blobCenters = [];
    for (let k = 0; k < Math.round(p.blobs); k++) {
      const big = r() < 0.6;
      let R = Math.min(w, h) * (big ? 0.22 + r() * 0.16 : 0.07 + r() * 0.06);
      // smooth wander: the radius is a sum of two low harmonics instead of
      // independent per-vertex noise, so the contour flows instead of jagging
      const a1 = (0.08 + 0.3 * p.wobble) * (0.5 + r() * 0.5);
      const a2 = (0.05 + 0.22 * p.wobble) * (0.5 + r() * 0.5);
      const f1 = 2, f2 = 3 + Math.floor(r() * 2);
      const ph1 = r() * TAU, ph2 = r() * TAU;
      // bound by construction: shrink R (if the blob simply can't fit) and
      // clamp the CENTER — never the vertices — so the curve stays whole
      let maxR = R * (1 + a1 + a2);
      const capR = Math.min(w, h) * 0.48;
      if (maxR > capR) { R *= capR / maxR; maxR = capR; }
      const cx = clamp(w * (0.18 + r() * 0.64), w * 0.02 + maxR, w * 0.98 - maxR);
      const cy = clamp(h * (0.18 + r() * 0.64), h * 0.02 + maxR, h * 0.98 - maxR);
      const n = 30;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rad = R * (1 + a1 * Math.sin(f1 * a + ph1) + a2 * Math.sin(f2 * a + ph2));
        pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
      }
      blobCenters.push([cx, cy, R]);
      out += `<path d="${smoothPath(pts, { closed: true, tension: 0.7 })}" fill="none" stroke="${accent}" stroke-width="${1.4 * U}" stroke-dasharray="${4.5 * U} ${2.6 * U}" stroke-linecap="round"/>`;
    }

    // --- datum points ◉ — biased toward the contours they annotate.
    for (let k = 0; k < Math.round(p.markers); k++) {
      let x, y;
      if (blobCenters.length && r() < 0.65) {
        const [cx, cy, R] = blobCenters[Math.floor(r() * blobCenters.length)];
        const a = r() * TAU;
        const rad = R * 0.7 * Math.sqrt(r());
        x = clamp(cx + Math.cos(a) * rad, w * 0.04, w * 0.96);
        y = clamp(cy + Math.sin(a) * rad, h * 0.04, h * 0.96);
      } else {
        x = w * (0.05 + r() * 0.9);
        y = h * (0.05 + r() * 0.9);
      }
      out += `<g stroke="${ink}" fill="none"><circle cx="${round(x)}" cy="${round(y)}" r="${8 * U}" stroke-width="${1.4 * U}"/><circle cx="${round(x)}" cy="${round(y)}" r="${2.6 * U}" fill="${ink}" stroke="none"/></g>`;
    }

    return `<g>${out}</g>`;
  },
};
