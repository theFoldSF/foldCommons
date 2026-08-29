// tokens.ts — the canon. Machine-readable source of truth for The Fold's brand,
// taken from the fold-brand Figma deck (the current identity: color system
// slide with usage percentages, type system, lockups) plus the technosphere
// vault for voice and history. Everything the tool can express comes from
// here — the guardrails are simply that the UI offers nothing else.
//
// Visual language (from the deck): SCHEMATISM ←→ BIO-FUTURISM. Quilted
// space-time. Analog algorithms. The grid is present, but broken. Sine waves,
// oscilloscopes, schematic diagrams, wireframe fold meshes, cyanotype blue.
//
// status: DRAFT — see OPEN_QUESTIONS.

// ---------------------------------------------------------------------------
// Color — from the deck's color-system slide, with its usage percentages.
// ---------------------------------------------------------------------------

export interface Swatch {
  name: string;
  hex: string;
  pct?: number; // usage guidance from the deck
}

export const COLOR = {
  // Grounds (creams; 30% + 10% + 10%)
  cream: { name: "Cream", hex: "#FFF9F1", pct: 30 },
  cream2: { name: "Cream 2", hex: "#F8F3EC", pct: 10 },
  warmGray: { name: "Warm gray", hex: "#E8E4E1", pct: 10 },
  coolGray: { name: "Cool gray", hex: "#C8C6CB", pct: 10 },
  // Accents (10% each)
  orange: { name: "Orange", hex: "#FA6F2E", pct: 10 },
  pink: { name: "Pink", hex: "#FCA4EE", pct: 10 },
  sky: { name: "Sky", hex: "#88DCE9", pct: 10 },
  green: { name: "Green", hex: "#71D599", pct: 10 },
  // Ink (10%)
  ink: { name: "Ink", hex: "#03071B", pct: 10 },
  // Blueprint blue — the lockup wireframe meshes' deep blue.
  blueprint: { name: "Blueprint blue", hex: "#171D60" },
} satisfies Record<string, Swatch>;

export const CANON_COLORS: Swatch[] = Object.values(COLOR);

// ---------------------------------------------------------------------------
// Registers — two grounds the system actually uses: paper (cream, schematic
// ink drawings, candy accents) and blueprint (deep ink ground, light traces —
// the oscilloscope / cyanotype mode).
// ---------------------------------------------------------------------------

export type RegisterKey = "paper" | "blueprint";

export interface Register {
  key: RegisterKey;
  label: string;
  blurb: string;
  ground: string;
  ink: string;
  accents: string[];
}

export const REGISTERS: Record<RegisterKey, Register> = {
  paper: {
    key: "paper",
    label: "Paper",
    blurb:
      "Cream ground, near-black ink, candy accents. Schematic drawings on warm paper — most things live here.",
    ground: COLOR.cream.hex,
    ink: COLOR.ink.hex,
    accents: [
      COLOR.orange.hex,
      COLOR.pink.hex,
      COLOR.sky.hex,
      COLOR.green.hex,
      COLOR.blueprint.hex,
      COLOR.coolGray.hex,
    ],
  },
  blueprint: {
    key: "blueprint",
    label: "Blueprint",
    blurb:
      "Deep ink ground, cream traces. The oscilloscope / cyanotype mode — for night flyers and heavier moods.",
    ground: COLOR.ink.hex,
    ink: COLOR.cream.hex,
    accents: [
      COLOR.pink.hex,
      COLOR.sky.hex,
      COLOR.green.hex,
      COLOR.orange.hex,
      COLOR.cream2.hex,
    ],
  },
};

// ---------------------------------------------------------------------------
// Grounds — any canon color can carry a whole composition (the exploration
// boards run cream, deep ink, orange, gray). Each ground knows its ink and
// which register's accent list it borrows.
// ---------------------------------------------------------------------------

export interface Ground {
  key: string;
  label: string;
  hex: string;
  ink: string; // text/logotype color on this ground
  register: RegisterKey; // accent list source
}

const g = (key: keyof typeof COLOR, ink: string, register: RegisterKey): Ground => ({
  key,
  label: COLOR[key].name,
  hex: COLOR[key].hex,
  ink,
  register,
});

export const GROUNDS: Ground[] = [
  g("cream", COLOR.ink.hex, "paper"),
  g("cream2", COLOR.ink.hex, "paper"),
  g("warmGray", COLOR.ink.hex, "paper"),
  g("orange", COLOR.cream.hex, "paper"),
  g("pink", COLOR.ink.hex, "paper"),
  g("sky", COLOR.ink.hex, "paper"),
  g("green", COLOR.ink.hex, "paper"),
  g("blueprint", COLOR.cream.hex, "blueprint"),
  g("ink", COLOR.cream.hex, "blueprint"),
];

// Rough relative luminance — used to pick readable text on accent chips.
export function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * gg + 0.114 * b < 140;
}

// ---------------------------------------------------------------------------
// Seasons — the vault's seasonal Line system, recolored through the deck
// palette. Structure constant, color variable, time marked by hue.
// ---------------------------------------------------------------------------

export interface Season {
  key: string;
  label: string;
  accent: string;
}

export const SEASONS: Season[] = [
  { key: "spring", label: "Spring", accent: COLOR.green.hex },
  { key: "summer", label: "Summer", accent: COLOR.pink.hex },
  { key: "autumn", label: "Autumn", accent: COLOR.orange.hex },
  { key: "winter", label: "Winter", accent: COLOR.sky.hex },
];

// ---------------------------------------------------------------------------
// Typography — the deck's system is Denim (semi-bold / regular) with Fira Code
// for numerals, urls, dates, times, and a soft chunky display face for the
// biggest headings. Fira Code is OFL and used verbatim. Denim and the display
// face are commercial: the tool ships the closest OFL stand-ins (Figtree;
// Fraunces black+soft for display) until licensing is decided.
// ---------------------------------------------------------------------------

export type TypeRole = "display" | "heading" | "body" | "mono";

export interface Face {
  name: string; // Google Fonts family
  weight: number;
  role: TypeRole;
  standInFor?: string;
}

export const FACES: Face[] = [
  { name: "Fraunces", weight: 900, role: "display", standInFor: "deck display (chunky soft slab)" },
  { name: "Figtree", weight: 600, role: "heading", standInFor: "Denim semi-bold" },
  { name: "Figtree", weight: 400, role: "body", standInFor: "Denim regular" },
  { name: "Fira Code", weight: 450, role: "mono" },
];

export const TYPE_RULES = {
  // Lockups set the wordmark in sentence case — "the Fold" — semi-bold sans.
  wordmark: { text: "the Fold", face: "Figtree", weight: 600, tracking: 0 },
  byRole: (role: TypeRole) => FACES.filter((f) => f.role === role),
};

// Fraunces variable axes for the display stand-in (goopy at black weights).
export const DISPLAY_FONT_CSS = `'Fraunces', serif`;

// ---------------------------------------------------------------------------
// The Line — sine wave motif: time, fabric, harmonic series, oscilloscope
// trace. Still canon; the deck's moodboard is full of it.
// ---------------------------------------------------------------------------

export const LINE_MOTIF = {
  blurb:
    "A sine wave: time made visible. Reads as harmonic series, oscilloscope trace, clothesline. Structure constant, color variable.",
  amplitude: { min: 0.02, max: 0.14, default: 0.06 },
  periods: { min: 1, max: 5, default: 2.5 },
  strokeWidth: { min: 1.5, max: 8, default: 3 },
};

// ---------------------------------------------------------------------------
// Hard "never" rules — vault + brief. Mostly enforced structurally.
// ---------------------------------------------------------------------------

export const AVOID = [
  "Literal laundry imagery",
  "Wi-Fi symbols and digital clichés",
  "Anything that reads as coworking / WeWork-after-discovering-plants",
  "Decorative wave spam — the Line is a motif, not wallpaper",
  "Unbroken sterile grids — the grid is present, but broken",
];

// ---------------------------------------------------------------------------
// Open questions — surfaced honestly so the draft never pretends more is
// decided than is.
// ---------------------------------------------------------------------------

export const OPEN_QUESTIONS = [
  "Type licensing: the deck specifies Denim (Displaay) and a commercial display face; lockups use Focal. The tool ships OFL stand-ins (Figtree, Fraunces) — buying licenses would let it use the real faces.",
  "Wordmark casing varies across lockups ('the Fold' / 'The Fold') — pick one.",
  "Ink #03071B (deck) vs blueprint blue #171D60 (lockup meshes) — the tool treats ink as text and blueprint as the mesh color; confirm.",
  "Seasonal color rotation: governance still undecided (who chooses, on what cycle).",
  "The May-era gilded gold-on-black exterior register and jewel palette: superseded by the deck system, or still alive for the physical sign?",
];

export const BRAND_SENTENCE =
  "Schematism ←→ bio-futurism: quilted space-time, analog algorithms — the grid is present, but broken.";
