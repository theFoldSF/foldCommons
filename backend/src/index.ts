// fold-commons-backend — a minimal Cloudflare Worker fronting an R2 bucket
// of community photos and a D1-backed community gallery.
//
// Routes:
//   GET    /photos        -> [{ id, name, url, w, h }, ...]
//   POST   /photos        -> create one (bearer-token guarded)
//   GET    /photos/:id    -> raw image bytes
//   GET    /gallery       -> [{ id, name, maker, doc, created_at }, ...]
//   POST   /gallery       -> create one entry
//   DELETE /gallery/:id   -> remove one entry (bearer-token guarded)
//   OPTIONS *              -> CORS preflight
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

function corsHeaders(env: Env): HeadersInit {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

// Shared bearer-token guard: POST /photos and DELETE /gallery/:id both use
// this same comparison against env.UPLOAD_TOKEN.
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

async function listPhotos(env: Env, origin: string): Promise<Response> {
  const objects: PhotoMeta[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.PHOTOS_BUCKET.list({ include: ["customMetadata"], cursor });
    for (const obj of page.objects) {
      objects.push(toPhotoMeta(obj.key, obj.customMetadata, origin));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json(objects, env);
}

async function uploadPhoto(request: Request, env: Env, origin: string): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, env, { status: 401 });
  }

  const url = new URL(request.url);
  let bytes: ArrayBuffer;
  let contentType = "application/octet-stream";
  let name = url.searchParams.get("name") || "untitled";
  let w = Number(url.searchParams.get("w") || 0) || 0;
  let h = Number(url.searchParams.get("h") || 0) || 0;

  const ct = request.headers.get("Content-Type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ error: "Missing 'file' field in form data" }, env, { status: 400 });
    }
    bytes = await file.arrayBuffer();
    contentType = file.type || contentType;
    const formName = form.get("name");
    name = typeof formName === "string" && formName ? formName : file.name || name;
    const formW = form.get("w");
    const formH = form.get("h");
    if (typeof formW === "string" && formW) w = Number(formW) || 0;
    if (typeof formH === "string" && formH) h = Number(formH) || 0;
  } else {
    bytes = await request.arrayBuffer();
    contentType = ct || contentType;
  }

  if (!bytes || bytes.byteLength === 0) {
    return json({ error: "Empty upload body" }, env, { status: 400 });
  }

  const id = slugify(name);
  await env.PHOTOS_BUCKET.put(id, bytes, {
    httpMetadata: { contentType },
    customMetadata: { name, w: String(w), h: String(h) },
  });

  return json(toPhotoMeta(id, { name, w: String(w), h: String(h) }, origin), env, { status: 201 });
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
      const photoMatch = url.pathname.match(/^\/photos\/([^/]+)$/);
      if (photoMatch && request.method === "GET") {
        return await getPhoto(decodeURIComponent(photoMatch[1]), env);
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
      return json({ error: "Not found" }, env, { status: 404 });
    } catch (err) {
      return json({ error: "Internal error", detail: String(err) }, env, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
