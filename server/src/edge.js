// LastPick API on Supabase Edge Functions (Deno). Three functions from the same code: customer, partner, admin
// (supabase/functions/<name>/index.ts sets SERVICE and calls createEdgeHandler). The web apps are on Cloudflare.
// Uses the same routes, SQL, security headers and rate limits as the Node server; one small database pool per running function, shared by its requests.
import { buildRouter } from "./app.js";
import { ADMIN_ALLOWED_IPS, CRON_SECRET, SERVICE } from "./config.js";
import { requestContext } from "./context.js";
import { q, requestPool } from "./db.js";
import { handleFetch } from "./http.js";
import { registerJobs } from "./jobs.js";
import { log } from "./log.js";
import { runOne, runSchedules } from "./queue.js";
import { storageCheck } from "./storage.js";

export function createEdgeHandler({ dbUrl, dbSsl = false }) {
  const router = buildRouter(SERVICE);
  registerJobs();
  const guard = SERVICE === "admin" && ADMIN_ALLOWED_IPS.length
    ? (req, ip) => (ADMIN_ALLOWED_IPS.includes(ip) ? null : "Not allowed from this network")
    : null;

  // One small pool per running copy of the function, shared by all its requests (opening a connection is the
  // slow, limited part). Idle connections close after 10 s, so a quiet function holds none.
  let shared = null;
  const pool = () => (shared ||= requestPool(dbUrl, { ssl: dbSsl, max: 3, idleMs: 10000 }));
  async function withDb(waitUntil, fn) {
    const store = { pool: await pool(), pending: [] };
    try {
      return await requestContext.run(store, fn);
    } finally {
      waitUntil(Promise.allSettled(store.pending));
    }
  }
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

  return async function handle(request, waitUntil = () => {}) {
    const url = new URL(request.url);
    // Supabase sends /<function name>/<path> (or /functions/v1/<name>/<path>); the app's own paths start after that.
    let path = url.pathname.replace(/^\/functions\/v1/, "");
    if (path === `/${SERVICE}` || path.startsWith(`/${SERVICE}/`)) path = path.slice(SERVICE.length + 1) || "/";

    if (path === "/healthz") {
      return withDb(waitUntil, async () => {
        let db = false;
        try { await q("SELECT 1"); db = true; } catch (e) { log.error("health check failed", { error: e.message }); }
        return json(db ? 200 : 503, { ok: db, service: SERVICE, db });
      });
    }

    // file storage check, called by the deploy pipeline after each release (same shared secret)
    if (path === "/storage-check") {
      if (!CRON_SECRET || request.headers.get("x-cron-secret") !== CRON_SECRET) return json(403, { error: "Forbidden" });
      return withDb(waitUntil, async () => json(200, await storageCheck()));
    }

    // background jobs, called by pg_cron every 5 minutes with the shared secret
    if (path === "/cron") {
      if (!CRON_SECRET || request.headers.get("x-cron-secret") !== CRON_SECRET) return json(403, { error: "Forbidden" });
      return withDb(waitUntil, async () => {
        let jobs = 0;
        try { await runSchedules(); } catch (e) { log.error("scheduler error", { error: e.message }); }
        for (let i = 0; i < 50; i++) {
          let worked = false;
          try { worked = await runOne(); } catch (e) { log.error("queue error", { error: e.message }); }
          if (!worked) break;
          jobs++;
        }
        return json(200, { ok: true, jobs });
      });
    }

    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
    const inner = new Request(new URL(path + url.search, url.origin), { method: request.method, headers: request.headers, body });
    const ip = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("cf-connecting-ip") || "unknown";
    return withDb(waitUntil, () => handleFetch(router, inner, { guard, ip }));
  };
}
