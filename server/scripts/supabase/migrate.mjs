// Applies new server/migrations/*.sql files to the Supabase database (each in its own transaction, once),
// then keeps Supabase's open data API locked (row-level security on every table, no grants for anon/authenticated).
import fs from "node:fs";
import path from "node:path";
import { sql } from "./api.mjs";

const dir = new URL("../../migrations/", import.meta.url);
await sql("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const done = new Set((await sql("SELECT name FROM schema_migrations")).map((r) => r.name));
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  const body = fs.readFileSync(path.join(dir.pathname, f), "utf8");
  await sql(`BEGIN;\n${body}\nINSERT INTO schema_migrations (name) VALUES ('${f}');\nCOMMIT;`);
  console.log("migration applied:", f);
}
await sql(`DO $$
  DECLARE t record;
  BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
  END $$`);
console.log("database up to date; public data API locked");
