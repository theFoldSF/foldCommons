// fold-commons-backend — a minimal Cloudflare Worker fronting an R2 bucket
// of community photos, a D1-backed community gallery, and a D1-backed
// feedback inbox.
//
// Routes:
//   GET    /photos             -> [{ id, name, url, w, h }, ...] (approved only)
//   POST   /photos             -> create one, pre-approved (bearer-token guarded)
//   POST   /photos/submit      -> submit one for moderation (public, no auth)
//   GET    /photos/pending     -> list submissions awaiting review (bearer-token guarded)
//   POST   /photos/:id/approve -> approve a pending submission (bearer-token guarded)
//   GET    /photos/:id         -> raw image bytes
//   DELETE /photos/:id         -> remove one (approved or pending) (bearer-token guarded)
//   GET    /gallery            -> [{ id, name, maker, doc, created_at }, ...]
//   POST   /gallery            -> create one entry
//   DELETE /gallery/:id        -> remove one entry (bearer-token guarded)
//   POST   /feedback           -> submit a bug report / feature request (public, no auth)
//   GET    /feedback           -> list reports, newest first (bearer-token guarded)
//   PATCH  /feedback/:id       -> update a report's status (bearer-token guarded)
//   DELETE /feedback/:id       -> remove a report (bearer-token guarded)
//   POST   /tuning             -> log a signature tuning sample (public, no auth)
//   GET    /tuning             -> list pooled tuning samples (bearer-token guarded)
//   DELETE /tuning/:id         -> remove a tuning sample (bearer-token guarded)
//   GET    /palettes           -> list team palettes (public)
//   POST   /palettes           -> save one (public); returns a one-time edit_key
//   PUT    /palettes/:id       -> update one (edit_key or bearer token)
//   DELETE /palettes/:id       -> remove one (edit_key or bearer token)
//   GET    /gallery/:id/comments      -> list comments on a piece (public)
//   POST   /gallery/:id/comments      -> add one (public); returns edit_key
//   DELETE /gallery/:id/comments/:cid -> remove one (edit_key or bearer token)
//   OPTIONS *                   -> CORS preflight
//
// See ../README.md for deploy steps.

export interface Env {
  PHOTOS_BUCKET: R2Bucket;
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  UPLOAD_TOKEN: string;
}

interface PhotoMeta {
  id: string;
  name: string;
  url: string;
  w: number;
  h: number;
}

interface GalleryRow {
  id: string;
  name: string;
  maker: string | null;
  doc: string;
  created_at: string;
}

interface FeedbackRow {
  id: string;
  kind: string;
  text: string;
  name: string | null;
  context: string | null;
  status: string;
  created_at: string;
}

interface GalleryCommentRow {
  id: string;
  gallery_id: string;
  text: string;
  author: string | null;
  verdict: string;
  x: number | null;
  y: number | null;
  created_at: string;
}

interface PaletteRow {
  id: string;
  name: string;
  maker: string | null;
  colors: string;
  created_at: string;
}

interface SigSampleRow {
  id: string;
  tuner: string | null;
  seed: number;
  params: string;
  ground: string;
  ink: string;
  comment: string | null;
  rating: string;
  created_at: string;
}

// ALLOWED_ORIGIN is a comma-separated list of exact origins, each of which
// may contain `*` wildcards — "https://fold-commons-*.vercel.app" covers
// Vercel preview deployments, whose URLs carry a per-deployment hash.
//
// A wildcard matches only [A-Za-z0-9-], never a dot, so it cannot cross a
// domain-label boundary: "https://fold-commons-*.vercel.app" will not match
// "https://fold-commons-anything.attacker.com".
function originMatches(pattern: string, origin: string): boolean {
  if (pattern === "*" || pattern === origin) return true;
  if (!pattern.includes("*")) return false;
  const rx = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[A-Za-z0-9-]*");
  return new RegExp(`^${rx}$`).test(origin);
}

// Echo back the caller's own origin when it is allowed, rather than a fixed
// string — a single Access-Control-Allow-Origin value cannot cover both the
// production domain and the preview deployments at once.
function resolveAllowedOrigin(request: Request, env: Env): string {
  const patterns = (env.ALLOWED_ORIGIN || "*")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (patterns.includes("*")) return "*";
  const origin = request.headers.get("Origin");
  // No Origin header at all (curl, server-to-server) — nothing to match
  // against, so fall back to the canonical production origin.
  if (!origin) return patterns[0] ?? "*";
  return patterns.some((p) => originMatches(p, origin)) ? origin : patterns[0] ?? "*";
}

function corsHeaders(env: Env, request: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(request, env),
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    // The response varies per caller now, so caches must key on Origin.
    Vary: "Origin",
  };
}

// Shared bearer-token guard: every moderation-only route (design-team photo
// uploads, pending-photo review, gallery/feedback deletes, feedback status
// updates) uses this same comparison against env.UPLOAD_TOKEN.
function isAuthorized(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization") || "";
  return !!env.UPLOAD_TOKEN && authHeader === `Bearer ${env.UPLOAD_TOKEN}`;
}

// CORS is not applied here — the fetch handler decorates every outgoing
// response in one place, so handlers never have to think about it.
function json(data: unknown, env: Env, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

// Turn an R2Object's stored custom metadata into the {id, name, url, w, h}
// shape the frontend expects. `origin` is this worker's own origin, so
// `url` is a path the app can fetch straight through this worker
// (`${origin}${url}`, or just `url` if the caller is already at that origin).
function toPhotoMeta(key: string, customMetadata: Record<string, string> | undefined, origin: string): PhotoMeta {
  return {
    id: key,
    name: customMetadata?.name ?? key,
    url: `${origin}/photos/${encodeURIComponent(key)}`,
    w: Number(customMetadata?.w ?? 0) || 0,
    h: Number(customMetadata?.h ?? 0) || 0,
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "") // strip extension
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = crypto.randomUUID().slice(0, 8);
  return base ? `${base}-${suffix}` : suffix;
}

// R2 objects with no `status` custom metadata predate moderation entirely —
// treated as approved so nothing already in the bucket disappears.
function photoStatus(customMetadata: Record<string, string> | undefined): "approved" | "pending" {
  return customMetadata?.status === "pending" ? "pending" : "approved";
}

const MAX_PHOTO_SUBMIT_BYTES = 8_000_000;

interface ParsedUpload {
  bytes: ArrayBuffer;
  contentType: string;
  name: string;
  w: number;
  h: number;
  submitter?: string;
}

// Shared body parsing for POST /photos and POST /photos/submit: either
// multipart/form-data (`file` field, optional `name`/`w`/`h`/`submitter`) or
// a raw body with `?name=&w=&h=&submitter=` query params.
async function parseUploadBody(request: Request): Promise<ParsedUpload | null> {
  const url = new URL(request.url);
  let bytes: ArrayBuffer;
  let contentType = "application/octet-stream";
  let name = url.searchParams.get("name") || "untitled";
  let w = Number(url.searchParams.get("w") || 0) || 0;
  let h = Number(url.searchParams.get("h") || 0) || 0;
  let submitter = url.searchParams.get("submitter")?.trim() || undefined;

  const ct = request.headers.get("Content-Type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return null;
    bytes = await file.arrayBuffer();
    contentType = file.type || contentType;
    const formName = form.get("name");
    name = typeof formName === "string" && formName ? formName : file.name || name;
    const formW = form.get("w");
    const formH = form.get("h");
    if (typeof formW === "string" && formW) w = Number(formW) || 0;
    if (typeof formH === "string" && formH) h = Number(formH) || 0;
    const formSubmitter = form.get("submitter");
    if (typeof formSubmitter === "string" && formSubmitter.trim()) submitter = formSubmitter.trim();
  } else {
    bytes = await request.arrayBuffer();
    contentType = ct || contentType;
  }

  if (!bytes || bytes.byteLength === 0) return null;
  return { bytes, contentType, name, w, h, submitter };
}

async function listPhotos(env: Env, origin: string): Promise<Response> {
  const objects: PhotoMeta[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.PHOTOS_BUCKET.list({ include: ["customMetadata"], cursor });
    for (const obj of page.objects) {
      if (photoStatus(obj.customMetadata) === "pending") continue;
      objects.push(toPhotoMeta(obj.key, obj.customMetadata, origin));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json(objects, env);
}

async function listPendingPhotos(env: Env, origin: string): Promise<Response> {
  const objects: (PhotoMeta & { submitter: string | null })[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.PHOTOS_BUCKET.list({ include: ["customMetadata"], cursor });
    for (const obj of page.objects) {
      if (photoStatus(obj.customMetadata) !== "pending") continue;
      objects.push({
        ...toPhotoMeta(obj.key, obj.customMetadata, origin),
        submitter: obj.customMetadata?.submitter ?? null,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json(objects, env);
}

// Design-team direct add — pre-approved, same as before moderation existed.
async function uploadPhoto(request: Request, env: Env, origin: string): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, env, { status: 401 });
  }
  const parsed = await parseUploadBody(request);
  if (!parsed) {
    return json({ error: "Missing or empty 'file'" }, env, { status: 400 });
  }
  const id = slugify(parsed.name);
  const customMetadata: Record<string, string> = {
    name: parsed.name,
    w: String(parsed.w),
    h: String(parsed.h),
    status: "approved",
  };
  await env.PHOTOS_BUCKET.put(id, parsed.bytes, {
    httpMetadata: { contentType: parsed.contentType },
    customMetadata,
  });
  return json(toPhotoMeta(id, customMetadata, origin), env, { status: 201 });
}

// Public submission path — always lands as "pending"; only shows up in
// GET /photos (or the live library) once a moderator approves it.
async function submitPhoto(request: Request, env: Env): Promise<Response> {
  const parsed = await parseUploadBody(request);
  if (!parsed) {
    return json({ error: "Missing or empty 'file'" }, env, { status: 400 });
  }
  if (parsed.bytes.byteLength > MAX_PHOTO_SUBMIT_BYTES) {
    return json({ error: `File exceeds the ${MAX_PHOTO_SUBMIT_BYTES}-byte limit` }, env, { status: 400 });
  }
  const id = slugify(parsed.name);
  const customMetadata: Record<string, string> = {
    name: parsed.name,
    w: String(parsed.w),
    h: String(parsed.h),
    status: "pending",
  };
  if (parsed.submitter) customMetadata.submitter = parsed.submitter;
  await env.PHOTOS_BUCKET.put(id, parsed.bytes, {
    httpMetadata: { contentType: parsed.contentType },
    customMetadata,
  });
  return json({ id, status: "pending" }, env, { status: 201 });
}

async function approvePhoto(id: string, env: Env, origin: string): Promise<Response> {
  const obj = await env.PHOTOS_BUCKET.get(id);
  if (!obj) {
    return json({ error: "Not found" }, env, { status: 404 });
  }
  const bytes = await obj.arrayBuffer();
  const customMetadata: Record<string, string> = { ...(obj.customMetadata ?? {}), status: "approved" };
  await env.PHOTOS_BUCKET.put(id, bytes, {
    httpMetadata: obj.httpMetadata,
    customMetadata,
  });
  return json(toPhotoMeta(id, customMetadata, origin), env);
}

async function deletePhoto(id: string, request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, env, { status: 401 });
  }
  const obj = await env.PHOTOS_BUCKET.head(id);
  if (!obj) {
    return json({ error: "Not found" }, env, { status: 404 });
  }
  await env.PHOTOS_BUCKET.delete(id);
  return new Response(null, { status: 204 });
}

async function getPhoto(id: string, env: Env): Promise<Response> {
  const object = await env.PHOTOS_BUCKET.get(id);
  if (!object) {
    return json({ error: "Not found" }, env, { status: 404 });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

const MAX_GALLERY_NAME_LEN = 120;
const MAX_GALLERY_DOC_BYTES = 100_000;

function toGalleryItem(row: GalleryRow): { id: string; name: string; maker: string | null; doc: unknown; created_at: string } {
  return {
    id: row.id,
    name: row.name,
    maker: row.maker,
    doc: JSON.parse(row.doc),
    created_at: row.created_at,
  };
}

async function listGallery(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, maker, doc, created_at FROM gallery ORDER BY created_at DESC LIMIT 200"
  ).all<GalleryRow>();
  return json((results ?? []).map(toGalleryItem), env);
}

async function createGalleryItem(request: Request, env: Env): Promise<Response> {
  let body: { name?: unknown; maker?: unknown; doc?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, env, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_GALLERY_NAME_LEN) {
    return json({ error: `'name' must be a non-empty string up to ${MAX_GALLERY_NAME_LEN} characters` }, env, {
      status: 400,
    });
  }

  const maker = typeof body.maker === "string" && body.maker.trim() ? body.maker.trim() : null;

  if (body.doc === undefined || body.doc === null || typeof body.doc !== "object") {
    return json({ error: "'doc' is required and must be an object" }, env, { status: 400 });
  }
  const docJson = JSON.stringify(body.doc);
  if (docJson.length > MAX_GALLERY_DOC_BYTES) {
    return json({ error: `'doc' exceeds the ${MAX_GALLERY_DOC_BYTES}-byte limit` }, env, { status: 400 });
  }

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  await env.DB.prepare("INSERT INTO gallery (id, name, maker, doc, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, name, maker, docJson, created_at)
    .run();

  return json(toGalleryItem({ id, name, maker, doc: docJson, created_at }), env, { status: 201 });
}

async function deleteGalleryItem(id: string, request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, env, { status: 401 });
  }
  const { meta } = await env.DB.prepare("DELETE FROM gallery WHERE id = ?").bind(id).run();
  if (!meta.changes) {
    return json({ error: "Not found" }, env, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

const MAX_FEEDBACK_TEXT_LEN = 4000;
const MAX_FEEDBACK_NAME_LEN = 120;
const MAX_FEEDBACK_CONTEXT_LEN = 500;
const FEEDBACK_KINDS = ["bug", "feature", "other"];

async function submitFeedback(request: Request, env: Env): Promise<Response> {
  let body: { kind?: unknown; text?: unknown; name?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, env, { status: 400 });
  }

  const kind = typeof body.kind === "string" && FEEDBACK_KINDS.includes(body.kind) ? body.kind : "other";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_FEEDBACK_TEXT_LEN) {
    return json({ error: `'text' must be a non-empty string up to ${MAX_FEEDBACK_TEXT_LEN} characters` }, env, {
      status: 400,
    });
  }
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, MAX_FEEDBACK_NAME_LEN) : null;
  const context =
    typeof body.context === "string" && body.context.trim()
      ? body.context.trim().slice(0, MAX_FEEDBACK_CONTEXT_LEN)
      : null;

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO feedback (id, kind, text, name, context, status, created_at) VALUES (?, ?, ?, ?, ?, 'new', ?)"
  )
    .bind(id, kind, text, name, context, created_at)
    .run();

  return json({ id, kind, text, name, context, status: "new", created_at }, env, { status: 201 });
}

async function listFeedback(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, kind, text, name, context, status, created_at FROM feedback ORDER BY created_at DESC LIMIT 200"
  ).all<FeedbackRow>();
  return json(results ?? [], env);
}

async function updateFeedbackStatus(id: string, request: Request, env: Env): Promise<Response> {
  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, env, { status: 400 });
  }
  const status = body.status === "done" ? "done" : body.status === "new" ? "new" : null;
  if (!status) {
    return json({ error: "'status' must be 'new' or 'done'" }, env, { status: 400 });
  }
  const { meta } = await env.DB.prepare("UPDATE feedback SET status = ? WHERE id = ?").bind(status, id).run();
  if (!meta.changes) {
    return json({ error: "Not found" }, env, { status: 404 });
  }
  return json({ id, status }, env);
}

async function deleteFeedbackItem(id: string, env: Env): Promise<Response> {
  const { meta } = await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
  if (!meta.changes) {
    return json({ error: "Not found" }, env, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

const MAX_SIG_COMMENT_LEN = 2000;
const MAX_SIG_TUNER_LEN = 120;
const MAX_SIG_PARAMS_LEN = 4000;
const SIG_RATINGS = ["up", "down", ""];

// The tuning log's shareable half. Teammates POST here with no token (the
// #tune page is hidden but unauthenticated, same as the public feedback
// form); only a moderator can read the pool back or prune it.
async function submitSigSample(request: Request, env: Env): Promise<Response> {
  let body: {
    seed?: unknown;
    params?: unknown;
    ground?: unknown;
    ink?: unknown;
    comment?: unknown;
    rating?: unknown;
    tuner?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, env, { status: 400 });
  }

  const seed = typeof body.seed === "number" && Number.isFinite(body.seed) ? Math.trunc(body.seed) : null;
  if (seed === null) {
    return json({ error: "'seed' must be a finite number" }, env, { status: 400 });
  }

  // params is the SIG_PARAMS dial set — an object of finite numbers. Stored
  // as JSON text (same approach as gallery.doc) so new dials don't need a
  // migration.
  const rawParams = body.params;
  if (typeof rawParams !== "object" || rawParams === null || Array.isArray(rawParams)) {
    return json({ error: "'params' must be an object" }, env, { status: 400 });
  }
  for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return json({ error: `'params.${k}' must be a finite number` }, env, { status: 400 });
    }
  }
  const params = JSON.stringify(rawParams);
  if (params.length > MAX_SIG_PARAMS_LEN) {
    return json({ error: `'params' exceeds ${MAX_SIG_PARAMS_LEN} serialized characters` }, env, { status: 400 });
  }

  const ground = typeof body.ground === "string" && body.ground.trim() ? body.ground.trim().slice(0, 32) : "#FFF9F1";
  const ink = typeof body.ink === "string" && body.ink.trim() ? body.ink.trim().slice(0, 32) : "#03071B";
  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, MAX_SIG_COMMENT_LEN)
      : null;
  const rating = typeof body.rating === "string" && SIG_RATINGS.includes(body.rating) ? body.rating : "";
  const tuner =
    typeof body.tuner === "string" && body.tuner.trim() ? body.tuner.trim().slice(0, MAX_SIG_TUNER_LEN) : null;

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO sig_samples (id, tuner, seed, params, ground, ink, comment, rating, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, tuner, seed, params, ground, ink, comment, rating, created_at)
    .run();

  return json({ id, tuner, seed, params: rawParams, ground, ink, comment, rating, created_at }, env, { status: 201 });
}

async function listSigSamples(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, tuner, seed, params, ground, ink, comment, rating, created_at FROM sig_samples ORDER BY created_at DESC LIMIT 500"
  ).all<SigSampleRow>();
  // params comes back as JSON text; hand the frontend a real object, the
  // same way listGallery unwraps `doc`.
  const rows = (results ?? []).map((r) => ({
    ...r,
    params: (() => {
      try {
        return JSON.parse(r.params);
      } catch {
        return {};
      }
    })(),
  }));
  return json(rows, env);
}

async function deleteSigSample(id: string, env: Env): Promise<Response> {
  const { meta } = await env.DB.prepare("DELETE FROM sig_samples WHERE id = ?").bind(id).run();
  if (!meta.changes) {
    return json({ error: "Not found" }, env, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

async function route(request: Request, env: Env): Promise<Response> {
  {
    const url = new URL(request.url);
    const origin = url.origin;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    try {
      if (url.pathname === "/photos" && request.method === "GET") {
        return await listPhotos(env, origin);
      }
      if (url.pathname === "/photos" && request.method === "POST") {
        return await uploadPhoto(request, env, origin);
      }
      if (url.pathname === "/photos/submit" && request.method === "POST") {
        return await submitPhoto(request, env);
      }
      if (url.pathname === "/photos/pending" && request.method === "GET") {
        if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, env, { status: 401 });
        return await listPendingPhotos(env, origin);
      }
      const approveMatch = url.pathname.match(/^\/photos\/([^/]+)\/approve$/);
      if (approveMatch && request.method === "POST") {
        if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, env, { status: 401 });
        return await approvePhoto(decodeURIComponent(approveMatch[1]), env, origin);
      }
      const photoMatch = url.pathname.match(/^\/photos\/([^/]+)$/);
      if (photoMatch && request.method === "GET") {
        return await getPhoto(decodeURIComponent(photoMatch[1]), env);
      }
      if (photoMatch && request.method === "DELETE") {
        return await deletePhoto(decodeURIComponent(photoMatch[1]), request, env);
      }
      if (url.pathname === "/gallery" && request.method === "GET") {
        return await listGallery(env);
      }
      if (url.pathname === "/gallery" && request.method === "POST") {
        return await createGalleryItem(request, env);
      }
      // Longer gallery paths first: /gallery/:id would otherwise swallow them.
      const commentsMatch = url.pathname.match(/^\/gallery\/([^/]+)\/comments$/);
      if (commentsMatch && request.method === "GET") {
        return await listGalleryComments(decodeURIComponent(commentsMatch[1]), env);
      }
      if (commentsMatch && request.method === "POST") {
        return await createGalleryComment(decodeURIComponent(commentsMatch[1]), request, env);
      }
      const oneCommentMatch = url.pathname.match(/^\/gallery\/[^/]+\/comments\/([^/]+)$/);
      if (oneCommentMatch && request.method === "DELETE") {
        return await deleteGalleryComment(decodeURIComponent(oneCommentMatch[1]), request, env);
      }
      const galleryMatch = url.pathname.match(/^\/gallery\/([^/]+)$/);
      if (galleryMatch && request.method === "DELETE") {
        return await deleteGalleryItem(decodeURIComponent(galleryMatch[1]), request, env);
      }
      if (url.pathname === "/feedback" && request.method === "POST") {
        return await submitFeedback(request, env);
      }
      if (url.pathname === "/feedback" && request.method === "GET") {
        if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, env, { status: 401 });
        return await listFeedback(env);
      }
      const feedbackMatch = url.pathname.match(/^\/feedback\/([^/]+)$/);
      if (feedbackMatch && request.method === "PATCH") {
        if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, env, { status: 401 });
        return await updateFeedbackStatus(decodeURIComponent(feedbackMatch[1]), request, env);
      }
      if (feedbackMatch && request.method === "DELETE") {
        if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, env, { status: 401 });
        return await deleteFeedbackItem(decodeURIComponent(feedbackMatch[1]), env);
      }
      if (url.pathname === "/tuning" && request.method === "POST") {
        return await submitSigSample(request, env);
      }
      if (url.pathname === "/tuning" && request.method === "GET") {
        if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, env, { status: 401 });
        return await listSigSamples(env);
      }
      const tuningMatch = url.pathname.match(/^\/tuning\/([^/]+)$/);
      if (tuningMatch && request.method === "DELETE") {
        if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, env, { status: 401 });
        return await deleteSigSample(decodeURIComponent(tuningMatch[1]), env);
      }
      if (url.pathname === "/palettes" && request.method === "GET") {
        return await listPalettes(env);
      }
      if (url.pathname === "/palettes" && request.method === "POST") {
        return await createPalette(request, env);
      }
      const paletteMatch = url.pathname.match(/^\/palettes\/([^/]+)$/);
      if (paletteMatch && request.method === "PUT") {
        return await updatePalette(decodeURIComponent(paletteMatch[1]), request, env);
      }
      if (paletteMatch && request.method === "DELETE") {
        return await deletePalette(decodeURIComponent(paletteMatch[1]), request, env);
      }
      return json({ error: "Not found" }, env, { status: 404 });
    } catch (err) {
      return json({ error: "Internal error", detail: String(err) }, env, { status: 500 });
    }
  }
}

const MAX_PALETTE_NAME_LEN = 80;
const MAX_PALETTE_MAKER_LEN = 120;
// The canon slots a palette may override. Anything else in the body is
// dropped rather than rejected, so a future slot can't 400 an older client.
const PALETTE_SLOTS = [
  "cream",
  "cream2",
  "warmGray",
  "coolGray",
  "orange",
  "pink",
  "sky",
  "green",
  "ink",
  "blueprint",
];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Palettes are shared: everyone reads the whole list. Writes are open too, but
// editing or deleting one needs either its edit_key (handed to the author on
// create, kept in their browser) or the moderation token — so an author can
// prune their own without the shared secret, and nobody else can touch it.
function parsePaletteBody(body: Record<string, unknown>): { colors: Record<string, string> } | string {
  const raw = body.colors;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "'colors' must be an object";
  const colors: Record<string, string> = {};
  for (const slot of PALETTE_SLOTS) {
    const v = (raw as Record<string, unknown>)[slot];
    if (v === undefined) continue;
    if (typeof v !== "string" || !HEX_RE.test(v)) return `'colors.${slot}' must be a #rrggbb string`;
    colors[slot] = v.toLowerCase();
  }
  if (!Object.keys(colors).length) return "'colors' must name at least one canon slot";
  return { colors };
}

function toPaletteItem(row: PaletteRow) {
  let colors: unknown = {};
  try {
    colors = JSON.parse(row.colors);
  } catch {
    colors = {};
  }
  return { id: row.id, name: row.name, maker: row.maker, colors, created_at: row.created_at };
}

async function listPalettes(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, maker, colors, created_at FROM palettes ORDER BY created_at DESC LIMIT 200"
  ).all<PaletteRow>();
  return json((results ?? []).map(toPaletteItem), env);
}

async function createPalette(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, env, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_PALETTE_NAME_LEN) : "";
  if (!name) return json({ error: "'name' must be a non-empty string" }, env, { status: 400 });
  const parsed = parsePaletteBody(body);
  if (typeof parsed === "string") return json({ error: parsed }, env, { status: 400 });
  const maker =
    typeof body.maker === "string" && body.maker.trim() ? body.maker.trim().slice(0, MAX_PALETTE_MAKER_LEN) : null;

  const id = crypto.randomUUID();
  const edit_key = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO palettes (id, name, maker, colors, edit_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, name, maker, JSON.stringify(parsed.colors), edit_key, created_at)
    .run();
  // edit_key is returned here and never again — the author's browser keeps it.
  return json({ id, name, maker, colors: parsed.colors, created_at, edit_key }, env, { status: 201 });
}

// True when the caller may modify this palette: moderation token, or the
// edit_key handed out when it was created.
async function mayEditPalette(id: string, request: Request, env: Env): Promise<boolean> {
  if (isAuthorized(request, env)) return true;
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return false;
  const row = await env.DB.prepare("SELECT edit_key FROM palettes WHERE id = ?").bind(id).first<{ edit_key: string }>();
  return !!row && row.edit_key === key;
}

async function updatePalette(id: string, request: Request, env: Env): Promise<Response> {
  if (!(await mayEditPalette(id, request, env))) {
    return json({ error: "Unauthorized" }, env, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, env, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_PALETTE_NAME_LEN) : "";
  if (!name) return json({ error: "'name' must be a non-empty string" }, env, { status: 400 });
  const parsed = parsePaletteBody(body);
  if (typeof parsed === "string") return json({ error: parsed }, env, { status: 400 });

  // `maker` is optional here, and absence is not the same as empty: a client
  // that omits the field keeps whatever attribution the palette already has,
  // so an older build can still rename a palette without erasing its author.
  const hasMaker = Object.prototype.hasOwnProperty.call(body, "maker");
  const maker =
    typeof body.maker === "string" && body.maker.trim() ? body.maker.trim().slice(0, MAX_PALETTE_MAKER_LEN) : null;

  const { meta } = hasMaker
    ? await env.DB.prepare("UPDATE palettes SET name = ?, colors = ?, maker = ? WHERE id = ?")
        .bind(name, JSON.stringify(parsed.colors), maker, id)
        .run()
    : await env.DB.prepare("UPDATE palettes SET name = ?, colors = ? WHERE id = ?")
        .bind(name, JSON.stringify(parsed.colors), id)
        .run();
  if (!meta.changes) return json({ error: "Not found" }, env, { status: 404 });
  return json(hasMaker ? { id, name, maker, colors: parsed.colors } : { id, name, colors: parsed.colors }, env);
}

async function deletePalette(id: string, request: Request, env: Env): Promise<Response> {
  if (!(await mayEditPalette(id, request, env))) {
    return json({ error: "Unauthorized" }, env, { status: 401 });
  }
  const { meta } = await env.DB.prepare("DELETE FROM palettes WHERE id = ?").bind(id).run();
  if (!meta.changes) return json({ error: "Not found" }, env, { status: 404 });
  return new Response(null, { status: 204 });
}

const MAX_COMMENT_TEXT_LEN = 2000;
const MAX_COMMENT_AUTHOR_LEN = 120;
const VERDICTS = ["good", "bad", "note"];

function toCommentItem(row: GalleryCommentRow) {
  return {
    id: row.id,
    gallery_id: row.gallery_id,
    text: row.text,
    author: row.author,
    verdict: row.verdict,
    // Either both coordinates or neither — a half-pinned comment would render
    // at the wrong place, so it is treated as unpinned.
    x: row.x === null || row.y === null ? null : row.x,
    y: row.x === null || row.y === null ? null : row.y,
    created_at: row.created_at,
  };
}

async function listGalleryComments(galleryId: string, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, gallery_id, text, author, verdict, x, y, created_at FROM gallery_comments WHERE gallery_id = ? ORDER BY created_at ASC LIMIT 500"
  )
    .bind(galleryId)
    .all<GalleryCommentRow>();
  return json((results ?? []).map(toCommentItem), env);
}

async function createGalleryComment(galleryId: string, request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, env, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_COMMENT_TEXT_LEN) : "";
  if (!text) return json({ error: "'text' must be a non-empty string" }, env, { status: 400 });
  const verdict = typeof body.verdict === "string" && VERDICTS.includes(body.verdict) ? body.verdict : "note";
  const author =
    typeof body.author === "string" && body.author.trim()
      ? body.author.trim().slice(0, MAX_COMMENT_AUTHOR_LEN)
      : null;

  // A pin needs both coordinates inside the asset; anything else is stored as
  // an unpinned comment rather than rejected, so a client that can't work out
  // a position still gets its note saved.
  const nx = typeof body.x === "number" && Number.isFinite(body.x) ? Math.min(1, Math.max(0, body.x)) : null;
  const ny = typeof body.y === "number" && Number.isFinite(body.y) ? Math.min(1, Math.max(0, body.y)) : null;
  const x = nx !== null && ny !== null ? nx : null;
  const y = nx !== null && ny !== null ? ny : null;

  // The piece must exist — a comment pinned to nothing is unreachable.
  const piece = await env.DB.prepare("SELECT id FROM gallery WHERE id = ?").bind(galleryId).first<{ id: string }>();
  if (!piece) return json({ error: "Not found" }, env, { status: 404 });

  const id = crypto.randomUUID();
  const edit_key = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO gallery_comments (id, gallery_id, text, author, verdict, x, y, edit_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, galleryId, text, author, verdict, x, y, edit_key, created_at)
    .run();
  return json({ id, gallery_id: galleryId, text, author, verdict, x, y, created_at, edit_key }, env, { status: 201 });
}

async function deleteGalleryComment(commentId: string, request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    const key = new URL(request.url).searchParams.get("key");
    if (!key) return json({ error: "Unauthorized" }, env, { status: 401 });
    const row = await env.DB.prepare("SELECT edit_key FROM gallery_comments WHERE id = ?")
      .bind(commentId)
      .first<{ edit_key: string }>();
    if (!row || row.edit_key !== key) return json({ error: "Unauthorized" }, env, { status: 401 });
  }
  const { meta } = await env.DB.prepare("DELETE FROM gallery_comments WHERE id = ?").bind(commentId).run();
  if (!meta.changes) return json({ error: "Not found" }, env, { status: 404 });
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await route(request, env);
    // One place decorates every response — including 401s, 404s and the
    // 500 catch-all, so a browser sees a real error instead of an opaque
    // CORS failure masking it.
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(corsHeaders(env, request))) out.headers.set(k, v);
    return out;
  },
} satisfies ExportedHandler<Env>;
