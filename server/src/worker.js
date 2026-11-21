// LastPick on Cloudflare Workers. The same code is deployed as four Workers (wrangler.toml environments):
//   customer  -> customer.lastpick.in   (customer web app + customer API, and the background jobs on a timer)
//   partner   -> partner.lastpick.in    (partner web app + business API)
//   admin     -> admin.lastpick.in      (admin panel + admin API)
//   redirect  -> lastpick.in, www       (sends visitors to the customer site)
// Web apps are static files served by Cloudflare for free; only /api/* and /healthz run this code.
// The database is PostgreSQL, reached through Cloudflare Hyperdrive (one small connection pool per request).
import { buildRouter } from "./app.js";
import { ADMIN_ALLOWED_IPS, SERVICE } from "./config.js";
import { requestContext } from "./context.js";
import { q, requestPool } from "./db.js";
import { handleFetch } from "./http.js";
import { registerJobs } from "./jobs.js";
import { log } from "./log.js";
import { runOne, runSchedules } from "./queue.js";

const router = SERVICE === "redirect" ? null : buildRouter(SERVICE);
registerJobs();
const guard = SERVICE === "admin" && ADMIN_ALLOWED_IPS.length
  ? (req, ip) => (ADMIN_ALLOWED_IPS.includes(ip) ? null : "Not allowed from this network")
  : null;

// Run fn with this request's own database connection; the connection closes after every query has finished.
async function withDb(env, ctx, fn) {
  const pool = await requestPool(env.HYPERDRIVE.connectionString);
  const store = { pool, pending: [] };
  try {
    return await requestContext.run(store, fn);
  } finally {
    ctx.waitUntil((async () => { await Promise.allSettled(store.pending); await pool.end(); })());
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const domain = env.SITE_DOMAIN || "lastpick.in";

    // lastpick.in and www.lastpick.in -> the customer site
    if (SERVICE === "redirect" || url.hostname === domain || url.hostname === `www.${domain}`) {
      return Response.redirect(`https://customer.${domain}${url.pathname === "/" ? "" : url.pathname}`, 301);
    }

    if (url.pathname === "/healthz") {
      return withDb(env, ctx, async () => {
        let db = false;
        try { await q("SELECT 1"); db = true; } catch (e) { log.error("health check failed", { error: e.message }); }
        return new Response(JSON.stringify({ ok: db, service: SERVICE, db }), { status: db ? 200 : 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      });
    }

    if (url.pathname.startsWith("/api/")) {
      // Public offer lists are the same for everyone nearby: keep a copy in Cloudflare's cache for 60 seconds (free).
      const cacheable = request.method === "GET" && url.pathname === "/api/offers" && !request.headers.get("authorization") && typeof caches !== "undefined";
      if (cacheable) {
        const hit = await caches.default.match(request.url);
        if (hit) return hit;
      }
      const res = await withDb(env, ctx, () => handleFetch(router, request, { guard }));
      if (cacheable && res.ok && /s-maxage/.test(res.headers.get("Cache-Control") || "")) ctx.waitUntil(caches.default.put(request.url, res.clone()));
      return res;
    }

    // anything else is a page of the web app (normally Cloudflare serves these before the Worker runs)
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },

  // Every 5 minutes (customer Worker only): scheduled upkeep and queued background jobs.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(withDb(env, ctx, async () => {
      try { await runSchedules(); } catch (e) { log.error("scheduler error", { error: e.message }); }
      for (let i = 0; i < 50; i++) {
        let worked = false;
        try { worked = await runOne(); } catch (e) { log.error("queue error", { error: e.message }); }
        if (!worked) break;
      }
    }));
  },
};
