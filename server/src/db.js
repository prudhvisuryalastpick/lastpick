// PostgreSQL (Supabase) connection pools, transactions and migrations.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATABASE_URL, DB_CA_FILE, DB_POOL_MAX, DB_READ_HOST, DB_SSL } from "./config.js";
import { log } from "./log.js";

import { currentRequest } from "./context.js";

// The pg driver is loaded when first needed (no top-level await, so the same file also runs on Cloudflare Workers).
// LP_PG_SHIM=1 uses a tiny built-in driver (tests only, where the pg package can't be installed).
let pgModule = null;
async function pgPool() {
  if (!pgModule) {
    if (process.env.LP_PG_SHIM) { const shimPath = "../test/pg-shim.js"; pgModule = await import(shimPath); }
    else pgModule = (await import("pg")).default;
  }
  return pgModule.Pool;
}

function ssl() {
  if (DB_SSL === "off") return false;
  // "require" encrypts the connection with TLS; "verify" also checks the server certificate (DB_CA_FILE).
  if (DB_SSL === "verify") return { ca: fs.readFileSync(DB_CA_FILE, "utf8"), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

// Node server: one shared pool (and an optional read-replica pool), created on first use.
let mainPool = null, readPool = null;
async function sharedPool() {
  if (!mainPool) {
    const Pool = await pgPool();
    mainPool = new Pool({
      ...(DATABASE_URL ? { connectionString: DATABASE_URL } : {}),
      ssl: ssl(), max: DB_POOL_MAX, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
      statement_timeout: 15000, application_name: "lastpick",
    });
    mainPool.on?.("error", (e) => log.error("db pool error", { error: e.message }));
    if (DB_READ_HOST) {
      readPool = new Pool({
        ...(DATABASE_URL ? { connectionString: DATABASE_URL } : {}), host: DB_READ_HOST,
        ssl: ssl(), max: DB_POOL_MAX, idleTimeoutMillis: 30000, connectionTimeoutMillis: 3000,
        statement_timeout: 15000, application_name: "lastpick-read",
      });
      readPool.on?.("error", (e) => log.error("db read pool error", { error: e.message }));
    }
  }
  return mainPool;
}

// Cloudflare Workers: one small pool per request (through Hyperdrive), closed when the request is done.
export async function requestPool(connectionString, { ssl = false } = {}) {
  const Pool = await pgPool();
  // 3: a transaction may run alongside a fire-and-forget write
  return new Pool({ connectionString, max: 3, ssl: ssl ? { rejectUnauthorized: false } : false });
}

async function poolNow() {
  const r = currentRequest();
  return r?.pool || sharedPool();
}
// Every query run during a request is remembered, so the connection is closed only after all of them finish
// (some writes, like the audit log, are not awaited by the handler).
function track(p) {
  const r = currentRequest();
  if (r) r.pending.push(p.catch(() => {}));
  return p;
}
export const pool = { query: async (text, params) => (await poolNow()).query(text, params) };

// Read from the replica; if it's unavailable (restarting, too far behind), fall back to the main database.
async function readQuery(text, params) {
  const main = await poolNow();
  if (currentRequest() || !readPool) return main.query(text, params);
  try {
    return await readPool.query(text, params);
  } catch (e) {
    log.warn("read replica unavailable, using main database", { error: e.message });
    return main.query(text, params);
  }
}
export const rone = async (text, params) => (await track(readQuery(text, params))).rows[0] || null;
export const rmany = async (text, params) => (await track(readQuery(text, params))).rows;
export const closePools = () => Promise.all([mainPool?.end(), readPool?.end()].filter(Boolean));

export const q = (text, params) => track(pool.query(text, params));
export const one = async (text, params) => (await q(text, params)).rows[0] || null;
export const many = async (text, params) => (await q(text, params)).rows;

// Run fn(client) in a transaction; rolls back on error.
export async function tx(fn) {
  const c = await (await poolNow()).connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Apply migrations/*.sql in order, once each. An advisory lock stops two servers migrating at the same time.
export async function migrate() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const c = await (await sharedPool()).connect();
  try {
    await c.query("SELECT pg_advisory_lock(424242)");
    await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      await c.query("BEGIN");
      try {
        await c.query(sql);
        await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
        await c.query("COMMIT");
        log.info("migration applied", { file: f });
      } catch (e) {
        await c.query("ROLLBACK");
        throw new Error(`migration ${f} failed: ${e.message}`);
      }
    }
    // Supabase publishes every table in "public" through its open data API. Row-level security with no policies, and no
    // grants for its anon/authenticated roles, keeps every table reachable only by this server (the table owner).
    await c.query(`DO $$
      DECLARE t record;
      BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
        END LOOP;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
          EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
          EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
        END IF;
      END $$`);
  } finally {
    await c.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    c.release();
  }
}
