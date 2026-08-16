// Engine registry — the generative motif sources absorbed from brand-studio.
// Each engine renders deterministic SVG from (seed, params, colors): the same
// seed always reproduces the same mark, so compositions are shareable.

import mesh from "./foldMesh.js";
import dither from "./dither.js";
import dotfield from "./dotField.js";
import network from "./foldNetwork.js";
import weave from "./gridWeave.js";
import fold from "./foldedSurface.js";
import flow from "./flowField.js";
import graph from "./graph.js";
import quilt from "./quilt.js";
import wrap from "./pointFold.js";
import { rng } from "./util.js";

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

// Point fold was click-interactive in brand-studio; here it self-seeds its
// anchor points so it works as a pure parametric engine (reroll to re-scatter).
const seededWrap: Engine = {
  ...(wrap as Engine),
  blurb: "A curved surface folds and wraps around scattered anchor points.",
  params: (wrap as Engine).params.filter((p) => p.key !== "anchors" && p.key !== "grid"),
  render(ctx) {
    const r = rng(ctx.seed);
    const n = 4 + Math.floor(r() * 4);
    const points = Array.from({ length: n }, () => ({
      x: ctx.w * (0.18 + r() * 0.64),
      y: ctx.h * (0.18 + r() * 0.64),
    }));
    return (wrap as Engine).render({
      ...ctx,
      p: { ...ctx.p, grid: 0, anchors: 0 },
      data: { points },
    });
  },
};

export const ENGINES: Engine[] = [
  mesh as Engine,
  dither as Engine,
  dotfield as Engine,
  network as Engine,
  weave as Engine,
  fold as Engine,
  quilt as Engine,
  graph as Engine,
  flow as Engine,
  seededWrap,
];

export const engineById = (id: string) => ENGINES.find((e) => e.id === id);

export function defaultParams(e: Engine): Record<string, number> {
  return Object.fromEntries(e.params.map((p) => [p.key, p.default]));
}
