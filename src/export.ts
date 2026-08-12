// export.ts — SVG and PNG downloads. Exports embed the canon fonts as data
// URIs so files are self-contained wherever they land.

import { getEmbeddedFontCss } from "./brand/fonts";
import { renderDoc } from "./render";
import type { Doc } from "./state";

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const fileStem = (doc: Doc) =>
  `fold-${doc.template}-${(doc.name ?? "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export async function exportSvg(doc: Doc) {
  const fontCss = await getEmbeddedFontCss().catch(() => "");
  const svg = renderDoc(doc, { fontCss });
  download(`${fileStem(doc)}.svg`, new Blob([svg], { type: "image/svg+xml" }));
}

export async function exportPng(doc: Doc, scale = 2) {
  const fontCss = await getEmbeddedFontCss().catch(() => "");
  const svg = renderDoc(doc, { fontCss });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
    download(`${fileStem(doc)}.png`, blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
