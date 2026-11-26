// Address helpers for the business profile. Pincode first: every Indian pincode, in every state.
//   lookupPincode("500090") -> { state, city, areas: ["Nizampet", "Bachupally", ...] }   (India Post data)
//   addressFromLocation(lat, lng) -> { address, area, city, state, pincode }               (OpenStreetMap)
// Both are free public services called from the browser. If one is down, the partner types the fields.
import { INDIAN_STATES } from "./config.js";

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

// Big cities, where the city name alone says little: there the chip shows the locality ("Nizampet - 500090").
// [name, lat, lng, radius km]
const BIG_CITIES = [
  ["Delhi", 28.6139, 77.209, 35], ["Mumbai", 19.076, 72.8777, 35], ["Bengaluru", 12.9716, 77.5946, 30], ["Hyderabad", 17.385, 78.4867, 30],
  ["Chennai", 13.0827, 80.2707, 30], ["Kolkata", 22.5726, 88.3639, 30], ["Pune", 18.5204, 73.8567, 25], ["Ahmedabad", 23.0225, 72.5714, 25],
  ["Surat", 21.1702, 72.8311, 20], ["Jaipur", 26.9124, 75.7873, 20], ["Lucknow", 26.8467, 80.9462, 20], ["Kanpur", 26.4499, 80.3319, 15],
  ["Nagpur", 21.1458, 79.0882, 18], ["Indore", 22.7196, 75.8577, 18], ["Bhopal", 23.2599, 77.4126, 18], ["Patna", 25.5941, 85.1376, 18],
  ["Ranchi", 23.3441, 85.3096, 15], ["Visakhapatnam", 17.6868, 83.2185, 20], ["Vijayawada", 16.5062, 80.648, 15], ["Vadodara", 22.3072, 73.1812, 15],
  ["Ludhiana", 30.901, 75.8573, 15], ["Agra", 27.1767, 78.0081, 15], ["Nashik", 19.9975, 73.7898, 15], ["Rajkot", 22.3039, 70.8022, 15],
  ["Varanasi", 25.3176, 82.9739, 15], ["Srinagar", 34.0837, 74.7973, 12], ["Amritsar", 31.634, 74.8723, 12], ["Prayagraj", 25.4358, 81.8463, 15],
  ["Coimbatore", 11.0168, 76.9558, 15], ["Madurai", 9.9252, 78.1198, 12], ["Jabalpur", 23.1815, 79.9864, 12], ["Gwalior", 26.2183, 78.1828, 12],
  ["Raipur", 21.2514, 81.6296, 15], ["Kochi", 9.9312, 76.2673, 18], ["Thiruvananthapuram", 8.5241, 76.9366, 15], ["Kozhikode", 11.2588, 75.7804, 12],
  ["Guwahati", 26.1445, 91.7362, 15], ["Bhubaneswar", 20.2961, 85.8245, 15], ["Chandigarh", 30.7333, 76.7794, 18], ["Dehradun", 30.3165, 78.0322, 12],
  ["Jodhpur", 26.2389, 73.0243, 12], ["Jamshedpur", 22.8046, 86.2029, 12], ["Dhanbad", 23.7957, 86.4304, 12], ["Meerut", 28.9845, 77.7064, 12],
  ["Mysuru", 12.2958, 76.6394, 12], ["Mangaluru", 12.9141, 74.856, 12], ["Hubballi", 15.3647, 75.124, 12], ["Tiruchirappalli", 10.7905, 78.7047, 12],
  ["Warangal", 17.9689, 79.5941, 12], ["Guntur", 16.3067, 80.4365, 10], ["Nellore", 14.4426, 79.9865, 10], ["Tirupati", 13.6288, 79.4192, 10],
  ["Aurangabad", 19.8762, 75.3433, 12], ["Solapur", 17.6599, 75.9064, 10], ["Kota", 25.2138, 75.8648, 10], ["Gorakhpur", 26.7606, 83.3732, 10],
];
const bigCityAt = (lat, lng) => {
  let hit = null, best = Infinity;
  BIG_CITIES.forEach(([name, la, ln, r]) => { const km = kmBetween({ lat, lng }, { lat: la, lng: ln }); if (km <= r && km < best) { best = km; hit = name; } });
  return hit;
};
const cleanDistrict = (s) => String(s || "").replace(/\s+district$/i, "").replace(/^YSR\s+/i, "").trim();
// "Panyam Mandal" -> "Panyam", "Begamganj Tahsil" -> "Begamganj", "Ludhiana (West) Tahsil" -> "Ludhiana"
const cleanTehsil = (s) => String(s || "").replace(/\s+(mandal|tahsil|tehsil|taluk|taluka|block|sub-?division|circle)$/i, "").replace(/\s*\([^)]*\)/g, "").trim();
// "Zone 10 Kodambakkam" -> "Kodambakkam"; "Ward 136" -> "" (not a name people use)
const cleanLocality = (s) => {
  const t = String(s || "").replace(/^(ward|zone|sector|division|circle)\s*(no\.?\s*)?\d+[\s,-]*/i, "").trim();
  return /^(ward|zone)\b/i.test(t) || /^\d+$/.test(t) ? "" : t;
};

// The name shown before the pincode, anywhere in India:
//   big city  -> the locality (Andheri West, Koramangala, Nizampet); if the map has none, the city
//   elsewhere -> the city or town; else the mandal/tehsil (Panyam, Begamganj); else the village or district
function regionOf(a, lat, lng) {
  const big = bigCityAt(lat, lng);
  if (big) {
    const loc = [a.suburb, a.neighbourhood, a.quarter, a.village, a.town].map(cleanLocality).find((x) => x && x.toLowerCase() !== big.toLowerCase());
    return loc || a.city || big;
  }
  return a.city || a.town || cleanTehsil(a.county) || a.village || cleanDistrict(a.state_district) || "";
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
