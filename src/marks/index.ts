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

const MESHES = ["01", "02", "03", "04", "05", "06"];

export async function loadMarks(onLoaded?: () => void) {
  await Promise.all(
    MESHES.map(async (n) => {
      try {
        const text = await (await fetch(`marks/fold-mesh-${n}.svg`)).text();
        const viewBox = text.match(/viewBox="([^"]+)"/)?.[1];
        const inner = text.replace(/^[^>]*>/, "").replace(/<\/svg>\s*$/, "");
        if (!viewBox) return;
        MARKS.push({
          id: `mesh-${n}`,
          name: `Fold mesh ${Number(n)}`,
          viewBox,
          svg: `<g fill="none" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`,
        });
      } catch {
        // dev server without the asset — library just stays smaller
      }
    })
  );
  MARKS.sort((a, b) => a.id.localeCompare(b.id));
  onLoaded?.();
}

export const markById = (id: string) => MARKS.find((m) => m.id === id);
