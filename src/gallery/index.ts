// Community gallery — pure data layer over the localStorage-only gallery in
// ../state plus an optional shared backend (Cloudflare Worker + D1, see
// backend/). Mirrors the optional-backend pattern in ../photos/index.ts: when
// VITE_FOLD_API is unset, everything here degrades to local-only behavior
// with no thrown errors and no UI/DOM concerns.

import { type Doc, type GalleryItem, sanitize, loadGallery, saveToGallery, removeFromGallery } from "../state";

export interface MergedGalleryItem extends GalleryItem {
  source: "local" | "remote";
}

// Shape returned by the fold-commons-backend worker's GET /gallery (see
// backend/src/index.ts).
interface RemoteGalleryRow {
  id: string;
  name: string;
  maker: string | null;
  doc: unknown;
  created_at: string;
}

// Always includes local items. When VITE_FOLD_API is set, also fetches and
// merges remote gallery entries (sanitized, same as a decoded share link).
// Any fetch/parse failure silently falls back to local-only.
export async function fetchGalleryMerged(): Promise<MergedGalleryItem[]> {
  const local: MergedGalleryItem[] = loadGallery().map((i) => ({ ...i, source: "local" }));

  const base = import.meta.env.VITE_FOLD_API;
  if (!base) return local;

  try {
    const rows: RemoteGalleryRow[] = await (await fetch(`${base}/gallery`)).json();
    const remote: MergedGalleryItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      maker: row.maker ?? undefined,
      date: row.created_at.slice(0, 10),
      doc: sanitize(row.doc as Doc),
      source: "remote",
    }));
    return [...remote, ...local].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  } catch {
    return local;
  }
}

// Saves to the shared backend when VITE_FOLD_API is configured and the
// request succeeds; otherwise falls back to the existing local-only save.
// Never throws — the returned item's `source` tells the caller where it
// landed.
export async function saveGalleryItem(doc: Doc, name: string, maker?: string): Promise<MergedGalleryItem> {
  const base = import.meta.env.VITE_FOLD_API;
  if (base) {
    try {
      const res = await fetch(`${base}/gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, maker, doc }),
      });
      if (res.ok) {
        const row: RemoteGalleryRow = await res.json();
        return {
          id: row.id,
          name: row.name,
          maker: row.maker ?? undefined,
          date: row.created_at.slice(0, 10),
          doc: row.doc as Doc,
          source: "remote",
        };
      }
    } catch {
      // fall through to local save
    }
  }
  return { ...saveToGallery(doc, name, maker), source: "local" };
}

// Thin wrapper around state.ts's removeFromGallery — named clearly so a
// future caller in main.ts knows it only ever removes LOCAL items. Remote
// gallery entries have no public-facing delete path (DELETE /gallery/:id on
// the backend requires the moderation bearer token and is deliberately not
// wired into this frontend).
export function removeLocalGalleryItem(id: string): void {
  removeFromGallery(id);
}
