// state.ts — the composition document, serialization, and the local gallery.
// A Doc contains only canon references (template ids, accent indexes, seeds,
// engine params) plus member text — it cannot describe an off-brand artifact,
// which is what makes shared/remixed docs safe by construction.

import { GROUNDS, REGISTERS, SEASONS, type RegisterKey, LINE_MOTIF } from "./brand/tokens";
import { ENGINES, SIGNATURE_ENGINE, defaultParams, engineById, shuffleParams } from "./engines/index";
import { FRAMES } from "./frames/index";
import { TEMPLATES, templateById, type Template } from "./templates/index";
import { MARKS } from "./marks/index";
import { PHOTOS } from "./photos/index";

export interface MotifState {
  engine: string;
  seed: number;
  params: Record<string, number>;
  accents: number[]; // indexes into the active register's accent list
}

export interface DiagramNode {
  label: string;
  accent: number;
}

export type DiagramDir = "lr" | "tb" | "scatter";
export type NodeStyle = "ticket" | "scallop" | "plain";

export interface DiagramState {
  nodes: DiagramNode[];
  edges: [number, number][];
  dir: DiagramDir;
  nodeStyle: NodeStyle;
  scatterSeed: number;
}

// The composed layouts (poster / story / post): what the frame holds and
// where everything sits. All values are canon references + seeds.
export type LayoutKey = "hero" | "panel" | "motif" | "backdrop" | "collage";
export const LAYOUTS: { key: LayoutKey; label: string; blurb: string }[] = [
  { key: "hero", label: "Photo hero", blurb: "A framed photo carries it. Title below, date chips beside." },
  { key: "panel", label: "Color panel", blurb: "A canon color in an organic frame — the quiet one." },
  { key: "motif", label: "Motif", blurb: "A generative motif runs the whole frame." },
  { key: "backdrop", label: "Motif + photo", blurb: "The motif pours behind a framed photo." },
  { key: "collage", label: "Collage", blurb: "Texture, motif, and a framed photo — everything at once." },
];

// Background texture wash: how much ground color veils the photo. Clamped so
// text can never sit on a bare photo.
export const BG_FADE = { min: 0.5, max: 0.92, default: 0.78 };

// The signature: the F·O·L·D net motif, always present in the corner. Its
// params are the network engine's, minus tiles (a signature is one mark).
export interface SigState {
  seed: number;
  params: Record<string, number>;
}

// Per-element free transform (Photoshop-style): translate in canvas units,
// uniform scale, rotation in degrees. Pivots on the element's own untransformed
// center. Identity when absent.
export interface XfState {
  dx: number;
  dy: number;
  s: number;
  rot: number;
}

// The composed layout's transformable elements — keys into comp.xf.
export const XF_KEYS = ["photo", "motif", "prose", "title", "date", "time", "sig"] as const;
export type XfKey = (typeof XF_KEYS)[number];

// Horizontal-movement variants for backdrop/collage: which corner (or side)
// the motif box leans into, and which corner the photo frame anchors toward —
// deliberately asymmetric, never simply stacked/centered. "center" is the
// legacy centered pairing (kept as index 0 so old share links render close to
// how they always did). Index = comp.arrange, seeded fraction sizes/photo
// aspect come from frameSeed so the same doc always re-draws identically.
export interface ArrangeVariant {
  motif: "full" | "tl" | "tr" | "bl" | "br";
  photo: "center" | "tl" | "tr" | "bl" | "br";
}
export const ARRANGEMENTS: ArrangeVariant[] = [
  { motif: "full", photo: "center" }, // 0: classic centered stack
  { motif: "tl", photo: "br" },
  { motif: "tr", photo: "bl" },
  { motif: "bl", photo: "tr" },
  { motif: "br", photo: "tl" },
  { motif: "full", photo: "tl" }, // deliberate overlap
  { motif: "full", photo: "br" }, // deliberate overlap
  { motif: "tl", photo: "center" }, // off-center single: motif accents a corner, photo dominates
];

export type ChipStyle = "ticket" | "scallop" | "line";
export type WordsLayout = "band" | "corners" | "stack";

export interface CompState {
  layout: LayoutKey;
  frame: string; // frame shape id
  frameSeed: number;
  photo: string; // photo library id; "" = none
  upload?: string; // member-uploaded image (data URI), wins over photo
  bg: string; // photo id used as full-bleed background texture; "" = plain ground
  bgFade: number; // ground-color wash over the texture (BG_FADE range)
  panelAccent: number; // panel fill / photo-less hero fill
  sig: SigState; // the F·O·L·D net signature mark
  chipAccents: [number, number]; // date chip, time chip
  chipStyle: ChipStyle;
  words: WordsLayout;
  arrange: number; // index into ARRANGEMENTS — used by backdrop/collage
  xf: Partial<Record<XfKey, XfState>>; // per-element free transform, keyed by XF_KEYS
}

export interface Doc {
  v: 2;
  template: string;
  register: RegisterKey;
  ground: number; // index into GROUNDS
  season: string;
  fields: Record<string, string>;
  fieldAccents: Record<string, number>; // zone id → accent index; -1 = ink
  comp: CompState;
  motif: MotifState | null;
  lineOn: boolean;
  line: { amp: number; periods: number; sw: number };
  diagram: DiagramState;
  stickers: { ids: string[]; accent: number };
  name?: string;
}

// Signature params: the network engine's, minus tiles — one mark, one corner.
export const SIG_PARAMS = SIGNATURE_ENGINE.params.filter((p) => p.key !== "tiles");

export function defaultSigParams(): Record<string, number> {
  // engine defaults, pulled in tighter — a signature is one held cluster
  return { ...Object.fromEntries(SIG_PARAMS.map((p) => [p.key, p.default])), scatter: 0.55 };
}

export function newDoc(templateId: string): Doc {
  const t = templateById(templateId)!;
  const fields: Record<string, string> = {};
  for (const z of t.zones) fields[z.id] = z.default;
  if (t.composed) {
    fields.title = fields.title ?? "Friday Aperitivo";
    fields.detail = fields.detail ?? "";
    fields.date = fields.date ?? "Thurs Jul 2";
    fields.time = fields.time ?? "9pm";
  }
  const engine = ENGINES[0];
  return {
    v: 2,
    template: t.id,
    register: t.register,
    ground: 0,
    season: currentSeason(),
    fields,
    fieldAccents: {},
    comp: {
      layout: "hero",
      frame: "wobble",
      frameSeed: 7,
      photo: "fold-6416",
      bg: "",
      bgFade: BG_FADE.default,
      panelAccent: 0,
      sig: { seed: 7, params: defaultSigParams() },
      chipAccents: [0, 2],
      chipStyle: "ticket",
      words: "band",
      arrange: 0,
      xf: {},
    },
    motif: t.composed || t.motifSlot
      ? { engine: engine.id, seed: 1234, params: defaultParams(engine), accents: [4, 0] }
      : null,
    lineOn: !!t.line,
    line: {
      amp: LINE_MOTIF.amplitude.default,
      periods: LINE_MOTIF.periods.default,
      sw: LINE_MOTIF.strokeWidth.default,
    },
    diagram: {
      nodes: [
        { label: "An idea", accent: 0 },
        { label: "The Fold", accent: 1 },
        { label: "A thing that exists", accent: 2 },
      ],
      edges: [
        [0, 1],
        [1, 2],
      ],
      dir: "lr",
      nodeStyle: "ticket",
      scatterSeed: 101,
    },
    stickers: { ids: MARKS.slice(0, 4).map((m) => m.id), accent: 0 },
  };
}

export function docTemplate(doc: Doc): Template {
  return templateById(doc.template) ?? TEMPLATES[0];
}

export function docGround(doc: Doc) {
  return GROUNDS[((doc.ground % GROUNDS.length) + GROUNDS.length) % GROUNDS.length];
}

export function docAccent(doc: Doc, idx: number): string {
  const reg = REGISTERS[doc.register];
  const accents = reg.accents.filter((a) => a !== docGround(doc).hex);
  return accents[((idx % accents.length) + accents.length) % accents.length];
}

// One tap → a genuinely different composition, still entirely inside canon.
export function shuffleComp(doc: Doc) {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  // an upload is the member's deliberate choice — keep it; otherwise re-draw
  // the framed photo from the house library
  if (!doc.comp.upload && PHOTOS.length) doc.comp.photo = pick(PHOTOS).id;
  const hasPhoto = !!(doc.comp.upload || doc.comp.photo);
  const layouts: LayoutKey[] = hasPhoto
    ? ["hero", "hero", "backdrop", "collage", "motif", "panel"]
    : ["panel", "motif", "motif", "hero"];
  doc.comp.layout = pick(layouts);
  // pick the motif engine before the frame, so a drape-heavy motif (Drape
  // lines, Draped quilt) can exclude the Drape frame — no drape-on-drape.
  const engine = pick(ENGINES);
  const frameChoices =
    engine.id === "flow" || engine.id === "cloth" ? FRAMES.filter((f) => f.id !== "drape") : FRAMES;
  doc.comp.frame = pick(frameChoices).id;
  doc.comp.frameSeed = Math.floor(Math.random() * 100000);
  // background texture: collage always gets one; other layouts sometimes
  if (PHOTOS.length && (doc.comp.layout === "collage" || Math.random() < 0.35)) {
    const framed = doc.comp.upload ? "" : doc.comp.photo;
    doc.comp.bg = pick(PHOTOS.filter((p) => p.id !== framed).concat(PHOTOS.slice(0, 1))).id;
    doc.comp.bgFade = BG_FADE.min + Math.random() * (BG_FADE.max - BG_FADE.min);
  } else doc.comp.bg = "";
  doc.comp.panelAccent = Math.floor(Math.random() * 4);
  doc.comp.sig.seed = Math.floor(Math.random() * 100000);
  doc.comp.chipAccents = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)];
  doc.comp.chipStyle = pick<ChipStyle>(["ticket", "scallop", "line"]);
  doc.comp.words = pick<WordsLayout>(["band", "corners", "stack"]);
  doc.comp.arrange = Math.floor(Math.random() * ARRANGEMENTS.length);
  doc.comp.xf = {};
  doc.ground = pick([0, 0, 0, 1, 2, 3, 7, 8]);
  doc.register = docGround(doc).register;
  // a different motif engine each roll, params drawn from curated ranges
  doc.motif = {
    engine: engine.id,
    seed: Math.floor(Math.random() * 100000),
    params: shuffleParams(engine),
    accents: doc.motif?.accents ?? [4, 0],
  };
}

export function docSeason(doc: Doc) {
  return SEASONS.find((s) => s.key === doc.season) ?? SEASONS[0];
}

function currentSeason(): string {
  const m = new Date().getMonth();
  return m < 2 || m === 11 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "autumn";
}

// Guardrail clamp on load: unknown ids/indexes/params are pulled back into
// canon so hand-edited or stale share links can't escape the system.
export function sanitize(doc: Doc): Doc {
  const t = templateById(doc.template) ?? TEMPLATES[0];
  doc.template = t.id;
  if (!SEASONS.some((s) => s.key === doc.season)) doc.season = currentSeason();
  // v1 docs and hand-edited links: fill/clamp the composed-layout state.
  const fresh = newDoc(t.id);
  if (typeof doc.ground !== "number" || !Number.isFinite(doc.ground)) doc.ground = 0;
  doc.ground = ((Math.round(doc.ground) % GROUNDS.length) + GROUNDS.length) % GROUNDS.length;
  doc.comp = { ...fresh.comp, ...(doc.comp ?? {}) };
  if (!LAYOUTS.some((l) => l.key === doc.comp.layout)) doc.comp.layout = "hero";
  if (!FRAMES.some((f) => f.id === doc.comp.frame)) doc.comp.frame = FRAMES[0].id;
  doc.comp.frameSeed = Number.isFinite(doc.comp.frameSeed) ? doc.comp.frameSeed >>> 0 : 7;
  if (typeof doc.comp.upload !== "string" || !doc.comp.upload.startsWith("data:image/"))
    delete doc.comp.upload;
  if (PHOTOS.length && doc.comp.photo && !PHOTOS.some((p) => p.id === doc.comp.photo))
    doc.comp.photo = "";
  if (typeof doc.comp.bg !== "string") doc.comp.bg = "";
  if (PHOTOS.length && doc.comp.bg && !PHOTOS.some((p) => p.id === doc.comp.bg))
    doc.comp.bg = "";
  doc.comp.bgFade = Number.isFinite(doc.comp.bgFade)
    ? Math.min(BG_FADE.max, Math.max(BG_FADE.min, doc.comp.bgFade))
    : BG_FADE.default;
  // signature: fill defaults (covers pre-signature docs), clamp to canon ranges
  if (!doc.comp.sig || typeof doc.comp.sig !== "object")
    doc.comp.sig = { seed: 7, params: defaultSigParams() };
  doc.comp.sig.seed = Number.isFinite(doc.comp.sig.seed) ? doc.comp.sig.seed >>> 0 : 7;
  const sp: Record<string, number> = {};
  for (const p of SIG_PARAMS) {
    const v = Number(doc.comp.sig.params?.[p.key]);
    sp[p.key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
  }
  doc.comp.sig.params = sp;
  delete (doc.comp as unknown as Record<string, unknown>)["wm"];
  doc.comp.panelAccent = Number.isFinite(doc.comp.panelAccent) ? Math.round(doc.comp.panelAccent) : 0;
  const ca = doc.comp.chipAccents;
  doc.comp.chipAccents = [
    Number.isFinite(ca?.[0]) ? Math.round(ca[0]) : 0,
    Number.isFinite(ca?.[1]) ? Math.round(ca[1]) : 2,
  ];
  if (!["ticket", "scallop", "line"].includes(doc.comp.chipStyle)) doc.comp.chipStyle = "ticket";
  if (!["band", "corners", "stack"].includes(doc.comp.words)) doc.comp.words = "band";
  doc.comp.arrange = Number.isFinite(doc.comp.arrange)
    ? ((Math.round(doc.comp.arrange) % ARRANGEMENTS.length) + ARRANGEMENTS.length) % ARRANGEMENTS.length
    : 0;
  // transform tool: clamp dx/dy to the canvas size, s to [0.3,3], rot to
  // [-180,180]; unknown keys are dropped so hand-edited links can't escape.
  const rawXf = (doc.comp as unknown as { xf?: Record<string, Partial<XfState>> }).xf;
  const cleanXf: Partial<Record<XfKey, XfState>> = {};
  for (const k of XF_KEYS) {
    const v = rawXf?.[k];
    if (!v || typeof v !== "object") continue;
    const dx = Number(v.dx), dy = Number(v.dy), s = Number(v.s), rot = Number(v.rot);
    if (![dx, dy, s, rot].some(Number.isFinite)) continue;
    cleanXf[k] = {
      dx: Number.isFinite(dx) ? Math.max(-t.w, Math.min(t.w, dx)) : 0,
      dy: Number.isFinite(dy) ? Math.max(-t.h, Math.min(t.h, dy)) : 0,
      s: Number.isFinite(s) ? Math.max(0.3, Math.min(3, s)) : 1,
      rot: Number.isFinite(rot) ? Math.max(-180, Math.min(180, rot)) : 0,
    };
  }
  doc.comp.xf = cleanXf;
  doc.fields = { ...fresh.fields, ...(doc.fields ?? {}) };
  // pre-prose docs kept a short "detail" line — carry it into the prose card
  if (!doc.fields.prose?.trim() && doc.fields.detail?.trim())
    doc.fields.prose = doc.fields.detail;
  doc.v = 2;
  // register follows the ground — text stays readable by construction
  doc.register = docGround(doc).register;
  if (!REGISTERS[doc.register]) doc.register = t.register;
  if (doc.motif) {
    const e = engineById(doc.motif.engine);
    if (!e) doc.motif.engine = ENGINES[0].id;
    const eng = engineById(doc.motif.engine)!;
    const clean: Record<string, number> = {};
    for (const p of eng.params) {
      const v = Number(doc.motif.params?.[p.key]);
      clean[p.key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
    }
    doc.motif.params = clean;
  }
  const { amplitude, periods, strokeWidth } = LINE_MOTIF;
  doc.line.amp = Math.min(amplitude.max, Math.max(amplitude.min, doc.line.amp));
  doc.line.periods = Math.min(periods.max, Math.max(periods.min, doc.line.periods));
  doc.line.sw = Math.min(strokeWidth.max, Math.max(strokeWidth.min, doc.line.sw));
  if (MARKS.length) {
    doc.stickers.ids = doc.stickers.ids.filter((id) => MARKS.some((m) => m.id === id));
    if (!doc.stickers.ids.length) doc.stickers.ids = [MARKS[0].id];
  }
  // diagram: fill/clamp fields added after v2's first ship (dir gained
  // "scatter", node styling, a scatter-only reroll seed)
  if (!doc.diagram || typeof doc.diagram !== "object") doc.diagram = fresh.diagram;
  if (!Array.isArray(doc.diagram.nodes)) doc.diagram.nodes = fresh.diagram.nodes;
  if (!Array.isArray(doc.diagram.edges)) doc.diagram.edges = fresh.diagram.edges;
  if (!["lr", "tb", "scatter"].includes(doc.diagram.dir)) doc.diagram.dir = "lr";
  if (!["ticket", "scallop", "plain"].includes(doc.diagram.nodeStyle)) doc.diagram.nodeStyle = "ticket";
  doc.diagram.scatterSeed = Number.isFinite(doc.diagram.scatterSeed) ? doc.diagram.scatterSeed >>> 0 : 101;
  return doc;
}

// --- share links -------------------------------------------------------------

export function encodeDoc(doc: Doc): string {
  const json = JSON.stringify(doc);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeDoc(s: string): Doc | null {
  try {
    const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

// --- gallery (localStorage; backend-free v1) --------------------------------

export interface GalleryItem {
  id: string;
  name: string;
  maker?: string;
  date: string;
  doc: Doc;
}

const KEY = "foldCommons.gallery.v1";

export function loadGallery(): GalleryItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveToGallery(doc: Doc, name: string, maker?: string): GalleryItem {
  const items = loadGallery();
  const item: GalleryItem = {
    id: Math.random().toString(36).slice(2, 10),
    name,
    maker: maker?.trim() || undefined,
    date: new Date().toISOString().slice(0, 10),
    doc: JSON.parse(JSON.stringify(doc)),
  };
  items.unshift(item);
  localStorage.setItem(KEY, JSON.stringify(items));
  return item;
}

export function removeFromGallery(id: string) {
  localStorage.setItem(KEY, JSON.stringify(loadGallery().filter((i) => i.id !== id)));
}
