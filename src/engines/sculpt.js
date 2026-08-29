// sculpt.js — the concrete sculpture renders from the boards as a motif layer.
// Alpha-cut PNGs (see public/cutouts/) placed seeded on the ground: one big
// hero form, or a small seeded arrangement. The images are neutral greige, so
// they sit on any canon ground or texture without fighting it.
import { rng } from "./util.js";
import { CUTOUTS } from "../cutouts/index";

export default {
  id: "sculpt",
  label: "Fold sculpts",
  blurb:
    "The concrete F-forms from the boards — arches, pinwheels, folded letters — dropped onto the ground as cut-out objects.",
  params: [
    { key: "which", label: "Form (0 = seeded)", min: 0, max: 5, step: 1, default: 0 },
    { key: "count", label: "Forms", min: 1, max: 3, step: 1, default: 1 },
    { key: "size", label: "Size", min: 0.4, max: 1.1, step: 0.01, default: 0.85 },
    { key: "tilt", label: "Tilt", min: 0, max: 1, step: 0.01, default: 0.15 },
  ],

  render({ w, h, p, seed }) {
    if (!CUTOUTS.length) return "";
    const r = rng((seed >>> 0) * 747796405 + 5);
    const n = Math.round(p.count);
    const pad = Math.min(w, h) * 0.06;
    let out = "";
    // seeded distinct picks, or the chosen form for every placement
    const order = CUTOUTS.map((_, i) => i).sort(() => r() - 0.5);
    for (let k = 0; k < n; k++) {
      const c =
        Math.round(p.which) > 0
          ? CUTOUTS[(Math.round(p.which) - 1) % CUTOUTS.length]
          : CUTOUTS[order[k % order.length]];
      // the first form is the hero; extras come smaller
      const frac = p.size * (k === 0 ? 1 : 0.45 + r() * 0.2);
      const scale = (Math.min(w, h) * 0.72 * frac) / Math.max(c.w, c.h);
      const cw = c.w * scale;
      const ch = c.h * scale;
      const ang = (r() - 0.5) * 16 * p.tilt;
      // rotation grows the footprint a touch — pad for it so nothing clips
      const grow = Math.abs(Math.sin((ang * Math.PI) / 180)) * Math.max(cw, ch) * 0.5;
      const x = pad + grow + r() * Math.max(1, w - cw - (pad + grow) * 2);
      const y = pad + grow + r() * Math.max(1, h - ch - (pad + grow) * 2);
      out += `<g transform="translate(${(x + cw / 2).toFixed(1)} ${(y + ch / 2).toFixed(1)}) rotate(${ang.toFixed(1)})">
        <image href="${c.src}" x="${(-cw / 2).toFixed(1)}" y="${(-ch / 2).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}"/></g>`;
    }
    return `<g>${out}</g>`;
  },
};
