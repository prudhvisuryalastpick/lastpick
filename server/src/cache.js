// Small in-memory cache with expiry (per server). Feeds are reused for 30-60 s, the city list for 5 min.
// CloudFront caches app files and photos in front of this. Redis/ElastiCache isn't used: it costs money even when idle.
const store = new Map();
const MAX = 2000;
const inflight = new Map();

export async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;
  if (inflight.has(key)) return inflight.get(key); // many requests for the same thing share one query
  const p = (async () => {
    try {
      const v = await fn();
      if (store.size >= MAX) store.delete(store.keys().next().value);
      store.set(key, { v, exp: Date.now() + ttlMs });
      return v;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
export function clearCache(prefix = "") {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
