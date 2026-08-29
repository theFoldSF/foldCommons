// state.ts — the composition document, serialization, and the local gallery.
// A Doc contains only canon references (template ids, accent indexes, seeds,
// engine params) plus member text — it cannot describe an off-brand artifact,
// which is what makes shared/remixed docs safe by construction.

import { GROUNDS, REGISTERS, SEASONS, type RegisterKey, LINE_MOTIF } from "./brand/tokens";
import { ENGINES, defaultParams, engineById } from "./engines/index";
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

export interface DiagramState {
  nodes: DiagramNode[];
  edges: [number, number][];
  dir: "lr" | "tb";
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

export interface CompState {
  layout: LayoutKey;
  frame: string; // frame shape id
  frameSeed: number;
  photo: string; // photo library id; "" = none
  upload?: string; // member-uploaded image (data URI), wins over photo
  bg: string; // photo id used as full-bleed background texture; "" = plain ground
  bgFade: number; // ground-color wash over the texture (BG_FADE range)
  panelAccent: number; // panel fill / photo-less hero fill
  wm: "logo" | "pill"; // chunky FOLD logotype or "the Fold" pill
  chipAccents: [number, number]; // date chip, time chip
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

export function newDoc(templateId: string): Doc {
  const t = templateById(templateId)!;
  const fields: Record<string, string> = {};
  for (const z of t.zones) fields[z.id] = z.default;
  if (t.composed) {
    fields.title = fields.title ?? "Tantric Flute Night";
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
      wm: "logo",
      chipAccents: [0, 2],
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
  doc.comp.frame = pick(FRAMES).id;
  doc.comp.frameSeed = Math.floor(Math.random() * 100000);
  // background texture: collage always gets one; other layouts sometimes
  if (PHOTOS.length && (doc.comp.layout === "collage" || Math.random() < 0.35)) {
    const framed = doc.comp.upload ? "" : doc.comp.photo;
    doc.comp.bg = pick(PHOTOS.filter((p) => p.id !== framed).concat(PHOTOS.slice(0, 1))).id;
    doc.comp.bgFade = BG_FADE.min + Math.random() * (BG_FADE.max - BG_FADE.min);
  } else doc.comp.bg = "";
  doc.comp.panelAccent = Math.floor(Math.random() * 4);
  doc.comp.wm = pick(["logo", "logo", "pill"]);
  doc.comp.chipAccents = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)];
  doc.ground = pick([0, 0, 0, 1, 2, 3, 7, 8]);
  doc.register = docGround(doc).register;
  if (doc.motif) doc.motif.seed = Math.floor(Math.random() * 100000);
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
  if (doc.comp.wm !== "logo" && doc.comp.wm !== "pill") doc.comp.wm = "logo";
  doc.comp.panelAccent = Number.isFinite(doc.comp.panelAccent) ? Math.round(doc.comp.panelAccent) : 0;
  const ca = doc.comp.chipAccents;
  doc.comp.chipAccents = [
    Number.isFinite(ca?.[0]) ? Math.round(ca[0]) : 0,
    Number.isFinite(ca?.[1]) ? Math.round(ca[1]) : 2,
  ];
  doc.fields = { ...fresh.fields, ...(doc.fields ?? {}) };
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

export function saveToGallery(doc: Doc, name: string): GalleryItem {
  const items = loadGallery();
  const item: GalleryItem = {
    id: Math.random().toString(36).slice(2, 10),
    name,
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
