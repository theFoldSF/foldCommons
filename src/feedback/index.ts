// Bug report / feature request inbox — public submission side. Degrades
// like ../photos/index.ts's loadRemotePhotos: with no VITE_FOLD_API there's
// nowhere to send this, so main.ts simply doesn't render the entry point.

export type FeedbackKind = "bug" | "feature" | "other";

export async function submitFeedback(
  kind: FeedbackKind,
  text: string,
  name?: string
): Promise<{ ok: boolean }> {
  const base = import.meta.env.VITE_FOLD_API;
  if (!base) return { ok: false };
  try {
    const res = await fetch(`${base}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, text, name, context: location.hash || location.pathname }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
