// Maintenance mode, set by an admin in Admin → Overview → Maintenance.
// Stored in app_settings "maintenance": { on, from, until, apps: ["customer","partner"], message }.
// While it's active, the customer/partner apps show a full-screen maintenance page and the API refuses changes
// (anything but GET) from those apps with 503. The admin app is never blocked, so it can always be switched off.
// It ends by itself at "until". Before a scheduled window the apps show a warning banner (24 hours ahead).
import { cached, clearCache } from "./cache.js";
import { SERVICE } from "./config.js";
import { getSetting, setSetting } from "./settings.js";
import { HttpError } from "./util.js";

const APPS = ["customer", "partner"];
const KEY = "maintenance";
const toMs = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

export async function maintenanceSetting() {
  const s = (await getSetting(KEY, null)) || {};
  return { on: !!s.on, from: s.from ?? null, until: s.until ?? null, apps: Array.isArray(s.apps) ? s.apps.filter((a) => APPS.includes(a)) : APPS, message: s.message || "" };
}

// what the apps need to know right now
export function maintenanceState(s, now = Date.now()) {
  const ended = s.until != null && now >= s.until;
  const scheduledNow = s.from != null && now >= s.from && !ended;
  const active = !ended && (s.on || scheduledNow);
  const upcoming = !active && !ended && s.from != null && s.from > now && s.from - now <= 24 * 3600 * 1000;
  return { active, upcoming, from: s.from, until: s.until, apps: s.apps, message: s.message };
}

export async function maintenanceNow() {
  return cached("maintenance", 15000, async () => maintenanceState(await maintenanceSetting()));
}

export async function setMaintenance(body, by) {
  const cur = await maintenanceSetting();
  const next = { ...cur };
  if (typeof body.on === "boolean") next.on = body.on;
  if ("from" in body) next.from = toMs(body.from);
  if ("until" in body) next.until = toMs(body.until);
  if (Number.isNaN(next.from) || Number.isNaN(next.until)) throw new HttpError(400, "Please pick valid times", "invalid-argument");
  if (next.from != null && next.until != null && next.until <= next.from) throw new HttpError(400, "\"Until\" must be after \"From\"", "invalid-argument");
  if (Array.isArray(body.apps)) next.apps = body.apps.filter((a) => APPS.includes(a));
  if (!next.apps.length) throw new HttpError(400, "Pick at least one app", "invalid-argument");
  if (typeof body.message === "string") next.message = body.message.trim().slice(0, 300);
  await setSetting(KEY, next, by);
  clearCache("maintenance");
  return next;
}

// called before every API request (both runtimes)
export async function guardMaintenance(method, pathname) {
  if (method === "GET" || method === "OPTIONS" || SERVICE === "admin" || pathname.startsWith("/api/admin")) return;
  const m = await maintenanceNow();
  if (!m.active) return;
  const app = SERVICE === "partner" ? "partner" : SERVICE === "customer" ? "customer" : null;
  if (app && !m.apps.includes(app)) return;
  throw new HttpError(503, "LastPick is under maintenance right now. Please try again a little later.", "unavailable");
}
