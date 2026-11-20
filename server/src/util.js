// Shared helpers and app rules (kept in sync with web/src/lib/config.js).
export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export const bad = (m) => new HttpError(400, m, "invalid-argument");
export const unauth = (m = "Please log in") => new HttpError(401, m, "unauthenticated");
export const denied = (m) => new HttpError(403, m, "permission-denied");
export const notFound = (m) => new HttpError(404, m, "not-found");
export const precondition = (m) => new HttpError(409, m, "failed-precondition");
export const tooMany = (m = "Too many requests. Please try again later.") => new HttpError(429, m, "resource-exhausted");

export const DAY = 86400000;
export const TRIAL_DAYS = 30;
export const POSTS_PER_DAY = 3;
export const MAX_OFFER_MS = 30 * DAY;
export const CONSENT_VERSION = "2026-11-20";
export const PLANS = ["customer", "owner"];
export const STATUSES = ["pending", "verified", "rejected", "suspended"];
// How long things are kept (DPDP Rules 2025: logs of number exchange for 1 year).
export const RETENTION = { endedOfferVisibleDays: 7, archiveDays: 365, leadsDays: 365, contactsDays: 365, reportsDays: 365, auditDays: 365, closedGrievanceDays: 730 };
export const GRIEVANCE_TYPES = ["Offer or business", "My account or data (privacy)", "A review", "Payments or plans", "Something else"];

// ---- Working hours (India time). Outside them only ALWAYS_OPEN categories are shown and can be contacted.
// Partners can still post at night (e.g. a sale or a camp registration); it goes live when the area opens.
export const BUSINESS_HOURS = { open: Number(process.env.OPEN_HOUR ?? 6), close: Number(process.env.CLOSE_HOUR ?? 23) };
export const ALWAYS_OPEN = ["jobs", "travel", "trips"];
export const istHour = (now = Date.now()) => new Date(now + 5.5 * 3600000).getUTCHours();
export const isNight = (now = Date.now()) => { const h = istHour(now); return h < BUSINESS_HOURS.open || h >= BUSINESS_HOURS.close; };

// midnight today in India (UTC+05:30)
const IST = 5.5 * 3600000;
export const startOfDayIST = (now = Date.now()) => Math.floor((now + IST) / DAY) * DAY - IST;

export const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const ms = (d) => (d == null ? null : new Date(d).getTime());
export const num = (v) => (v == null ? null : Number(v));
export const cityKey = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function needUuid(v, what = "item") { if (!isUuid(v)) throw notFound(`${what[0].toUpperCase() + what.slice(1)} not found`); return v; }

// Phone numbers, links and e-mails are not allowed in reviews and replies (contact stays inside the number exchange).
export const hasContactInfo = (t) => /[6-9]\d{9}/.test(String(t).replace(/[\s().+-]/g, "")) || /https?:\/\/|www\.|\S+@\S+\.\S+/i.test(t);
export const firstName = (n) => String(n || "Customer").trim().split(/\s+/)[0].slice(0, 30) || "Customer";
export const isDataImage = (v, max) => typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= max;

// Indian numbers only. Mobile: 10 digits starting 6-9. Landline: 0 + STD code + number.
export function indianPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0") && /^[6-9]/.test(d[1])) d = d.slice(1);
  if (/^[6-9]\d{9}$/.test(d)) return "+91" + d;
  if (/^0[1-9]\d{9}$/.test(d)) return "+91" + d.slice(1);
  return null;
}
export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
