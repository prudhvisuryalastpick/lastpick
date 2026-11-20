// Geohash helpers for "offers within N km" queries.
// Offers store business.geohash (precision 9). To find offers near a point we query the geohash
// cell around the point plus its 8 neighbours, then keep only offers within the exact radius.
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat, lng, precision = 9) {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = "", bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch |= 1 << (4 - bit); lngMin = mid; } else lngMax = mid;
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch |= 1 << (4 - bit); latMin = mid; } else latMax = mid;
    }
    even = !even;
    if (bit < 4) bit++;
    else { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

// Size of a geohash cell in degrees for a given precision.
function cellSize(precision) {
  const bits = precision * 5, lngBits = Math.ceil(bits / 2), latBits = Math.floor(bits / 2);
  return { dLat: 180 / 2 ** latBits, dLng: 360 / 2 ** lngBits };
}

// Prefixes to query so that every point within radiusKm of (lat, lng) is covered.
export function geohashPrefixes(lat, lng, radiusKm) {
  // precision 4 cells are ~39 x 19.5 km, precision 3 cells are ~156 x 156 km
  const precision = radiusKm <= 19 ? 4 : 3;
  const { dLat, dLng } = cellSize(precision);
  const out = new Set();
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
    const la = Math.max(-89.999, Math.min(89.999, lat + a * dLat));
    const lo = ((lng + b * dLng + 540) % 360) - 180;
    out.add(encodeGeohash(la, lo, precision));
  }
  return [...out];
}

export const validPincode = (p) => /^[1-9]\d{5}$/.test(String(p || "").trim());

export const RADIUS_OPTIONS = [5, 10, 20, 30];
export const DEFAULT_RADIUS_KM = 30;
