// flowField.js — the clothesline made abstract. Strands hang from a baseline and
// drape through a flow field. Honors Eileen's favorite (the hanging-ribbon F) and
// the brief's "the stuff of life hangs from it." Carries the Cloth engine's register:
// each strand is a soft palette hang doubled by a thin ink centerline (the organic +
// the diagrammatic), pegged with ink nodes, and woven across by faint dashed quilting
// threads — the clothesline as a piece of the same quilted-space-time family.
import { rng, makeFlow, smoothPath, el, round } from "./util.js";

export default {
  id: "flow",
  label: "Drape lines",
  blurb: "Strands hung on a line and let drape through a flow field — the clothesline, abstracted, in the Cloth engine's ink-and-palette register.",
  params: [
    { key: "strands", label: "Strands",   min: 4,  max: 60, step: 1,    default: 26 },
    { key: "length",  label: "Length",    min: 0.2, max: 1, step: 0.01, default: 0.6 },
    { key: "curl",    label: "Curl",      min: 0,  max: 1,  step: 0.01, default: 0.45 },
    { key: "line",    label: "Hang line", min: 0.1, max: 0.6, step: 0.01, default: 0.28 },
    { key: "marks",   label: "Diagram marks", min: 0, max: 1, step: 0.01, default: 0.45 },
  ],

  render({ w, h, p, colors, ink, ground, seed }) {
    const r = rng(seed);
    const flow = makeFlow(seed, 0.003 + p.curl * 0.004);
    const n = Math.round(p.strands);
    const baseY = h * p.line;
    const maxLen = h * 0.7 * p.length;
    const pal = colors.length ? colors : [ink];
    const step = 6, marks = p.marks;

    // build every strand first, so the quilting threads can weave across them
    const strands = [];
    for (let i = 0; i < n; i++) {
      const x0 = w * 0.06 + (i / (n - 1)) * w * 0.88 + (r() - 0.5) * 6;
      const len = maxLen * (0.5 + 0.5 * r());
      const pts = [{ x: x0, y: baseY }];
      let x = x0, y = baseY;
      for (let s = 0; s < len; s += step) {
        const ang = flow(x, y);
        x += Math.cos(ang) * step * p.curl;        // cloth hangs; the flow only perturbs the fall
        y += step * (0.7 + 0.3 * Math.sin(ang));
        pts.push({ x, y });
        if (y > h * 0.96) break;
      }
      strands.push({ x0, pts, col: pal[i % pal.length], wide: 1.6 + r() * 2.4, node: r() });
    }

    // the clothesline itself — a faint ink constant
    let out = el("line", { x1: round(w * 0.04), y1: round(baseY), x2: round(w * 0.96), y2: round(baseY),
      stroke: ink, "stroke-width": 1.2, "stroke-opacity": 0.4 });

    // quilting threads: faint dashed horizontals sampled across the strands at a shared
    // fraction of each one's length — so they follow the drape instead of ruling straight.
    const nStitch = Math.round(marks * 4);
    for (let k = 0; k < nStitch; k++) {
      const fy = 0.16 + 0.74 * ((k + 0.5) / Math.max(1, nStitch)) + (r() - 0.5) * 0.05;
      const row = strands.map((st) => st.pts[Math.min(st.pts.length - 1, Math.max(0, Math.round(fy * (st.pts.length - 1))))]);
      if (row.length > 1) out += el("path", { d: smoothPath(row, { tension: 0.4 }), fill: "none",
        stroke: ink, "stroke-opacity": 0.26, "stroke-width": 1, "stroke-dasharray": "5 6" });
    }

    // strands: a soft palette hang, doubled by a thin ink centerline (organic + diagram)
    for (const st of strands) {
      const d = smoothPath(st.pts, { tension: 0.5 });
      out += el("path", { d, fill: "none", stroke: st.col, "stroke-width": round(st.wide), "stroke-opacity": 0.82, "stroke-linecap": "round" });
      out += el("path", { d, fill: "none", stroke: ink, "stroke-width": 0.8, "stroke-opacity": 0.22, "stroke-linecap": "round" });
      out += el("circle", { cx: round(st.x0), cy: round(baseY), r: 2.4, fill: ink, "fill-opacity": 0.8 });   // the peg node
      if (st.node < marks * 0.7) {                       // an occasional diagram node down the hang
        const m = st.pts[Math.floor(st.pts.length * (0.4 + 0.4 * st.node))];
        if (m) out += el("circle", { cx: round(m.x), cy: round(m.y), r: round(1.4 + 1.1 * st.node), fill: ink, "fill-opacity": 0.55 });
      }
    }
    return out;
  },
};
