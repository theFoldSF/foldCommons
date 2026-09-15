// Gallery critique — comments on a saved piece, optionally pinned to a spot on
// the asset itself, so "this chip is fighting the title" lands on the chip
// rather than in a paragraph describing where to look.
//
// Remote-only, like ../palettes/index.ts: a critique nobody else can read is
// pointless, so with no VITE_FOLD_API the comment UI simply isn't offered.
// Writing is open (any teammate can critique without the moderation secret);
// deleting needs the edit_key handed back on create, kept in that browser.

export type Verdict = "good" | "bad" | "note";

export interface GalleryComment {
  id: string;
  gallery_id: string;
  text: string;
  author: string | null;
  verdict: Verdict;
  // Normalized 0..1 on the asset, or null for a comment about the whole piece.
  // Normalized rather than pixel coords so a pin holds wherever the piece is
  // re-rendered — thumbnail, detail view, or a different template size.
  x: number | null;
  y: number | null;
  created_at: string;
}

const KEYS_STORE = "foldCommons.commentKeys.v1";

function loadKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORE) ?? "{}");
  } catch {
    return {};
  }
}

function saveKeys(keys: Record<string, string>) {
  try {
    localStorage.setItem(KEYS_STORE, JSON.stringify(keys));
  } catch {
    // private mode — this browser loses the ability to delete its own
    // comments later; the comments themselves are safe on the backend.
  }
}

export function canDeleteComment(id: string): boolean {
  return !!loadKeys()[id];
}

function base(): string | undefined {
  return import.meta.env.VITE_FOLD_API;
}

/** Comments are a backend feature; without one there is nothing to show. */
export function commentsAvailable(): boolean {
  return !!base();
}

export async function listComments(galleryId: string): Promise<GalleryComment[]> {
  const b = base();
  if (!b) return [];
  try {
    const res = await fetch(`${b}/gallery/${encodeURIComponent(galleryId)}/comments`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function addComment(
  galleryId: string,
  text: string,
  verdict: Verdict,
  author?: string,
  pin?: { x: number; y: number } | null
): Promise<GalleryComment | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}/gallery/${encodeURIComponent(galleryId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, verdict, author, x: pin?.x, y: pin?.y }),
    });
    if (!res.ok) return null;
    const row = await res.json();
    if (row.edit_key) saveKeys({ ...loadKeys(), [row.id]: row.edit_key });
    delete row.edit_key;
    return row;
  } catch {
    return null;
  }
}

export async function deleteComment(galleryId: string, id: string): Promise<boolean> {
  const b = base();
  const key = loadKeys()[id];
  if (!b || !key) return false;
  try {
    const res = await fetch(
      `${b}/gallery/${encodeURIComponent(galleryId)}/comments/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const keys = loadKeys();
      delete keys[id];
      saveKeys(keys);
    }
    return res.ok;
  } catch {
    return false;
  }
}

/** Summary for a gallery card: how the team has judged this piece so far. */
export function summarize(comments: GalleryComment[]): { good: number; bad: number; total: number } {
  let good = 0;
  let bad = 0;
  for (const c of comments) {
    if (c.verdict === "good") good++;
    else if (c.verdict === "bad") bad++;
  }
  return { good, bad, total: comments.length };
}
