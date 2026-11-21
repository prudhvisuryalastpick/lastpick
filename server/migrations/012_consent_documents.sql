-- The exact Terms text each person accepted, so it can be shown later if there is a dispute.
-- Stored once per version/text (by its SHA-256 fingerprint); consent_log points to it.
CREATE TABLE IF NOT EXISTS consent_documents (
  hash        text PRIMARY KEY,           -- SHA-256 of the text, hex
  version     text NOT NULL,
  text        text NOT NULL,
  first_seen  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE consent_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON consent_documents FROM anon, authenticated'; END IF;
END $$;
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS doc_hash text;
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS read_full boolean NOT NULL DEFAULT false;
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS ip text NOT NULL DEFAULT '';
