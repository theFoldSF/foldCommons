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
