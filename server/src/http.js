// Tiny HTTP layer on node:http: routing, JSON bodies, security headers, CORS, static files, rate limits.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ALLOWED_ORIGINS, ORIGIN_SECRET, PROXY_HOPS } from "./config.js";
import { userFromRequest } from "./auth.js";
import { log } from "./log.js";
import { ipAllow } from "./ratelimit.js";
import { HttpError, tooMany } from "./util.js";

const MAX_BODY = 600 * 1024; // an offer with its photo is about 250 KB

export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
    routes.push({ method, re, keys, handler, opts });
  };
  return {
    get: add("GET"), post: add("POST"), put: add("PUT"), patch: add("PATCH"), del: add("DELETE"),
    find(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
}

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
};
const CSP = [
  "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self' https://checkout.razorpay.com", "connect-src 'self'", "frame-src https://api.razorpay.com",
].join("; ");

export function clientIp(req) {
  // CloudFront appends the viewer's address to X-Forwarded-For and the load balancer appends CloudFront's,
  // so the viewer is PROXY_HOPS entries from the end (anything earlier is client-supplied and ignored).
  // API Gateway sets X-Client-IP itself (overwriting anything the visitor sent); requests only reach us with the origin secret
  const viaGateway = ORIGIN_SECRET && String(req.headers["x-client-ip"] || "").trim();
  if (viaGateway) return viaGateway;
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (ORIGIN_SECRET && xff.length >= PROXY_HOPS ? xff[xff.length - PROXY_HOPS] : req.socket.remoteAddress) || "unknown";
}

function send(res, status, body, headers = {}) {
  const data = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        // stop keeping the data, drain the rest, and answer 413 (then close the connection)
        if (!chunks.tooBig) { chunks.tooBig = true; chunks.length = 0; reject(new HttpError(413, "That's too large. Use a smaller photo.", "invalid-argument")); }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (chunks.tooBig) return;
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "Bad request", "invalid-argument")); }
    });
    req.on("error", reject);
  });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".txt": "text/plain" };
function serveStatic(webDir, pathname, res) {
  const root = path.resolve(webDir);
  let file = path.resolve(root, "." + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) && file !== root) return false;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html"); // single-page app
  if (!fs.existsSync(file)) return false;
  const ext = path.extname(file);
  const immutable = pathname.startsWith("/assets/");
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    ...(ext === ".html" ? { "Content-Security-Policy": CSP } : {}),
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

export function makeHandler(router, { webDir, guard } = {}) {
  return async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, "http://x");
    const pathname = url.pathname;
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const reqId = crypto.randomUUID();
    res.setHeader("X-Request-Id", reqId);
    const ip = clientIp(req);

    try {
      if (pathname === "/healthz") return await router.health(res);
      // only CloudFront may call the server (it adds the secret header)
      if (ORIGIN_SECRET) {
        const got = Buffer.from(String(req.headers["x-origin-verify"] || ""));
        const want = Buffer.from(ORIGIN_SECRET);
        if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return send(res, 403, { error: "Forbidden" });
      }
      if (guard) { const g = guard(req, ip); if (g) return send(res, 403, { error: g }); }

      if (!pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Method not allowed" });
        if (webDir && serveStatic(webDir, pathname, res)) return;
        return send(res, 404, { error: "Not found" });
      }

      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
        res.setHeader("Access-Control-Max-Age", "600");
      }
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

      const found = router.find(req.method, pathname);
      if (!found) return send(res, 404, { error: "Not found" });
      if (found.methodNotAllowed) return send(res, 405, { error: "Method not allowed" });
      const { route, params } = found;
      const cls = route.opts.limit || (req.method === "GET" ? "default" : "write");
      if (!ipAllow(ip, "default") || (cls !== "default" && !ipAllow(ip, cls))) throw tooMany();

      const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : {};
      const auth = await userFromRequest(req);
      const ctx = { req, res, ip, params, body, query: Object.fromEntries(url.searchParams), user: auth.user || null, authReason: auth.reason || null, userAgent: String(req.headers["user-agent"] || "").slice(0, 200) };
      const out = await route.handler(ctx);
      if (res.headersSent) return;
      send(res, 200, out === undefined ? { ok: true } : out, route.opts.cache ? { "Cache-Control": route.opts.cache } : {});
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) log.error("request failed", { reqId, method: req.method, path: pathname, error: e.message, stack: e.stack });
      if (!res.headersSent) send(res, status, { error: status >= 500 ? "Something went wrong on our side. Please try again in a minute." : e.message, code: e.code || "internal", reqId }, status === 413 ? { Connection: "close" } : {});
    } finally {
      const msTaken = Date.now() - started;
      if (pathname.startsWith("/api/") && (msTaken > 1000 || res.statusCode >= 500)) log.warn("slow or failed request", { reqId, method: req.method, path: pathname, status: res.statusCode, ms: msTaken });
    }
  };
}
