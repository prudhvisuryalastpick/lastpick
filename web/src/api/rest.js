// Live backend: the LastPick API on Supabase. Each app talks to its own function
// (customer site -> customer server, partner site -> partner server, admin panel -> admin server).
// Same-origin by default; the Android apps set VITE_API_URL to their server's address.
import { CONSENT_VERSION, IS_ADMIN_APP, IS_CUSTOMER_APP } from "../lib/config.js";
import { compressPhoto } from "../lib/image.js";

const BASE = (import.meta.env?.VITE_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "lastpick-token";
const listeners = new Set();
let token = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
function setToken(t) {
  token = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  listeners.forEach((cb) => cb());
}

async function call(method, path, body, { anonymous = false } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      // public lists are fetched without the login, so Cloudflare can serve the same copy to everyone nearby
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token && !anonymous ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("Can't reach LastPick right now. Check your internet and try again."); }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    // logged in on another device, or the login expired: remember why, for the login screen
    try { if (data?.code === "signed_in_elsewhere" || data?.code === "expired") localStorage.setItem("lastpick-logout-reason", data.error); } catch { /* ignore */ }
    setToken(null);
  }
  if (!res.ok) { const e = new Error(data?.error || "Something went wrong"); e.status = res.status; e.code = data?.code; throw e; }
  return data;
}
const get = (p) => call("GET", p);
const publicGet = (p) => call("GET", p, undefined, { anonymous: true });
const post = (p, b = {}) => call("POST", p, b);

// Short-lived cache for feeds and city lists, so switching tabs doesn't refetch.
const memo = new Map();
async function cached(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v;
  const v = await fn();
  memo.set(key, { at: Date.now(), v });
  return v;
}
const clearCache = () => memo.clear();
// every page change loads fresh data (a cached feed made pages look like they hadn't changed)
if (typeof window !== "undefined") window.addEventListener("hashchange", () => { for (const k of memo.keys()) if (k !== "cities") memo.delete(k); });
const live = (list) => list.filter((o) => o.endsAt > Date.now());
const enc = encodeURIComponent;

export const api = {
  mode: "live",

  // ---------- login (test accounts for now; one-time codes come later) ----------
  async getSession() {
    if (!token) return null;
    try { const me = await get("/api/me"); return { user: { id: me.id, email: me.email } }; }
    catch (e) { if (e.status === 401) return null; throw e; }
  },
  onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  async signIn(email, password) { const r = await post("/api/auth/login", { email: email.trim(), password }); clearCache(); setToken(r.token); },
  async signUp({ email, password, name, phone, consent, otp }) {
    const r = await post("/api/auth/signup", { email: email.trim(), password, name, phone, otp, consent: consent ? { adult: !!consent.adult, items: consent.items || [] } : undefined });
    setToken(r.token);
    return { needsConfirmation: false };
  },
  async sendPhoneOtp() { await post("/api/auth/otp/send", {}); },
  async verifyPhoneOtp() { await post("/api/auth/otp/verify", {}); return { isNew: false }; },
  async sendEmailOtp(email) { return post("/api/auth/otp/send", { email: String(email || "").trim() }); },
  async verifyEmailOtp() { await post("/api/auth/otp/verify", {}); return { isNew: false }; },
  async completeProfile({ name, phone, consent }) {
    await post("/api/me/complete-profile", { name, phone, consent: { adult: !!consent.adult, items: consent.items || [] } });
  },
  async resetPassword(email) { await post("/api/auth/reset", { email }); },
  async signOut() { clearCache(); setToken(null); },
  async getProfile() { return get("/api/me"); },
  async updateProfile({ name, phone }) { await call("PATCH", "/api/me", { name, phone }); },

  // ---------- plans (payments are on hold; admins switch plans on by hand) ----------
  async mySubscriptions() { return get("/api/me/subscriptions"); },
  async subscribe(plan) { await post("/api/billing", { action: "create", plan }); },
  async cancelPlan(plan) { await post("/api/billing", { action: "cancel", plan }); },

  // ---------- business (partner server) ----------
  async myBusiness() { return IS_CUSTOMER_APP || IS_ADMIN_APP ? null : get("/api/business"); }, // partner server only
  async saveBusiness(b) { const r = await call("PUT", "/api/business", b); clearCache(); return r.id; },

  // ---------- offers ----------
  async listLive(city) { return live(await cached("city:" + city, 60000, () => publicGet(`/api/offers?city=${enc(city)}`))); },
  async listNearby(lat, lng, radiusKm) {
    const key = `near:${lat.toFixed(2)},${lng.toFixed(2)},${radiusKm}`;
    return live(await cached(key, 60000, () => publicGet(`/api/offers?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}&radius=${radiusKm}`)));
  },
  async listByPincode(pincode) { return live(await cached("pin:" + pincode, 60000, () => publicGet(`/api/offers?pincode=${enc(pincode)}`))); },
  async getConfig() { return cached("config", 60000, () => get("/api/config").catch(() => ({ freeMode: false }))); },
  async listCities() { return cached("cities", 300000, () => get("/api/cities")); },
  async getOfferPhoto(id) { try { return (await get(`/api/offers/${enc(id)}/photo`)).photo; } catch { return null; } },
  async myArchive() { return get("/api/owner/archive"); },
  async getOffer(id) { try { return await get(`/api/offers/${enc(id)}`); } catch (e) { if (e.status === 404) return null; throw e; } },
  async myOffers() { return get("/api/owner/offers"); },
  async createOffer(o) { const r = await post("/api/owner/offers", o); clearCache(); return r; },
  async endOffer(id) { await post(`/api/owner/offers/${enc(id)}/end`); clearCache(); },
  async addView(id) { try { await post(`/api/offers/${enc(id)}/view`); } catch { /* not critical */ } },
  // a small thumbnail (for lists) and a full photo (opened on the offer page)
  async uploadPhoto(file) {
    const [thumb, photo] = await Promise.all([compressPhoto(file, 360, 28000), compressPhoto(file, 1000, 190000)]);
    return { thumb, photo };
  },

  // ---------- number exchange (customer server) ----------
  async revealContact(offerId) { return post(`/api/offers/${enc(offerId)}/reveal`); },
  async logContact(offerId, how) { try { await post(`/api/offers/${enc(offerId)}/log`, { how }); } catch { /* not critical */ } },
  async shareNumber(offerId) { await post(`/api/offers/${enc(offerId)}/share`); },
  async mySharedOfferIds() { return get("/api/me/shared-offer-ids"); },
  async myContacts() { return get("/api/me/contacts"); },
  async ownerLeads() { try { return await get("/api/owner/leads"); } catch { return []; } },
  async setLeadStatus(id, status) { await call("PATCH", `/api/owner/leads/${enc(id)}`, { status }); },

  // ---------- reports ----------
  async report(offerId, reason, details) { await post(`/api/offers/${enc(offerId)}/report`, { reason, details }); },

  // ---------- admin & moderators (admin server) ----------
  async adminStats() { return get("/api/admin/stats"); },
  async adminFindUsers(q) { return get(`/api/admin/users?q=${enc(q || "")}`); },
  async revealUser(id) { return post(`/api/admin/users/${enc(id)}/reveal`); },
  async revealBusiness(id) { return post(`/api/admin/businesses/${enc(id)}/reveal`); },
  async adminTeam() { return get("/api/admin/team"); },
  async adminSetRole(email, role, regions, cities = [], pincodes = []) { await post("/api/admin/role", { email, role, regions, cities, pincodes }); },
  async adminBusinesses(filter = {}) {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
    return get("/api/admin/businesses" + (qs ? "?" + qs : ""));
  },
  async setBusinessStatus(id, status, note) { await post(`/api/admin/businesses/${enc(id)}/status`, { status, note }); },
  async adminReports() { return get("/api/admin/reports"); },
  async resolveReport(id, status, removeOffer = false) { await post(`/api/admin/reports/${enc(id)}/resolve`, { status, removeOffer }); },
  async adminSetPlan(email, plan, months) { await post("/api/admin/plans", { email, plan, months }); },
  async adminSetConfig(cfg) { clearCache(); return post("/api/admin/config", cfg); },
  async adminSettings() { return get("/api/admin/settings"); },
  async setAdminSettings(v) { const r = await post("/api/admin/settings", v); memo.clear(); return r; },
  async adminBusinessPlan(businessId, action, extra = {}) { await post(`/api/admin/businesses/${enc(businessId)}/plan`, { action, ...extra }); },
  async adminGrievances(status) { return get(`/api/admin/grievances?status=${enc(status || "open")}`); },
  async adminUpdateGrievance(ticket, status, reply) { await post(`/api/admin/grievances/${enc(ticket)}`, { status, reply }); },

  // ---------- reviews ----------
  async listReviews(businessId) { return get(`/api/businesses/${enc(businessId)}/reviews`); },
  async myReview(businessId) { try { return await get(`/api/businesses/${enc(businessId)}/my-review`); } catch { return null; } },
  async ownerReviews() { return get("/api/owner/reviews"); },
  async submitReview(businessId, rating, text) { const r = await post(`/api/businesses/${enc(businessId)}/reviews`, { rating, text }); clearCache(); return r; },
  async replyReview(reviewId, text) { await post(`/api/reviews/${enc(reviewId)}/reply`, { text }); },
  async reportReview(reviewId, reason, details) { await post(`/api/reviews/${enc(reviewId)}/report`, { reason, details }); },

  // ---------- privacy & complaints ----------
  async recordConsent(kind, extra = {}) { await post("/api/consent", { kind, version: CONSENT_VERSION, ...extra }); },
  async exportMyData() { return get("/api/privacy/export"); },
  async deleteMyAccount() { await post("/api/privacy/delete", { confirm: "DELETE" }); clearCache(); setToken(null); },
  async submitGrievance(g) { return post("/api/grievances", g); },
  async myGrievances() { return get("/api/grievances/mine"); },
  // ---------- dashboards ----------
  async mySavings() { return get("/api/me/savings"); },
  async ownerInsights() { return get("/api/owner/insights"); },

  // ---------- help & support ----------
  async createSupport({ topic, message, role }) { return post("/api/support", { topic, message, role }); },
  async mySupport() { return get("/api/support"); },
  async supportThread(id) { return get(`/api/support/${enc(id)}`); },
  async supportReply(id, message) { await post(`/api/support/${enc(id)}/messages`, { message }); },
  async adminSupport(status) { return get(`/api/admin/support?status=${enc(status || "open")}`); },
  async adminSupportThread(id) { return get(`/api/admin/support/${enc(id)}`); },
  async adminSupportReply(id, message, close = false) { await post(`/api/admin/support/${enc(id)}/reply`, { message, close }); },

  // revenue: boosted offers, sponsored banners, admin revenue page
  async boostOffer(id, hours) { return post(`/api/owner/offers/${enc(id)}/boost`, { hours }); },
  async myBoosts() { return get("/api/owner/boosts"); },
  async banners(city) { return get(`/api/banners?city=${enc(city || "")}`); },
  async adminBoosts(status) { return get(`/api/admin/boosts?status=${enc(status || "pending")}`); },
  async decideBoost(id, action, note = "") { return post(`/api/admin/boosts/${enc(id)}`, { action, note }); },
  async adminBanners() { return get("/api/admin/banners"); },
  async createBanner(b) { return post("/api/admin/banners", b); },
  async stopBanner(id) { return post(`/api/admin/banners/${enc(id)}/stop`); },
  async revenue() { return get("/api/admin/revenue"); },

  async logClientError(e) { try { await post("/api/client-error", e); } catch { /* never let error reporting break the app */ } },
};
