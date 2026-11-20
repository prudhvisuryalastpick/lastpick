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

export async function addressFromLocation(lat, lng) {
  const j = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`);
  const a = j?.address || {};
  if (a.country_code && a.country_code !== "in") return { outsideIndia: true };
  const pincode = String(a.postcode || "").replace(/\D/g, "").slice(0, 6);
  return {
    address: [a.house_number, a.building, a.road].filter(Boolean).join(", "),
    area: a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet || "",
    city: a.city || a.town || a.city_district || a.state_district || a.county || "",
    state: matchState(a.state) || a.state || "",
    pincode: /^[1-9]\d{5}$/.test(pincode) ? pincode : "",
  };
}
