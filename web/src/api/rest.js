// Live backend: the LastPick API on Supabase. Each app talks to its own function
// (customer site -> customer server, partner site -> partner server, admin panel -> admin server).
// Same-origin by default; the Android apps set VITE_API_URL to their server's address.
import { CONSENT_VERSION, IS_ADMIN_APP, IS_CUSTOMER_APP, IS_NATIVE, RENTALS } from "../lib/config.js";
import { compressPhoto, dataUrlToBlob, putWithProgress, videoSeconds } from "../lib/image.js";
import { startRequest } from "../lib/busy.js";

const BASE = (import.meta.env?.VITE_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "lastpick-token";
const listeners = new Set();
let token = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
function setToken(t) {
  token = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  listeners.forEach((cb) => cb());
}

async function call(method, path, body, { anonymous = false, quiet = false } = {}) {
  const finish = startRequest({ quiet });
  try { return await send(method, path, body, anonymous); } finally { finish(); }
}
// A request that never reached LastPick (no internet, or the server restarting for a moment): GETs are tried again
// quietly (after 1, 2 and 4 seconds). If it still fails, the app shows only the small "Reconnecting…" strip, never an
// error box (errText gives "" for these). Saves (POST, PUT…) aren't repeated automatically, so nothing is done twice.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function offline() {
  try { window.dispatchEvent(new Event("lastpick-recheck")); } catch { /* not in a browser */ }
  const e = new Error(""); e.code = "offline"; e.offline = true; return e;
}
async function send(method, path, body, anonymous) {
  let res;
  const tries = method === "GET" ? [0, 1000, 2000, 4000] : [0];
  for (const delay of tries) {
    if (delay) await wait(delay);
    try {
      res = await fetch(BASE + path, {
        method,
        // public lists are fetched without the login, so Cloudflare can serve the same copy to everyone nearby
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token && !anonymous ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      // the server's front door answering 502/503/504 while it restarts: same as no answer for a GET
      if (method === "GET" && [502, 503, 504].includes(res.status) && delay !== tries[tries.length - 1]) { res = null; continue; }
      break;
    } catch { res = null; }
  }
  if (!res) throw offline();
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

// ---------- Google Play payments (Android partner app). Same packs and prices as the website. ----------
const playBilling = () => (IS_NATIVE && window.Capacitor?.Plugins?.PlayBilling) || null;
export const canBuyInApp = () => !!playBilling();
const PENDING_TEXT = "Your payment is still processing with Google. Your plan switches on by itself as soon as it's confirmed.";
async function googleBuy(plan, days, extra = {}) {
  const pb = playBilling();
  if (!pb) throw new Error("Please update the LastPick Partner app from the Play Store to buy plans.");
  const s = await post("/api/payments/google/start", { plan, days, ...extra });
  const r = await pb.buy({ productId: s.productId, accountId: s.accountId, ref: s.ref });
  if (r?.cancelled) throw new Error("Payment was not completed. No money was taken.");
  if (r?.pending) throw new Error(PENDING_TEXT);
  if (!r?.purchaseToken) throw new Error("Google Play didn't finish the payment. If money was taken, your plan switches on automatically within a few minutes.");
  const c = await post("/api/payments/google/confirm", { productId: r.productId || s.productId, purchaseToken: r.purchaseToken, ref: s.ref });
  if (c.pending) throw new Error(PENDING_TEXT);
  return true;
}
// purchases Google finished while the app was closed or offline (or pending UPI that went through later):
// confirm them quietly when the app opens
export async function finishGooglePurchases() {
  const pb = playBilling();
  if (!pb || !token) return 0;
  let n = 0;
  try {
    const { purchases = [] } = await pb.unfinished();
    for (const p of purchases) {
      if (p.state !== "purchased") continue;
      try { const c = await call("POST", "/api/payments/google/confirm", { productId: p.productId, purchaseToken: p.purchaseToken, ref: p.ref }, { quiet: true }); if (c.paid) n++; } catch { /* tried again next time */ }
    }
  } catch { /* billing not available on this phone */ }
  return n;
}
// Razorpay Checkout's script, loaded only when someone pays
let rzLoading = null;
function razorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  rzLoading ||= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.onload = () => resolve();
    el.onerror = () => { rzLoading = null; reject(new Error("Couldn't open the payment window. Check your internet and try again.")); };
    document.head.appendChild(el);
  });
  return rzLoading;
}

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

const qsOf = (filter) => { const qs = new URLSearchParams(Object.entries(filter || {}).filter(([, v]) => v)).toString(); return qs ? "?" + qs : ""; };

export const api = {
  mode: "live",

  // ---------- login (test accounts for now; one-time codes come later) ----------
  async getSession() {
    if (!token) return null;
    try { const me = await get("/api/me"); return { user: { id: me.id, email: me.email } }; }
    catch (e) { if (e.status === 401) return null; throw e; }
  },
  onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  // log in with e-mail OR mobile number + password
  async signIn(login, password) { const r = await post("/api/auth/login", { login: String(login || "").trim(), password }); clearCache(); setToken(r.token); },
  // forgot password: a code to the e-mail (for a mobile number: to the e-mail on that account)
  async sendResetCode(login) { return post("/api/auth/otp/send", { login: String(login || "").trim() }); },
  async signUp({ email, password, name, phone, consent, otp, phoneOtp, photo, waOptIn }) {
    // consent goes as is: it carries the Terms text the person read (readFull, docText, docHash)
    const r = await post("/api/auth/signup", { email: email.trim(), password, name, phone, otp, phoneOtp, photo: photo || undefined, waOptIn: waOptIn === true, consent: consent || undefined });
    setToken(r.token);
    return { needsConfirmation: false };
  },
  // one-time codes: always by e-mail; for a mobile number the code goes to the e-mail on that account
  // log in with mobile number + a 6-digit code on WhatsApp (customers and partners)
  async sendPhoneOtp(phone) { return post("/api/auth/wa/send", { phone: String(phone || "").trim() }); },
  async verifyPhoneOtp(phone, code) { const r = await post("/api/auth/wa/verify", { phone: String(phone || "").trim(), code }); clearCache(); setToken(r.token); return { isNew: !!r.isNew }; },
  async sendEmailOtp(email) { return post("/api/auth/otp/send", { email: String(email || "").trim() }); },
  async sendSmsOtp(phone, optIn) { return post("/api/auth/otp/send-phone", { phone: String(phone || "").trim(), optIn: optIn === true }); },
  // KYC: verify the saved mobile number from the account page
  async sendMyPhoneCode(optIn) { return post("/api/me/phone/send", { optIn: optIn === true }); },
  async verifyMyPhone(code) { return post("/api/me/phone/verify", { code: String(code || "").trim() }); },
  async verifyEmailOtp(email, code) { const r = await post("/api/auth/otp/verify", { email: String(email || "").trim(), code }); clearCache(); setToken(r.token); return { isNew: !!r.isNew }; },
  async completeProfile({ name, phone, consent }) {
    await post("/api/me/complete-profile", { name, phone, consent });
  },
  // forgot password: code from sendEmailOtp + new password -> logged in here, other devices logged out
  async resetPassword(login, code, password) { const r = await post("/api/auth/reset", { login, code, password }); clearCache(); setToken(r.token); },
  async signOut() { clearCache(); setToken(null); },
  async getProfile() { return get("/api/me"); },
  // is this login still valid? false = it was ended (e.g. logged in on another device), and the app is now logged out
  async checkSession() {
    if (!token) return true;
    try { await call("GET", "/api/me", undefined, { quiet: true }); return true; } catch (e) { return e.status !== 401; }
  },
  async updateProfile({ name, phone }) { await call("PATCH", "/api/me", { name, phone }); },

  // ---------- plans: pay once (website: Razorpay; Android app: Google Play), no auto-renewal ----------
  async mySubscriptions() { return get("/api/me/subscriptions"); },
  async subscribe(plan, _profile, days = 30, extra = {}) {
    if (IS_NATIVE) return googleBuy(plan, days, extra);
    const o = await post("/api/payments/order", { plan, days, ...extra });
    await razorpayScript();
    const check = () => post("/api/payments/check", { orderId: o.orderId });
    return new Promise((resolve, reject) => {
      const rz = new window.Razorpay({
        key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency, name: o.name, description: o.description,
        prefill: o.prefill, theme: { color: getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#0E6B66" },
        // paid: the server checks Razorpay's signature and adds 30 days
        handler: (r) => post("/api/payments/verify", { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature })
          .then(() => resolve(true), async (e) => { try { if ((await check()).paid) return resolve(true); } catch { /* keep the first error */ } reject(e); }),
        // closed without the success reply: ask the server whether the order was paid anyway
        modal: { ondismiss: () => check().then((c) => (c.paid ? resolve(true) : reject(new Error("Payment was not completed. No money was taken."))), reject) },
      });
      rz.open();
    });
  },
  // ---------- rentals (homes and workspaces) ----------
  async myRentals() { return get("/api/owner/rentals"); },
  async myRental(id) { return get(`/api/owner/rentals/${enc(id)}`); },
  async createRental(f) { return post("/api/owner/rentals", f); },
  async updateRental(id, f) { return call("PUT", `/api/owner/rentals/${enc(id)}`, f); },
  async removeRentalMedia(id, mid) { return post(`/api/owner/rentals/${enc(id)}/media/${enc(mid)}/remove`); },
  // photo (shrunk on the phone to under 1 MB) or video (checked: up to 1 minute, 20 MB), sent straight to R2
  async addRentalMedia(id, file, kind, onProgress = () => {}) {
    let blob = file, type = file.type || "";
    if (kind === "photo") {
      const dataUrl = await compressPhoto(file, 1600, 900000);
      blob = dataUrlToBlob(dataUrl); type = "image/jpeg";
    } else {
      if (!/^video\//.test(type)) throw new Error("Choose a video file");
      if (file.size > RENTALS.videoBytes) throw new Error("This video is over 20 MB. Please shorten it to 1 minute or compress it first.");
      const secs = await videoSeconds(file);
      if (secs > RENTALS.videoSeconds + 1) throw new Error(`This video is ${Math.round(secs)} seconds. Please keep it to 1 minute.`);
      if (!/^video\/(mp4|webm|quicktime|3gpp)$/.test(type)) type = "video/mp4";
    }
    const start = await post(`/api/owner/rentals/${enc(id)}/media`, { kind, type, bytes: blob.size });
    if (!start.uploadUrl) {
      // no R2 (local test runs): send the photo through the server
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      return post(`/api/owner/rentals/${enc(id)}/media/${enc(start.mediaId)}/data`, { data: dataUrl });
    }
    await putWithProgress(start.uploadUrl, blob, type, onProgress);
    return post(`/api/owner/rentals/${enc(id)}/media/${enc(start.mediaId)}/done`);
  },
  // live for 15 or 30 days: free in free launch mode, else paid (website: Razorpay; Android app: Google Play)
  async publishRental(id, days) {
    const r = await post(`/api/owner/rentals/${enc(id)}/publish`, { days });
    if (r.live) return r;
    await this.subscribe("rental", null, days, { listingId: id });
    return { live: true };
  },
  async closeRental(id) { return post(`/api/owner/rentals/${enc(id)}/close`); },
  async reopenRental(id) { return post(`/api/owner/rentals/${enc(id)}/reopen`); },
  async removeRental(id) { return post(`/api/owner/rentals/${enc(id)}/remove`); },
  async rentalsNear(lat, lng, kind) { return publicGet(`/api/rentals?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}&kind=${kind}`); },
  async rental(id) { return publicGet(`/api/rentals/${enc(id)}`); },
  async rentalContact(id) { return post(`/api/rentals/${enc(id)}/contact`); },

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
  // fresh: skip the 60-second memo (used by the 3-minute refresh). If the server can't be reached the result says so,
  // and the apps show the "We'll be right back" page.
  async getConfig(fresh = false) {
    // A phone's connection often drops for a second (switching apps, 4G to Wi-Fi). Try 3 times before saying
    // the server can't be reached, and never remember a failure: the next check tries again.
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const load = async () => {
      for (const pause of [0, 1500, 4000]) {
        if (pause) await wait(pause);
        try { return await call("GET", "/api/config", undefined, { quiet: true }); } catch (e) { if (e.status && e.status < 500) return { freeMode: false }; }
      }
      return { freeMode: false, unreachable: true };
    };
    if (!fresh) { const hit = memo.get("config"); if (hit && Date.now() - hit.at < 60000) return hit.v; }
    const r = await load();
    if (r.unreachable) memo.delete("config"); else memo.set("config", { at: Date.now(), v: r });
    return r;
  },
  async listCities() { return cached("cities", 300000, () => get("/api/cities")); },
  async getOfferPhoto(id) { try { return (await get(`/api/offers/${enc(id)}/photo`)).photo; } catch { return null; } },
  async myArchive() { return get("/api/owner/archive"); },
  async getOffer(id) { try { return await get(`/api/offers/${enc(id)}`); } catch (e) { if (e.status === 404) return null; throw e; } },
  async myOffers() { return get("/api/owner/offers"); },
  // My items: the partner's list of item names (no prices)
  async myItems() { return get("/api/owner/items"); },
  async addMyItem(name) { return post("/api/owner/items", { name }); },
  async removeMyItem(id) { return post(`/api/owner/items/${id}/remove`, {}); },
  async createOffer(o) { const r = await post("/api/owner/offers", o); clearCache(); return r; },
  async updateSeats(id, seats) { const r = await post(`/api/owner/offers/${enc(id)}/seats`, { seats }); clearCache(); return r; },
  async endOffer(id) { await post(`/api/owner/offers/${enc(id)}/end`); clearCache(); },
  async addView(id) { try { await post(`/api/offers/${enc(id)}/view`); } catch { /* not critical */ } },
  // a small thumbnail (for lists) and a full photo (opened on the offer page)
  // partner KYC: the owner's profile photo, made small before it is sent
  // shop photo: shrunk on the phone to about 1000 px / under 250 KB (always well under 1 MB) before upload
  async profilePhotoFrom(file) { return compressPhoto(file, 1000, 250000); },
  async myPhoto() { try { return (await get("/api/me/photo")).photo; } catch { return null; } },
  async setMyPhoto(photo) { await call("PUT", "/api/me/photo", { photo }); },
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
  // filter = { state, city, pincode, category } (any of them); a plain string is a category
  async adminStats(filter = {}) { return get("/api/admin/stats" + qsOf(filter)); },
  async adminPincodes(filter = {}) { return get("/api/admin/pincodes" + qsOf(typeof filter === "string" ? { category: filter } : filter)); },
  async adminAreas() { return get("/api/admin/areas"); },
  async adminFindUsers(q) { return get(`/api/admin/users?q=${enc(q || "")}`); },
  async adminUsers(kind, q) { return get(`/api/admin/users?kind=${enc(kind)}&q=${enc(q || "")}`); },
  async adminUserPhoto(id) { return (await get(`/api/admin/users/${enc(id)}/photo`)).photo; },
  async adminConsents(id) { return get(`/api/admin/users/${enc(id)}/consents`); },
  async adminExportUsers(kind) { return get(`/api/admin/users/export?kind=${enc(kind)}`); },
  async adminSetPlanFor(userId, plan, months) { await post("/api/admin/plans", { userId, plan, months }); },
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
  async adminCategoryPhoto(category, slot, photo) { await post("/api/admin/category-photo", { category, slot, photo }); },
  async categoryPhotoFrom(file) { return compressPhoto(file, 160, 30000); },
  async adminChangeCategory(businessId, category, reason) { return post(`/api/admin/businesses/${enc(businessId)}/category`, { category, reason }); },
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
  async createSupport({ topic, message, role, photos, place }) { return post("/api/support", { topic, message, role, photos, place }); },
  async mySupport() { return get("/api/support"); },
  async supportThread(id) { return get(`/api/support/${enc(id)}`); },
  async supportReply(id, message, photos) { await post(`/api/support/${enc(id)}/messages`, { message, photos }); },
  async supportResolve(id) { return post(`/api/support/${enc(id)}/resolve`, {}); },
  // ---------- Support Desk (support.lastpick.in) ----------
  async deskMe() { return get("/api/desk/me"); },
  async deskTickets({ view = "open", area = "", topic = "", q = "" } = {}, quiet = false) { return call("GET", `/api/desk/tickets?view=${enc(view)}&area=${enc(area)}&topic=${enc(topic)}&q=${enc(q)}`, undefined, { quiet }); },
  async deskTicket(id) { return get(`/api/desk/tickets/${enc(id)}`); },
  async deskReply(id, message, photos) { return post(`/api/desk/tickets/${enc(id)}/reply`, { message, photos }); },
  async deskResolve(id, { call = false, note = "" } = {}) { return post(`/api/desk/tickets/${enc(id)}/resolve`, { call, note }); },
  async deskEscalate(id) { return post(`/api/desk/tickets/${enc(id)}/escalate`, {}); },
  async deskCallbacks(status = "new") { return get(`/api/desk/callbacks?status=${enc(status)}`); },
  async deskCallbackDone(id) { return post(`/api/desk/callbacks/${enc(id)}/done`, {}); },
  async deskCreateIncharge(body) { return post("/api/desk/incharges", body); },
  async deskEditIncharge(id, body) { return post(`/api/desk/incharges/${enc(id)}`, body); },
  async deskInchargePassword(id, password) { return post(`/api/desk/incharges/${enc(id)}/password`, { password }); },
  async deskRemoveIncharge(id) { return post(`/api/desk/incharges/${enc(id)}/remove`, {}); },
  async deskIncharges() { return get("/api/desk/incharges"); },
  async requestCallback({ topic, bestTime, note, role }) { return post("/api/callbacks", { topic, bestTime, note, role }); },
  async myCallback() { return get("/api/callbacks/mine"); },
  async adminCallbacks(status) { return get(`/api/admin/callbacks?status=${enc(status || "new")}`); },
  async adminCallbackDone(id) { await post(`/api/admin/callbacks/${enc(id)}/done`, {}); },
  async adminSupport(status) { return get(`/api/admin/support?status=${enc(status || "open")}`); },
  async adminSupportThread(id) { return get(`/api/admin/support/${enc(id)}`); },
  async adminSupportReply(id, message, close = false) { await post(`/api/admin/support/${enc(id)}/reply`, { message, close }); },

  // revenue: boosted offers, sponsored banners, admin revenue page
  async boostOffer(id, hours) { return post(`/api/owner/offers/${enc(id)}/boost`, { hours }); },
  async myBoosts() { return get("/api/owner/boosts"); },
  async banners(city) { return get(`/api/banners?city=${enc(city || "")}`); },
  // public counts: partners in a pincode and in total, customers in total, newly joined partners
  async stats(pincode) { return get(`/api/stats${pincode ? `?pincode=${enc(pincode)}` : ""}`); },
  async adminBoosts(status) { return get(`/api/admin/boosts?status=${enc(status || "pending")}`); },
  async decideBoost(id, action, note = "") { return post(`/api/admin/boosts/${enc(id)}`, { action, note }); },
  async adminBanners() { return get("/api/admin/banners"); },
  async createBanner(b) { return post("/api/admin/banners", b); },
  async stopBanner(id) { return post(`/api/admin/banners/${enc(id)}/stop`); },
  async revenue() { return get("/api/admin/revenue"); },

  async logClientError(e) { try { await post("/api/client-error", e); } catch { /* never let error reporting break the app */ } },
};
