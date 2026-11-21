// LastPick API server. The same code runs as three separate servers:
//   SERVICE=customer  customer web app + customer API     (offers, number exchange, reviews)
//   SERVICE=partner   partner web app + business API      (business profile, posting offers, leads)
//   SERVICE=admin     admin panel + admin API             (verification, reports, plans, complaints, team)
// All three share one PostgreSQL database (Amazon RDS).
import http from "node:http";
import { ADMIN_ALLOWED_IPS, PORT, RUN_WORKER, SERVICE, WEB_DIR } from "./config.js";
import { closePools, migrate, pool } from "./db.js";
import { makeHandler } from "./http.js";
import { registerJobs } from "./jobs.js";
import { log } from "./log.js";
import { startWorker, stopWorker } from "./queue.js";
import { buildRouter } from "./app.js";

const router = buildRouter(SERVICE);

let shuttingDown = false;
router.health = async (res) => {
  let db = false;
  try { await pool.query("SELECT 1"); db = true; } catch { /* reported below */ }
  const ok = db && !shuttingDown;
  res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok, service: SERVICE, db }));
};

// Admin server: optional IP allow-list on top of staff-only login.
const guard = SERVICE === "admin" && ADMIN_ALLOWED_IPS.length
  ? (req, ip) => (ADMIN_ALLOWED_IPS.includes(ip) ? null : "Not allowed from this network")
  : null;

await migrate();
registerJobs();
if (RUN_WORKER) startWorker();

const server = http.createServer(makeHandler(router, { webDir: WEB_DIR, guard }));
server.keepAliveTimeout = 65000; // longer than CloudFront's keep-alive, so connections aren't dropped mid-request
server.headersTimeout = 66000;
server.requestTimeout = 30000;
server.listen(PORT, () => log.info("server started", { port: PORT, service: SERVICE, web: WEB_DIR || null, worker: RUN_WORKER }));

// Graceful shutdown on deploy/restart: stop taking requests, finish the ones in flight, close the database.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal: sig });
    stopWorker();
    server.close(async () => { await closePools().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(0), 10000).unref();
  });
}
process.on("unhandledRejection", (e) => log.error("unhandled rejection", { error: String(e?.message || e), stack: e?.stack }));
