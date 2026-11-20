// PostgreSQL (Amazon RDS) connection pool, transactions and migrations.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATABASE_URL, DB_CA_FILE, DB_POOL_MAX, DB_READ_HOST, DB_SSL } from "./config.js";
import { log } from "./log.js";

// LP_PG_SHIM=1 uses a tiny built-in driver (tests only, where the pg package can't be installed).
const { Pool } = process.env.LP_PG_SHIM ? await import("../test/pg-shim.js") : (await import("pg")).default;

function ssl() {
  if (DB_SSL === "off") return false;
  // RDS: traffic is encrypted with TLS. "verify" also checks the server certificate against the RDS CA bundle.
  if (DB_SSL === "verify") return { ca: fs.readFileSync(DB_CA_FILE, "utf8"), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

export const pool = new Pool({
  ...(DATABASE_URL ? { connectionString: DATABASE_URL } : {}),
  ssl: ssl(),
  max: DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  application_name: "lastpick",
});
pool.on?.("error", (e) => log.error("db pool error", { error: e.message }));

// Read replica pool (only when PGHOST_READ is set). Same login; the replica follows the main database within about a second.
const readPool = DB_READ_HOST
  ? new Pool({
    ...(DATABASE_URL ? { connectionString: DATABASE_URL } : {}),
    host: DB_READ_HOST,
    ssl: ssl(),
    max: DB_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
    statement_timeout: 15000,
    application_name: "lastpick-read",
  })
  : null;
readPool?.on?.("error", (e) => log.error("db read pool error", { error: e.message }));

// Read from the replica; if it's unavailable (restarting, too far behind), fall back to the main database.
async function readQuery(text, params) {
  if (!readPool) return pool.query(text, params);
  try {
    return await readPool.query(text, params);
  } catch (e) {
    log.warn("read replica unavailable, using main database", { error: e.message });
    return pool.query(text, params);
  }
}
export const rone = async (text, params) => (await readQuery(text, params)).rows[0] || null;
export const rmany = async (text, params) => (await readQuery(text, params)).rows;
export const closePools = () => Promise.all([pool.end(), readPool?.end()].filter(Boolean));

export const q = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
export const many = async (text, params) => (await pool.query(text, params)).rows;

// Run fn(client) in a transaction; rolls back on error.
export async function tx(fn) {
  const c = await pool.connect();
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
  const c = await pool.connect();
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
  } finally {
    await c.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    c.release();
  }
}
