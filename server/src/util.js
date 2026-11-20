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
// No free version: no free month at sign-up or at verification.
export const TRIAL_DAYS = 0;
export const POSTS_PER_DAY = 3;
// Every offer must be completed within 24 hours: LastPick is only for same-day offers and discounts.
export const MAX_OFFER_MS = DAY;
export const CONSENT_VERSION = "2026-11-20";
export const PLANS = ["customer", "owner"];
export const STATUSES = ["pending", "verified", "rejected", "suspended"];
// How long things are kept (DPDP Rules 2025: logs of number exchange for 1 year).
export const RETENTION = { endedOfferVisibleDays: 7, archiveDays: 365, leadsDays: 365, contactsDays: 365, reportsDays: 365, auditDays: 365, closedGrievanceDays: 730 };
export const GRIEVANCE_TYPES = ["Offer or business", "My account or data (privacy)", "A review", "Payments or plans", "Something else"];

// ---- Working hours (India time). Outside them only ALWAYS_OPEN categories are shown and can be contacted.
// Hotels and travel stay open 24×7 (offers till 12 midnight); everything else is shown 4 AM – 11 PM and ends by 11 PM.
// Every partner (hotels and travel too) can post only between 4 AM and 10:30 PM. Everything is gone at 12 midnight.
export const BUSINESS_HOURS = { open: Number(process.env.OPEN_HOUR ?? 4), close: Number(process.env.CLOSE_HOUR ?? 23) };
// last post at 10:30 PM, so every offer has at least 30 minutes before 11 PM (22.5 = 10:30 PM)
export const POSTING_HOURS = { from: Number(process.env.POST_FROM_HOUR ?? 4), till: Number(process.env.POST_TILL_HOUR ?? 22.5) };
export const ALWAYS_OPEN = ["stay", "travel"];
export const istHour = (now = Date.now()) => new Date(now + 5.5 * 3600000).getUTCHours();
export const isNight = (now = Date.now()) => { const h = istHour(now); return h < BUSINESS_HOURS.open || h >= BUSINESS_HOURS.close; };

// midnight today in India (UTC+05:30)
const IST = 5.5 * 3600000;
export const startOfDayIST = (now = Date.now()) => Math.floor((now + IST) / DAY) * DAY - IST;
export const postingOpen = (now = Date.now()) => { const d = new Date(now + IST); const h = d.getUTCHours() + d.getUTCMinutes() / 60; return h >= POSTING_HOURS.from && h < POSTING_HOURS.till; };
// latest end time for an offer posted today: 11 PM, or 12 midnight for hotels and travel
export const closingTimeIST = (category, now = Date.now()) => startOfDayIST(now) + (ALWAYS_OPEN.includes(category) ? DAY : BUSINESS_HOURS.close * 3600000);

export const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const ms = (d) => (d == null ? null : new Date(d).getTime());
export const num = (v) => (v == null ? null : Number(v));
// Personal data is masked in the admin panel; showing it in full is a separate, logged request.
export const maskPhone = (p) => { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 2)}•••••${d.slice(-3)}` : (p ? "•••" : ""); };
export const maskEmail = (e) => { const [u, dom] = String(e || "").split("@"); return dom ? `${u.slice(0, 2)}•••@${dom}` : (e ? "•••" : ""); };
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
