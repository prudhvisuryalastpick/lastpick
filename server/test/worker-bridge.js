// Runs src/worker.js (the Cloudflare Workers entry) inside Node, behind a tiny HTTP server, so the whole test
// suite can check the Workers code path locally:  LP_TEST_TARGET=worker npm test
import http from "node:http";

const worker = (await import("../src/worker.js")).default;
const env = {
  HYPERDRIVE: { connectionString: process.env.DATABASE_URL },
  SITE_DOMAIN: "lastpick.test",
};
const waiting = new Set();
const ctx = { waitUntil(p) { const x = Promise.resolve(p).catch(() => {}).finally(() => waiting.delete(x)); waiting.add(x); } };

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = { ...req.headers, "cf-connecting-ip": req.socket.remoteAddress || "127.0.0.1" };
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  try {
    const r = await worker.fetch(request, env, ctx);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});
server.listen(Number(process.env.PORT));

// the Cloudflare timer, every second here (only where background jobs run)
if (process.env.RUN_WORKER !== "0") setInterval(() => worker.scheduled({}, env, ctx), 1000).unref();
