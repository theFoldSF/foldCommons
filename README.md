# Fold Commons

The Fold's community design tool: anyone at The Fold can compose event flyers,
Instagram stories/posts, diagrams, and sticker sheets — and everything that
comes out is on-brand by construction, because the tool can only express the
canon: brand palettes, registers, faces, motifs, and guarded template layouts.

Community ownership, Grateful Dead style: the marks and motifs belong to
everyone; compositions can be saved, shared as remixable links, and re-mixed by
anyone — while the canon itself stays steward-curated.

## How the guardrails work

- **A composition is only canon references** — template ids, accent indexes,
  engine seeds/params, and your words. There is no free color input, no free
  font input, no freeform layout. Off-brand output isn't forbidden; it's
  inexpressible.
- **Two registers**: paper (warm cream, ink, candy accents) and blueprint
  (deep ink ground, cream traces). Switching registers re-restricts every
  color chip. The canon is the fold-brand Figma deck's system: creams
  #FFF9F1/#F8F3EC/#E8E4E1, ink #03071B, accents #FA6F2E/#FCA4EE/#88DCE9/#71D599.
- **The Line**: the sine-wave motif is placed by each template; members tune it
  within canonical ranges. Its color follows the season — structure constant,
  color variable.
- **Generative motifs**: parametric mark engines absorbed from
  [the-fold-brand-studio](https://github.com/parametricpod/the-fold-brand-studio),
  deterministic by seed so shared links reproduce exactly.

## Develop

```bash
bun install
bun run dev        # local dev server
bun run build      # production build → dist/
```

## Pull brand assets from Figma

Requires `FIGMA_TOKEN` in env or a `.env` (here or one directory up):

```bash
bun run figma:inventory   # list every node in the brand + jam boards
bun run figma:pull        # export frames/sketches to assets/figma/
```

## Deploy

Static output, deployed on Vercel (`vercel.json` is set up; `vercel --prod`).

## Status

Draft deliverable. Open brand decisions (type licensing, wordmark casing,
seasonal governance) are tracked on the in-app **Canon** page. The deck's type
system is Denim + Fira Code + a chunky display face; Fira Code (OFL) is used
verbatim. Denim is chosen and under trial evaluation locally — Figtree (OFL)
is the stand-in that actually ships until a license is purchased. The display
face is still unpicked, so that role just uses the heaviest text weight. The mark library holds the six wireframe fold meshes extracted
from the lockups; hand-souled redraws of the Brand Jam sketches (cudi catcher,
fortune teller, …) join them after the FigJam pull.
