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

export function defaultParams(e: Engine): Record<string, number> {
  return Object.fromEntries(e.params.map((p) => [p.key, p.default]));
}
