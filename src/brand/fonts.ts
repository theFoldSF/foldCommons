// fonts.ts — load the canon faces (all OFL, via Google Fonts) for the UI, and
// inline them as data-URI @font-face rules at export time so downloaded SVG/PNG
// files are self-contained.

import { FACES } from "./tokens";

// Self-hosted faces, inlined into exports alongside the Google ones. Absent in
// any build without these files, where fetch() 404s and the entry is dropped —
// exports then carry Figtree, exactly as the screen does.
const LOCAL_FONT_FILES: { family: string; weight: number; url: string }[] = [
  { family: "Denim", weight: 400, url: "/fonts/denim-trial/Denim-TRIAL-Regular.woff2" },
  { family: "Denim", weight: 600, url: "/fonts/denim-trial/Denim-TRIAL-SemiBold.woff2" },
];

// Group faces by family so multi-weight families make one valid css2 query.
function css2Url(): string {
  const byFamily = new Map<string, Set<number>>();
  for (const f of FACES.filter((f) => !f.local)) {
    if (!byFamily.has(f.name)) byFamily.set(f.name, new Set());
    byFamily.get(f.name)!.add(Math.round(f.weight));
  }
  const parts = [...byFamily.entries()].map(
    ([name, weights]) =>
      `family=${name.replace(/ /g, "+")}:wght@${[...weights].sort((a, b) => a - b).join(";")}`
  );
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

export function loadFonts() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = css2Url();
  document.head.appendChild(link);
  loadTrialFaces();
}

// Denim is self-hosted from public/fonts/denim-trial/ rather than fetched from
// Google, so it needs its own @font-face rules. They are injected here instead
// of living in styles.css so the file list stays in one place next to the
// export-embedding path that reads the same array.
//
// The files are gitignored on purpose: they are trial-licensed and deploys run
// from the one machine that holds them, so they never enter the repo or a
// teammate's checkout. A build without them still works — the CSS stacks name
// Figtree directly behind Denim.
function loadTrialFaces() {
  const css = LOCAL_FONT_FILES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url('${f.url}') format('woff2');}`
  ).join("");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

// --- export-time embedding ---------------------------------------------------

let embeddedCss: string | null = null;

// Fetch the Google Fonts css, then fetch each woff2 and inline it as a data URI.
// fonts.gstatic.com and fonts.googleapis.com both send permissive CORS headers.
export async function getEmbeddedFontCss(): Promise<string> {
  if (embeddedCss) return embeddedCss;
  const css = await (await fetch(css2Url())).text();
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((m) => m[1]))];
  let out = css;
  await Promise.all(
    urls.map(async (u) => {
      const buf = await (await fetch(u)).arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      out = out.replaceAll(u, `data:font/woff2;base64,${btoa(bin)}`);
    })
  );
  embeddedCss = (await localFontCss()) + out;
  return embeddedCss;
}

// Denim (Displaay) is the canon text face; Figtree is the OFL stand-in. Both
// names resolve to the same stack so a caller never has to know which one is
// actually present — where the trial files are missing, Figtree renders.
const TEXT_STACK = `'Denim', 'Figtree', sans-serif`;

export const fontFamilyCss = (name: string) =>
  name === "Fira Code"
    ? `'Fira Code', monospace`
    : name === "Denim" || name === "Figtree"
      ? TEXT_STACK
      : `'${name}', sans-serif`;

async function localFontCss(): Promise<string> {
  const rules = await Promise.all(
    LOCAL_FONT_FILES.map(async (f) => {
      try {
        const res = await fetch(f.url);
        if (!res.ok) return "";
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
      } catch {
        return "";
      }
    })
  );
  return rules.join("");
}
