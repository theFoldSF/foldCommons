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
  // Where generative motif art lives. "backdrop" fills behind everything.
  motifSlot?: { x: number; y: number; w: number; h: number } | "backdrop";
  // The Line: y as fraction of height. Templates place it; members tune within canon ranges.
  line?: { y: number };
  wordmark: { x: number; y: number; size: number; align: "start" | "middle" | "end" };
}

const flyerZones = (W: number, H: number, s: number): TextZone[] => [
  { id: "kicker", label: "Kicker", role: "label", x: W / 2, y: H * 0.1, w: W * 0.8, size: 22 * s, align: "middle", default: "THE FOLD PRESENTS", uppercase: true, tracking: 0.28, lines: 1, colorable: true },
  { id: "title", label: "Title", role: "display", x: W / 2, y: H * 0.34, w: W * 0.86, size: 92 * s, align: "middle", default: "Salon Night", lines: 3, colorable: true },
  { id: "detail", label: "Details", role: "body", x: W / 2, y: H * 0.62, w: W * 0.72, size: 26 * s, align: "middle", default: "Readings, music, and long conversation.\nAll are welcome.", lines: 4 },
  { id: "when", label: "When / where", role: "label", x: W / 2, y: H * 0.87, w: W * 0.8, size: 24 * s, align: "middle", default: "FRI SEPT 12 · 7PM · THE FOLD", uppercase: true, tracking: 0.14, lines: 2, colorable: true },
];

export const TEMPLATES: Template[] = [
  {
    id: "flyer-print",
    label: "Event flyer · print",
    blurb: "8.5×11 poster for the wall and the window.",
    kind: "poster",
    w: 850,
    h: 1100,
    register: "interior",
    allowRegisterSwitch: true,
    zones: flyerZones(850, 1100, 1),
    motifSlot: { x: 85, y: 462, w: 680, h: 187 },
    line: { y: 0.72 },
    wordmark: { x: 425, y: 1042, size: 20, align: "middle" },
  },
  {
    id: "flyer-digital",
    label: "Event flyer · digital",
    blurb: "1080×1350 — feeds, mail, screens.",
    kind: "poster",
    w: 1080,
    h: 1350,
    register: "interior",
    allowRegisterSwitch: true,
    zones: flyerZones(1080, 1350, 1.28),
    motifSlot: { x: 108, y: 567, w: 864, h: 230 },
    line: { y: 0.72 },
    wordmark: { x: 540, y: 1280, size: 26, align: "middle" },
  },
  {
    id: "ig-story",
    label: "Instagram story",
    blurb: "1080×1920, type-safe zones clear of the UI chrome.",
    kind: "story",
    w: 1080,
    h: 1920,
    register: "interior",
    allowRegisterSwitch: true,
    zones: [
      { id: "kicker", label: "Kicker", role: "label", x: 540, y: 340, w: 800, size: 30, align: "middle", default: "THIS WEEK AT THE FOLD", uppercase: true, tracking: 0.28, lines: 1, colorable: true },
      { id: "title", label: "Title", role: "display", x: 540, y: 700, w: 900, size: 120, align: "middle", default: "Open Studio", lines: 3, colorable: true },
      { id: "detail", label: "Details", role: "body", x: 540, y: 1180, w: 760, size: 38, align: "middle", default: "Bring the thing you're making.", lines: 3 },
      { id: "when", label: "When", role: "label", x: 540, y: 1560, w: 800, size: 32, align: "middle", default: "WEDNESDAY · 6–10PM", uppercase: true, tracking: 0.16, lines: 1, colorable: true },
    ],
    motifSlot: "backdrop",
    line: { y: 0.45 },
    wordmark: { x: 540, y: 1800, size: 30, align: "middle" },
  },
  {
    id: "ig-post",
    label: "Instagram post",
    blurb: "1080×1080 square.",
    kind: "post",
    w: 1080,
    h: 1080,
    register: "interior",
    allowRegisterSwitch: true,
    zones: [
      { id: "kicker", label: "Kicker", role: "label", x: 100, y: 140, w: 880, size: 28, align: "start", default: "THE FOLD", uppercase: true, tracking: 0.28, lines: 1, colorable: true },
      { id: "title", label: "Title", role: "display", x: 100, y: 320, w: 880, size: 96, align: "start", default: "A gathering place", lines: 3, colorable: true },
      { id: "detail", label: "Details", role: "body", x: 100, y: 880, w: 700, size: 34, align: "start", default: "Third space · gallery · cafe", lines: 2 },
    ],
    motifSlot: { x: 100, y: 560, w: 880, h: 260 },
    line: { y: 0.52 },
    wordmark: { x: 980, y: 1010, size: 24, align: "end" },
  },
  {
    id: "diagram",
    label: "Diagram",
    blurb: "On-brand boxes, arrows, and labels for explaining a system.",
    kind: "diagram",
    w: 1600,
    h: 1000,
    register: "interior",
    allowRegisterSwitch: true,
    zones: [
      { id: "title", label: "Title", role: "display", x: 80, y: 96, w: 1200, size: 54, align: "start", default: "How it works", lines: 1, colorable: true },
    ],
    line: { y: 0.16 },
    wordmark: { x: 1520, y: 950, size: 22, align: "end" },
  },
  {
    id: "stickers",
    label: "Sticker sheet",
    blurb: "The community marks at sticker size — pick, tint, print, peel.",
    kind: "stickers",
    w: 1000,
    h: 1000,
    register: "interior",
    allowRegisterSwitch: true,
    zones: [],
    wordmark: { x: 500, y: 964, size: 20, align: "middle" },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
