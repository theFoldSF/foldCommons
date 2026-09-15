// state.ts — the composition document, serialization, and the local gallery.
// A Doc contains only canon references (template ids, accent indexes, seeds,
// engine params) plus member text — it cannot describe an off-brand artifact,
// which is what makes shared/remixed docs safe by construction.

import { GROUNDS, REGISTERS, SEASONS, type RegisterKey, LINE_MOTIF } from "./brand/tokens";
import { ENGINES, SIGNATURE_ENGINE, defaultParams, engineById, shuffleParams } from "./engines/index";
import { FRAMES, PLATE_FRAMES } from "./frames/index";
import { TEMPLATES, templateById, defaultDateChip, type Template } from "./templates/index";
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

// The composed layout's fixed transformable elements — keys into comp.xf.
// Text boxes (comp.texts) are dynamic in number, so they use runtime keys of
// the form `text:<id>` instead of a member of this union — see XfKey below.
export const XF_KEYS = ["photo", "motif", "title", "date", "time", "sig"] as const;
export type StaticXfKey = (typeof XF_KEYS)[number];
export type XfKey = StaticXfKey | `text:${string}`;
export const textXfKey = (id: string): XfKey => `text:${id}`;

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

// A member text box — its own framed card, sized to its wrapped text. Replaces
// the old single fields.prose string; sanitize() migrates old docs (see below).
export interface TextBoxState {
  id: string;
  text: string;
  frame: string; // frame shape id — the PLATE_FRAMES set, same as the title's plate
  frameSeed: number;
}

// Shuffle locks: when a key is true, shuffleComp() leaves that slot alone.
export type LockKey =
  | "layout"
  | "frame"
  | "photo"
  | "bg"
  | "panelAccent"
  | "chips"
  | "titlePlate"
  | "words"
  | "arrange"
  | "groundRegister"
  | "motif"
  | "signature";

export const LOCK_KEYS: LockKey[] = [
  "layout",
  "frame",
  "photo",
  "bg",
  "panelAccent",
  "chips",
  "titlePlate",
  "words",
  "arrange",
  "groundRegister",
  "motif",
  "signature",
];

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
  sigOn: boolean; // false = signature hidden (Delete key on it, toggled back in its panel)
  chipAccents: [number, number]; // date chip, time chip
  chipStyle: ChipStyle;
  words: WordsLayout;
  arrange: number; // index into ARRANGEMENTS — used by backdrop/collage
  texts: TextBoxState[]; // member text boxes, each its own framed card
  titleFrame: string; // frame shape id for the title's contrast plate
  titleFrameSeed: number;
  xf: Partial<Record<XfKey, XfState>>; // per-element free transform
  locks?: Partial<Record<LockKey, boolean>>; // shuffleComp() skips locked slots
  // Palette lab — temporary escape hatch while the design team dials accent
  // colors; when set, replaces the active register's accent list wherever
  // docAccent()/docAccents() resolve one. Not canon; explicitly experimental.
  paletteOverride?: { accents: string[] };
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
    fields.title = fields.title ?? "Aperitivo Night";
    fields.detail = fields.detail ?? "";
    fields.date = defaultDateChip();
    fields.time = fields.time ?? "9pm";
  }
  const engine = ENGINES[0];
  return finalizeComp({
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
      photo: "fold-6417",
      bg: "",
      bgFade: BG_FADE.default,
      panelAccent: 0,
      sig: { seed: 7, params: defaultSigParams() },
      sigOn: true,
      chipAccents: [0, 2],
      chipStyle: "ticket",
      words: "band",
      arrange: 0,
      texts: [],
      titleFrame: PLATE_FRAMES[0].id,
      titleFrameSeed: 11,
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
  });
}

// Applied right after a doc's comp is built (newDoc, shuffleComp): keeps the
// freshly-picked chip accents from landing on the same color as a solid frame
// fill sitting right behind them, and keeps the scallop mark from showing up
// in too many places at once.
function finalizeComp(doc: Doc): Doc {
  if (!doc.comp.locks?.chips) avoidChipFrameClash(doc);
  if (!doc.comp.locks?.titlePlate) avoidScallopOverload(doc);
  return doc;
}

// The scallop shape reads fine doubled up — d/t chips + title, or d/t chips +
// the photo/motif frame, are both still legible as one consistent bumpy-cloud
// language running through a piece. But title plate + a text box + the photo/
// motif frame ALL scalloped at once reads as overdone (every window on the
// canvas fighting for the same texture), so that specific triple is the one
// combination shuffle is never allowed to land on. The d/t chip style is
// deliberately left out of this check — it's fine alongside any of the above.
function avoidScallopOverload(doc: Doc) {
  const titleScallop = doc.comp.titleFrame === "scallop-chip";
  const imageScallop = doc.comp.frame === "scallop";
  const textScallop = doc.comp.texts.some((tb) => tb.frame === "scallop-chip");
  if (!(titleScallop && imageScallop && textScallop)) return;
  // break the triple by re-rolling the title plate — it's the one surface
  // this same shuffle just picked fresh, so nudging it off scallop never
  // contradicts a member's own deliberate choice (the image frame) or their
  // typed text-box content.
  const alt = PLATE_FRAMES.filter((f) => f.id !== "scallop-chip");
  doc.comp.titleFrame = alt[Math.floor(Math.random() * alt.length)].id;
}

export function docTemplate(doc: Doc): Template {
  return templateById(doc.template) ?? TEMPLATES[0];
}

// Short, collision-safe-enough id for a new text box.
export function newTextBoxId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// The accent list docAccent() indexes into: a palette-lab override when one
// is set, otherwise the active register's accents with the ground color
// excluded so a chip/accent never lands invisibly on top of a matching ground.
export function docAccents(doc: Doc): string[] {
  if (doc.comp.paletteOverride?.accents.length) return doc.comp.paletteOverride.accents;
  return REGISTERS[doc.register].accents.filter((a) => a !== docGround(doc).hex);
}

// How many accent indexes are actually pickable for this doc (docAccent's own
// modulus).
function accentCount(doc: Doc): number {
  return docAccents(doc).length;
}

// True when the layout currently shows a flat accent fill behind the words —
// the panel layout always, or any layout that falls back to the panel accent
// because no photo is set — so a chip sitting in that same color would
// disappear into it. null when nothing solid is showing.
function solidFrameAccent(doc: Doc): number | null {
  const hasPhoto = !!(doc.comp.upload || doc.comp.photo);
  if (doc.comp.layout === "panel") return doc.comp.panelAccent;
  if (!hasPhoto && (doc.comp.layout === "hero" || doc.comp.layout === "backdrop" || doc.comp.layout === "collage"))
    return doc.comp.panelAccent;
  return null;
}

// Re-roll any chip accent that collides with a solid-color frame behind it —
// called after a fresh/shuffled chipAccents pick, never on a member's manual
// chip color choice from the panel.
function avoidChipFrameClash(doc: Doc) {
  const clash = solidFrameAccent(doc);
  if (clash === null) return;
  const n = accentCount(doc);
  if (n < 2) return;
  const norm = (i: number) => ((i % n) + n) % n;
  const clashN = norm(clash);
  const bump = (i: number) => (norm(i) === clashN ? norm(i + 1) : norm(i));
  doc.comp.chipAccents = [bump(doc.comp.chipAccents[0]), bump(doc.comp.chipAccents[1])];
}

export function docGround(doc: Doc) {
  return GROUNDS[((doc.ground % GROUNDS.length) + GROUNDS.length) % GROUNDS.length];
}

export function docAccent(doc: Doc, idx: number): string {
  const accents = docAccents(doc);
  return accents[((idx % accents.length) + accents.length) % accents.length];
}

// One tap → a genuinely different composition, still entirely inside canon.
// Any slot named in doc.comp.locks is left exactly as it was.
export function shuffleComp(doc: Doc) {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const locks = doc.comp.locks ?? {};

  // an upload is the member's deliberate choice — keep it; otherwise re-draw
  // the framed photo from the house library
  if (!locks.photo && !doc.comp.upload && PHOTOS.length) doc.comp.photo = pick(PHOTOS).id;
  const hasPhoto = !!(doc.comp.upload || doc.comp.photo);
  if (!locks.layout) {
    const layouts: LayoutKey[] = hasPhoto
      ? ["hero", "hero", "backdrop", "collage", "motif", "panel"]
      : ["panel", "motif", "motif", "hero"];
    doc.comp.layout = pick(layouts);
  }
  // pick the motif engine before the frame, so a drape-heavy motif (Drape
  // lines, Draped quilt) can exclude the Drape frame — no drape-on-drape.
  // When the motif itself is locked, base the frame exclusion on the doc's
  // current engine instead of rolling a fresh one.
  const engine = locks.motif ? engineById(doc.motif?.engine ?? "") ?? pick(ENGINES) : pick(ENGINES);
  if (!locks.frame) {
    const frameChoices =
      engine.id === "flow" || engine.id === "cloth" ? FRAMES.filter((f) => f.id !== "drape") : FRAMES;
    doc.comp.frame = pick(frameChoices).id;
    doc.comp.frameSeed = Math.floor(Math.random() * 100000);
  }
  // background texture: collage always gets one; other layouts sometimes
  if (!locks.bg) {
    if (PHOTOS.length && (doc.comp.layout === "collage" || Math.random() < 0.35)) {
      const framed = doc.comp.upload ? "" : doc.comp.photo;
      doc.comp.bg = pick(PHOTOS.filter((p) => p.id !== framed).concat(PHOTOS.slice(0, 1))).id;
      doc.comp.bgFade = BG_FADE.min + Math.random() * (BG_FADE.max - BG_FADE.min);
    } else doc.comp.bg = "";
  }
  if (!locks.panelAccent) doc.comp.panelAccent = Math.floor(Math.random() * 4);
  if (!locks.signature) doc.comp.sig.seed = Math.floor(Math.random() * 100000);
  if (!locks.chips) {
    doc.comp.chipAccents = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)];
    doc.comp.chipStyle = pick<ChipStyle>(["ticket", "scallop", "line"]);
  }
  if (!locks.titlePlate) {
    doc.comp.titleFrame = pick(PLATE_FRAMES).id;
    doc.comp.titleFrameSeed = Math.floor(Math.random() * 100000);
  }
  if (!locks.words) doc.comp.words = pick<WordsLayout>(["band", "corners", "stack"]);
  if (!locks.arrange) doc.comp.arrange = Math.floor(Math.random() * ARRANGEMENTS.length);
  // wipe manual transforms only for slots that actually just moved — a
  // locked element's deliberate placement shouldn't be reset under it.
  const xf = { ...doc.comp.xf };
  if (!locks.photo) delete xf.photo;
  if (!locks.motif) delete xf.motif;
  if (!locks.signature) delete xf.sig;
  if (!locks.titlePlate) delete xf.title;
  if (!locks.chips) {
    delete xf.date;
    delete xf.time;
  }
  doc.comp.xf = xf;
  if (!locks.groundRegister) {
    doc.ground = pick([0, 0, 0, 1, 2, 3, 7, 8]);
    doc.register = docGround(doc).register;
  }
  // a different motif engine each roll, params drawn from curated ranges
  if (!locks.motif) {
    doc.motif = {
      engine: engine.id,
      seed: Math.floor(Math.random() * 100000),
      params: shuffleParams(engine),
      accents: doc.motif?.accents ?? [4, 0],
    };
  }
  finalizeComp(doc);
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
  // captured before the merge below fills in a default [] — tells the
  // fields.prose migration whether this doc predates comp.texts entirely, or
  // already has an (even empty) texts array of its own to leave alone.
  const rawHadTexts = Array.isArray((doc.comp as unknown as { texts?: unknown })?.texts);
  if (typeof doc.ground !== "number" || !Number.isFinite(doc.ground)) doc.ground = 0;
  doc.ground = ((Math.round(doc.ground) % GROUNDS.length) + GROUNDS.length) % GROUNDS.length;
  doc.comp = { ...fresh.comp, ...(doc.comp ?? {}) };
  // fields merged early — the fields.prose migration below needs it before
  // the rest of comp's own sanitizing runs.
  doc.fields = { ...fresh.fields, ...(doc.fields ?? {}) };
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
  doc.comp.sigOn = doc.comp.sigOn !== false;
  if (!PLATE_FRAMES.some((f) => f.id === doc.comp.titleFrame)) doc.comp.titleFrame = PLATE_FRAMES[0].id;
  doc.comp.titleFrameSeed = Number.isFinite(doc.comp.titleFrameSeed) ? doc.comp.titleFrameSeed >>> 0 : 11;

  // shuffle locks: unknown keys (hand-edited links, renamed slots) dropped;
  // only true booleans kept.
  const rawLocks = (doc.comp as unknown as { locks?: Record<string, unknown> }).locks;
  const cleanLocks: Partial<Record<LockKey, boolean>> = {};
  for (const k of LOCK_KEYS) if (rawLocks?.[k] === true) cleanLocks[k] = true;
  doc.comp.locks = cleanLocks;

  // palette lab override: valid #rrggbb strings only, 2-8 of them, else no override.
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const rawAccents = (doc.comp as unknown as { paletteOverride?: { accents?: unknown } }).paletteOverride
    ?.accents;
  const cleanAccents = Array.isArray(rawAccents)
    ? rawAccents.filter((a): a is string => typeof a === "string" && HEX.test(a)).slice(0, 8)
    : [];
  doc.comp.paletteOverride = cleanAccents.length >= 2 ? { accents: cleanAccents } : undefined;

  // pre-prose / pre-text-box docs: fold the old `detail` line into `prose`,
  // then `prose` into the first text box — a v1/v2 share link must still
  // render its words. Only migrate when this doc predates comp.texts
  // entirely; an already-migrated doc (even an emptied-out one) is left alone.
  if (!doc.fields.prose?.trim() && doc.fields.detail?.trim()) doc.fields.prose = doc.fields.detail;
  const legacyProse = doc.fields.prose?.trim();
  if (!rawHadTexts && legacyProse) {
    doc.comp.texts = [
      { id: newTextBoxId(), text: legacyProse, frame: doc.comp.frame, frameSeed: (doc.comp.frameSeed || 7) + 9 },
    ];
  }
  delete doc.fields.prose;
  // text boxes: fill/clamp each one; unknown frame ids fall back to the
  // default shape rather than dropping the box (a member's words survive).
  if (!Array.isArray(doc.comp.texts)) doc.comp.texts = [];
  doc.comp.texts = doc.comp.texts
    .filter((tb) => tb && typeof tb === "object")
    .map((tb) => ({
      id: typeof tb.id === "string" && tb.id ? tb.id : newTextBoxId(),
      text: typeof tb.text === "string" ? tb.text : "",
      frame: PLATE_FRAMES.some((f) => f.id === tb.frame) ? tb.frame : PLATE_FRAMES[0].id,
      frameSeed: Number.isFinite(tb.frameSeed) ? tb.frameSeed >>> 0 : 7,
    }));
  // de-dupe ids (hand-edited links) so two boxes can't fight over one xf key
  const seenIds = new Set<string>();
  for (const tb of doc.comp.texts) {
    while (seenIds.has(tb.id)) tb.id = newTextBoxId();
    seenIds.add(tb.id);
  }

  // transform tool: clamp dx/dy to the canvas size, s to [0.3,3], rot to
  // [-180,180]; unknown keys (including a text box that no longer exists)
  // are dropped so hand-edited links can't escape.
  const rawXf = (doc.comp as unknown as { xf?: Record<string, Partial<XfState>> }).xf;
  const validXfKeys: XfKey[] = [...XF_KEYS, ...doc.comp.texts.map((tb) => textXfKey(tb.id))];
  const cleanXf: Partial<Record<XfKey, XfState>> = {};
  for (const k of validXfKeys) {
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
