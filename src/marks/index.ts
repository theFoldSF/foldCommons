// The community mark library — the Fold's "dancing bears": hand-souled vector
// marks anyone can stamp, recolor (within canon), and remix. Finished redraws
// of the Brand Jam sketches (cudi catcher, fortune teller, …) land here after
// the Figma pull. Marks use currentColor so the canon palette recolors them.

export interface Mark {
  id: string;
  name: string;
  viewBox: string;
  svg: string; // inner SVG, stroke/fill via currentColor
  placeholder?: boolean;
}

// Hand-drawn wobble is deliberate — single-weight strokes, round caps,
// imperfect geometry. These two are placeholders holding the door open for
// the real sketch redraws.
export const MARKS: Mark[] = [
  {
    id: "fold-ribbon",
    name: "Fold ribbon",
    viewBox: "0 0 100 100",
    placeholder: true,
    svg: `<path d="M 12 68 C 18 44, 30 30, 45 32 C 62 34, 60 52, 47 55 C 36 57, 30 48, 38 41 C 50 31, 72 33, 82 45 C 90 55, 87 68, 76 72"
      fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 74 74 C 78 72, 82 71, 86 72" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>`,
  },
  {
    id: "time-knot",
    name: "Time knot",
    viewBox: "0 0 100 100",
    placeholder: true,
    svg: `<path d="M 10 50 C 22 38, 30 62, 42 50 C 54 38, 50 28, 42 32 C 34 36, 40 58, 56 54 C 70 50, 68 34, 78 40 C 86 45, 84 56, 90 52"
      fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="50" cy="76" r="3.5" fill="currentColor"/>`,
  },
];

export const markById = (id: string) => MARKS.find((m) => m.id === id);
