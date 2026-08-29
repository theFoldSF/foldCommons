// Photo library — the Fold's own imagery from the boards, loaded from
// public/photos/ and cached as data URIs so the one renderDoc() output works
// everywhere (canvas preview, SVG export, PNG export) with no special-casing.
// Member uploads live on the doc itself as data URIs.

export interface Photo {
  id: string;
  name: string;
  src: string; // data URI
  w: number;
  h: number;
}

export const PHOTOS: Photo[] = [];

async function toDataUri(url: string): Promise<{ src: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const src = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    const dim = await imageSize(src);
    return { src, ...dim };
  } catch {
    return null;
  }
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 1, h: 1 });
    img.src = src;
  });
}

export async function loadPhotos(onLoaded?: () => void) {
  try {
    const manifest: { id: string; name: string; file: string }[] = await (
      await fetch("photos/manifest.json")
    ).json();
    const loaded = await Promise.all(
      manifest.map(async (m) => {
        const d = await toDataUri(`photos/${m.file}`);
        return d ? { id: m.id, name: m.name, ...d } : null;
      })
    );
    PHOTOS.push(...loaded.filter((p): p is Photo => !!p));
    onLoaded?.();
  } catch {
    // no library on this deploy — uploads still work
  }
}

export const photoById = (id: string) => PHOTOS.find((p) => p.id === id);

// Member upload: downscale to a sane size and re-encode as JPEG so docs and
// localStorage stay manageable.
export function readUpload(file: File): Promise<Photo> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * k);
        const h = Math.round(img.naturalHeight * k);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        res({ id: "upload", name: file.name, src: c.toDataURL("image/jpeg", 0.85), w, h });
      };
      img.onerror = rej;
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}
