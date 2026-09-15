// Signature tuning log — a record of what a signature generation looked like
// and what the tuner thought of it. Hidden page only (#tune in main.ts).
//
// Local-first, like ../gallery/index.ts: every note always lands in
// localStorage so the page works with no backend at all, and when
// VITE_FOLD_API is set it's *also* posted to the shared D1 pool so the team's
// notes accumulate in one place. A failed post is not an error the tuner
// needs to see — the local copy is already saved either way.

export interface SigSample {
  id: string;
  seed: number;
  params: Record<string, number>;
  ground: string; // hex the sample was previewed on
  ink: string;
  comment: string;
  rating: "up" | "down" | "";
  createdAt: string;
}

// One row of the shared pool. Mirrors SigSample but carries the tuner's name
// and uses the backend's snake_case, since it comes straight from D1.
export interface RemoteSigSample {
  id: string;
  tuner: string | null;
  seed: number;
  params: Record<string, number>;
  ground: string;
  ink: string;
  comment: string | null;
  rating: "up" | "down" | "";
  created_at: string;
}

const KEY = "foldCommons.sigTuning.v1";

export function loadSamples(): SigSample[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(samples: SigSample[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(samples));
  } catch {
    // private mode etc — the note just won't stick around
  }
}

export function addSample(s: Omit<SigSample, "id" | "createdAt">): SigSample {
  const sample: SigSample = {
    ...s,
    id: Math.random().toString(36).slice(2, 10),
    createdAt: new Date().toISOString(),
  };
  const samples = loadSamples();
  samples.unshift(sample);
  save(samples);
  return sample;
}

export function removeSample(id: string) {
  save(loadSamples().filter((s) => s.id !== id));
}

export function exportSamplesJson(): string {
  return JSON.stringify(loadSamples(), null, 2);
}

// --- shared pool ---------------------------------------------------------

// Fire-and-forget: the caller has already saved locally, so a network failure
// here costs nothing but the shared copy. Returns whether it landed, for the
// small "synced / local only" hint on the page.
export async function pushSample(s: SigSample, tuner?: string): Promise<boolean> {
  const base = import.meta.env.VITE_FOLD_API;
  if (!base) return false;
  try {
    const res = await fetch(`${base}/tuning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seed: s.seed,
        params: s.params,
        ground: s.ground,
        ink: s.ink,
        comment: s.comment,
        rating: s.rating,
        tuner,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Moderator-only read of everyone's notes — same bearer token as #moderate
// and #feedback (see ../moderation/index.ts).
export async function fetchTeamSamples(
  base: string,
  token: string
): Promise<{ ok: true; data: RemoteSigSample[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base}/tuning`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return { ok: false, error: "Invalid token." };
    if (!res.ok) return { ok: false, error: `Request failed (${res.status}).` };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export async function deleteTeamSample(base: string, id: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/tuning/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
