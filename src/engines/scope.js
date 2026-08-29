// scope.js — the oscilloscope from the brand studio, distilled to its
// Lissajous traces. A sine pair pushed through a West-Coast triangle
// wavefolder draws looping figures; the trace blooms with a phosphor glow —
// the same path stacked wide-and-faint to crisp-and-bright — as a pen-plotter
// trace with a CRT bloom, in the accent color. Deterministic SVG.
import { rng, smoothPath, round } from "./util.js";

const TAU = Math.PI * 2;

export default {
  id: "scope",
  label: "Oscilloscope",
  blurb:
    "Lissajous figures through a wavefolder — the mathematical signature of time, drawn as a pen-plotter trace with a phosphor glow.",
  params: [
    { key: "ratio", label: "XY ratio", min: 1, max: 5, step: 0.5, default: 2 },
    { key: "fold", label: "Wavefold", min: 1, max: 5, step: 0.05, default: 2.2 },
    { key: "sym", label: "Symmetry", min: -1, max: 1, step: 0.01, default: 0 },
    { key: "turns", label: "Turns", min: 1, max: 6, step: 1, default: 3 },
    { key: "weight", label: "Trace weight", min: 0.6, max: 3, step: 0.05, default: 1.4 },
  ],

  render({ w, h, p, colors, ink, seed }) {
    const r = rng((seed >>> 0) * 1181783497 + 3);
    const accent = colors[0] || ink;
    const U = Math.min(w, h) / 1000;
    const midX = w / 2, midY = h / 2;
    const ampX = Math.min(w, h) * 0.38;
    const ampY = Math.min(w, h) * 0.38;
    const phase0 = r() * TAU;
    const phaseB = r() * TAU;

    // West-Coast triangle wavefolder: the signal reflected back on itself
    const foldTri = (x) => {
      x = (((x + 1) % 4) + 4) % 4;
      return x < 2 ? x - 1 : 3 - x;
    };
    const shape = (raw, drive) => Math.sin((Math.PI / 2) * foldTri(drive * raw + p.sym));

    const trace = (phaseShift, drive) => {
      const N = 780;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU * Math.round(p.turns) + phase0 + phaseShift;
        pts.push({
          x: midX + ampX * shape(Math.sin(th), drive),
          y: midY - ampY * shape(Math.sin(p.ratio * th + phaseB), drive),
        });
      }
      return smoothPath(pts, { tension: 0.5 });
    };

    const d = trace(0, p.fold);
    let out = "";
    // phosphor glow: the same trace stacked wide-to-narrow at falling
    // opacity, so it blooms like a CRT beam on paper, then the crisp pen line
    const glow = [[10, 0.06], [6, 0.1], [3.2, 0.2]];
    for (const [mul, op] of glow)
      out += `<path d="${d}" fill="none" stroke="${accent}" stroke-width="${round(p.weight * U * mul)}" stroke-opacity="${op}" stroke-linecap="round"/>`;
    out += `<path d="${d}" fill="none" stroke="${accent}" stroke-width="${round(p.weight * U * 2.2)}" stroke-opacity="0.95" stroke-linecap="round"/>`;
    // the beam node
    const bx = midX + ampX * shape(Math.sin(phase0), p.fold);
    const by = midY - ampY * shape(Math.sin(phaseB), p.fold);
    out += `<circle cx="${round(bx)}" cy="${round(by)}" r="${round(3.4 * U * p.weight)}" fill="${ink}" fill-opacity="0.85"/>`;
    return `<g>${out}</g>`;
  },
};
