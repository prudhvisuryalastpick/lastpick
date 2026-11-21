// Runs src/edge.js (the Supabase Edge Functions entry) behind a tiny HTTP server, so the whole test suite can check
// that code path:  LP_TEST_TARGET=edge npm test   (Node)   or   LP_TEST_TARGET=deno npm test   (Deno, like Supabase)
import http from "node:http";
import process from "node:process";

process.env.CRON_SECRET ||= "test-cron-secret";
const { createEdgeHandler } = await import("../src/edge.js");
const handle = createEdgeHandler({ dbUrl: process.env.DATABASE_URL });
const waitUntil = (p) => Promise.resolve(p).catch(() => {});

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method, headers: { ...req.headers, "x-forwarded-for": "127.0.0.1" },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  try {
    const r = await handle(request, waitUntil);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});
server.listen(Number(process.env.PORT));

// pg_cron's 5-minute call, every second here (only where background jobs run)
if (process.env.RUN_WORKER !== "0") {
  const tick = setInterval(() => handle(new Request("http://localhost/cron", { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET } }), waitUntil), 1000);
  tick.unref?.();
}
