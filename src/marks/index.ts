// The mark library. The six canonical wireframe fold meshes (extracted from
// the lockup files) load from public/marks/ at startup; hand-souled redraws of
// the Brand Jam sketches join them after the Figma pull. All marks draw with
// currentColor so the canon recolors them.

export interface Mark {
  id: string;
  name: string;
  viewBox: string;
  svg: string; // inner SVG markup, colored via currentColor
  placeholder?: boolean;
}

export const MARKS: Mark[] = [];

interface ManifestEntry {
  id: string;
  name: string;
  file: string;
  stroked?: boolean; // stroke-drawn (meshes) vs filled outlines (traced sketches)
}

const MANIFEST: ManifestEntry[] = [
  { id: "cootie-catcher", name: "Cootie catcher", file: "cootie-catcher.svg" },
  { id: "fold-script", name: "fold · hand script", file: "fold-script.svg" },
  { id: "tf-ligature", name: "TF ligature", file: "tf-ligature.svg" },
  ...["01", "02", "03", "04", "05", "06"].map((n) => ({
    id: `mesh-${n}`,
    name: `Fold mesh ${Number(n)}`,
    file: `fold-mesh-${n}.svg`,
    stroked: true,
  })),
];

export async function loadMarks(onLoaded?: () => void) {
  const loaded: Mark[] = [];
  await Promise.all(
    MANIFEST.map(async (m) => {
      try {
        const text = await (await fetch(`marks/${m.file}`)).text();
        const viewBox = text.match(/viewBox="([^"]+)"/)?.[1];
        const inner = text.replace(/^[^>]*>/, "").replace(/<\/svg>\s*$/, "");
        if (!viewBox) return;
        const wrap = m.stroked
          ? `<g fill="none" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
          : `<g fill="currentColor">${inner}</g>`;
        loaded.push({ id: m.id, name: m.name, viewBox, svg: wrap });
      } catch {
        // dev server without the asset — library just stays smaller
      }
    })
  );
  // manifest order, not fetch-completion order
  loaded.sort((a, b) => MANIFEST.findIndex((m) => m.id === a.id) - MANIFEST.findIndex((m) => m.id === b.id));
  MARKS.push(...loaded);
  onLoaded?.();
}

export const markById = (id: string) => MARKS.find((m) => m.id === id);
