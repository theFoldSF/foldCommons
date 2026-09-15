// Team palettes — the data layer behind the #palette tuner and the picker
// under Ground in the left panel.
//
// Unlike the gallery this is remote-only: a palette exists to be shared with
// the team, so with no VITE_FOLD_API there is nothing to list and the entry
// points simply don't render (same degradation as ../feedback/index.ts).
//
// Writes are open — any teammate can save a palette without holding the
// moderation secret. Editing or deleting one needs its `edit_key`, handed out
// once on create and kept in that browser, so an author can prune their own
// work and nobody else's.

import type { Palette } from "../brand/tokens";

export interface TeamPalette {
  id: string;
  name: string;
  maker: string | null;
  colors: Palette;
  created_at: string;
}

const KEYS_STORE = "foldCommons.paletteKeys.v1";

// id -> edit_key for palettes made in this browser.
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
    // private mode — this browser just loses the ability to edit its own
    // palettes later; the palettes themselves are safely on the backend.
  }
}

export function editKeyFor(id: string): string | undefined {
  return loadKeys()[id];
}

/** True when this browser can edit/delete the given palette. */
export function canEdit(id: string): boolean {
  return !!editKeyFor(id);
}

export function apiBase(): string | undefined {
  return import.meta.env.VITE_FOLD_API;
}

export async function listPalettes(): Promise<TeamPalette[]> {
  const base = apiBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/palettes`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function createPalette(
  name: string,
  colors: Palette,
  maker?: string
): Promise<TeamPalette | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/palettes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, colors, maker }),
    });
    if (!res.ok) return null;
    const row = await res.json();
    // edit_key comes back exactly once — stash it, then keep it out of the
    // object the rest of the app passes around.
    if (row.edit_key) saveKeys({ ...loadKeys(), [row.id]: row.edit_key });
    delete row.edit_key;
    return row;
  } catch {
    return null;
  }
}

export async function updatePalette(id: string, name: string, colors: Palette): Promise<boolean> {
  const base = apiBase();
  const key = editKeyFor(id);
  if (!base || !key) return false;
  try {
    const res = await fetch(`${base}/palettes/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, colors }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deletePalette(id: string): Promise<boolean> {
  const base = apiBase();
  const key = editKeyFor(id);
  if (!base || !key) return false;
  try {
    const res = await fetch(`${base}/palettes/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
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
