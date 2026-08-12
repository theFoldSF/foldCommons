// pointFold.js — Jasper's idea: place points on a grid, then fold/wrap a curved
// outline around them. The hull of the points is smoothed into an organic closed
// curve; an inner offset reads as the cloth folding back over its anchors.
// Interactive: app.js captures clicks into ctx.data.points ([{x,y}...]).
import { convexHull, smoothPath, el, round } from "./util.js";

export default {
  id: "wrap",
  label: "Point fold",
  blurb: "Place anchor points; a curved surface folds and wraps around them. Geometric control, organic result.",
  interactive: "points",
  params: [
    { key: "wrap",   label: "Wrap",        min: 0,  max: 1,  step: 0.01, default: 0.7 },
    { key: "fold",   label: "Fold depth",  min: 0,  max: 1,  step: 0.01, default: 0.4 },
    { key: "grid",   label: "Show grid",   min: 0,  max: 1,  step: 1,    default: 1 },
    { key: "anchors",label: "Show points", min: 0,  max: 1,  step: 1,    default: 1 },
  ],

  render({ w, h, p, colors, ink, ground, seed, data }) {
    const pts = (data && data.points) || [];
    const accent = colors[0] || ink;
    const accent2 = colors[1] || accent;
    let out = "";

    // Faint dot grid — the placement surface.
    if (p.grid) {
      const g = 28;
      let dots = "";
      for (let x = g; x < w; x += g)
        for (let y = g; y < h; y += g)
          dots += el("circle", { cx: x, cy: y, r: 1, fill: ink, "fill-opacity": 0.12 });
      out += dots;
    }

    if (pts.length >= 3) {
      const hull = convexHull(pts);
      const cx = hull.reduce((s, q) => s + q.x, 0) / hull.length;
      const cy = hull.reduce((s, q) => s + q.y, 0) / hull.length;
      const tension = 0.3 + p.wrap * 0.7;
      const outer = smoothPath(hull, { closed: true, tension });

      const gradId = `wrap-grad-${seed}`;
      out += el("defs", {}, el("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "1", y2: "1" },
        el("stop", { offset: "0%", "stop-color": accent }) +
        el("stop", { offset: "100%", "stop-color": accent2 })));
      out += el("path", { d: outer, fill: `url(#${gradId})`, stroke: ink, "stroke-width": 1.5,
        "stroke-opacity": 0.5 });

      // The fold: an inner contour pulled toward the centroid, suggesting the
      // surface creasing back over itself.
      if (p.fold > 0.02) {
        const inner = hull.map((q) => ({
          x: q.x + (cx - q.x) * p.fold * 0.6,
          y: q.y + (cy - q.y) * p.fold * 0.6,
        }));
        out += el("path", { d: smoothPath(inner, { closed: true, tension }), fill: ink,
          "fill-opacity": 0.18, stroke: ink, "stroke-width": 1, "stroke-opacity": 0.3 });
      }
    }

    if (p.anchors) {
      for (const q of pts)
        out += el("circle", { cx: round(q.x), cy: round(q.y), r: 4, fill: ink,
          stroke: ground, "stroke-width": 1.5 });
    }

    if (!pts.length) {
      out += el("text", { x: round(w / 2), y: round(h / 2), "text-anchor": "middle",
        fill: ink, "fill-opacity": 0.35, "font-size": 18, "font-family": "system-ui" },
        "Click to place points — three or more wraps a surface");
    }
    return out;
  },
};
