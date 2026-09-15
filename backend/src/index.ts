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

function corsHeaders(env: Env): HeadersInit {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

// Shared bearer-token guard: every moderation-only route (design-team photo
// uploads, pending-photo review, gallery/feedback deletes, feedback status
// updates) uses this same comparison against env.UPLOAD_TOKEN.
function isAuthorized(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization") || "";
  return !!env.UPLOAD_TOKEN && authHeader === `Bearer ${env.UPLOAD_TOKEN}`;
}

function json(data: unknown, env: Env, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);
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
  return new Response(null, { status: 204, headers: corsHeaders(env) });
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
  for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);
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
  return new Response(null, { status: 204, headers: corsHeaders(env) });
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
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
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
      return json({ error: "Not found" }, env, { status: 404 });
    } catch (err) {
      return json({ error: "Internal error", detail: String(err) }, env, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
