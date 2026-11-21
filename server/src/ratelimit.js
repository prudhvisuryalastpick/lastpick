// Two layers of rate limiting:
// 1. Per IP, in memory, on every request (token bucket). Stops floods before they reach the database.
// 2. Per user (or IP) and action, in PostgreSQL, so the limit holds across all servers. Stops number scraping,
//    review spam and runaway costs (same limits as before: 60 numbers viewed/hour, 30 shared/hour, ...).
import { q } from "./db.js";
import { tooMany } from "./util.js";

const buckets = new Map();
// class -> [requests per minute, burst]. IP_LIMIT_MULTIPLIER raises them (tests, or a big office behind one IP).
const X = Math.max(1, Number(process.env.IP_LIMIT_MULTIPLIER || 1));
const CLASSES = { default: [240 * X, 120 * X], auth: [20 * X, 10 * X], write: [60 * X, 30 * X] };

let calls = 0;
export function ipAllow(ip, cls = "default") {
  // tidy up old buckets now and then (no timers, so this also runs on Cloudflare Workers)
  if (++calls % 1000 === 0) { const old = Date.now() - 10 * 60000; for (const [k, b] of buckets) if (b.at < old) buckets.delete(k); }
  const [perMin, burst] = CLASSES[cls] || CLASSES.default;
  const key = cls + "|" + ip;
  const now = Date.now();
  const b = buckets.get(key) || { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 60000) * perMin);
  b.at = now;
  if (b.tokens < 1) { buckets.set(key, b); return false; }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

// Has this key already used up `max` in the current window? (Reads only; for lockouts after failed logins.)
export async function overLimit(key, action, max, windowSec) {
  const { rows } = await q(
    "SELECT n FROM rate_limits WHERE key = $1 AND action = $2 AND window_start > now() - make_interval(secs => $3)",
    [String(key), action, windowSec]);
  return !!rows[0] && rows[0].n >= max;
}

// Fixed window counter shared by all servers. Throws 429 when over the limit.
export async function limit(key, action, max, windowSec, message) {
  const { rows } = await q(
    `INSERT INTO rate_limits (key, action, window_start, n) VALUES ($1, $2, now(), 1)
     ON CONFLICT (key, action) DO UPDATE SET
       n = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $3) THEN 1 ELSE rate_limits.n + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $3) THEN now() ELSE rate_limits.window_start END
     RETURNING n`,
    [String(key), action, windowSec],
  );
  if (rows[0].n > max) throw tooMany(message);
}
