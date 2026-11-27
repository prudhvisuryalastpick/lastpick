-- Files live in Cloudflare R2; the database keeps a reference ("r2:<key>"). Without R2 (tests, local runs) the
-- bytes are kept here instead.
CREATE TABLE IF NOT EXISTS stored_files (
  key text PRIMARY KEY,
  data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
