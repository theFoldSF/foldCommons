// Template definitions — the guarded layouts. Layout geometry is locked;
// members edit content, swap canon colors, tune the motif, and reroll seeds.
// Structure is constant, color is variable, time is marked by hue.

import type { RegisterKey, TypeRole } from "../brand/tokens";

export interface TextZone {
  id: string;
  label: string;
  role: TypeRole;
  x: number; // canvas units
  y: number;
  w: number;
  size: number;
  align: "start" | "middle" | "end";
  default: string;
  uppercase?: boolean;
  tracking?: number; // em
  lines?: number; // max wrapped lines (default 3)
  colorable?: boolean; // may take an accent instead of ink
}

export type TemplateKind = "poster" | "story" | "post" | "diagram" | "stickers";

export interface CompMetrics {
  margin: number; // outer margin, canvas units
  titleSize: number;
  detailSize: number;
  chipSize: number;
  logoH: number; // FOLD logotype height
}

export interface Template {
  id: string;
  label: string;
  blurb: string;
  kind: TemplateKind;
  w: number;
  h: number;
  register: RegisterKey;
  allowRegisterSwitch: boolean;
  zones: TextZone[];
  // Composed kinds (poster/story/post) render via the frame composer instead
  // of fixed zones; `comp` carries their type metrics.
  composed?: boolean;
  comp?: CompMetrics;
  // Where generative motif art lives. "backdrop" fills behind everything.
  motifSlot?: { x: number; y: number; w: number; h: number } | "backdrop";
  // The Line: y as fraction of height. Templates place it; members tune within canon ranges.
  line?: { y: number };
  wordmark: { x: number; y: number; size: number; align: "start" | "middle" | "end" };
}

const composedZones = (title: string): TextZone[] => [
  { id: "title", label: "Title", role: "heading", x: 0, y: 0, w: 0, size: 0, align: "start", default: title },
  { id: "prose", label: "Prose (optional)", role: "body", x: 0, y: 0, w: 0, size: 0, align: "start", default: "", lines: 10 },
  { id: "date", label: "Date chip", role: "body", x: 0, y: 0, w: 0, size: 0, align: "start", default: "Thurs Jul 2", colorable: true },
  { id: "time", label: "Time chip", role: "body", x: 0, y: 0, w: 0, size: 0, align: "start", default: "9pm", colorable: true },
];

export const TEMPLATES: Template[] = [
  {
    id: "flyer-print",
    label: "Event flyer · print",
    blurb: "8.5×11 poster for the wall and the window.",
    kind: "poster",
    w: 850,
    h: 1100,
    register: "paper",
    allowRegisterSwitch: true,
    composed: true,
    comp: { margin: 64, titleSize: 52, detailSize: 26, chipSize: 24, logoH: 34 },
    zones: composedZones("Friday Aperitivo"),
    wordmark: { x: 425, y: 1042, size: 20, align: "middle" },
  },
  {
    id: "flyer-digital",
    label: "Event flyer · digital",
    blurb: "1080×1350 — feeds, mail, screens.",
    kind: "poster",
    w: 1080,
    h: 1350,
    register: "paper",
    allowRegisterSwitch: true,
    composed: true,
    comp: { margin: 80, titleSize: 64, detailSize: 32, chipSize: 30, logoH: 42 },
    zones: composedZones("Friday Aperitivo"),
    wordmark: { x: 540, y: 1280, size: 26, align: "middle" },
  },
  {
    id: "ig-story",
    label: "Instagram story",
    blurb: "1080×1920, type-safe zones clear of the UI chrome.",
    kind: "story",
    w: 1080,
    h: 1920,
    register: "paper",
    allowRegisterSwitch: true,
    composed: true,
    comp: { margin: 90, titleSize: 72, detailSize: 36, chipSize: 32, logoH: 48 },
    zones: composedZones("Friday Aperitivo"),
    wordmark: { x: 540, y: 1800, size: 30, align: "middle" },
  },
  {
    id: "ig-post",
    label: "Instagram post",
    blurb: "1080×1080 square.",
    kind: "post",
    w: 1080,
    h: 1080,
    register: "paper",
    allowRegisterSwitch: true,
    composed: true,
    comp: { margin: 76, titleSize: 60, detailSize: 32, chipSize: 30, logoH: 42 },
    zones: composedZones("Friday Aperitivo"),
    wordmark: { x: 980, y: 1010, size: 24, align: "end" },
  },
  {
    id: "diagram",
    label: "Diagram",
    blurb: "On-brand boxes, arrows, and labels for explaining a system.",
    kind: "diagram",
    w: 1600,
    h: 1000,
    register: "paper",
    allowRegisterSwitch: true,
    zones: [
      { id: "title", label: "Title", role: "heading", x: 80, y: 96, w: 1200, size: 54, align: "start", default: "How it works", lines: 1, colorable: true },
    ],
    wordmark: { x: 1520, y: 950, size: 22, align: "end" },
  },
  {
    id: "stickers",
    label: "Sticker sheet",
    blurb: "The community marks at sticker size — pick, tint, print, peel.",
    kind: "stickers",
    w: 1000,
    h: 1000,
    register: "paper",
    allowRegisterSwitch: true,
    zones: [],
    wordmark: { x: 500, y: 964, size: 20, align: "middle" },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
