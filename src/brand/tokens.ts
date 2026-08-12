// tokens.ts — the canon. Single machine-readable source of truth for The Fold's
// brand, distilled from the May 2026 Creative Brief and the technosphere vault
// (02 Brand and Voice). Every color, face, and rule the tool can express comes
// from here — the guardrails are simply that the UI offers nothing else.
//
// status: DRAFT — several upstream decisions are still open; see OPEN_QUESTIONS.

// ---------------------------------------------------------------------------
// Brand registers — the dual system: gilded outside, jewel-bright within.
// ---------------------------------------------------------------------------

export type RegisterKey = "exterior" | "interior";

export interface Register {
  key: RegisterKey;
  label: string;
  blurb: string;
  ground: string; // page/canvas ground
  ink: string; // primary text color on that ground
  accents: string[]; // permitted accent colors in this register
}

export const REGISTERS: Record<RegisterKey, Register> = {
  exterior: {
    key: "exterior",
    label: "Exterior · gilded",
    blurb:
      "Street-facing authority: black ground, warm gold-leaf tones, typographic confidence. For official marks, signage, formal announcements.",
    ground: "#14130F",
    ink: "#E8C57A",
    accents: ["#C8973F", "#E8C57A", "#ECE6E4"],
  },
  interior: {
    key: "interior",
    label: "Interior · jewel",
    blurb:
      "Member-facing aliveness: warm cream ground, saturated jewel tones, seasonal color. For posters, cards, prompts, everything that breathes.",
    ground: "#ECE6E4",
    ink: "#171D60",
    accents: ["#ED591D", "#EEA541", "#73C49F", "#171D60", "#51225D", "#1DB1ED"],
  },
};

// ---------------------------------------------------------------------------
// Palettes — v1 (JessyKate, preferred) and v2 (Eileen, contrast adjustment).
// ---------------------------------------------------------------------------

export interface Swatch {
  name: string;
  hex: string;
}

export const PALETTES = {
  v1: {
    label: "JessyKate · preferred",
    swatches: [
      { name: "Orange", hex: "#ED591D" },
      { name: "Gold", hex: "#EEA541" },
      { name: "Green", hex: "#73C49F" },
      { name: "Deep blue", hex: "#171D60" },
    ] as Swatch[],
  },
  v2: {
    label: "Eileen · contrast",
    swatches: [
      { name: "Red-orange", hex: "#ED461D" },
      { name: "Golden", hex: "#F2B450" },
      { name: "Light green", hex: "#A8D39C" },
      { name: "Off-white", hex: "#ECE6E4" },
      { name: "Blue", hex: "#1DB1ED" },
      { name: "Purple", hex: "#51225D" },
    ] as Swatch[],
  },
};

// Every color the tool may ever emit. Guardrail: pickers enumerate this set
// (per active register); there is no free color input anywhere in the UI.
export const CANON_COLORS: Swatch[] = [
  ...PALETTES.v1.swatches,
  ...PALETTES.v2.swatches.filter((s) => !PALETTES.v1.swatches.some((t) => t.hex === s.hex)),
  { name: "Sign black", hex: "#14130F" },
  { name: "Gold leaf", hex: "#C8973F" },
  { name: "Gold leaf · high", hex: "#E8C57A" },
];

// ---------------------------------------------------------------------------
// Seasons — the Line stays constant, its color marks time.
// ---------------------------------------------------------------------------

export interface Season {
  key: string;
  label: string;
  accent: string;
  ground: string;
  ink: string;
}

export const SEASONS: Season[] = [
  { key: "spring", label: "Spring", accent: "#73C49F", ground: "#ECE6E4", ink: "#171D60" },
  { key: "summer", label: "Summer", accent: "#EEA541", ground: "#FBF4E9", ink: "#ED591D" },
  { key: "autumn", label: "Autumn", accent: "#ED591D", ground: "#F3E7DD", ink: "#51225D" },
  { key: "winter", label: "Winter", accent: "#1DB1ED", ground: "#EEF1F2", ink: "#171D60" },
];

// ---------------------------------------------------------------------------
// Typography — brasserie confidence, not startup deck. All faces are OFL
// (Google Fonts) so the public tool is licensed cleanly. The trial faces used
// in early lockups (Focal Maxi et al.) are NOT shippable — see OPEN_QUESTIONS.
// ---------------------------------------------------------------------------

export type TypeRole = "display" | "body" | "label";

export interface Face {
  name: string; // Google Fonts family name
  weight: number;
  role: TypeRole;
}

export const FACES: Face[] = [
  // Display — high-contrast, formal weight, warm.
  { name: "Fraunces", weight: 600, role: "display" },
  { name: "Instrument Serif", weight: 400, role: "display" },
  { name: "Marcellus", weight: 400, role: "display" },
  // Body — readable warmth.
  { name: "Spectral", weight: 400, role: "body" },
  { name: "Newsreader", weight: 400, role: "body" },
  // Label — small caps, wayfinding, diagram labels.
  { name: "Space Grotesk", weight: 500, role: "label" },
];

export const TYPE_RULES = {
  wordmark: {
    text: "THE FOLD",
    face: "Fraunces",
    weight: 600,
    tracking: 0.18, // em — all caps carries the weight of the sign
  },
  // Faces the picker offers per role. No other faces are expressible.
  byRole: (role: TypeRole) => FACES.filter((f) => f.role === role),
};

// ---------------------------------------------------------------------------
// The Line — recurring motif. A sine wave reading as time / fabric / season.
// ---------------------------------------------------------------------------

export const LINE_MOTIF = {
  blurb:
    "A sine wave: precise, generative, alive. Reads as time, fabric, clothesline, season — never literal laundry.",
  // Canonical parameter ranges; templates place it, members tune it within these.
  amplitude: { min: 0.02, max: 0.14, default: 0.06 }, // fraction of canvas height
  periods: { min: 1, max: 5, default: 2.5 },
  strokeWidth: { min: 1.5, max: 8, default: 3 },
};

// ---------------------------------------------------------------------------
// The avoid list — hard "never" rules, from the brief. The tool enforces most
// of these structurally (they simply aren't expressible); the rest are steward
// review guidance, shown on the guidelines page.
// ---------------------------------------------------------------------------

export const AVOID = [
  "Literal laundry imagery",
  "Wi-Fi symbols and digital clichés",
  "Anything that reads as coworking / WeWork-after-discovering-plants",
  "Rounded sans-serifs and generic geometric grotesques",
  "Copying the existing sign too literally",
  "Decorative wave spam — the Line is a motif, not wallpaper",
];

// ---------------------------------------------------------------------------
// Open questions — surfaced honestly in the tool so the draft never pretends
// more is decided than is. From Brand Open Questions.md.
// ---------------------------------------------------------------------------

export const OPEN_QUESTIONS = [
  "Final palette: v1 is 'working preferred' — the brand owner has not marked a final palette.",
  "Primary typeface: undecided. This draft uses OFL faces (Fraunces/Spectral); the trial faces in early lockups are unlicensed and cannot ship publicly.",
  "How literal 'the fold' should be in the mark: fabric, crease, gathering, digital connection.",
  "Whether the sine wave appears in the mark itself or only the supporting system.",
  "Seasonal rotation governance: who chooses the color, and on what cycle.",
  "Minimum contrast standard for accessibility.",
];

export const BRAND_SENTENCE =
  "A brand that lives between the formal and the alive: gilded on the outside, jewel-bright within.";
