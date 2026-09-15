-- fold-commons-backend — D1 schema for the community gallery.
-- Apply with: wrangler d1 execute fold-commons --file=./schema.sql
-- (add --remote to apply against the deployed database instead of the
-- local dev shadow db). See README.md for the full sequence.

CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  maker TEXT,
  doc TEXT NOT NULL,       -- JSON text: the full sanitized, shareable Doc
  created_at TEXT NOT NULL -- ISO 8601
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,          -- 'bug' | 'feature' | 'other'
  text TEXT NOT NULL,
  name TEXT,
  context TEXT,                -- e.g. the reporter's URL hash, for repro context
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'done'
  created_at TEXT NOT NULL     -- ISO 8601
);

CREATE TABLE IF NOT EXISTS sig_samples (
  id TEXT PRIMARY KEY,
  tuner TEXT,                  -- who left the note (free text, may be NULL)
  seed INTEGER NOT NULL,
  params TEXT NOT NULL,        -- JSON text: the SIG_PARAMS dial values
  ground TEXT NOT NULL,        -- hex the sample was previewed on
  ink TEXT NOT NULL,
  comment TEXT,
  rating TEXT NOT NULL DEFAULT '', -- 'up' | 'down' | ''
  created_at TEXT NOT NULL     -- ISO 8601
);

CREATE INDEX IF NOT EXISTS sig_samples_created_at ON sig_samples (created_at DESC);

CREATE TABLE IF NOT EXISTS palettes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  maker TEXT,                  -- who tuned it (free text, may be NULL)
  colors TEXT NOT NULL,        -- JSON text: { <canon color key>: "#rrggbb", ... }
  -- Returned to the creator once, kept in their browser. Lets an author prune
  -- their own palette without holding the shared moderation secret.
  edit_key TEXT NOT NULL,
  created_at TEXT NOT NULL     -- ISO 8601
);

CREATE INDEX IF NOT EXISTS palettes_created_at ON palettes (created_at DESC);

CREATE TABLE IF NOT EXISTS gallery_comments (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL,    -- the gallery row this is about
  text TEXT NOT NULL,
  author TEXT,
  -- What the commenter is saying about the piece: it works, it doesn't, or
  -- neither. Drives the good/bad example filter in the gallery.
  verdict TEXT NOT NULL DEFAULT 'note',  -- 'good' | 'bad' | 'note'
  -- Normalized 0..1 position on the asset. NULL for a comment about the piece
  -- as a whole; set when the commenter pinned it to a specific spot, so a pin
  -- survives the piece being re-rendered at any size.
  x REAL,
  y REAL,
  edit_key TEXT NOT NULL,      -- author-owns-their-own, as with palettes
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS gallery_comments_gallery ON gallery_comments (gallery_id, created_at);
