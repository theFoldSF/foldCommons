# fold-commons-backend

Cloudflare Worker that stores the community photo library in R2 and the
community gallery in D1. R2 objects plus their custom metadata (`name`,
`w`, `h`) are the entire photo store; the gallery is one small D1 table
(see `schema.sql`).

## Deploy

```sh
cd backend
bun install

# Authenticate with Cloudflare (opens a browser window)
wrangler login

# Create the R2 bucket referenced in wrangler.toml
wrangler r2 bucket create fold-commons-photos

# Create the D1 database referenced in wrangler.toml, then paste the
# printed `database_id` into wrangler.toml's [[d1_databases]] block
wrangler d1 create fold-commons

# Apply the gallery table schema — once locally (wrangler dev's shadow db)
# and once against the real deployed database
wrangler d1 execute fold-commons --file=./schema.sql
wrangler d1 execute fold-commons --file=./schema.sql --remote

# Set the upload bearer token (prompts for a value; not stored in the repo).
# Guards POST /photos and the moderation-only DELETE /gallery/:id.
wrangler secret put UPLOAD_TOKEN

# Ship it
wrangler deploy
```

`wrangler deploy` prints the worker's URL, e.g.
`https://fold-commons-backend.<your-subdomain>.workers.dev`.

## Wire up the frontend

In the main `fold-commons` app, point it at the deployed worker by setting
`VITE_FOLD_API` to that URL. This is a Vercel project environment variable
(Settings → Environment Variables on the `fold-commons` Vercel project) —
not a Vercel config or code change — and for local dev goes in `.env.local`:

```sh
# fold-commons/.env.local
VITE_FOLD_API=https://fold-commons-backend.<your-subdomain>.workers.dev
```

With that set, `loadPhotos()` fetches `GET /photos` from the worker and
merges the results with the bundled `photos/manifest.json` set, and the
gallery data layer (`src/gallery/index.ts`) fetches/saves through
`GET`/`POST /gallery`. Leave it unset and the app behaves exactly as it did
before this backend existed (bundled photos only, localStorage-only
gallery).

## CORS

`ALLOWED_ORIGIN` in `wrangler.toml`'s `[vars]` controls the
`Access-Control-Allow-Origin` header. It defaults to `"*"`, which is fine for
local development but should be tightened to the real app origin (e.g.
`https://fold-commons.example.com`) before going to production — edit
`wrangler.toml` and redeploy, or override per-environment with
`wrangler secret put ALLOWED_ORIGIN`.

## API

- `GET /photos` — `[{ id, name, url, w, h }, ...]`, **approved only**. `url`
  is an absolute URL back to this same worker's `GET /photos/:id` route.
- `POST /photos` — requires `Authorization: Bearer <UPLOAD_TOKEN>`. Accepts
  either `multipart/form-data` (`file` field, optional `name`/`w`/`h`
  fields) or a raw body with `?name=&w=&h=` query params. Lands as
  pre-approved (a direct design-team add). Returns the created
  `{ id, name, url, w, h }` with status 201.
- `POST /photos/submit` — **public, no auth.** Same body shape as
  `POST /photos` plus an optional `submitter` field (form field or query
  param). Lands with `status: "pending"` — invisible to `GET /photos`
  until a moderator approves it. Capped at 8MB. Returns `{ id, status }`
  with status 201.
- `GET /photos/pending` — requires `Authorization: Bearer <UPLOAD_TOKEN>`.
  `[{ id, name, url, w, h, submitter }, ...]` for everything awaiting
  review.
- `POST /photos/:id/approve` — requires `Authorization: Bearer
  <UPLOAD_TOKEN>`. Flips a pending submission to approved; it then starts
  appearing in `GET /photos`. Returns the approved `{ id, name, url, w, h }`.
- `GET /photos/:id` — streams the image bytes with a long-lived
  `Cache-Control` header, or 404 if the id doesn't exist.
- `DELETE /photos/:id` — requires `Authorization: Bearer <UPLOAD_TOKEN>`.
  Removes a photo outright — the "deny" side of moderation, or general
  cleanup. 204 on success, 404 if no object matched.
- `GET /gallery` — `[{ id, name, maker, doc, created_at }, ...]`, newest
  first, capped at 200 rows. `doc` is a real JSON object (already parsed
  server-side), not a doubly-encoded string.
- `POST /gallery` — body `{ name, maker?, doc }`. `name` must be non-empty
  (trimmed, max 120 chars); `doc` must be an object under ~100KB when
  serialized. Returns the created row (201), `doc` as an object.
- `DELETE /gallery/:id` — requires `Authorization: Bearer <UPLOAD_TOKEN>`
  (same check as `POST /photos`). Moderation-only escape hatch called
  manually (e.g. via curl) — deliberately not wired into the frontend,
  since a bearer secret can never live in shipped frontend JS. 204 on
  success, 404 if no row matched.
- `POST /feedback` — **public, no auth.** Body `{ kind, text, name?,
  context? }`. `kind` is `"bug" | "feature" | "other"` (defaults to
  `"other"` if omitted/unrecognized); `text` is required, trimmed, capped
  at 4000 characters. Returns the created row (201) with `status: "new"`.
- `GET /feedback` — requires `Authorization: Bearer <UPLOAD_TOKEN>`.
  `[{ id, kind, text, name, context, status, created_at }, ...]`, newest
  first, capped at 200 rows.
- `PATCH /feedback/:id` — requires `Authorization: Bearer <UPLOAD_TOKEN>`.
  Body `{ status }` where `status` is `"new" | "done"`. Returns
  `{ id, status }`, 404 if no row matched.
- `DELETE /feedback/:id` — requires `Authorization: Bearer <UPLOAD_TOKEN>`.
  204 on success, 404 if no row matched.

Every `Bearer <UPLOAD_TOKEN>`-gated route above shares one moderator
workflow: paste the token once into the app's hidden `#moderate` (photo
review) or `#feedback` (bug/feature inbox) pages — it's kept in that
browser's `localStorage`, never in shipped frontend JS.

## Local dev

```sh
bun run dev   # wrangler dev
```

Requires being logged in via `wrangler login` and having created the R2
bucket, since `wrangler dev` talks to real Cloudflare resources unless you
pass `--local`/`--remote` flags of your own choosing.
