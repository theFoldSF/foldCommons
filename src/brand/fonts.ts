// fonts.ts — load the canon faces (all OFL, via Google Fonts) for the UI, and
// inline them as data-URI @font-face rules at export time so downloaded SVG/PNG
// files are self-contained.

import { FACES } from "./tokens";

const css2Url = () =>
  "https://fonts.googleapis.com/css2?" +
  FACES.map((f) => `family=${f.name.replace(/ /g, "+")}:wght@${f.weight}`).join("&") +
  "&display=swap";

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
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      out = out.replaceAll(u, `data:font/woff2;base64,${b64}`);
    })
  );
  embeddedCss = out;
  return out;
}

export const fontFamilyCss = (name: string) => `'${name}', serif`;
