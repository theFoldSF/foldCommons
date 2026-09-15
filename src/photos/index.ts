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
  lum?: Float32Array; // LUM_N×LUM_N mean-luminance grid (0..1), row-major
}

// Coarse luminance grid per photo — enough to ask "is the region under this
// element dark or light" without touching pixels at render time.
export const LUM_N = 16;

function luminanceGrid(img: HTMLImageElement): Float32Array | undefined {
  try {
    const c = document.createElement("canvas");
    c.width = LUM_N;
    c.height = LUM_N;
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, LUM_N, LUM_N);
    const data = ctx.getImageData(0, 0, LUM_N, LUM_N).data;
    const out = new Float32Array(LUM_N * LUM_N);
    for (let i = 0; i < out.length; i++) {
      const o = i * 4;
      out[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
    }
    return out;
  } catch {
    return undefined;
  }
}

// Mean luminance of the part of `photo` visible inside `sub`, when the photo
// cover-fits (preserveAspectRatio slice) the `slot` rect. 0 dark … 1 light;
// falls back to mid-grey when no grid is available.
export function photoRegionLum(
  photo: Photo,
  sub: { x: number; y: number; w: number; h: number },
  slot: { x: number; y: number; w: number; h: number }
): number {
  if (!photo.lum) return 0.5;
  const scale = Math.max(slot.w / photo.w, slot.h / photo.h);
  const dispW = photo.w * scale;
  const dispH = photo.h * scale;
  const offX = slot.x - (dispW - slot.w) / 2;
  const offY = slot.y - (dispH - slot.h) / 2;
  const u0 = Math.max(0, Math.min(1, (sub.x - offX) / dispW));
  const u1 = Math.max(0, Math.min(1, (sub.x + sub.w - offX) / dispW));
  const v0 = Math.max(0, Math.min(1, (sub.y - offY) / dispH));
  const v1 = Math.max(0, Math.min(1, (sub.y + sub.h - offY) / dispH));
  const i0 = Math.min(LUM_N - 1, Math.floor(u0 * LUM_N));
  const i1 = Math.max(i0, Math.min(LUM_N - 1, Math.ceil(u1 * LUM_N) - 1));
  const j0 = Math.min(LUM_N - 1, Math.floor(v0 * LUM_N));
  const j1 = Math.max(j0, Math.min(LUM_N - 1, Math.ceil(v1 * LUM_N) - 1));
  let sum = 0, n = 0;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      sum += photo.lum[j * LUM_N + i];
      n++;
    }
  return n ? sum / n : 0.5;
}

export const PHOTOS: Photo[] = [];

async function toDataUri(url: string): Promise<{ src: string; w: number; h: number; lum?: Float32Array } | null> {
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

function imageSize(src: string): Promise<{ w: number; h: number; lum?: Float32Array }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () =>
      res({ w: img.naturalWidth, h: img.naturalHeight, lum: luminanceGrid(img) });
    img.onerror = () => res({ w: 1, h: 1 });
    img.src = src;
  });
}

// Shape returned by the fold-commons-backend worker's GET /photos (see
// backend/src/index.ts). `url` is an absolute URL back to the worker's own
// GET /photos/:id route, so we can fetch bytes straight from it.
interface RemotePhotoMeta {
  id: string;
  name: string;
  url: string;
  w: number;
  h: number;
}

// Optional community backend (Cloudflare Worker + R2, see backend/). When
// VITE_FOLD_API is unset, this is a no-op and the app behaves exactly as
// it did with only the bundled manifest.
async function loadRemotePhotos(): Promise<Photo[]> {
  const base = import.meta.env.VITE_FOLD_API;
  if (!base) return [];
  try {
    const metas: RemotePhotoMeta[] = await (await fetch(`${base}/photos`)).json();
    const loaded = await Promise.all(
      metas.map(async (m) => {
        // `url` is already absolute (points at the worker itself).
        const d = await toDataUri(m.url);
        return d ? { id: m.id, name: m.name, ...d } : null;
      })
    );
    return loaded.filter((p): p is Photo => !!p);
  } catch {
    return [];
  }
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
  } catch {
    // no bundled library on this deploy — uploads still work
  }

  // Remote photos are additive: merge in anything from the backend, keeping
  // bundled ids authoritative on collision (skip rather than overwrite, so
  // a same-named remote upload never silently replaces a bundled photo).
  const existingIds = new Set(PHOTOS.map((p) => p.id));
  const remote = await loadRemotePhotos();
  for (const p of remote) {
    if (existingIds.has(p.id)) continue;
    existingIds.add(p.id);
    PHOTOS.push(p);
  }

  onLoaded?.();
}

export const photoById = (id: string) => PHOTOS.find((p) => p.id === id);

// Submit a photo into the shared house library, pending design-team
// approval — separate from a member's own doc-only upload (comp.upload).
// No-ops when there's no backend configured (VITE_FOLD_API unset), same
// guard loadRemotePhotos() uses; the caller is expected to hide the entry
// point entirely in that case.
export async function submitPhoto(file: File, submitterName?: string): Promise<{ ok: boolean }> {
  const base = import.meta.env.VITE_FOLD_API;
  if (!base) return { ok: false };
  try {
    const downscaled = await readUpload(file);
    const blob = await (await fetch(downscaled.src)).blob();
    const form = new FormData();
    form.append("file", blob, file.name);
    form.append("name", file.name);
    form.append("w", String(downscaled.w));
    form.append("h", String(downscaled.h));
    if (submitterName?.trim()) form.append("submitter", submitterName.trim());
    const res = await fetch(`${base}/photos/submit`, { method: "POST", body: form });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

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
