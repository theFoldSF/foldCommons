// Engine registry — the generative motif sources absorbed from brand-studio.
// Each engine renders deterministic SVG from (seed, params, colors): the same
// seed always reproduces the same mark, so compositions are shareable.

import mesh from "./foldMesh.js";
import dither from "./dither.js";
import dotfield from "./dotField.js";
import network from "./foldNetwork.js";
import weave from "./gridWeave.js";
import flow from "./flowField.js";
import graph from "./graph.js";
import quilt from "./quilt.js";

export interface EngineParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface Engine {
  id: string;
  label: string;
  blurb: string;
  params: EngineParam[];
  render(ctx: {
    w: number;
    h: number;
    p: Record<string, number>;
    colors: string[];
    ink: string;
    ground: string;
    seed: number;
    data?: unknown;
  }): string;
}

// The F·O·L·D net is the signature mark — always present in the corner of
// every composed layout, so it lives outside the pickable motif list.
export const SIGNATURE_ENGINE = network as Engine;

export const ENGINES: Engine[] = [
  mesh as Engine,
  dither as Engine,
  dotfield as Engine,
  weave as Engine,
  quilt as Engine,
  graph as Engine,
  flow as Engine,
];

export const engineById = (id: string) => ENGINES.find((e) => e.id === id);

// Curated sub-ranges for Shuffle: params are sampled inside these instead of
// the sliders' full extremes, so a random roll always lands somewhere
// tasteful. Params not listed stay at their default.
export const SHUFFLE_RANGES: Record<string, Record<string, [number, number]>> = {
  mesh: { lines: [12, 24], warp: [0.6, 1.2], radius: [0.16, 0.3], swirl: [0.2, 1.3], tilt: [0.55, 1.0], persp: [0.3, 0.7], sing: [2, 4] },
  dither: { warp: [0.7, 1.4], radius: [0.2, 0.34], contrast: [0.9, 1.7], grain: [0.7, 1.3], sing: [1, 3] },
  dotfield: { patches: [2, 4], density: [14, 24], blobs: [1, 3], markers: [5, 14], wobble: [0.3, 0.7] },
  weave: { cells: [3, 6], lobes: [4, 8], amp: [0.2, 0.42], strands: [1, 3], hand: [0.25, 0.7] },
  quilt: { grid: [10, 18], warp: [0.3, 0.7], wells: [2, 4], irregular: [0.15, 0.5], patch: [0.2, 0.6], marks: [0.3, 0.7], drape: [0.1, 0.4], hand: [0.15, 0.5] },
  graph: { nodes: [10, 26], density: [0.2, 0.55], spread: [0.8, 1.3], scale: [1.2, 2.4], curve: [0.2, 0.8] },
  flow: { strands: [14, 40], length: [0.4, 0.85], curl: [0.25, 0.7], line: [0.15, 0.4], marks: [0.2, 0.6] },
};

// Sample an engine's params for a shuffle roll: defaults, overridden by a
// uniform draw inside each curated range (snapped to the param's step).
export function shuffleParams(e: Engine): Record<string, number> {
  const out = defaultParams(e);
  const ranges = SHUFFLE_RANGES[e.id];
  if (!ranges) return out;
  for (const p of e.params) {
    const r = ranges[p.key];
    if (!r) continue;
    const v = r[0] + Math.random() * (r[1] - r[0]);
    const snapped = Math.round(v / p.step) * p.step;
    out[p.key] = Math.min(p.max, Math.max(p.min, Math.round(snapped * 1000) / 1000));
  }
  return out;
}

export function defaultParams(e: Engine): Record<string, number> {
  return Object.fromEntries(e.params.map((p) => [p.key, p.default]));
}
