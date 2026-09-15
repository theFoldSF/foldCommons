# fold-commons-backend

Cloudflare Worker that stores the community photo library in R2 and the
community gallery (with its critique comments), feedback inbox, signature
tuning log, and team color palettes in D1. R2
objects plus their custom metadata (`name`, `w`, `h`) are the entire photo
store; everything else is a small D1 table (see `schema.sql`).

## Deploy

This Worker lives in **The Fold SF's** Cloudflare account
(`3e871b0b1eb6ba48da27e2b9bd6a667d`), which is *not* the account this
machine's `wrangler login` points at. Two guardrails matter:

1. `account_id` is pinned in `wrangler.toml`, so a wrong-account deploy
   fails loudly instead of quietly succeeding somewhere else.
2. Authenticate with a scoped API token via `CLOUDFLARE_API_TOKEN` rather
   than `wrangler login` — `login` overwrites the single global OAuth token
   and would sign this machine out of its other Cloudflare accounts.

**Gotcha:** not every wrangler subcommand honours `wrangler.toml`'s
`account_id`. `wrangler r2 bucket list` in particular falls back to the
account in the global OAuth config and fails with a confusing
`Authentication error [code: 10000]` that looks like a missing token
permission but is actually a wrong-account lookup. Export
`CLOUDFLARE_ACCOUNT_ID` alongside the token and every subcommand agrees:

```sh
cd backend
bun install

export CLOUDFLARE_API_TOKEN="$(cat ~/.cloudflare-fold-token)"
export CLOUDFLARE_ACCOUNT_ID=3e871b0b1eb6ba48da27e2b9bd6a667d

# Sanity-check you are pointed at the right account before writing anything
wrangler whoami          # -> Cafe@thefoldsf.com's Account
wrangler d1 list         # -> fold-commons
wrangler r2 bucket list  # -> fold-commons

# Apply the schema (gallery + feedback + sig_samples) to the real database
wrangler d1 execute fold-commons --file=./schema.sql --remote

# Ship it
wrangler deploy

# Set the moderation bearer token. Guards every moderator-only route:
# photo review, the feedback inbox, and reading the tuning pool back.
wrangler secret put UPLOAD_TOKEN
```

The R2 bucket and D1 database already exist (both named `fold-commons`,
created in the dashboard), so there are no `create` steps above. If you ever
rebuild the account from scratch, add:

```sh
wrangler r2 bucket create fold-commons
wrangler d1 create fold-commons   # paste the printed id into wrangler.toml
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
- `POST /tuning` — **public, no auth.** Body `{ seed, params, ground?,
  ink?, comment?, rating?, tuner? }`. `seed` must be a finite number and
  `params` an object of finite numbers (the SIG_PARAMS dial values, stored
  as JSON text so new dials need no migration); `rating` is `"up" |
  "down" | ""`; `comment` is capped at 2000 characters and `tuner` at 120.
  Returns the created row (201). This is how a teammate's `#tune` note
  reaches the shared pool — the app posts here on every "Save note", on
  top of always keeping a local copy.
- `GET /tuning` — requires `Authorization: Bearer <UPLOAD_TOKEN>`.
  `[{ id, tuner, seed, params, ground, ink, comment, rating, created_at },
  ...]`, newest first, capped at 500 rows. `params` is a real JSON object
  (parsed server-side), not a doubly-encoded string.
- `DELETE /tuning/:id` — requires `Authorization: Bearer <UPLOAD_TOKEN>`.
  Prunes one note from the pool. 204 on success, 404 if no row matched.

- `GET /gallery/:id/comments` — **public.** `[{ id, gallery_id, text, author,
  verdict, x, y, created_at }, ...]`, oldest first, capped at 500. `verdict`
  is `"good" | "bad" | "note"`. `x`/`y` are normalized 0..1 positions on the
  asset, or both `null` for a comment about the whole piece. `edit_key` is
  never included.
- `POST /gallery/:id/comments` — **public, no auth.** Body `{ text, verdict?,
  author?, x?, y? }`. `text` is required, capped at 2000 chars. Coordinates
  are clamped to 0..1, and a comment with only one of the two is stored
  unpinned rather than rejected. 404 if the piece doesn't exist. Returns the
  row **plus a one-time `edit_key`**.
- `DELETE /gallery/:id/comments/:cid` — needs `?key=<edit_key>` or the
  moderation token. 204, or 404 if no row matched.

Note the route order in `index.ts`: these are matched **before**
`/gallery/:id`, which would otherwise swallow them.

Comments use the same open-write / author-owned-delete shape as palettes, and
for the same reason — critique is only useful if everyone can write it, but an
open delete would let anyone erase anyone's feedback.

- `GET /palettes` — **public.** `[{ id, name, maker, colors, created_at },
  ...]`, newest first, capped at 200. `colors` is a real JSON object keyed by
  canon slot name. `edit_key` is **never** included here.
- `POST /palettes` — **public, no auth.** Body `{ name, colors, maker? }`.
  `colors` maps canon slot names (`cream`, `cream2`, `warmGray`, `coolGray`,
  `orange`, `pink`, `sky`, `green`, `ink`, `blueprint`) to `#rrggbb`; at
  least one is required, unknown keys are dropped rather than rejected so a
  new slot can't 400 an older client. Returns the row **plus a one-time
  `edit_key`** — the only time it is ever sent.
- `PUT /palettes/:id` — body `{ name, colors }`. Needs either
  `?key=<edit_key>` or `Authorization: Bearer <UPLOAD_TOKEN>`.
- `DELETE /palettes/:id` — same auth as `PUT`. 204, or 404 if no row matched.

Palettes use a different auth shape from everything else here, on purpose.
Writing one must be open — the whole point is that any teammate can tune a
palette without holding the moderation secret — but an open `DELETE` would
let anyone wipe anyone's work. So creating a palette hands back an `edit_key`
that lives in that browser's `localStorage`: its author can edit and delete
it, nobody else can, and no shared secret is distributed. The moderation
token still overrides, for cleanup.

Every `Bearer <UPLOAD_TOKEN>`-gated route above shares one moderator
workflow: paste the token once into the app's hidden `#moderate` (photo
review), `#feedback` (bug/feature inbox), or `#tune` ("Everyone's notes"
section) pages — it's kept in that browser's `localStorage`, never in
shipped frontend JS.

Note the asymmetry on `#tune`: *writing* a note needs no token, so any
teammate can use the tuner, but *reading the pool back* does — the notes
accumulate for whoever holds the token.

## Local dev

```sh
# In backend/ — serves on http://127.0.0.1:8787 against a local D1/R2
bun run dev -- --local

# Seed the local shadow database (it is keyed by database_id, so it starts
# empty and needs this again whenever that id changes)
wrangler d1 execute fold-commons --file=./schema.sql --local
```

Then point the frontend at it — `fold-commons/.env.local`:

```sh
VITE_FOLD_API=http://127.0.0.1:8787
```

`.dev.vars` (gitignored, never uploaded) carries the dev-only overrides:

```sh
UPLOAD_TOKEN = "any-value-you-like"
ALLOWED_ORIGIN = "*"
```

That `ALLOWED_ORIGIN` matters. Production pins the allowlist to the real app
origins, so a vite dev server on `localhost:5173` talking to a *locally run*
worker would otherwise be refused by CORS. Overriding it in `.dev.vars`
keeps local dev working without loosening anything that ships.
