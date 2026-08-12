// foldedSurface.js — the brief's core ask: "fabric caught in motion, folded,
// hanging, mid-breath, built from clean geometric precision."
// A ribbon whose edges are sums of sines (a truncated Fourier series). It is
// geometrically exact, yet reads as draped cloth. Shading bands suggest the folds.
import { rng, smoothPath, el, round, lerp } from "./util.js";

export default {
  id: "fold",
  label: "Folded surface",
  blurb: "A draped ribbon from pure sine math — the organic/geometric synthesis the brief reaches for.",
  params: [
    { key: "folds",  label: "Folds",       min: 1,  max: 6,   step: 1,    default: 3 },
    { key: "drape",  label: "Drape",       min: 0.1, max: 1,  step: 0.01, default: 0.55 },
    { key: "width",  label: "Cloth width", min: 0.1, max: 0.6, step: 0.01, default: 0.32 },
    { key: "twist",  label: "Twist",       min: 0,  max: 1,    step: 0.01, default: 0.4 },
    { key: "shade",  label: "Shading",     min: 0,  max: 1,    step: 0.01, default: 0.7 },
  ],

  render({ w, h, p, colors, ink, ground, seed }) {
    const r = rng(seed);
    const midY = h * 0.5;
    const amp = h * 0.34 * p.drape;
    const band = h * p.width;
    const k = p.folds;
    const phase = p.twist * Math.PI * 2 + r() * 0.6;
    const N = 220;

    const centerline = (x) => {
      const t = (x / w) * Math.PI * 2;
      return midY
        + amp * Math.sin(k * t + phase)
        + amp * 0.32 * Math.sin(2 * k * t + phase * 1.7)
        + amp * 0.12 * Math.sin(3 * k * t + 1.1);
    };
    // Cloth tapers slightly at the ends, fuller in the middle — a hung sheet.
    const widthAt = (x) => band * (0.55 + 0.45 * Math.sin((x / w) * Math.PI));

    const top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * w;
      const c = centerline(x);
      const wd = widthAt(x);
      top.push({ x, y: c - wd / 2 });
      bot.push({ x, y: c + wd / 2 });
    }
    const outline = top.concat(bot.slice().reverse());
    const dRibbon = smoothPath(outline, { closed: true, tension: 0.5 });

    const accent = colors[0] || ink;
    const accent2 = colors[1] || accent;

    // Fold shading: where the centerline slope flips, the cloth "turns over."
    // Draw soft darker bands there to read as folds.
    let folds = "";
    if (p.shade > 0.02) {
      for (let i = 2; i < N - 2; i++) {
        const x = (i / N) * w;
        const dy = centerline(x + 1) - centerline(x - 1);
        const dyPrev = centerline(x) - centerline(x - 2);
        if (Math.sign(dy) !== Math.sign(dyPrev) && Math.abs(dy) < 0.6) {
          const c = centerline(x), wd = widthAt(x);
          const o = p.shade * 0.5;
          folds += el("line", {
            x1: round(x), y1: round(c - wd / 2), x2: round(x), y2: round(c + wd / 2),
            stroke: ink, "stroke-width": round(wd * 0.18), "stroke-opacity": round(o),
            "stroke-linecap": "round",
          });
        }
      }
    }

    const gradId = `fold-grad-${seed}`;
    const defs = el("defs", {},
      el("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" },
        el("stop", { offset: "0%",  "stop-color": accent }) +
        el("stop", { offset: "55%", "stop-color": accent2 }) +
        el("stop", { offset: "100%","stop-color": ink, "stop-opacity": 0.9 })
      )
    );

    return defs
      + el("path", { d: dRibbon, fill: `url(#${gradId})`, stroke: ink, "stroke-width": 1.2, "stroke-opacity": 0.35 })
      + folds;
  },
};
