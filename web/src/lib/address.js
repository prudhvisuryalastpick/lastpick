// Address helpers for the business profile. Pincode first: every Indian pincode, in every state.
//   lookupPincode("500090") -> { state, city, areas: ["Nizampet", "Bachupally", ...] }   (India Post data)
//   addressFromLocation(lat, lng) -> { address, area, city, state, pincode }               (OpenStreetMap)
// Both are free public services called from the browser. If one is down, the partner types the fields.
import { INDIAN_STATES, MAJOR_CITIES } from "./config.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const ALIASES = { orissa: "Odisha", pondicherry: "Puducherry", nctofdelhi: "Delhi", jammukashmir: "Jammu and Kashmir", andamannicobar: "Andaman and Nicobar Islands" };
export function matchState(name) {
  const n = norm(name).replace(/and/g, "");
  if (!n) return "";
  const hit = INDIAN_STATES.find((s) => norm(s).replace(/and/g, "") === n);
  if (hit) return hit;
  const alias = Object.entries(ALIASES).find(([k]) => n.includes(k.replace(/and/g, "")));
  return alias ? (INDIAN_STATES.find((s) => s === alias[1]) || alias[1]) : "";
}

async function getJson(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("lookup failed");
    return await r.json();
  } finally { clearTimeout(t); }
}

const pinCache = new Map();
export async function lookupPincode(pin) {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  if (pinCache.has(pin)) return pinCache.get(pin);
  const j = await getJson(`https://api.postalpincode.in/pincode/${pin}`);
  const offices = j?.[0]?.Status === "Success" ? j[0].PostOffice || [] : [];
  if (!offices.length) { pinCache.set(pin, null); return null; }
  const first = offices[0];
  const out = {
    state: matchState(first.State) || first.State,
    city: first.District || first.Block || "",
    areas: [...new Set(offices.map((o) => o.Name).filter(Boolean))].sort(),
  };
  pinCache.set(pin, out);
  return out;
}

// Named colonies and neighbourhoods near a point (OpenStreetMap / Overpass), nearest first.
// In many towns OpenStreetMap only draws one big suburb (e.g. "Saleem Nagar" for all of Nandyal 518501); the colonies
// inside it (Srinivasa Nagar, Bommalasatram, ...) exist only as named points, so the plain reverse lookup never returns them.
const FINE = ["neighbourhood", "quarter", "locality", "hamlet"];
const locCache = new Map();
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const kmBetween = (a, b) => {
  const r = (d) => (d * Math.PI) / 180, R = 6371;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
export async function nearbyLocalities(lat, lng, radiusM = 2000) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radiusM}`;
  if (locCache.has(key)) return locCache.get(key);
  const q = `[out:json][timeout:8];node(around:${radiusM},${lat},${lng})[place~"^(neighbourhood|quarter|locality|hamlet|suburb|village)$"][name];out tags;`;
  // free public servers, often busy: ask them all at once and use the first good answer
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  const ask = async (url) => {
    const r = await fetch(url, { method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) throw new Error("lookup failed");
    return r.json();
  };
  try {
    const j = await Promise.any(OVERPASS.map(ask));
    const seen = new Set();
    const out = (j.elements || [])
      .map((e) => ({ name: (e.tags["name:en"] || e.tags.name || "").trim(), place: e.tags.place, km: kmBetween({ lat, lng }, { lat: e.lat, lng: e.lon }) }))
      .filter((x) => x.name && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()))
      .sort((a, b) => a.km - b.km);
    locCache.set(key, out);
    return out;
  } finally { clearTimeout(t); ctl.abort(); }
}

// The closest named colony within ~1.2 km (or "" if none / the lookup fails).
export async function colonyNear(lat, lng) {
  const near = await nearbyLocalities(lat, lng).catch(() => []);
  return near.find((x) => FINE.includes(x.place) && x.km <= 1.2)?.name || "";
}

// The town/region for a point, anywhere in India: the city or town name; else, near a big city (within 40 km),
// that city (Nizampet -> "Hyderabad"); else the district ("Nandyal District" -> "Nandyal", "Vaishali").
const cleanDistrict = (s) => String(s || "").replace(/\s+district$/i, "").replace(/^YSR\s+/i, "").trim();
function regionOf(a, lat, lng) {
  let metro = null, best = 40;
  MAJOR_CITIES.forEach((c) => { const km = kmBetween({ lat, lng }, c); if (km < best) { best = km; metro = c.name; } });
  return a.city || a.town || metro || cleanDistrict(a.state_district) || cleanDistrict(a.county) || a.village || "";
}

// Some villages have no pincode on the map: find it in India Post's list by the village (or tehsil) name,
// in the same district.
async function pincodeByName(names, district) {
  const d = norm(cleanDistrict(district));
  for (const n of names.filter(Boolean)) {
    try {
      const j = await getJson(`https://api.postalpincode.in/postoffice/${encodeURIComponent(n.replace(/\s+(tehsil|tahsil|mandal|taluk|taluka|block)$/i, ""))}`, 6000);
      const offices = j?.[0]?.Status === "Success" ? j[0].PostOffice || [] : [];
      const hit = offices.find((o) => d && norm(o.District) === d) || (offices.length === 1 ? offices[0] : null);
      if (hit?.Pincode) return hit.Pincode;
    } catch { /* try the next name */ }
  }
  return "";
}

// Reverse lookup (OpenStreetMap / Nominatim): pincode, region and address parts for a point.
export async function addressFromLocation(lat, lng) {
  const j = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`);
  const a = j?.address || {};
  if (a.country_code && a.country_code !== "in") return { outsideIndia: true };
  let pincode = String(a.postcode || "").replace(/\D/g, "").slice(0, 6);
  if (!/^[1-9]\d{5}$/.test(pincode)) pincode = await pincodeByName([a.village, a.hamlet, a.suburb, a.town, a.county], a.state_district || a.county);
  return {
    address: [a.house_number, a.building, a.road].filter(Boolean).join(", "),
    area: a.neighbourhood || a.quarter || a.suburb || a.village || a.hamlet || "",
    city: a.city || a.town || a.city_district || a.state_district || a.county || "",
    region: regionOf(a, lat, lng),
    state: matchState(a.state) || a.state || "",
    pincode: /^[1-9]\d{5}$/.test(pincode) ? pincode : "",
  };
}

// "Nandyal - 518501": what the location chip shows
export const placeLabel = (p) => [p?.region || p?.city, p?.pincode].filter(Boolean).join(" - ");
