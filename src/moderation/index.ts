// Moderation client — bearer-token-gated calls against the fold-commons
// backend, used only from the hidden #moderate and #feedback pages. Kept
// separate from ../photos/index.ts (the public-facing module) since this is
// the one place a token gets attached to a request; nothing here is called
// from the regular Make/Gallery/Canon views.

export interface PendingPhoto {
  id: string;
  name: string;
  url: string;
  w: number;
  h: number;
  submitter: string | null;
}

export interface FeedbackItem {
  id: string;
  kind: "bug" | "feature" | "other";
  text: string;
  name: string | null;
  context: string | null;
  status: "new" | "done";
  created_at: string;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

// Every call here returns a result tagged with ok/error rather than
// throwing, so the hidden pages can show "invalid token" inline instead of
// crashing on a 401.
export type ModResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function asResult<T>(res: Response): Promise<ModResult<T>> {
  if (res.status === 401) return { ok: false, error: "Invalid token." };
  if (!res.ok) return { ok: false, error: `Request failed (${res.status}).` };
  const data = res.status === 204 ? (undefined as T) : await res.json();
  return { ok: true, data };
}

export async function fetchPendingPhotos(base: string, token: string): Promise<ModResult<PendingPhoto[]>> {
  try {
    const res = await fetch(`${base}/photos/pending`, { headers: authHeaders(token) });
    return asResult(res);
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function approvePhoto(base: string, id: string, token: string): Promise<ModResult<void>> {
  try {
    const res = await fetch(`${base}/photos/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: authHeaders(token),
    });
    return asResult(res);
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function denyPhoto(base: string, id: string, token: string): Promise<ModResult<void>> {
  try {
    const res = await fetch(`${base}/photos/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    return asResult(res);
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function fetchFeedback(base: string, token: string): Promise<ModResult<FeedbackItem[]>> {
  try {
    const res = await fetch(`${base}/feedback`, { headers: authHeaders(token) });
    return asResult(res);
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function setFeedbackStatus(
  base: string,
  id: string,
  status: "new" | "done",
  token: string
): Promise<ModResult<void>> {
  try {
    const res = await fetch(`${base}/feedback/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return asResult(res);
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function deleteFeedback(base: string, id: string, token: string): Promise<ModResult<void>> {
  try {
    const res = await fetch(`${base}/feedback/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    return asResult(res);
  } catch {
    return { ok: false, error: "Network error." };
  }
}

// The bearer token itself: entered once by a team member into a hidden
// page's prompt, kept in localStorage, never shipped in bundled JS.
const TOKEN_KEY = "foldCommons.modToken";

export function loadModToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveModToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode etc — the operator will just be asked again next time
  }
}
