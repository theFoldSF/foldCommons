// fonts.ts — load the canon faces (all OFL, via Google Fonts) for the UI, and
// inline them as data-URI @font-face rules at export time so downloaded SVG/PNG
// files are self-contained.

import { FACES } from "./tokens";

// Group faces by family so multi-weight families make one valid css2 query.
function css2Url(): string {
  const byFamily = new Map<string, Set<number>>();
  for (const f of FACES) {
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
  embeddedCss = out;
  return out;
}

export const fontFamilyCss = (name: string) =>
  name === "Fira Code" ? `'Fira Code', monospace` : name === "Fraunces" ? `'Fraunces', serif` : `'${name}', sans-serif`;
