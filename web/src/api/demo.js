// Demo backend: same interface as firebase.js, data kept in this browser's localStorage.
// Used automatically when VITE_FIREBASE_API_KEY is not set. No real payments happen here.
import { compressPhoto } from "../lib/image.js";
import { CONSENT_VERSION, cityKey } from "../lib/config.js";
import { distanceKm, indianPhone } from "../lib/format.js";

const KEY = "lastpick-demo-v7";
const H = 3600000, D = 86400000;
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const listeners = new Set();

export const DEMO_ACCOUNTS = [
  { email: "customer@demo.in", password: "demo1234", label: "Customer (no plan yet)" },
  { email: "owner@demo.in", password: "demo1234", label: "Owner: Sunrise Bakery" },
  { email: "admin@demo.in", password: "demo1234", label: "Admin (all India)" },
  { email: "moderator@demo.in", password: "demo1234", label: "Moderator (Telangana)" },
];

const PINS = {"Indiranagar": "560038", "MG Road": "560001", "Jayanagar": "560041", "Majestic": "560009", "HSR Layout": "560102", "Koramangala": "560034", "Commercial Street": "560001", "Whitefield": "560066", "Banjara Hills": "500034", "Andheri East": "400069", "T. Nagar": "600017"};

function seed() {
  const n = Date.now();
  const users = [
    { id: "u-cust", email: "customer@demo.in", password: "demo1234", name: "Priya", phone: "9000012345", role: "user" },
    { id: "u-own", email: "owner@demo.in", password: "demo1234", name: "Suresh", phone: "9845011223", role: "user" },
    { id: "u-admin", email: "admin@demo.in", password: "demo1234", name: "Admin", phone: "9000000000", role: "admin" },
    { id: "u-mod", email: "moderator@demo.in", password: "demo1234", name: "Kavya (Hyderabad)", phone: "9000000001", role: "moderator", regions: ["Telangana"] },
  ].map((u) => ({ ...u, phone: indianPhone(u.phone), createdAt: n - 10 * D, consent: CONSENT_VERSION, partnerConsent: CONSENT_VERSION }));
  const biz = [
    ["u-own", "Sunrise Bakery", "food", "Indiranagar", 12.9784, 77.6408, "9845011223"],
    ["o2", "Hotel Grand Residency", "stay", "MG Road", 12.9756, 77.6066, "8041255667"],
    ["o3", "Shubh Mangal Function Hall", "venue", "Jayanagar", 12.925, 77.5938, "9900123456"],
    ["o4", "Royal Travels", "travel", "Majestic", 12.9767, 77.5713, "9740088990"],
    ["o5", "KickOff Turf", "sports", "HSR Layout", 12.9116, 77.6474, "9008044556"],
    ["o6", "ZoomCars Point", "rental", "Koramangala", 12.9352, 77.6245, "9632077889"],
    ["o7", "Trendz Fashion", "retail", "Commercial Street", 12.9822, 77.6083, "9886133445"],
    ["o8", "Glow Salon", "beauty", "Whitefield", 12.9698, 77.75, "9812345670"],
    ["o10", "Paradise Banquets", "venue", "Banjara Hills", 17.4156, 78.4347, "9849012345", "Hyderabad", "Telangana"],
    ["o11", "Hotel Sea Breeze", "stay", "Andheri East", 19.1136, 72.8697, "9820012345", "Mumbai", "Maharashtra"],
    ["o12", "Chennai Sweets", "food", "T. Nagar", 13.0418, 80.2341, "9840012345", "Chennai", "Tamil Nadu"],
    ["o14", "Dr. Rao Eye Clinic", "health", "Indiranagar", 12.9731, 77.6385, "9845022334"],
    ["o15", "Greenwood Public School", "admissions", "Indiranagar", 12.9705, 77.6455, "8041234567"],
    ["o16", "Ravi K (driving to Mysuru)", "trips", "Indiranagar", 12.9762, 77.6399, "9900011122"],
    ["o17", "Meena (selling at home)", "sell", "Indiranagar", 12.9748, 77.6421, "9900033344"],
    ["o18", "Indiranagar Kirana Stores", "grocery", "Indiranagar", 12.9779, 77.6436, "9845055667"],
    ["o19", "Lakshmi Talkies", "events", "Indiranagar", 12.9718, 77.6412, "8041122334"],
  ].map(([owner, name, category, area, lat, lng, phone, city = "Bengaluru", state = "Karnataka"], i) => ({
    id: "b" + (i + 1), ownerId: owner, name, category, categories: [category], about: "", address: `${area}, ${city}`, area, city, state, cityKey: cityKey(city), lat, lng,
    pincode: PINS[area] || "",
    status: "verified", statusNote: "", reportCount: 0, createdAt: n - 30 * D, phone: indianPhone(phone), whatsapp: true,
  }));
  biz.push({ id: "b99", ownerId: "o9", name: "New Mobile World", category: "electronics", about: "", address: "SP Road", area: "SP Road", city: "Bengaluru", state: "Karnataka", cityKey: "bengaluru", pincode: "560002", lat: 12.968, lng: 77.58, status: "pending", statusNote: "", reportCount: 0, createdAt: n - 2 * H, phone: indianPhone("9988776655"), whatsapp: true });
  biz.push({ id: "b98", ownerId: "o13", name: "Quick Deals Hyd", category: "electronics", about: "", address: "Ameerpet", area: "Ameerpet", city: "Hyderabad", state: "Telangana", cityKey: "hyderabad", pincode: "500016", lat: 17.4375, lng: 78.4482, status: "pending", statusNote: "", reportCount: 0, createdAt: n - 5 * H, phone: indianPhone("9849012345"), whatsapp: true });
  const subs = ["u-own", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o10", "o11", "o12", "o14", "o15", "o16", "o17", "o18", "o19"].map((u) => ({ userId: u, plan: "owner", status: "active", currentPeriodEnd: n + 20 * D, provider: "demo" }));
  const o = (b, category, emoji, title, description, origPrice, price, quantity, endsIn, views) => ({
    id: rid(), businessId: b, title, description, category, emoji, photoUrl: null, origPrice, price, quantity,
    endsAt: n + endsIn, status: "live", views, createdAt: n - 2 * H,
  });
  const offers = [
    o("b1", "food", "🎂", "Fresh cakes & pastries before closing", "Today's cakes, pastries and breads at half price. Come before 10:30 PM.", 600, 299, "7 left", 95 * 60000, 142),
    o("b1", "food", "🥐", "Croissant box of 6 for tomorrow morning", "Order tonight, collect fresh at 8 AM.", 420, 260, "10 boxes", 9 * H, 63),
    o("b2", "stay", "🛏️", "Deluxe AC room for tonight", "Double bed, breakfast included. Check-in till midnight.", 3800, 1999, "3 rooms", 5 * H, 211),
    o("b3", "venue", "💒", "Marriage hall for 300 guests, free this Sunday", "Hall, dining area and 6 rooms for one day. Cancelled booking, so heavily discounted.", 180000, 95000, "1 date", 2 * D, 388),
    o("b4", "travel", "🚌", "AC sleeper to Chennai, leaves 10:45 PM", "6 seats unsold. Board at Majestic bus stand.", 1400, 799, "6 seats", 150 * 60000, 96),
    o("b5", "sports", "⚽", "5-a-side turf, 10 to 11 PM tonight", "Floodlights, bibs and ball included.", 1800, 900, "1 slot", 55 * 60000, 54),
    o("b6", "rental", "🚗", "Swift self-drive, free for the weekend", "Unlimited km within Karnataka. Licence and ID needed.", 5200, 2999, "1 car", 20 * H, 120),
    o("b7", "retail", "👕", "Last-season shirts, 3 for the price of 1", "Sizes M to XL.", 2400, 799, "18 left", 26 * H, 77),
    o("b8", "beauty", "💇", "Haircut + head massage, weekday afternoons", "Senior stylists, 2 to 5 PM slots.", 900, 449, "8 slots", 3 * D, 40),
    o("b9", "venue", "💒", "Banquet hall for 500, free on Saturday", "AC hall with parking. Cancelled booking.", 250000, 140000, "1 date", 3 * D, 210),
    o("b10", "stay", "🛏️", "Business rooms near the airport tonight", "Free airport pickup after 10 PM.", 4500, 2499, "5 rooms", 6 * H, 133),
    o("b11", "food", "🍬", "Sweets and savouries at closing time", "Mixed boxes, 40% off after 8 PM.", 800, 480, "20 boxes", 3 * H, 88),
    o("b12", "health", "🩺", "Free eye check-up camp this Sunday", "9 AM to 1 PM. Register by sharing your number; 60 slots.", 500, 0, "42 of 60 slots", 3 * D, 230),
    o("b13", "admissions", "🎓", "Early-bird admissions 2027-28: 20% off first-year fees", "Nursery to Class 9. Offer valid for admissions confirmed before 31 May.", 60000, 48000, "Limited seats", 60 * D, 512),
    o("b14", "trips", "🧳", "Driving to Mysuru tomorrow 6 AM, 2 seats free", "Swift, AC. Share fuel cost. Pickup at Indiranagar metro.", 800, 350, "2 seats", 14 * H, 64),
    o("b15", "sell", "🏷️", "Used cycle in good condition", "Hero 26-inch, 2 years old, new tyres.", 4000, 1500, "1 piece", 6 * D, 41),
    o("b17", "events", "🎬", "Empty seats for today's 6:30 PM show: tickets ₹80", "Hall is half empty. Normal price ₹200. Show this offer at the counter.", 200, 80, "60 seats", 4 * H, 187),
    o("b16", "jobs", "🧰", "Loaders (coolies) needed tomorrow 7 AM, ₹700/day", "Unloading a rice truck, 4-5 hours. Lunch provided.", 700, 700, "5 people", 20 * H, 73),
    o("b16", "jobs", "🧰", "Shop helper needed, full time", "Billing and stocking. 9 AM to 8 PM, Sundays off.", 15000, 15000, "1 opening · ₹15,000/month", 12 * D, 58),
  ];
  const leads = [
    { id: rid(), offerId: offers[0].id, businessId: "b1", customerId: "x1", name: "Ravi Kumar", phone: "9876543210", status: "new", createdAt: n - 12 * 60000 },
    { id: rid(), offerId: offers[0].id, businessId: "b1", customerId: "x2", name: "Ananya S", phone: "9123456780", status: "contacted", createdAt: n - 48 * 60000 },
    { id: rid(), offerId: offers[1].id, businessId: "b1", customerId: "x3", name: "Mohammed Irfan", phone: "9986012345", status: "new", createdAt: n - 110 * 60000 },
  ];
  const archive = [
    { id: rid(), ownerId: "u-own", businessName: "Sunrise Bakery", title: "Diwali sweets box", category: "food", emoji: "🪔", origPrice: 900, price: 540, views: 410, leads: 23, status: "live", createdAt: n - 25 * D, endsAt: n - 20 * D },
    { id: rid(), ownerId: "u-own", businessName: "Sunrise Bakery", title: "Birthday cakes, 30% off", category: "food", emoji: "🎂", origPrice: 1200, price: 840, views: 176, leads: 9, status: "ended", createdAt: n - 14 * D, endsAt: n - 12 * D },
  ];
  const reviews = [
    { id: "b1_x1", businessId: "b1", customerId: "x1", name: "Ravi", rating: 5, text: "Cakes were fresh and the owner kept them aside for me. Great deal.", offerTitle: offers[0].title, status: "published", createdAt: n - 3 * D, reply: { text: "Thank you Ravi, see you again!", at: n - 2 * D } },
    { id: "b1_x2", businessId: "b1", customerId: "x2", name: "Ananya", rating: 4, text: "Good pastries. Came a bit late so fewer choices.", offerTitle: offers[0].title, status: "published", createdAt: n - 6 * D, reply: null },
  ];
  biz[0].rating = { avg: 4.5, count: 2 };
  // the demo customer's history, so My savings has something to show
  const contacts = [[0, "Called", 2 * D], [2, "WhatsApp", 9 * D], [3, "Viewed number", 35 * D], [6, "Shared my number", 70 * D], [7, "Called", 100 * D]]
    .map(([i, how, ago]) => ({ customerId: "u-cust", offerId: offers[i].id, how, at: n - ago, snap: { title: offers[i].title, category: offers[i].category, price: offers[i].price, origPrice: offers[i].origPrice, businessId: offers[i].businessId } }));
  const support = [{ id: "s1", userId: "u-cust", role: "customer", topic: "Using the app", status: "answered", createdAt: n - 2 * D, updatedAt: n - D,
    messages: [{ fromStaff: false, body: "How do I share my number with a business?", at: n - 2 * D }, { fromStaff: true, body: "Open the offer and tap \"Share my number\". You'll see exactly who gets it before it's sent.", at: n - D }] }];
  return { v: 6, config: { freeMode: true }, session: null, users, businesses: biz, subs, offers, leads, contacts, reports: [], photos: {}, archive, reviews, grievances: [], consentLog: [], support };
}

function load() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { db = null; }
  // reseed when empty or when every demo offer has expired
  if (!db || db.v !== 6 || !db.offers.some((o) => o.status === "live" && o.endsAt > Date.now())) {
    const fresh = seed();
    if (db?.session) fresh.session = db.session;
    db = fresh;
    save(db);
  }
  return db;
}
function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ } }
function me(db) {
  const u = db.users.find((x) => x.id === db.session);
  if (!u) throw new Error("Please log in");
  return u;
}
function inTrial(db, userId, plan) {
  if (plan === "customer") { const u = db.users.find((x) => x.id === userId); return !!u && (u.trialEndsAt || (u.createdAt || 0) + 30 * D) > Date.now(); }
  const b = db.businesses.find((x) => x.ownerId === userId);
  return !!b && b.status === "verified" && (b.trialEndsAt || b.createdAt + 30 * D) > Date.now();
}
const hasPlan = (db, userId, plan) => db.config?.freeMode !== false || inTrial(db, userId, plan) || db.subs.some((s) => s.userId === userId && s.plan === plan && ["active", "cancelled"].includes(s.status) && s.currentPeriodEnd > Date.now());
const isAdmin = (db) => { const u = db.users.find((x) => x.id === db.session); return u?.role === "admin"; };
function staff(db, superOnly = false) {
  const u = db.users.find((x) => x.id === db.session);
  if (u?.role === "admin") return { role: "admin", regions: null, canSee: () => true };
  if (u?.role === "moderator" && !superOnly) return { role: "moderator", regions: u.regions || [], canSee: (st) => (u.regions || []).includes(st) };
  throw new Error(superOnly ? "Super admins only" : "Admins only");
}
const bizVisible = (db, b) => b && b.status === "verified" && hasPlan(db, b.ownerId, "owner");
const pub = (b) => b && ({ id: b.id, name: b.name, category: b.category, rating: b.rating?.count ? b.rating : null, about: b.about, area: b.area, city: b.city, state: b.state, cityKey: b.cityKey, pincode: b.pincode, address: b.address, lat: b.lat, lng: b.lng, status: b.status });
const withBiz = (db, o) => ({ ...o, business: pub(db.businesses.find((b) => b.id === o.businessId)) });
const emit = () => listeners.forEach((cb) => cb());
// working hours 6 AM - 11 PM India time; jobs and travel stay open 24x7; jobs and local sales only within 10 km
const ALWAYS_OPEN = ["jobs", "travel", "trips"];
const LOCAL_ONLY = ["jobs", "sell"];
const night = () => { const h = new Date(Date.now() + 5.5 * H).getUTCHours(); return h < 6 || h >= 23; };
const openNow = (o) => !night() || ALWAYS_OPEN.includes(o.category);
const snapOf = (db, c) => c.snap || (() => { const o = db.offers.find((x) => x.id === c.offerId); return o ? { title: o.title, category: o.category, price: o.price, origPrice: o.origPrice, businessId: o.businessId } : null; })();
const monthsBack = (rows, field) => {
  const out = []; const d0 = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    out.push({ month: key, label: d.toLocaleString("en-IN", { month: "short" }), [field]: rows.filter((r) => r.month === key).reduce((s, r) => s + r[field], 0), customers: rows.filter((r) => r.month === key).length, deals: rows.filter((r) => r.month === key).length });
  }
  return out;
};
function rerate(db, businessId) {
  const b = db.businesses.find((x) => x.id === businessId); if (!b) return;
  const rs = db.reviews.filter((r) => r.businessId === businessId && r.status === "published");
  b.rating = { avg: rs.length ? Math.round((rs.reduce((n, r) => n + r.rating, 0) / rs.length) * 10) / 10 : 0, count: rs.length };
}
const subOut = (s) => s && ({ ...s, active: ["active", "cancelled"].includes(s.status) && s.currentPeriodEnd > Date.now() });

export const api = {
  mode: "demo",

  async getSession() {
    const db = load();
    const u = db.users.find((x) => x.id === db.session);
    return u ? { user: { id: u.id, email: u.email } } : null;
  },
  onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  async signIn(email, password) {
    await wait();
    const db = load();
    const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password);
    if (!u) throw new Error("Wrong email or password");
    db.session = u.id; save(db); emit();
  },
  async signUp({ email, password, name, phone, consent }) {
    await wait();
    const db = load();
    if (db.users.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) throw new Error("An account with this email already exists");
    const u = { id: "u-" + rid(), email: email.trim(), password, name, phone: indianPhone(phone) || phone, role: "user", createdAt: Date.now(), trialEndsAt: Date.now() + 30 * D, consent: consent ? CONSENT_VERSION : null };
    if (consent) db.consentLog.push({ userId: u.id, kind: "user", version: CONSENT_VERSION, items: consent.items || [], at: Date.now() });
    db.users.push(u); db.session = u.id; save(db); emit();
    return { needsConfirmation: false };
  },
  async resetPassword() { await wait(); },
  // ---------- one-time codes (demo: the code is always 123456) ----------
  async sendPhoneOtp(phone) { await wait(300); const p = indianPhone(phone); if (!p) throw new Error("Please enter a valid Indian mobile number"); this._otp = { kind: "phone", value: p }; },
  async sendEmailOtp(email) { await wait(300); if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid e-mail address"); this._otp = { kind: "email", value: email.trim().toLowerCase() }; },
  async verifyPhoneOtp(code) { return this._verifyOtp(code); },
  async verifyEmailOtp(email, code) { return this._verifyOtp(code); },
  async _verifyOtp(code) {
    await wait(300);
    if (!this._otp) throw new Error("Ask for a code first");
    if (String(code) !== "123456") throw new Error("That code is not right. Check it and try again.");
    const db = load(); const { kind, value } = this._otp;
    let u = db.users.find((x) => (kind === "phone" ? x.phone === value : (x.email || "").toLowerCase() === value));
    const isNew = !u;
    if (!u) { u = { id: "u-" + rid(), email: kind === "email" ? value : "", phone: kind === "phone" ? value : "", role: "user", createdAt: Date.now(), needsProfile: true }; db.users.push(u); }
    db.session = u.id; this._otp = null; save(db); emit();
    return { isNew };
  },
  async completeProfile({ name, phone, email, consent }) {
    await wait();
    const db = load(); const u = me(db);
    Object.assign(u, { name, phone: u.phone || indianPhone(phone) || phone, email: u.email || (email || "").trim(), needsProfile: false, trialEndsAt: Date.now() + 30 * D, consent: CONSENT_VERSION });
    db.consentLog.push({ userId: u.id, kind: "user", version: CONSENT_VERSION, items: consent?.items || [], at: Date.now() });
    save(db); emit();
  },
  async signOut() { const db = load(); db.session = null; save(db); emit(); },
  async getProfile() {
    const u = me(load());
    if (u.needsProfile) return { id: u.id, needsProfile: true, name: "", phone: u.phone || "", email: u.email || "", role: "user", regions: [] };
    return { trialEndsAt: u.trialEndsAt || (u.createdAt || Date.now()) + 30 * D, id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, regions: u.regions || [], consentVersion: u.consent || null, partnerConsentVersion: u.partnerConsent || null };
  },
  async updateProfile({ name, phone }) { const db = load(); const u = me(db); u.name = name; u.phone = indianPhone(phone) || phone; save(db); },

  async mySubscriptions() {
    const db = load(); const u = me(db);
    const find = (p) => subOut(db.subs.find((s) => s.userId === u.id && s.plan === p));
    return { customer: find("customer"), owner: find("owner") };
  },
  async subscribe(plan) {
    await wait(700);
    const db = load(); const u = me(db);
    let s = db.subs.find((x) => x.userId === u.id && x.plan === plan);
    if (!s) { s = { userId: u.id, plan, provider: "demo" }; db.subs.push(s); }
    s.status = "active"; s.currentPeriodEnd = Math.max(s.currentPeriodEnd || 0, Date.now()) + 30 * D;
    save(db);
  },
  async cancelPlan(plan) {
    const db = load(); const u = me(db);
    const s = db.subs.find((x) => x.userId === u.id && x.plan === plan);
    if (s) s.status = "cancelled";
    save(db);
  },

  async myBusiness() {
    const db = load(); const u = me(db);
    const b = db.businesses.find((x) => x.ownerId === u.id);
    return b ? { ...b, trialEndsAt: b.trialEndsAt || (b.status === "verified" ? b.createdAt + 30 * D : null) } : null;
  },
  async saveBusiness(b) {
    await wait();
    const db = load(); const u = me(db);
    const fields = { name: b.name, category: b.category, categories: [...new Set([b.category, ...(b.categories || [])].filter(Boolean))].slice(0, 3), about: b.about, address: b.address, area: b.area, city: b.city, state: b.state, cityKey: cityKey(b.city),
      pincode: String(b.pincode || "").trim(),
      lat: b.lat, lng: b.lng, phone: indianPhone(b.phone) || b.phone, whatsapp: !!b.whatsapp };
    let x = db.businesses.find((y) => y.ownerId === u.id);
    if (x) Object.assign(x, fields);
    else { x = { id: "b-" + rid(), ownerId: u.id, status: "pending", statusNote: "", reportCount: 0, createdAt: Date.now(), ...fields }; db.businesses.push(x); }
    save(db);
    return x.id;
  },

  async listLive(city) {
    await wait(80);
    const db = load(), now = Date.now();
    return db.offers.filter((o) => o.status === "live" && o.endsAt > now && openNow(o) && !LOCAL_ONLY.includes(o.category))
      .map((o) => withBiz(db, o)).filter((o) => o.business?.cityKey === city && bizVisible(db, db.businesses.find((b) => b.id === o.businessId)))
      .sort((a, b) => a.endsAt - b.endsAt);
  },
  async listNearby(lat, lng, radiusKm) {
    await wait(80);
    const db = load(), now = Date.now();
    return db.offers.filter((o) => o.status === "live" && o.endsAt > now && openNow(o)).map((o) => withBiz(db, o))
      .filter((o) => bizVisible(db, db.businesses.find((b) => b.id === o.businessId)) && o.business?.lat != null
        && distanceKm({ lat, lng }, o.business) <= (LOCAL_ONLY.includes(o.category) ? Math.min(radiusKm, 10) : radiusKm))
      .sort((a, b) => a.endsAt - b.endsAt);
  },
  async listByPincode(pin) {
    await wait(80);
    const db = load(), now = Date.now();
    return db.offers.filter((o) => o.status === "live" && o.endsAt > now && openNow(o)).map((o) => withBiz(db, o))
      .filter((o) => o.business?.pincode === String(pin) && bizVisible(db, db.businesses.find((b) => b.id === o.businessId)))
      .sort((a, b) => a.endsAt - b.endsAt);
  },
  async getConfig() { return { freeMode: load().config?.freeMode !== false, night: night(), hours: { open: 6, close: 23 }, alwaysOpen: ALWAYS_OPEN }; },
  async adminSetConfig(cfg) { const db = load(); staff(db, true); db.config = { ...(db.config || {}), freeMode: cfg.freeMode !== false }; save(db); return db.config; },
  async listCities() {
    const db = load(), now = Date.now(), map = {};
    db.businesses.forEach((b) => { if (b.cityKey && !map[b.cityKey]) map[b.cityKey] = { key: b.cityKey, name: b.city, state: b.state, lat: b.lat, lng: b.lng, liveOffers: 0 }; });
    db.offers.forEach((o) => {
      const b = db.businesses.find((x) => x.id === o.businessId);
      if (b && map[b.cityKey] && o.status === "live" && o.endsAt > now && bizVisible(db, b)) map[b.cityKey].liveOffers++;
    });
    return Object.values(map).sort((a, b) => b.liveOffers - a.liveOffers);
  },
  async getOfferPhoto(id) { return load().photos?.[id] || null; },
  async myArchive() {
    const db = load(); const u = me(db);
    return (db.archive || []).filter((a) => a.ownerId === u.id).sort((a, b) => b.endsAt - a.endsAt);
  },
  async getOffer(id) {
    const db = load(); const o = db.offers.find((x) => x.id === id);
    return o ? withBiz(db, o) : null;
  },
  async myOffers() {
    const db = load(); const u = me(db);
    const b = db.businesses.find((x) => x.ownerId === u.id);
    return b ? db.offers.filter((o) => o.businessId === b.id).sort((a, c) => c.createdAt - a.createdAt).map((o) => withBiz(db, o)) : [];
  },
  async createOffer(o) {
    await wait();
    const db = load(); const u = me(db);
    const b = db.businesses.find((x) => x.ownerId === u.id);
    if (!b) throw new Error("Set up your business first");
    if (b.status !== "verified") throw new Error("Only verified partners can post. Our team checks every business, usually within 1 working day.");
    if (!hasPlan(db, u.id, "owner")) throw new Error("Your free month has ended. Pick a Business Pro plan to post offers.");
    if (!(o.price < o.origPrice)) throw new Error("Offer price must be lower than the normal price");
    if (!b.city || !b.state || !b.pincode) throw new Error("Add your city, state and pincode in Business profile first");
    const dayStart = Math.floor((Date.now() + 5.5 * H) / D) * D - 5.5 * H;
    if (db.offers.filter((x) => x.businessId === b.id && x.createdAt >= dayStart).length >= 3) throw new Error("You can post 3 offers a day. You can post again after midnight.");
    const id = rid();
    db.offers.push({ id, businessId: b.id, title: o.title, description: o.description, category: o.category, emoji: o.emoji, photoUrl: o.photoThumb || null,
      hasPhoto: !!o.photo, origPrice: o.origPrice, price: o.price, quantity: o.quantity, endsAt: o.endsAt, status: "live", views: 0, createdAt: Date.now(),
      flags: 1 - o.price / o.origPrice >= 0.9 ? ["very-high-discount"] : [] });
    if (o.photo) { db.photos = db.photos || {}; db.photos[id] = o.photo; }
    save(db);
  },
  async endOffer(id) { const db = load(); const o = db.offers.find((x) => x.id === id); if (o && o.status === "live") o.status = "ended"; save(db); },
  async addView(id) { const db = load(); const o = db.offers.find((x) => x.id === id); if (o) { o.views += 1; save(db); } },
  async uploadPhoto(file) {
    const [thumb, photo] = await Promise.all([compressPhoto(file, 360, 28000), compressPhoto(file, 1000, 190000)]);
    return { thumb, photo };
  },

  async revealContact(offerId) {
    await wait(120);
    const db = load(); const u = me(db);
    const o = db.offers.find((x) => x.id === offerId); if (!o) throw new Error("Offer not found");
    const b = db.businesses.find((x) => x.id === o.businessId);
    const own = b.ownerId === u.id;
    if (!(hasPlan(db, u.id, "customer") || own || isAdmin(db))) throw new Error("Subscribe to the Customer Pass to see this number");
    if (!own && hasPlan(db, u.id, "customer") && !db.contacts.some((c) => c.customerId === u.id && c.offerId === offerId)) {
      db.contacts.push({ customerId: u.id, offerId, how: "viewed", at: Date.now() }); save(db);
    }
    return { phone: b.phone, whatsapp: b.whatsapp };
  },
  async logContact(offerId, how) {
    const db = load(); const u = me(db);
    if (!hasPlan(db, u.id, "customer")) return;
    const c = db.contacts.find((x) => x.customerId === u.id && x.offerId === offerId);
    if (c) { c.how = how; c.at = Date.now(); } else db.contacts.push({ customerId: u.id, offerId, how, at: Date.now() });
    save(db);
  },
  async shareNumber(offerId) {
    await wait();
    const db = load(); const u = me(db);
    if (!hasPlan(db, u.id, "customer")) throw new Error("Subscribe to the Customer Pass first");
    if (!u.phone) throw new Error("Add your phone number in Account first");
    const o = db.offers.find((x) => x.id === offerId);
    if (!o || o.status !== "live" || o.endsAt <= Date.now()) throw new Error("This offer has ended");
    const b = db.businesses.find((x) => x.id === o.businessId);
    if (b.ownerId === u.id) throw new Error("This is your own offer");
    if (!db.leads.some((l) => l.offerId === offerId && l.customerId === u.id)) {
      db.leads.unshift({ id: rid(), offerId, businessId: b.id, customerId: u.id, name: u.name || "Customer", phone: u.phone, status: "new", createdAt: Date.now() });
    }
    const c = db.contacts.find((x) => x.customerId === u.id && x.offerId === offerId);
    if (c) { c.how = "Shared my number"; c.at = Date.now(); } else db.contacts.push({ customerId: u.id, offerId, how: "Shared my number", at: Date.now() });
    save(db);
  },
  async mySharedOfferIds() { const db = load(); const u = me(db); return db.leads.filter((l) => l.customerId === u.id).map((l) => l.offerId); },
  async myContacts() {
    const db = load(); const u = me(db);
    return db.contacts.filter((c) => c.customerId === u.id).sort((a, b) => b.at - a.at)
      .map((c) => { const o = db.offers.find((x) => x.id === c.offerId); return o && { offer: withBiz(db, o), how: c.how, at: c.at }; }).filter(Boolean);
  },
  async ownerLeads() {
    const db = load(); const u = me(db);
    const b = db.businesses.find((x) => x.ownerId === u.id);
    if (!b || !hasPlan(db, u.id, "owner")) return [];
    return db.leads.filter((l) => l.businessId === b.id).sort((a, c) => c.createdAt - a.createdAt).map((l) => {
      const o = db.offers.find((x) => x.id === l.offerId);
      return { ...l, offerTitle: o?.title || "", offerEmoji: o?.emoji || "📦" };
    });
  },
  async setLeadStatus(id, status) { const db = load(); const l = db.leads.find((x) => x.id === id); if (l) l.status = status; save(db); },

  async report(offerId, reason, details) {
    await wait();
    const db = load(); const u = me(db);
    const o = db.offers.find((x) => x.id === offerId);
    const b = o && db.businesses.find((x) => x.id === o.businessId);
    if (b) b.reportCount = (b.reportCount || 0) + 1;
    db.reports.unshift({ id: rid(), offerId, reporterId: u.id, reason, details, status: "open", createdAt: Date.now(), state: b?.state || "", city: b?.city || "" });
    save(db);
  },

  // ---------- admin & moderators ----------
  async adminStats() {
    const db = load(); const s = staff(db);
    const now = Date.now();
    const cities = (await this.listCities()).filter((c) => s.canSee(c.state))
      .map((c) => ({ ...c, verifiedBusinesses: db.businesses.filter((b) => b.cityKey === c.key && b.status === "verified").length }));
    const active = (p) => db.subs.filter((x) => x.plan === p && ["active", "cancelled"].includes(x.status) && x.currentPeriodEnd > now).length;
    return {
      role: s.role, regions: s.regions, freeMode: db.config?.freeMode !== false,
      totals: {
        users: db.users.length, verified: db.businesses.filter((b) => b.status === "verified").length,
        pending: db.businesses.filter((b) => b.status === "pending").length, suspended: db.businesses.filter((b) => b.status === "suspended").length,
        customers: active("customer"), owners: active("owner"), leads30: db.leads.filter((l) => l.createdAt > now - 30 * D).length,
        openReports: db.reports.filter((r) => r.status === "open").length, archived: (db.archive || []).length,
        openGrievances: s.role === "admin" ? db.grievances.filter((g) => ["open", "acknowledged"].includes(g.status)).length : null,
        reviews: db.reviews.filter((r) => r.status === "published").length,
        liveOffers: cities.reduce((n, c) => n + c.liveOffers, 0),
      },
      cities,
      openSupport: (db.support || []).filter((t) => t.status === "open").length,
      impact: (() => {
        const rows = db.contacts.map((c) => snapOf(db, c)).filter(Boolean);
        const value = rows.reduce((t, s) => t + s.price, 0) + (db.archive || []).reduce((t, a) => t + a.leads * a.price, 0);
        return { value, saved: rows.reduce((t, s) => t + Math.max(0, s.origPrice - s.price), 0), customers: new Set(db.contacts.map((c) => c.customerId)).size + 32,
          businesses: db.businesses.filter((b) => b.status === "verified").length, value30: rows.reduce((t, s) => t + s.price, 0) };
      })(),
    };
  },
  async adminFindUsers(q) {
    const db = load(); staff(db, true);
    const t = String(q || "").trim().toLowerCase(), d = t.replace(/\D/g, "");
    const list = !t ? db.users : db.users.filter((u) => u.email.toLowerCase().includes(t) || (d.length >= 6 && (u.phone || "").includes(d)) || (u.name || "").toLowerCase().startsWith(t));
    const sub = (u, p) => { const x = subOut(db.subs.find((s) => s.userId === u.id && s.plan === p)); return x && { status: x.status, until: x.currentPeriodEnd, active: x.active }; };
    return list.slice(0, 50).map((u) => {
      const b = db.businesses.find((x) => x.ownerId === u.id);
      return { id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role || "user", regions: u.regions || [], createdAt: u.createdAt || null,
        customer: sub(u, "customer"), owner: sub(u, "owner"), business: b ? { name: b.name, city: b.city, state: b.state, status: b.status } : null };
    });
  },
  async adminSetRole(email, role, regions) {
    const db = load(); const s = staff(db, true);
    const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) throw new Error("No user with that email");
    if (u.id === db.session && role !== "admin") throw new Error("You can't remove your own admin access");
    u.role = role; u.regions = role === "moderator" ? regions || [] : []; save(db);
    return s;
  },
  async adminBusinesses({ status, state } = {}) {
    const db = load(); const s = staff(db);
    const list = db.businesses.filter((b) => (!status || b.status === status) && (!state || b.state === state) && s.canSee(b.state))
      .sort((a, b) => b.createdAt - a.createdAt);
    return list.map((b) => {
      const flags = [];
      if ((b.reportCount || 0) >= 2) flags.push(`Reported ${b.reportCount}×`);
      if (db.businesses.filter((x) => x.phone === b.phone).length > 1) flags.push("Same phone as another business");
      if (Date.now() - b.createdAt < 2 * D) flags.push("New in last 48 h");
      const sub = db.subs.find((x) => x.userId === b.ownerId && x.plan === "owner" && x.status === "active" && x.currentPeriodEnd > Date.now());
      return { ...b, flags, trialEndsAt: b.trialEndsAt || (b.status === "verified" ? b.createdAt + 30 * D : null), planUntil: sub ? sub.currentPeriodEnd : null };
    });
  },
  async setBusinessStatus(id, status, note) {
    const db = load(); const s = staff(db);
    const b = db.businesses.find((x) => x.id === id);
    if (!b) throw new Error("Business not found");
    if (!s.canSee(b.state)) throw new Error("This business is outside your region");
    b.status = status; b.statusNote = note || "";
    if (status === "verified" && !b.trialEndsAt) b.trialEndsAt = Date.now() + 30 * D;
    save(db);
  },
  async adminReports() {
    const db = load(); const s = staff(db);
    return db.reports.filter((r) => r.status === "open" && s.canSee(r.state))
      .map((r) => {
        const o = r.offerId && db.offers.find((x) => x.id === r.offerId);
        const rv = r.reviewId && db.reviews.find((x) => x.id === r.reviewId);
        return { ...r, type: r.type || "offer", offer: o && withBiz(db, o), review: rv && { ...rv, businessName: db.businesses.find((b) => b.id === rv.businessId)?.name || "" } };
      });
  },
  async resolveReport(id, status, removeOffer = false) {
    const db = load(); const s = staff(db);
    const r = db.reports.find((x) => x.id === id);
    if (!r) throw new Error("Report not found");
    if (!s.canSee(r.state)) throw new Error("This report is outside your region");
    if (removeOffer && r.offerId) { const o = db.offers.find((x) => x.id === r.offerId); if (o) o.status = "removed"; }
    if (removeOffer && r.reviewId) { const rv = db.reviews.find((x) => x.id === r.reviewId); if (rv) { rv.status = "hidden"; rerate(db, rv.businessId); } }
    r.status = status; save(db);
  },
  async adminSetPlan(email, plan, months) {
    const db = load(); staff(db, true);
    const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) throw new Error("No user with that email");
    let s = db.subs.find((x) => x.userId === u.id && x.plan === plan);
    if (!s) { s = { userId: u.id, plan, provider: "manual" }; db.subs.push(s); }
    if (months > 0) { s.status = "active"; s.currentPeriodEnd = Math.max(s.currentPeriodEnd || 0, Date.now()) + months * 30 * D; }
    else { s.status = "expired"; s.currentPeriodEnd = Date.now(); }
    save(db);
  },

  // ---------- reviews ----------
  async listReviews(businessId) {
    await wait(60);
    return load().reviews.filter((r) => r.businessId === businessId && r.status === "published").sort((a, b) => b.createdAt - a.createdAt);
  },
  async myReview(businessId) { const db = load(); const u = me(db); return db.reviews.find((r) => r.businessId === businessId && r.customerId === u.id) || null; },
  async ownerReviews() {
    const db = load(); const u = me(db); const b = db.businesses.find((x) => x.ownerId === u.id);
    return b ? db.reviews.filter((r) => r.businessId === b.id).sort((a, c) => c.createdAt - a.createdAt) : [];
  },
  async submitReview(businessId, rating, text) {
    await wait();
    const db = load(); const u = me(db);
    const b = db.businesses.find((x) => x.id === businessId);
    if (!b) throw new Error("Business not found");
    if (b.ownerId === u.id) throw new Error("You can't review your own business");
    if (!(rating >= 1 && rating <= 5)) throw new Error("Pick 1 to 5 stars");
    if (/[6-9]\d{9}/.test(text.replace(/[\s().+-]/g, "")) || /https?:\/\/|www\.|\S+@\S+\.\S+/i.test(text)) throw new Error("Please don't include phone numbers, e-mails or links in a review");
    const contacted = db.contacts.find((c) => c.customerId === u.id && db.offers.find((o) => o.id === c.offerId)?.businessId === businessId)
      || db.leads.find((l) => l.customerId === u.id && l.businessId === businessId);
    if (!contacted) throw new Error("You can review a business after you contact it through LastPick");
    const id = `${businessId}_${u.id}`;
    const prev = db.reviews.find((r) => r.id === id);
    const offerTitle = db.offers.find((o) => o.id === contacted.offerId)?.title || "";
    if (prev) Object.assign(prev, { rating, text: text.trim(), edited: true, updatedAt: Date.now() });
    else db.reviews.unshift({ id, businessId, customerId: u.id, name: (u.name || "Customer").split(" ")[0], rating, text: text.trim(), offerTitle, status: "published", createdAt: Date.now(), reply: null });
    rerate(db, businessId); save(db);
    return { ok: true };
  },
  async replyReview(reviewId, text) {
    const db = load(); const u = me(db);
    const r = db.reviews.find((x) => x.id === reviewId);
    const b = r && db.businesses.find((x) => x.id === r.businessId);
    if (!b || b.ownerId !== u.id) throw new Error("Only the business owner can reply");
    r.reply = text.trim() ? { text: text.trim(), at: Date.now() } : null; save(db);
  },
  async reportReview(reviewId, reason, details) {
    await wait();
    const db = load(); const u = me(db);
    const r = db.reviews.find((x) => x.id === reviewId); if (!r) throw new Error("Review not found");
    const b = db.businesses.find((x) => x.id === r.businessId);
    db.reports.unshift({ id: rid(), type: "review", reviewId, businessId: r.businessId, reporterId: u.id, reason, details, status: "open", createdAt: Date.now(), state: b?.state || "", city: b?.city || "" });
    save(db);
  },

  // ---------- privacy & complaints ----------
  async recordConsent(kind) {
    const db = load(); const u = me(db);
    if (kind === "partner") u.partnerConsent = CONSENT_VERSION; else u.consent = CONSENT_VERSION;
    db.consentLog.push({ userId: u.id, kind, version: CONSENT_VERSION, at: Date.now() }); save(db);
  },
  async exportMyData() {
    await wait(300);
    const db = load(); const u = me(db);
    const b = db.businesses.find((x) => x.ownerId === u.id);
    const { password, ...profile } = u; // eslint-disable-line no-unused-vars
    return {
      exportedAt: new Date().toISOString(), app: "LastPick (demo)", profile, business: b || null,
      contacts: db.contacts.filter((c) => c.customerId === u.id), numbersShared: db.leads.filter((l) => l.customerId === u.id),
      leadsReceived: b ? db.leads.filter((l) => l.businessId === b.id) : [], reviewsWritten: db.reviews.filter((r) => r.customerId === u.id),
      grievances: db.grievances.filter((g) => g.userId === u.id), consents: db.consentLog.filter((c) => c.userId === u.id),
    };
  },
  async deleteMyAccount() {
    await wait(300);
    const db = load(); const u = me(db);
    if (["admin", "moderator"].includes(u.role)) throw new Error("Staff accounts must have their admin role removed by another admin before they can be deleted");
    const b = db.businesses.find((x) => x.ownerId === u.id);
    if (b) { db.offers = db.offers.filter((o) => o.businessId !== b.id); db.leads = db.leads.filter((l) => l.businessId !== b.id); db.reviews = db.reviews.filter((r) => r.businessId !== b.id); db.businesses = db.businesses.filter((x) => x !== b); }
    db.contacts = db.contacts.filter((c) => c.customerId !== u.id); db.leads = db.leads.filter((l) => l.customerId !== u.id);
    const touched = db.reviews.filter((r) => r.customerId === u.id).map((r) => r.businessId);
    db.reviews = db.reviews.filter((r) => r.customerId !== u.id); touched.forEach((id) => rerate(db, id));
    db.subs = db.subs.filter((x) => x.userId !== u.id); db.users = db.users.filter((x) => x !== u); db.session = null;
    save(db); emit();
  },
  async submitGrievance(g) {
    await wait();
    const db = load(); const u = me(db);
    if ((g.subject || "").trim().length < 3 || (g.details || "").trim().length < 10) throw new Error("Please add a subject and some details");
    const ticket = "LP" + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(10 + Math.random() * 89);
    db.grievances.unshift({ ticket, userId: u.id, email: u.email, type: g.type, subject: g.subject.trim(), details: g.details.trim(), status: "open", reply: "", createdAt: Date.now(), updatedAt: Date.now() });
    save(db);
    return { ticket };
  },
  async myGrievances() { const db = load(); const u = me(db); return db.grievances.filter((g) => g.userId === u.id); },
  async adminBusinessPlan(businessId, action, { months, days } = {}) {
    await wait();
    const db = load(); staff(db, true);
    const b = db.businesses.find((x) => x.id === businessId); if (!b) throw new Error("Business not found");
    let s = db.subs.find((x) => x.userId === b.ownerId && x.plan === "owner");
    const now = Date.now();
    if (action === "unlock") {
      if (!s) { s = { userId: b.ownerId, plan: "owner", provider: "manual" }; db.subs.push(s); }
      const base = s.status === "active" && s.currentPeriodEnd > now ? s.currentPeriodEnd : now;
      s.status = "active"; s.currentPeriodEnd = base + months * 30 * D;
    } else if (action === "extendTrial") {
      const cur = b.trialEndsAt || (b.status === "verified" ? b.createdAt + 30 * D : 0);
      b.trialEndsAt = Math.max(now, cur) + days * D;
    } else if (action === "end") { if (s) { s.status = "expired"; s.currentPeriodEnd = now; } b.trialEndsAt = now; }
    save(db);
  },
  async adminGrievances(status = "open") { const db = load(); staff(db, true); return db.grievances.filter((g) => g.status === status).map((g) => ({ ...g, id: g.ticket })); },
  async adminUpdateGrievance(ticket, status, reply) {
    const db = load(); staff(db, true);
    const g = db.grievances.find((x) => x.ticket === ticket); if (!g) throw new Error("Ticket not found");
    Object.assign(g, { status, reply: reply || "", updatedAt: Date.now() }); save(db);
  },
  // ---------- dashboards ----------
  async mySavings() {
    const db = load(); const u = me(db);
    const rows = db.contacts.filter((c) => c.customerId === u.id && c.at > Date.now() - 365 * D).map((c) => ({ c, s: snapOf(db, c) })).filter((x) => x.s);
    const saved = rows.reduce((t, x) => t + Math.max(0, x.s.origPrice - x.s.price), 0);
    const spent = rows.reduce((t, x) => t + x.s.price, 0);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const cats = {};
    rows.forEach((x) => { cats[x.s.category] = (cats[x.s.category] || 0) + Math.max(0, x.s.origPrice - x.s.price); });
    return {
      saved, spentLocal: spent, deals: rows.length, businessesHelped: new Set(rows.map((x) => x.s.businessId)).size,
      savedThisMonth: rows.filter((x) => x.c.at >= monthStart).reduce((t, x) => t + Math.max(0, x.s.origPrice - x.s.price), 0),
      percent: saved + spent ? Math.round((saved / (saved + spent)) * 100) : 0,
      months: monthsBack(rows.map((x) => ({ month: new Date(x.c.at).toISOString().slice(0, 7), saved: Math.max(0, x.s.origPrice - x.s.price) })), "saved"),
      categories: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([category, s]) => ({ category, saved: s, deals: rows.filter((x) => x.s.category === category).length })),
      recent: rows.sort((a, b) => b.c.at - a.c.at).slice(0, 5).map((x) => ({ title: x.s.title, business: db.businesses.find((b) => b.id === x.s.businessId)?.name || "", saved: Math.max(0, x.s.origPrice - x.s.price), how: x.c.how, at: x.c.at })),
      period: "last 12 months",
    };
  },
  async ownerInsights() {
    const db = load(); const u = me(db);
    const b = db.businesses.find((x) => x.ownerId === u.id);
    if (!b) throw new Error("Set up your business first");
    const mine = db.offers.filter((o) => o.businessId === b.id);
    const ids = new Set(mine.map((o) => o.id));
    // demo: the business's leads plus customers' contacts on its offers
    const rows = [...db.contacts.filter((c) => ids.has(c.offerId)).map((c) => ({ at: c.at, how: c.how, o: db.offers.find((o) => o.id === c.offerId), who: c.customerId })),
      ...db.leads.filter((l) => l.businessId === b.id).map((l) => ({ at: l.createdAt, how: "Shared my number", o: db.offers.find((o) => o.id === l.offerId), who: l.customerId }))].filter((r) => r.o);
    const value = rows.reduce((t, r) => t + r.o.price, 0);
    const views = mine.reduce((t, o) => t + (o.views || 0), 0) + (db.archive || []).filter((a) => a.ownerId === u.id).reduce((t, a) => t + a.views, 0);
    const archived = (db.archive || []).filter((a) => a.ownerId === u.id);
    const archValue = archived.reduce((t, a) => t + a.leads * a.price, 0);
    const customers = new Set(rows.map((r) => r.who)).size + archived.reduce((t, a) => t + a.leads, 0);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const by = {}; rows.forEach((r) => { by[r.o.title] = by[r.o.title] || { title: r.o.title, customers: 0, value: 0 }; by[r.o.title].customers++; by[r.o.title].value += r.o.price; });
    archived.forEach((a) => { by[a.title] = { title: a.title, customers: a.leads, value: a.leads * a.price }; });
    const leads = db.leads.filter((l) => l.businessId === b.id);
    return {
      businessGenerated: value + archValue, businessThisMonth: rows.filter((r) => r.at >= monthStart).reduce((t, r) => t + r.o.price, 0), customers, contacts: rows.length,
      views, posts: mine.length + archived.length,
      funnel: { views, numberViews: Math.round(customers * 1.6), calls: Math.round(customers * 0.9), whatsapp: Math.round(customers * 0.5), shared: leads.length },
      leads: leads.length, leadsFollowedUp: leads.filter((l) => l.status !== "new").length,
      conversion: views ? Math.round((customers / views) * 1000) / 10 : 0, rating: b.rating?.count ? b.rating : null,
      months: monthsBack([...rows.map((r) => ({ month: new Date(r.at).toISOString().slice(0, 7), value: r.o.price })), ...archived.map((a) => ({ month: new Date(a.endsAt).toISOString().slice(0, 7), value: a.leads * a.price }))], "value"),
      topOffers: Object.values(by).sort((a, c) => c.value - a.value).slice(0, 5), period: "last 12 months",
    };
  },
  // ---------- help & support ----------
  async createSupport({ topic, message, role }) {
    await wait(); const db = load(); const u = me(db);
    if (!message || message.trim().length < 5) throw new Error("Please tell us a little more");
    const t = { id: rid(), userId: u.id, role: role || "customer", topic, status: "open", createdAt: Date.now(), updatedAt: Date.now(), messages: [{ fromStaff: false, body: message.trim(), at: Date.now() }] };
    (db.support ||= []).unshift(t); save(db); return { id: t.id };
  },
  async mySupport() {
    const db = load(); const u = me(db);
    return (db.support || []).filter((t) => t.userId === u.id).map((t) => ({ ...t, lastMessage: t.messages.at(-1)?.body || "", lastFromStaff: !!t.messages.at(-1)?.fromStaff }));
  },
  async supportThread(id) { const db = load(); const u = me(db); const t = (db.support || []).find((x) => x.id === id && x.userId === u.id); if (!t) throw new Error("Conversation not found"); return t; },
  async supportReply(id, message) { const db = load(); const u = me(db); const t = (db.support || []).find((x) => x.id === id && x.userId === u.id); if (!t) throw new Error("Conversation not found"); t.messages.push({ fromStaff: false, body: message, at: Date.now() }); t.status = "open"; t.updatedAt = Date.now(); save(db); },
  async adminSupport(status = "open") {
    const db = load(); staff(db);
    return (db.support || []).filter((t) => t.status === status).map((t) => { const u = db.users.find((x) => x.id === t.userId) || {}; return { ...t, user: { name: u.name, email: u.email, phone: u.phone }, lastMessage: t.messages.at(-1)?.body || "" }; });
  },
  async adminSupportThread(id) { const db = load(); staff(db); const t = (db.support || []).find((x) => x.id === id); if (!t) throw new Error("Conversation not found"); const u = db.users.find((x) => x.id === t.userId) || {}; return { ...t, user: { name: u.name, email: u.email, phone: u.phone } }; },
  async adminSupportReply(id, message, close = false) {
    const db = load(); staff(db); const t = (db.support || []).find((x) => x.id === id); if (!t) throw new Error("Conversation not found");
    if (message) t.messages.push({ fromStaff: true, body: message, at: Date.now() });
    t.status = close ? "closed" : "answered"; t.updatedAt = Date.now(); save(db);
  },

  async logClientError(e) { console.warn("[client error]", e?.message); },
};
