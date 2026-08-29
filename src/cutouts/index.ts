// Sculpture cutouts — the concrete F-form renders from the boards, cut off
// their cream backgrounds so they composite cleanly over any ground, texture,
// or motif. Loaded from public/cutouts/ and cached as data URIs (same pipeline
// as the photo library) so one renderDoc() output serves preview and exports.

export interface Cutout {
  id: string;
  name: string;
  src: string; // data URI (empty until loaded)
  w: number;
  h: number;
}

export const CUTOUTS: Cutout[] = [];

export async function loadCutouts(onLoaded?: () => void) {
  try {
    const manifest: { id: string; name: string; file: string; w: number; h: number }[] = await (
      await fetch("cutouts/manifest.json")
    ).json();
    const loaded = await Promise.all(
      manifest.map(async (m) => {
        try {
          const blob = await (await fetch(`cutouts/${m.file}`)).blob();
          const src = await new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result as string);
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
          return { id: m.id, name: m.name, src, w: m.w, h: m.h };
        } catch {
          return null;
        }
      })
    );
    CUTOUTS.push(...loaded.filter((c): c is Cutout => !!c));
    onLoaded?.();
  } catch {
    // no cutouts on this deploy — the sculpt engine just renders nothing
  }
}
