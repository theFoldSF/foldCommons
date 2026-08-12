// state.ts — the composition document, serialization, and the local gallery.
// A Doc contains only canon references (template ids, accent indexes, seeds,
// engine params) plus member text — it cannot describe an off-brand artifact,
// which is what makes shared/remixed docs safe by construction.

import { REGISTERS, SEASONS, type RegisterKey, LINE_MOTIF } from "./brand/tokens";
import { ENGINES, defaultParams, engineById } from "./engines/index";
import { TEMPLATES, templateById, type Template } from "./templates/index";
import { MARKS } from "./marks/index";

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

export interface Doc {
  v: 1;
  template: string;
  register: RegisterKey;
  season: string;
  fields: Record<string, string>;
  fieldAccents: Record<string, number>; // zone id → accent index; -1 = ink
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
  const engine = ENGINES[0];
  return {
    v: 1,
    template: t.id,
    register: t.register,
    season: currentSeason(),
    fields,
    fieldAccents: {},
    motif: t.motifSlot
      ? { engine: engine.id, seed: 1234, params: defaultParams(engine), accents: [0, 1] }
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

export function docAccent(doc: Doc, idx: number): string {
  const reg = REGISTERS[doc.register];
  return reg.accents[((idx % reg.accents.length) + reg.accents.length) % reg.accents.length];
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
  if (!REGISTERS[doc.register]) doc.register = t.register;
  if (!SEASONS.some((s) => s.key === doc.season)) doc.season = currentSeason();
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
  doc.stickers.ids = doc.stickers.ids.filter((id) => MARKS.some((m) => m.id === id));
  if (!doc.stickers.ids.length) doc.stickers.ids = [MARKS[0].id];
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
