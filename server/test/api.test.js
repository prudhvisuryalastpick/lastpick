// End-to-end API test. Needs an EMPTY test database:
//   DATABASE_URL=postgres://postgres@localhost/lastpick_test npm test
// It wipes that database, starts the servers and walks through the main flows.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// a consent as the app sends it: the whole Terms were read and their exact text is attached
import { createHash } from "node:crypto";
import { CONSENT_VERSION as TERMS_V } from "../src/util.js";
const termsDoc = () => { const docText = `LastPick Terms and Conditions\nVersion ${TERMS_V}\n\n1. About these terms\nTest text.`; return { readFull: true, docText, docHash: createHash("sha256").update(docText).digest("hex") }; };
const fullConsent = (extra = {}) => ({ adult: true, items: ["account"], ...termsDoc(), ...extra });


const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB = process.env.DATABASE_URL;
if (!DB || !/test/.test(DB)) throw new Error("Set DATABASE_URL to a database whose name contains 'test' (it will be wiped)");
const PASSWORD = "TestPass1234";
const procs = [];
const PORTS = { all: 18080, customer: 18081, partner: 18082, admin: 18083, night: 18084 };
// a fake WhatsApp Cloud API: records every message the servers send (login codes, updates)
const WA_PORT = 18090;
const waSent = [];
// a fake Razorpay API: orders, and the payments of an order (rzPaid = orders the "customer" paid)
const RZ_PORT = 18091, RZ_SECRET = "rz_test_secret";
const rzOrders = [], rzPaid = new Map();
const WA_ENV = { RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_KEY_SECRET: RZ_SECRET, RAZORPAY_API_BASE: `http://localhost:${RZ_PORT}`, WA_LOGIN: "on", WA_PHONE_NUMBER_ID: "123456", WA_ACCESS_TOKEN: "test-token", WA_UPDATE_TEMPLATE: "lastpick_update", WA_API_BASE: `http://localhost:${WA_PORT}` };

async function sh(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("exit", (c) => (c === 0 ? resolve(out) : reject(new Error(out))));
  });
}
async function startServer(service) {
  // "night" is a customer server whose working hours are 0-0, so it is always night there
  const hours = service === "night" ? { OPEN_HOUR: "0", CLOSE_HOUR: "0", POST_FROM_HOUR: "0", POST_TILL_HOUR: "0" } : { OPEN_HOUR: "0", CLOSE_HOUR: "24", POST_FROM_HOUR: "0", POST_TILL_HOUR: "24" };
  // LP_TEST_TARGET=worker runs the Cloudflare Workers code (src/worker.js) instead of the Node server
  // LP_TEST_TARGET: worker = Cloudflare Workers code, edge = Supabase Edge Functions code (in Node), deno = same in Deno
  const target = process.env.LP_TEST_TARGET;
  const entry = target === "worker" ? "test/worker-bridge.js" : target === "edge" || target === "deno" ? "test/edge-bridge.js" : "src/index.js";
  const [cmd, args] = target === "deno" ? ["deno", ["run", "-A", "--config", "deno.json", entry]] : [process.execPath, [entry]];
  const p = spawn(cmd, args, { cwd: root, env: { ...process.env, ...WA_ENV, SERVICE: service === "night" ? "customer" : service, ...(service === "night" ? { WA_VERIFY: "on" } : { CUSTOMER_PASS: "on" }), PORT: String(PORTS[service]), LOG_LEVEL: "error", SIGNUP: "open", IP_LIMIT_MULTIPLIER: "20", RUN_WORKER: service === "night" ? "0" : "1", ...hours }, stdio: ["ignore", "inherit", "inherit"] });
  procs.push(p);
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${PORTS[service]}/healthz`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${service} server did not start`);
}

function client(service) {
  let token = null;
  const call = async (method, p, body) => {
    const res = await fetch(`http://localhost:${PORTS[service]}${p}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  return {
    call,
    get: (p) => call("GET", p), post: (p, b = {}) => call("POST", p, b), put: (p, b) => call("PUT", p, b), patch: (p, b) => call("PATCH", p, b),
    async login(email) { const r = await call("POST", "/api/auth/login", { email, password: PASSWORD }); token = r.data?.token; return r; },
    set token(t) { token = t; },
  };
}

before(async () => {
  // wipe the test database
  const { Pool } = process.env.LP_PG_SHIM ? await import("./pg-shim.js") : (await import("pg")).default;
  const pool = new Pool({ connectionString: DB });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await sh(process.execPath, ["scripts/seed.js"], { SEED_PASSWORD: PASSWORD });
  const http = await import("node:http");
  const wa = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d));
    req.on("end", () => {
      const body = JSON.parse(b || "{}");
      if (body.to === "919812345679") { res.writeHead(404, { "Content-Type": "application/json" }); return res.end('{"error":{"message":"(#132001) Template name does not exist in the translation","type":"OAuthException","code":132001}}'); }
      waSent.push({ url: req.url, auth: req.headers.authorization, body }); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"messages":[{"id":"wamid.test"}]}');
    });
  });
  await new Promise((r) => wa.listen(WA_PORT, r));
  procs.push({ kill: () => wa.close() });
  const rz = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d));
    req.on("end", () => {
      const ok = req.headers.authorization === "Basic " + Buffer.from(`rzp_test_key:${RZ_SECRET}`).toString("base64");
      res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
      if (!ok) return res.end('{"error":{"description":"Authentication failed"}}');
      if (req.method === "POST" && req.url === "/v1/orders") {
        const o = { id: `order_T${rzOrders.length + 1}`, ...JSON.parse(b) }; rzOrders.push(o); return res.end(JSON.stringify(o));
      }
      const m = req.url.match(/^\/v1\/orders\/([^/]+)\/payments$/);
      if (m) return res.end(JSON.stringify({ items: rzPaid.has(m[1]) ? [{ id: rzPaid.get(m[1]), status: "captured" }] : [] }));
      res.end("{}");
    });
  });
  await new Promise((r) => rz.listen(RZ_PORT, r));
  procs.push({ kill: () => rz.close() });
  await Promise.all(Object.keys(PORTS).map(startServer));
});
after(() => procs.forEach((p) => p.kill("SIGTERM")));

const tonightIST = () => Math.floor((Date.now() + 19800000) / 86400000) * 86400000 - 19800000 + 86400000 - 1000;
const soon = (min) => Math.min(Date.now() + min * 60000, tonightIST());

test("one account per mobile number", async () => {
  const c = client("customer");
  const a = await c.post("/api/auth/signup", { email: "phone1@test.lastpick.in", password: "longpassword", name: "Phone One", phone: "9811122233", consent: fullConsent() });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const b = await client("customer").post("/api/auth/signup", { email: "phone2@test.lastpick.in", password: "longpassword", name: "Phone Two", phone: "+91 98111 22233", consent: fullConsent() });
  assert.equal(b.status, 409);
  assert.match(b.data.error, /already registered/);
});

test("e-mail codes: refused cleanly while e-mail isn't set up", async () => {
  const r = await client("customer").post("/api/auth/otp/send", { email: "someone@test.lastpick.in" });
  assert.equal(r.status, 409);
  // e-mail codes are off here because e-mail isn't set up in tests
  // SMS codes are not used (no SMS provider)
  assert.equal((await client("customer").post("/api/auth/otp/send-sms", { phone: "9876501234" })).status, 409);
  const cfg = (await client("customer").get("/api/config")).data;
  assert.equal(cfg.phoneCodes, false);
  assert.equal(cfg.emailCodes, false);
});

test("each server has only its own routes", async () => {
  const c = client("customer"), p = client("partner"), a = client("admin");
  assert.equal((await c.get("/api/admin/stats")).status, 404);
  assert.equal((await c.get("/api/owner/offers")).status, 404);
  assert.equal((await p.get("/api/admin/stats")).status, 404);
  assert.equal((await p.get("/api/me/contacts")).status, 404);
  assert.equal((await a.get("/api/owner/offers")).status, 404);
  assert.equal((await a.get("/api/offers?city=bengaluru")).status, 404);
});

test("login rules", async () => {
  const c = client("customer");
  assert.equal((await c.call("POST", "/api/auth/login", { email: "customer@test.lastpick.in", password: "wrong" })).status, 400);
  assert.equal((await c.get("/api/me")).status, 401);
  assert.equal((await c.login("customer@test.lastpick.in")).status, 200);
  const me = await c.get("/api/me");
  assert.equal(me.data.email, "customer@test.lastpick.in");
  // the admin server refuses non-staff
  assert.equal((await client("admin").login("customer@test.lastpick.in")).status, 403);
  assert.equal((await client("admin").login("moderator@test.lastpick.in")).status, 200);
  // sign-up works on customer/partner, never on admin
  const s = await client("customer").post("/api/auth/signup", { email: "new@test.lastpick.in", password: "longpassword", name: "New Person", phone: "9876543291", consent: fullConsent() });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal((await client("admin").post("/api/auth/signup", { email: "x@test.lastpick.in", password: "longpassword", name: "X" })).status, 403);
  // log in with the mobile number instead of the e-mail (any format), and a wrong password is refused
  const byPhone = await client("customer").post("/api/auth/login", { login: "+91 98765 43291", password: "longpassword" });
  assert.equal(byPhone.status, 200, JSON.stringify(byPhone.data));
  assert.equal((await client("partner").post("/api/auth/login", { login: "9876543291", password: "longpassword" })).status, 200, "same account works in the partner app");
  assert.equal((await client("customer").post("/api/auth/login", { login: "9876543291", password: "wrongpassword" })).status, 400);
  assert.equal((await client("customer").post("/api/auth/login", { login: "9000000000", password: "longpassword" })).status, 400, "unknown number");
  // obviously fake numbers are refused
  for (const fake of ["9999999999", "9000000000", "9876543210", "1234567890", "98765"]) {
    const r = await client("customer").post("/api/auth/signup", { email: `fake${fake}@test.lastpick.in`, password: "longpassword", name: "Fake Person", phone: fake, consent: fullConsent() });
    assert.equal(r.status, 400, fake);
  }
  // a second account can't use the same mobile number
  assert.equal((await client("customer").post("/api/auth/signup", { email: "dup@test.lastpick.in", password: "longpassword", name: "Dup Person", phone: "98765 43291", consent: fullConsent() })).status, 409);
});

let offerId, bizId;
test("partner: business, verification, offers, daily limit", async () => {
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  assert.equal((await p.post("/api/owner/offers", { title: "x" })).status, 409); // no business yet
  const b = await p.put("/api/business", { name: "Chai Point", category: "food", categories: ["stay", "nonsense"], phone: "9988776655", city: "Bengaluru", state: "Karnataka", pincode: "560001", area: "MG Road", lat: 12.975, lng: 77.605, whatsapp: true });
  assert.equal(b.status, 200, JSON.stringify(b.data));
  assert.deepEqual(b.data.categories, ["food", "stay"]); // unknown categories are dropped
  assert.equal(b.data.status, "pending");
  bizId = b.data.id;

  const ends = soon(360);
  // only trusted (verified) partners can post
  const early = await p.post("/api/owner/offers", { title: "Evening samosas", category: "food", origPrice: 100, price: 40, endsAt: ends });
  assert.equal(early.status, 403);
  assert.equal(early.data.code, "not_verified");

  // the Karnataka moderator verifies the business
  const a = client("admin");
  await a.login("moderator@test.lastpick.in");
  const list = await a.get("/api/admin/businesses?status=pending");
  assert.ok(list.data.some((x) => x.id === bizId));
  assert.equal((await a.post(`/api/admin/businesses/${bizId}/status`, { status: "verified", note: "ok" })).status, 200);
  // no free version: verified, but no Business Pro yet, so no posting
  const unpaid = await p.post("/api/owner/offers", { title: "Evening samosas", category: "food", origPrice: 100, price: 40, endsAt: ends });
  assert.equal(unpaid.status, 403);
  assert.match(unpaid.data.error, /Business Pro/);
  // the partner pays (e.g. UPI) and a super admin activates Business Pro for 1 month
  const sa = client("admin");
  await sa.login("admin@test.lastpick.in");
  assert.equal((await sa.post(`/api/admin/businesses/${bizId}/plan`, { action: "unlock", months: 1 })).status, 200);

  const o = await p.post("/api/owner/offers", { title: "Evening samosas", category: "food", emoji: "🥟", origPrice: 100, price: 40, endsAt: ends, quantity: "20 pcs" });
  assert.equal(o.status, 200, JSON.stringify(o.data));
  assert.equal(o.data.visible, true);
  offerId = o.data.id;
  assert.equal((await p.post("/api/owner/offers", { title: "Too cheap?", category: "food", origPrice: 100, price: 120, endsAt: ends })).status, 400);
  const c = client("customer");
  assert.equal((await c.get(`/api/offers/${offerId}`)).status, 200);

  // a business posts only in its registered categories (food, stay here), 3 posts a day
  assert.equal((await p.post("/api/owner/offers", { title: "Phone accessories sale", category: "appliances", origPrice: 100, price: 50, endsAt: ends })).status, 403);
  assert.equal((await p.post("/api/owner/offers", { title: "Second", category: "food", origPrice: 100, price: 50, endsAt: ends })).status, 200);
  assert.equal((await p.post("/api/owner/offers", { title: "Third", category: "stay", origPrice: 100, price: 50, endsAt: ends })).status, 200);
  const fourth = await p.post("/api/owner/offers", { title: "Fourth", category: "food", origPrice: 100, price: 50, endsAt: ends });
  assert.equal(fourth.status, 409);
  assert.match(fourth.data.error, /3 offers a day/);
});

test("customer: feeds, number reveal, share, contacts, review", async () => {
  const c = client("customer");
  await c.login("customer@test.lastpick.in");
  const near = await c.get("/api/offers?lat=12.97&lng=77.60&radius=5");
  assert.ok(near.data.some((o) => o.id === offerId), "near me");
  assert.equal((await c.get("/api/offers?lat=13.5&lng=77.60&radius=5")).data.length, 0, "too far");
  assert.ok((await c.get("/api/offers?pincode=560001")).data.some((o) => o.id === offerId), "pincode");
  assert.ok((await c.get("/api/offers?city=bengaluru")).data.some((o) => o.id === offerId), "city");
  const offer = near.data.find((o) => o.id === offerId);
  assert.equal(offer.business.name, "Chai Point");
  assert.equal(offer.phone, undefined, "number never in the offer");
  const cities = await c.get("/api/cities");
  assert.ok(cities.data.find((x) => x.key === "bengaluru").liveOffers >= 1);

  assert.equal((await c.post(`/api/businesses/${bizId}/reviews`, { rating: 5 })).status, 409); // not contacted yet
  const rev = await c.post(`/api/offers/${offerId}/reveal`);
  assert.equal(rev.data.phone, "+919988776655");
  assert.equal((await c.post(`/api/offers/${offerId}/share`)).status, 200);
  assert.deepEqual((await c.get("/api/me/shared-offer-ids")).data, [offerId]);
  const contacts = await c.get("/api/me/contacts");
  assert.equal(contacts.data[0].how, "Shared my number");
  assert.equal(contacts.data[0].offer.business.name, "Chai Point");

  assert.equal((await c.post(`/api/businesses/${bizId}/reviews`, { rating: 4, text: "call me 9876543210" })).status, 400);
  assert.equal((await c.post(`/api/businesses/${bizId}/reviews`, { rating: 4, text: "Hot and fresh" })).status, 200);
  const reviews = await c.get(`/api/businesses/${bizId}/reviews`);
  assert.equal(reviews.data[0].name, "Test");
  const again = await c.get(`/api/offers/${offerId}`);
  assert.deepEqual(again.data.business.rating, { avg: 4, count: 1 });
  assert.equal((await c.post(`/api/offers/${offerId}/report`, { reason: "Fake offer" })).status, 200);
});

test("partner: leads, reply, end offer", async () => {
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  const leads = await p.get("/api/owner/leads");
  assert.equal(leads.data.length, 1);
  assert.equal(leads.data[0].phone, undefined, "partners never see customer numbers"); assert.ok(leads.data[0].name);
  assert.equal((await p.patch(`/api/owner/leads/${leads.data[0].id}`, { status: "contacted" })).status, 200);
  const rv = (await p.get("/api/owner/reviews")).data[0];
  assert.equal((await p.post(`/api/reviews/${rv.id}/reply`, { text: "Thank you!" })).status, 200);
  assert.equal((await p.post(`/api/owner/offers/${offerId}/end`)).status, 200);
  assert.equal((await client("customer").get(`/api/offers/${offerId}`)).status, 404);
  assert.equal((await p.get(`/api/offers/${offerId}`)).data.status, "ended"); // owner still sees it
});

test("admin: stats, reports, plans, no free version, team, complaints", async () => {
  const a = client("admin");
  await a.login("admin@test.lastpick.in");
  const s = await a.get("/api/admin/stats");
  assert.equal(s.data.role, "admin");
  assert.equal(s.data.freeMode, false); // there is no free version
  assert.ok(s.data.totals.users >= 5);
  const reports = await a.get("/api/admin/reports");
  assert.equal(reports.data.length, 1);
  assert.equal(reports.data[0].offer.business.name, "Chai Point");
  assert.equal((await a.post(`/api/admin/reports/${reports.data[0].id}/resolve`, { status: "dismissed" })).status, 200);

  // the free launch switch is gone
  assert.equal((await a.post("/api/admin/config", { freeMode: true })).status, 409);
  const users = await a.get("/api/admin/users?q=customer@test.lastpick.in");
  assert.equal(users.data.length, 1);
  assert.equal((await a.post("/api/admin/plans", { email: "customer@test.lastpick.in", plan: "customer", months: 1 })).status, 200);
  const subs = await (async () => { const c = client("customer"); await c.login("customer@test.lastpick.in"); return c.get("/api/me/subscriptions"); })();
  assert.equal(subs.data.customer.active, true);
  assert.equal((await a.post(`/api/admin/businesses/${bizId}/plan`, { action: "unlock", months: 3 })).status, 200);
  assert.equal((await a.post(`/api/admin/businesses/${bizId}/plan`, { action: "extendTrial", days: 7 })).status, 200);

  assert.equal((await a.post("/api/admin/role", { email: "new@test.lastpick.in", role: "moderator", regions: ["Kerala"] })).status, 200);
  assert.equal((await a.post("/api/admin/role", { email: "admin@test.lastpick.in", role: "user" })).status, 409);
  // moderators can't use super-admin tools
  const m = client("admin");
  await m.login("moderator@test.lastpick.in");
  assert.equal((await m.get("/api/admin/users")).status, 403);
  assert.equal((await m.post("/api/admin/config", { freeMode: true })).status, 403);

  const c = client("customer");
  await c.login("customer@test.lastpick.in");
  const g = await c.post("/api/grievances", { type: "A review", subject: "Test complaint", details: "Something happened here." });
  assert.match(g.data.ticket, /^LP/);
  const open = await a.get("/api/admin/grievances?status=open");
  assert.equal(open.data[0].ticket, g.data.ticket);
  assert.equal((await a.post(`/api/admin/grievances/${g.data.ticket}`, { status: "resolved", reply: "Sorted" })).status, 200);
  assert.equal((await c.get("/api/grievances/mine")).data[0].status, "resolved");
});

test("only one device can be logged in", async () => {
  const phone = client("customer"), laptop = client("customer");
  await phone.login("customer@test.lastpick.in");
  assert.equal((await phone.get("/api/me")).status, 200);
  await laptop.login("customer@test.lastpick.in");
  const old = await phone.get("/api/me");
  assert.equal(old.status, 401);
  assert.equal(old.data.code, "signed_in_elsewhere");
  assert.match(old.data.error, /another device/);
  assert.equal((await laptop.get("/api/me")).status, 200);

  // admin switches it off: customers can stay logged in on two devices
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  assert.equal((await a.get("/api/admin/settings")).data.singleDevice, true);
  assert.equal((await a.post("/api/admin/settings", { singleDevice: false })).data.singleDevice, false);
  const tab = client("customer");
  await tab.login("customer@test.lastpick.in");
  assert.equal((await laptop.get("/api/me")).status, 200);
  assert.equal((await tab.get("/api/me")).status, 200);
  // partner logins stay one device even when the switch is off
  const p1 = client("partner"), p2 = client("partner");
  await p1.login("owner@test.lastpick.in"); await p2.login("owner@test.lastpick.in");
  assert.equal((await p1.get("/api/me")).status, 401);
  assert.equal((await a.post("/api/admin/settings", { singleDevice: true })).data.singleDevice, true);
  await phone.login("customer@test.lastpick.in");
  assert.equal((await tab.get("/api/me")).status, 401);
});

test("consent is checked on the server", async () => {
  const c = client("customer");
  const s = await c.post("/api/auth/signup", { email: "noconsent@test.lastpick.in", password: "longpassword", name: "No Consent", phone: "9876500000" });
  assert.equal(s.status, 200);
  c.token = s.data.token;
  const r = await c.post(`/api/offers/${offerId}/reveal`);
  assert.equal(r.status, 409);
  assert.equal(r.data.code, "consent_required");
  // agreeing without reading the whole Terms (or without the text) is refused
  assert.equal((await c.post("/api/consent", { kind: "user", version: TERMS_V, adult: true, items: ["account"] })).status, 400);
  assert.equal((await c.post("/api/consent", { kind: "user", version: TERMS_V, ...fullConsent({ readFull: false }) })).status, 400);
  assert.equal((await c.post("/api/consent", { kind: "user", version: TERMS_V, ...fullConsent({ docHash: "0".repeat(64) }) })).status, 400, "the fingerprint must match the text");
  assert.equal((await c.post("/api/consent", { kind: "user", version: TERMS_V, ...fullConsent() })).status, 200);
  // the admin sees the record, with the exact text accepted
  const adm = client("admin"); await adm.login("admin@test.lastpick.in");
  const me = (await c.get("/api/me")).data;
  const rec = await adm.get(`/api/admin/users/${me.id}/consents`);
  assert.equal(rec.status, 200);
  assert.ok(rec.data.consents[0].readFull && rec.data.consents[0].text.includes(`Version ${TERMS_V}`) && rec.data.consents[0].hash.length === 64);
  // customers and partners are listed separately, and the CSV export has full contact details
  const custs = (await adm.get("/api/admin/users?kind=customers")).data, parts = (await adm.get("/api/admin/users?kind=partners")).data;
  assert.ok(custs.every((x) => !x.business) && parts.every((x) => x.business) && parts.length > 0);
  const csv = (await adm.get("/api/admin/users/export?kind=partners")).data;
  assert.ok(csv.length === parts.length && csv.every((x) => !x.masked) && csv.some((x) => x.email.includes("@")));
  // the offer ended in an earlier test, but consent no longer blocks: it fails for a different reason
  assert.notEqual((await c.post(`/api/offers/${offerId}/reveal`)).data?.code, "consent_required");
});

test("dashboards: customer savings, partner business, platform impact", async () => {
  const c = client("customer");
  await c.login("customer@test.lastpick.in");
  const s = await c.get("/api/me/savings");
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.saved, 60); // ₹100 offer at ₹40
  assert.equal(s.data.businessesHelped, 1);
  assert.equal(s.data.months.length, 6);
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  const i = await p.get("/api/owner/insights");
  assert.equal(i.status, 200, JSON.stringify(i.data));
  assert.equal(i.data.businessGenerated, 40);
  assert.equal(i.data.customers, 1);
  assert.equal(i.data.funnel.shared, 1);
  assert.equal(i.data.topOffers[0].title, "Evening samosas");
  const a = client("admin");
  await a.login("admin@test.lastpick.in");
  const st = await a.get("/api/admin/stats");
  assert.ok(st.data.impact.saved >= 60);
  assert.ok(st.data.impact.value >= 40);
});

test("support conversations", async () => {
  const c = client("customer");
  await c.login("customer@test.lastpick.in");
  const t = await c.post("/api/support", { topic: "Using the app", message: "How do I share my number?" });
  assert.equal(t.status, 200);
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  const pt = await p.post("/api/support", { topic: "Posting offers", message: "Can I post a health camp?" });
  assert.equal(pt.status, 200);
  const a = client("admin");
  await a.login("admin@test.lastpick.in");
  const open = await a.get("/api/admin/support?status=open");
  assert.equal(open.data.length, 2);
  assert.equal(open.data.find((x) => x.id === pt.data.id).role, "partner");
  assert.equal((await a.post(`/api/admin/support/${t.data.id}/reply`, { message: "Open the offer and tap Share my number." })).status, 200);
  const mine = await c.get(`/api/support/${t.data.id}`);
  assert.equal(mine.data.status, "answered");
  assert.equal(mine.data.messages.length, 2);
  assert.equal(mine.data.messages[1].fromStaff, true);
  assert.equal((await p.get(`/api/support/${t.data.id}`)).status, 404, "can't read someone else's conversation");
  assert.equal((await c.post(`/api/support/${t.data.id}/messages`, { message: "Thanks!" })).status, 200);
  assert.equal((await c.get(`/api/support/${t.data.id}`)).data.status, "open");
});

test("request a call back: one open request per person, admin calls and marks it done", async () => {
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  await p.patch("/api/me", { phone: "9876543210" });
  const r = await p.post("/api/callbacks", { topic: "Posting offers", bestTime: "Evening", note: "Offer not showing" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const again = await p.post("/api/callbacks", { topic: "Posting offers", bestTime: "Morning" });
  assert.equal(again.data.id, r.data.id, "a second request while one is open returns the same one");
  assert.equal(again.data.already, true);
  const mine = await p.get("/api/callbacks/mine");
  assert.equal(mine.data.bestTime, "Evening");
  assert.equal(mine.data.role, "partner");
  assert.notEqual((await p.get("/api/admin/callbacks")).status, 200, "partners can't see the call-back list");
  const a = client("admin");
  await a.login("admin@test.lastpick.in");
  const list = await a.get("/api/admin/callbacks?status=new");
  const row = list.data.find((x) => x.id === r.data.id);
  assert.ok(row, "admin sees the request");
  assert.ok(row.user.phone, "with the number to call");
  assert.equal((await a.post(`/api/admin/callbacks/${r.data.id}/done`, {})).status, 200);
  assert.equal((await p.get("/api/callbacks/mine")).data, null, "nothing waiting once it's done");
  assert.ok((await a.get("/api/admin/callbacks?status=done")).data.some((x) => x.id === r.data.id));
});

test("maintenance: apps pause changes while it's on, admin keeps working, a schedule ends by itself", async () => {
  const a = client("admin");
  await a.login("admin@test.lastpick.in");
  const c = client("customer");
  await c.login("customer@test.lastpick.in");
  assert.equal((await a.post("/api/admin/settings", { maintenance: { on: true, apps: ["customer"], message: "Back soon" } })).status, 200);
  await new Promise((r) => setTimeout(r, 16000)); // the apps re-check every 15 s
  const cfg = await c.get("/api/config");
  assert.equal(cfg.data.maintenance.active, true);
  assert.equal(cfg.data.maintenance.message, "Back soon");
  assert.equal((await c.post("/api/support", { topic: "Using the app", message: "Is it working?" })).status, 503, "changes are paused");
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  assert.notEqual((await p.post("/api/support", { topic: "Posting offers", message: "Still open for partners?" })).status, 503, "only the chosen app is paused");
  assert.equal((await a.post("/api/admin/settings", { maintenance: { on: false, from: Date.now() + 3600000, until: Date.now() + 7200000, apps: ["customer", "partner"] } })).status, 200, "the admin app is never paused");
  const bad = await a.post("/api/admin/settings", { maintenance: { from: Date.now() + 7200000, until: Date.now() + 3600000 } });
  assert.equal(bad.status, 400, "until must be after from");
  await new Promise((r) => setTimeout(r, 16000));
  const soon = (await c.get("/api/config")).data.maintenance;
  assert.equal(soon.active, false);
  assert.equal(soon.upcoming, true, "a warning banner shows before a scheduled window");
  await a.post("/api/admin/settings", { maintenance: { on: false, from: null, until: null } });
});

test("own category only, everything ends the same day, no job openings", async () => {
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  // the daily limit was used earlier: lift it for this test by ageing today's posts
  const { Pool } = process.env.LP_PG_SHIM ? await import("./pg-shim.js") : (await import("pg")).default;
  const pool = new Pool({ connectionString: DB });
  await pool.query("UPDATE offers SET created_at = now() - interval '2 days'");
  await pool.end();
  // job openings (hiring) are not allowed any more
  const job = await p.post("/api/owner/offers", { title: "Shop helper needed, ₹12,000/month", category: "jobs", origPrice: 0, price: 12000, endsAt: soon(30) });
  assert.equal(job.status, 400);
  assert.match(job.data.error, /Job openings/);
  // longer than 24 hours is refused (no 120-day admission campaigns any more)
  const long = await p.post("/api/owner/offers", { title: "Cake pre-orders, 20% off", category: "food", origPrice: 100, price: 80, endsAt: Date.now() + 90 * 86400000 });
  assert.equal(long.status, 400);
  assert.match(long.data.error, /same day/);
  // not its category (movie tickets, travel): refused for this food & stay business
  assert.equal((await p.post("/api/owner/offers", { title: "Empty seats tonight", category: "events", origPrice: 200, price: 80, endsAt: soon(20) })).status, 403);
  assert.equal((await p.post("/api/owner/offers", { title: "Bus seats", category: "travel", origPrice: 1200, price: 700, endsAt: soon(20) })).status, 403);
  // a room for tonight (hotels stay open 24×7)
  const room = await p.post("/api/owner/offers", { title: "Room for tonight", category: "stay", origPrice: 3000, price: 1800, endsAt: soon(20) });
  assert.equal(room.status, 200, JSON.stringify(room.data));
});

test("working hours: after 11 PM only hotels and local ads", async () => {
  const { isNight, istHour, postingOpen } = await import("../src/util.js");
  const at = (h) => Date.UTC(2026, 10, 20, h, 0) - 5.5 * 3600000; // h o'clock India time
  assert.equal(istHour(at(23)), 23);
  // defaults when OPEN_HOUR/CLOSE_HOUR aren't set: 4 AM to 11 PM
  if (!process.env.OPEN_HOUR) {
    assert.equal(isNight(at(22)), false);
    assert.equal(isNight(at(23)), true);
    assert.equal(isNight(at(3)), true);
    assert.equal(isNight(at(4)), false);
    assert.equal(postingOpen(at(3)), false);
    assert.equal(postingOpen(at(4)), true);
    assert.equal(postingOpen(at(22) + 29 * 60000), true);
    assert.equal(postingOpen(at(22) + 30 * 60000), false); // last post 10:30 PM
    assert.equal(postingOpen(at(23)), false);
  }
  {
    const { fixTitlePercent, runs24x7 } = await import("../src/util.js");
    assert.equal(fixTitlePercent("Haircut slots free this evening, 40% off", 80), "Haircut slots free this evening, 80% off");
    assert.equal(fixTitlePercent("Fresh cakes", 50), "Fresh cakes");
    assert.ok(runs24x7("stay") && !runs24x7("travel") && !runs24x7("gym") && !runs24x7("combo") && !runs24x7("food"));
  }
  const cfg = await client("customer").get("/api/config");
  assert.deepEqual(cfg.data.alwaysOpen, ["stay", "ads"]);
  assert.equal(cfg.data.night, false); // test servers run with OPEN_HOUR=0, CLOSE_HOUR=24
  // the night server: hotels and travel still listed, the food offers hidden, and their numbers can't be revealed
  const n = client("night");
  const feed = (await n.get("/api/offers?lat=12.97&lng=77.60&radius=5")).data;
  assert.ok(feed.length > 0 && feed.every((o) => ["stay", "ads"].includes(o.category)), JSON.stringify(feed.map((o) => o.category)));
  assert.equal((await n.get("/api/config")).data.night, true);
  await n.login("customer@test.lastpick.in");
  // radius 6: a fresh (uncached) list, so no offer removed by an earlier test is picked
  const day = (await client("customer").get("/api/offers?lat=12.97&lng=77.60&radius=6")).data.find((o) => o.category === "food");
  if (day) {
    const r = await n.post(`/api/offers/${day.id}/reveal`);
    assert.equal(r.data.code, "closed_for_night");
  }
  // customers are free (the night server runs without CUSTOMER_PASS): a brand-new customer with no plan sees a
  // 24-hour offer's number, call only (no WhatsApp), and can't buy a Customer Pass
  const su = await client("customer").post("/api/auth/signup", { email: "freecust@test.lastpick.in", password: "longpassword", name: "Free Cust", phone: "9811155599", consent: fullConsent() });
  assert.equal(su.status, 200, JSON.stringify(su.data));
  const fresh = client("night");
  fresh.token = su.data.token; // same database and sign-in secret, so the night server accepts it
  assert.equal((await fresh.get("/api/config")).data.customersFree, true);
  assert.equal((await client("customer").get("/api/config")).data.customersFree, false);
  const stay = feed[0];
  const rv = await fresh.post(`/api/offers/${stay.id}/reveal`);
  assert.equal(rv.status, 200, JSON.stringify(rv.data));
  assert.ok(rv.data.phone && rv.data.whatsapp === undefined, JSON.stringify(rv.data));
  assert.notEqual((await fresh.post("/api/payments/order", { plan: "customer" })).status, 200, "no Customer Pass to buy");
});

test("no combos, automatic % in the title, 24-hour hotel offers", async () => {
  const { Pool } = process.env.LP_PG_SHIM ? await import("./pg-shim.js") : (await import("pg")).default;
  const pool = new Pool({ connectionString: DB });
  await pool.query("UPDATE offers SET created_at = now() - interval '2 days'"); // lift today's post limit
  await pool.end();
  const p = client("partner"); await p.login("owner@test.lastpick.in");
  // combos are removed: a "combo" offer is refused like any other category the business isn't registered in
  assert.equal((await p.post("/api/owner/offers", { title: "Room + dinner + pickup", category: "combo", comboItems: ["stay", "food"], origPrice: 4000, price: 2800, endsAt: soon(60) })).status, 403);
  assert.equal((await client("customer").get("/api/config")).data.combos, undefined);
  // the % in the title is worked out from the prices: 400 -> 80 is 80% off, not 40%
  const cut = await p.post("/api/owner/offers", { title: "Cake slices, 40% off", category: "food", origPrice: 400, price: 80, endsAt: soon(30) });
  assert.equal(cut.status, 200, JSON.stringify(cut.data));
  assert.equal((await p.get("/api/offers/" + cut.data.id)).data.title, "Cake slices, 80% off");
  // hotels can run for up to 24 hours (past midnight); more than that is refused
  const room = await p.post("/api/owner/offers", { title: "Rooms tonight and tomorrow", category: "stay", origPrice: 3000, price: 2000, endsAt: Date.now() + 20 * 3600000 });
  assert.equal(room.status, 200, JSON.stringify(room.data));
  assert.equal((await p.post("/api/owner/offers", { title: "Rooms", category: "stay", origPrice: 3000, price: 2000, endsAt: Date.now() + 30 * 3600000 })).status, 400);
});

test("revenue: boosted offers, sponsored banners, revenue page", async () => {
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  const a = client("admin");
  await a.login("admin@test.lastpick.in");
  const mine = (await p.get("/api/owner/offers")).data.find((o) => o.status === "live" && o.endsAt > Date.now() && o.category !== "jobs");
  assert.ok(mine, "the partner has a live offer");
  // only 6, 12 or 24 hours
  assert.equal((await p.post(`/api/owner/offers/${mine.id}/boost`, { hours: 5 })).status, 400);
  // no free version: a boost waits until an admin confirms the payment
  const req = await p.post(`/api/owner/offers/${mine.id}/boost`, { hours: 12 });
  assert.equal(req.status, 200, JSON.stringify(req.data));
  assert.equal(req.data.status, "pending");
  assert.equal(req.data.price, 79);
  assert.equal((await p.post(`/api/owner/offers/${mine.id}/boost`, { hours: 6 })).status, 409, "one boost at a time");
  // moderators can't touch money
  const m = client("admin");
  await m.login("moderator@test.lastpick.in");
  assert.equal((await m.get("/api/admin/boosts")).status, 403);
  const pending = (await a.get("/api/admin/boosts?status=pending")).data;
  assert.ok(pending.some((b) => b.id === req.data.id));
  const ok = await a.post(`/api/admin/boosts/${req.data.id}`, { action: "approve", note: "UPI ref 123" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.live, true);
  // customers see it as featured
  const c = client("customer");
  assert.equal((await c.get(`/api/offers/${mine.id}`)).data.featured, true);
  // a sponsored banner for Bengaluru
  const ban = await a.post("/api/admin/banners", { title: "Grand opening: 30% off all week", advertiser: "Chai Point", city: "Bengaluru", days: 7, price: 2000, offerId: mine.id });
  assert.equal(ban.status, 200, JSON.stringify(ban.data));
  assert.ok((await c.get("/api/banners?city=bengaluru")).data.some((b) => b.id === ban.data.id));
  assert.ok(!(await c.get("/api/banners?city=mumbai")).data.some((b) => b.id === ban.data.id));
  // a Customer Pass for 3 months, paid by UPI and activated by the admin: 3 × ₹99 = ₹297
  const before = (await a.get("/api/admin/revenue")).data.subscriptions.customerPass.soldThisMonth;
  assert.equal((await a.post("/api/admin/plans", { email: "customer@test.lastpick.in", plan: "customer", months: 3 })).status, 200);
  // revenue this month: plan sales, the paid boost and the banner
  const rev = (await a.get("/api/admin/revenue")).data;
  assert.equal(rev.subscriptions.customerPass.soldThisMonth - before, 297);
  assert.ok(rev.subscriptions.customerPass.byMonths[3] >= 1);
  assert.ok(rev.subscriptions.mrr >= 99, "₹99 a month");
  assert.equal(rev.boosts.paid, 79);
  assert.equal(rev.banners.sold, 2000);
  assert.equal(rev.totalThisMonth, rev.subscriptions.customerPass.soldThisMonth + rev.subscriptions.businessPro.soldThisMonth + 79 + 2000);
  assert.equal((await a.post(`/api/admin/banners/${ban.data.id}/stop`)).status, 200);
  assert.ok(!(await c.get("/api/banners?city=bengaluru")).data.some((b) => b.id === ban.data.id));
});

test("area agents: a moderator sees only their states, cities or pincodes", async () => {
  const a = client("admin");
  await a.login("admin@test.lastpick.in");
  // Karnataka, but only Mysuru: the Bengaluru businesses disappear for this agent
  assert.equal((await a.post("/api/admin/role", { email: "moderator@test.lastpick.in", role: "moderator", regions: ["Karnataka"], cities: ["Mysuru"] })).status, 200);
  const m = client("admin");
  await m.login("moderator@test.lastpick.in");
  const list = (await m.get("/api/admin/businesses")).data;
  assert.ok(Array.isArray(list) && !list.some((b) => b.city === "Bengaluru"), JSON.stringify(list.map((b) => b.city)));
  const blr = (await a.get("/api/admin/businesses?state=Karnataka")).data.find((b) => b.city === "Bengaluru");
  assert.equal((await m.post(`/api/admin/businesses/${blr.id}/status`, { status: "suspended" })).status, 403);
  // a pincode area: 560001 (MG Road) is in, the rest of Bengaluru is out
  await a.post("/api/admin/role", { email: "moderator@test.lastpick.in", role: "moderator", regions: ["Karnataka"], cities: ["Bengaluru"], pincodes: ["560001"] });
  await m.login("moderator@test.lastpick.in");
  const pins = (await m.get("/api/admin/businesses")).data;
  assert.ok(pins.length > 0 && pins.every((b) => b.city === "Bengaluru"));
  const users = (await a.get("/api/admin/users?q=moderator@test.lastpick.in")).data;
  assert.deepEqual(users[0].areaPincodes, ["560001"]);
  // personal data is masked in admin lists; the full value needs a separate, logged reveal
  assert.match(users[0].email, /^mo•••@test\.lastpick\.in$/);
  assert.match(users[0].phone, /•••/);
  const full = await a.post(`/api/admin/users/${users[0].id}/reveal`);
  assert.equal(full.data.email, "moderator@test.lastpick.in");
  assert.equal((await m.post(`/api/admin/users/${users[0].id}/reveal`)).status, 403, "area agents can't reveal users");
  const team = (await a.get("/api/admin/team")).data;
  assert.ok(team.some((t) => t.email === "moderator@test.lastpick.in" && t.areaPincodes.includes("560001")));
  // back to all of Karnataka for the other tests
  await a.post("/api/admin/role", { email: "moderator@test.lastpick.in", role: "moderator", regions: ["Karnataka"] });
});

test("privacy: export and delete account", async () => {
  const c = client("customer");
  await c.login("customer@test.lastpick.in");
  const ex = await c.get("/api/privacy/export");
  assert.equal(ex.data.profile.email, "customer@test.lastpick.in");
  assert.equal(ex.data.numbersShared.length, 1);
  assert.equal((await c.post("/api/privacy/delete", { confirm: "nope" })).status, 400);
  assert.equal((await c.post("/api/privacy/delete", { confirm: "DELETE" })).status, 200);
  assert.equal((await c.get("/api/me")).status, 401, "token stops working at once");
  assert.equal((await client("customer").login("customer@test.lastpick.in")).status, 400);
  // the queue purges the rest within a few seconds
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  let leads;
  for (let i = 0; i < 40; i++) { leads = (await p.get("/api/owner/leads")).data; if (!leads.length) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(leads.length, 0, "leads from the deleted customer are gone");
  assert.equal((await p.get(`/api/businesses/${bizId}/reviews`)).data.length, 0, "their review is gone");
});

test("rate limits and safety", async () => {
  const c = client("customer");
  let last;
  for (let i = 0; i < 12; i++) last = await c.call("POST", "/api/auth/login", { email: "ratelimit@test.lastpick.in", password: "wrong" });
  assert.equal(last.status, 429);
  assert.equal((await c.get("/api/offers/not-a-uuid")).status, 404);
  const big = await c.call("POST", "/api/grievances", { details: "x".repeat(700 * 1024) });
  assert.equal(big.status, 413);
  const res = await fetch(`http://localhost:${PORTS.customer}/api/config`);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.ok(res.headers.get("strict-transport-security"));
});


test("log in with mobile number + WhatsApp code (no password, no e-mail)", async () => {
  const c = client("customer");
  assert.equal((await c.get("/api/config")).data.whatsappLogin, true);
  // fake numbers are refused before anything is sent
  assert.equal((await c.post("/api/auth/wa/send", { phone: "9999999999" })).status, 400);
  const n0 = waSent.length;
  const sent = await c.post("/api/auth/wa/send", { phone: "+91 91234 56781" });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const msg = waSent[n0];
  assert.match(msg.url, /\/123456\/messages$/);
  assert.equal(msg.auth, "Bearer test-token");
  assert.equal(msg.body.to, "919123456781");
  assert.equal(msg.body.template.name, "lastpick_otp");
  const code = msg.body.template.components[0].parameters[0].text;
  assert.match(code, /^\d{6}$/);
  assert.equal(msg.body.template.components[1].parameters[0].text, code, "same code in the Copy code button");
  // wrong code refused, right code logs in and creates the account (no e-mail, no password)
  assert.equal((await c.post("/api/auth/wa/verify", { phone: "9123456781", code: code === "111111" ? "222222" : "111111" })).status, 400);
  const ok = await c.post("/api/auth/wa/verify", { phone: "9123456781", code });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.isNew, true);
  c.setToken?.(ok.data.token);
  const me = await fetch(`http://localhost:18081/api/me`, { headers: { Authorization: `Bearer ${ok.data.token}` } }).then((r) => r.json());
  assert.equal(me.phone, "+919123456781");
  assert.equal(me.email, "");
  assert.equal(me.needsProfile, true, "the app asks for the name next");
  // the code works once only
  assert.equal((await c.post("/api/auth/wa/verify", { phone: "9123456781", code })).status, 400);
  // logging in again (partner app, same account): not new
  const p = client("partner");
  const n1 = waSent.length;
  // a second code within 30 seconds is refused (each code costs money)
  assert.equal((await p.post("/api/auth/wa/send", { phone: "9123456781" })).status, 429);
  { const { Pool } = process.env.LP_PG_SHIM ? await import("./pg-shim.js") : (await import("pg")).default;
    const pool = new Pool({ connectionString: DB }); await pool.query("DELETE FROM rate_limits WHERE action = 'waGap'"); await pool.end(); }
  assert.equal((await p.post("/api/auth/wa/send", { phone: "9123456781" })).status, 200);
  const code2 = waSent[n1].body.template.components[0].parameters[0].text;
  const again = await p.post("/api/auth/wa/verify", { phone: "9123456781", code: code2 });
  assert.equal(again.status, 200);
  assert.equal(again.data.isNew, false);
  // the admin panel doesn't accept numbers that aren't staff
  assert.equal((await client("admin").post("/api/auth/wa/send", { phone: "9123456781" })).status, 403);
});

test("partner sign-up needs a profile photo (KYC); confirm with /api/me and the admin view", async () => {
  const PHOTO = "data:image/jpeg;base64," + "A".repeat(400);
  const p = client("partner");
  const base = { email: "kyc@test.lastpick.in", password: "longpassword", name: "Kyc Owner", phone: "9812345670", consent: fullConsent() };
  const no = await p.post("/api/auth/signup", base);
  assert.equal(no.status, 400); assert.match(no.data.error, /photo/i);
  assert.equal((await p.post("/api/auth/signup", { ...base, photo: "data:text/html;base64,AAAA" })).status, 400, "only images");
  const ok = await p.post("/api/auth/signup", { ...base, photo: PHOTO });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const k = client("partner"); k.token = ok.data.token;
  assert.equal((await k.get("/api/me")).data.hasPhoto, true);
  assert.equal((await k.get("/api/me/photo")).data.photo, PHOTO);
  // customers can sign up without a photo
  assert.equal((await client("customer").post("/api/auth/signup", { email: "nophoto@test.lastpick.in", password: "longpassword", name: "No Photo", phone: "9812345671", consent: fullConsent() })).status, 200);
  // admins can open the KYC photo
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  const ph = await a.get(`/api/admin/users/${ok.data.user.id}/photo`);
  assert.equal(ph.status, 200); assert.equal(ph.data.photo, PHOTO);
});

test("sign-up checks the mobile number with a WhatsApp code when WA_VERIFY is on", async () => {
  const n = client("night"); // this test server runs with WA_VERIFY=on
  { const { Pool } = process.env.LP_PG_SHIM ? await import("./pg-shim.js") : (await import("pg")).default;
    const pool = new Pool({ connectionString: DB }); await pool.query("DELETE FROM rate_limits WHERE action = 'signup'"); await pool.end(); } // all tests share one IP
  const cfg = (await n.get("/api/config")).data;
  assert.equal(cfg.phoneCodes, true); assert.equal(cfg.phoneChannel, "whatsapp");
  assert.equal((await client("customer").get("/api/config")).data.phoneCodes, false, "off elsewhere");
  const base = { email: "wav@test.lastpick.in", password: "longpassword", name: "Wa Verify", phone: "9812345672", consent: fullConsent(), waOptIn: true };
  assert.equal((await n.post("/api/auth/otp/send-phone", { phone: "9812345673" })).status, 400, "WhatsApp opt-in needed first");
  assert.equal((await n.post("/api/auth/signup", base)).status, 400, "no WhatsApp code yet");
  assert.equal((await n.post("/api/auth/otp/send-phone", { phone: "9999999999" })).status, 400, "fake number refused");
  const n0 = waSent.length;
  const s1 = await n.post("/api/auth/otp/send-phone", { phone: "98123 45672", optIn: true });
  assert.equal(s1.status, 200, JSON.stringify(s1.data)); assert.equal(s1.data.channel, "whatsapp");
  assert.equal(waSent[n0].body.to, "919812345672");
  const code = waSent[n0].body.template.components[0].parameters[0].text;
  assert.equal((await n.post("/api/auth/otp/send-phone", { phone: "9812345672", optIn: true })).status, 429, "30-second gap");
  const wr = await n.post("/api/auth/signup", { ...base, phoneOtp: code === "111111" ? "222222" : "111111" }); assert.equal(wr.status, 400, JSON.stringify(wr.data));
  const ok = await n.post("/api/auth/signup", { ...base, phoneOtp: code });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const me = client("night"); me.token = ok.data.token;
  assert.equal((await me.get("/api/me")).data.phoneVerified, true);
});

test("if Meta refuses the WhatsApp template, sign-up still works with the e-mail code only", async () => {
  const n = client("night");
  const r = await n.post("/api/auth/otp/send-phone", { phone: "9812345679", optIn: true });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.skipped, true);
  const ok = await n.post("/api/auth/signup", { email: "skip@test.lastpick.in", password: "longpassword", name: "Skip", phone: "9812345679", consent: fullConsent(), waOptIn: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const me = client("night"); me.token = ok.data.token;
  const prof = (await me.get("/api/me")).data;
  assert.equal(prof.phoneVerified, false); assert.equal(prof.emailVerified, true); assert.equal(prof.whatsappOptIn, true);
});

test("KYC: verify the mobile number later from the account page (WhatsApp code)", async () => {
  { const { Pool } = process.env.LP_PG_SHIM ? await import("./pg-shim.js") : (await import("pg")).default;
    const pool = new Pool({ connectionString: DB }); await pool.query("DELETE FROM rate_limits WHERE action IN ('signup','waSkip')"); await pool.end(); }
  const n = client("night");
  // the code couldn't be sent at sign-up (Meta refused), so the account starts with the number not verified
  await n.post("/api/auth/otp/send-phone", { phone: "9812345679", optIn: true });
  const ok = await n.post("/api/auth/signup", { email: "later@test.lastpick.in", password: "longpassword", name: "Later", phone: "9812345674", consent: fullConsent(), waOptIn: true, phoneOtp: "000000" });
  // 9812345674 was never skipped, so a wrong code is refused
  assert.equal(ok.status, 400);
  await n.post("/api/auth/otp/send-phone", { phone: "9812345674", optIn: true });
  const code0 = waSent.at(-1).body.template.components[0].parameters[0].text;
  const ok2 = await n.post("/api/auth/signup", { email: "later@test.lastpick.in", password: "longpassword", name: "Later", phone: "9812345674", consent: fullConsent(), waOptIn: true, phoneOtp: code0 });
  assert.equal(ok2.status, 200, JSON.stringify(ok2.data));
  const me = client("night"); me.token = ok2.data.token;
  assert.equal((await me.get("/api/me")).data.phoneVerified, true);
  assert.equal((await me.post("/api/me/phone/send", { optIn: true })).data.verified, true, "already verified");
  // changing the number resets it; then verify it again from the account page
  assert.equal((await me.patch("/api/me", { name: "Later", phone: "9812345675" })).status, 200);
  assert.equal((await me.get("/api/me")).data.phoneVerified, false);
  assert.equal((await me.post("/api/me/phone/send", {})).status, 400, "opt-in needed");
  const s1 = await me.post("/api/me/phone/send", { optIn: true });
  assert.equal(s1.status, 200, JSON.stringify(s1.data));
  const code = waSent.at(-1).body.template.components[0].parameters[0].text;
  assert.equal((await me.post("/api/me/phone/verify", { code: code === "111111" ? "222222" : "111111" })).status, 400);
  assert.equal((await me.post("/api/me/phone/verify", { code })).status, 200);
  assert.equal((await me.get("/api/me")).data.phoneVerified, true);
});

test("Razorpay: pay once, get 30 days; each payment counts once; wrong signatures are refused", async () => {
  const { createHmac } = await import("node:crypto");
  const sign = (o, p) => createHmac("sha256", RZ_SECRET).update(`${o}|${p}`).digest("hex");
  const c = client("customer");
  const s = await c.post("/api/auth/signup", { email: "payer@test.lastpick.in", password: "longpassword", name: "Payer", phone: "9811155566", consent: fullConsent() });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  c.token = s.data.token;
  assert.equal((await c.get("/api/config")).data.payments, true);
  // the customer app sells only the Customer Pass
  assert.equal((await c.post("/api/payments/order", { plan: "owner" })).status, 403);
  const o = await c.post("/api/payments/order", { plan: "customer" });
  assert.equal(o.status, 200, JSON.stringify(o.data));
  assert.equal(o.data.amount, 9900); assert.equal(o.data.keyId, "rzp_test_key");
  assert.equal(rzOrders.at(-1).amount, 9900);
  // a forged signature does nothing
  assert.equal((await c.post("/api/payments/verify", { orderId: o.data.orderId, paymentId: "pay_X1", signature: "0".repeat(64) })).status, 400);
  assert.equal((await c.get("/api/me/subscriptions")).data.customer, null);
  // the real signature: 30 days
  const v = await c.post("/api/payments/verify", { orderId: o.data.orderId, paymentId: "pay_X1", signature: sign(o.data.orderId, "pay_X1") });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  const end1 = v.data.subscription.currentPeriodEnd;
  // the day of payment is Day 1: 30 days run till 11:59:59 PM (India time) on the 30th day, counting today
  const IST = 19800000, endOfIstDay = (t) => (Math.floor((t + IST) / 86400000) + 1) * 86400000 - IST - 1000;
  assert.ok(v.data.subscription.active && Math.abs(end1 - (endOfIstDay(Date.now()) + 29 * 86400000)) < 2000, String(end1));
  // the same payment again changes nothing
  await c.post("/api/payments/verify", { orderId: o.data.orderId, paymentId: "pay_X1", signature: sign(o.data.orderId, "pay_X1") });
  assert.equal((await c.get("/api/me/subscriptions")).data.customer.currentPeriodEnd, end1);
  // the number is visible now (the Customer Pass is active): paying works end to end
  // second payment, the app never got Razorpay's reply: "check" asks Razorpay and adds 30 more days
  const o2 = await c.post("/api/payments/order", { plan: "customer" });
  assert.deepEqual((await c.post("/api/payments/check", { orderId: o2.data.orderId })).data, { paid: false });
  rzPaid.set(o2.data.orderId, "pay_X2");
  const k = await c.post("/api/payments/check", { orderId: o2.data.orderId });
  assert.equal(k.data.paid, true);
  assert.ok(Math.abs(k.data.subscription.currentPeriodEnd - (end1 + 30 * 86400000)) < 5000, "30 days added to the current end");
  // someone else's order can't be used
  const other = client("customer");
  other.token = (await other.post("/api/auth/signup", { email: "payer2@test.lastpick.in", password: "longpassword", name: "Payer Two", phone: "9811155577", consent: fullConsent() })).data.token;
  assert.equal((await other.post("/api/payments/check", { orderId: o2.data.orderId })).status, 404);
  // partners: Business Pro only, and only once the business is verified
  const p = client("partner"); await p.login("owner@test.lastpick.in");
  assert.equal((await p.post("/api/payments/order", { plan: "customer" })).status, 403);
  const po = await p.post("/api/payments/order", { plan: "owner" });
  assert.ok([200, 409].includes(po.status), JSON.stringify(po.data));
  if (po.status === 200) assert.equal(po.data.amount, 49900);
  // partner packs: 5 days ₹99, 15 days ₹199 (any number of times); other lengths are refused; customers only 30 days
  if (po.status === 200) {
    const p5 = await p.post("/api/payments/order", { plan: "owner", days: 5 });
    assert.equal(p5.data.amount, 11900); assert.equal(p5.data.days, 5);
    const before = (await p.get("/api/me/subscriptions")).data.owner?.currentPeriodEnd || 0;
    const v5 = await p.post("/api/payments/verify", { orderId: p5.data.orderId, paymentId: "pay_P5", signature: sign(p5.data.orderId, "pay_P5") });
    assert.equal(v5.status, 200, JSON.stringify(v5.data));
    // a top-up adds the days after the current last day; a fresh plan counts today as Day 1
    const IST = 19800000, endOfIstDay = (t) => (Math.floor((t + IST) / 86400000) + 1) * 86400000 - IST - 1000;
    const want = before > Date.now() ? endOfIstDay(before) + 5 * 86400000 : endOfIstDay(Date.now()) + 4 * 86400000;
    assert.ok(Math.abs(v5.data.subscription.currentPeriodEnd - want) < 2000, "5 days added");
    // one pack at a time: while this plan runs, only a top-up with the same pack is open
    const pk = v5.data.subscription.packDays;
    const other = pk === 15 ? 5 : 15;
    assert.equal((await p.post("/api/payments/order", { plan: "owner", days: other })).status, 409);
    assert.equal((await p.post("/api/payments/order", { plan: "owner", days: pk })).status, 200);
    assert.equal((await p.post("/api/payments/order", { plan: "owner", days: 7 })).status, 400);
  }
  // the customer's 30-day pass is running: 5 and 15 days wait till it ends, a 30-day top-up is open
  assert.equal((await c.post("/api/payments/order", { plan: "customer", days: 5 })).status, 409);
  assert.equal((await c.post("/api/payments/order", { plan: "customer", days: 30 })).status, 200);
  assert.equal((await c.post("/api/payments/order", { plan: "customer", days: 7 })).status, 400);
});

test("public counts: partners in a pincode and in total, customers, newly joined partners", async () => {
  const c = client("customer");
  const all = await c.get("/api/stats");
  assert.equal(all.status, 200, JSON.stringify(all.data));
  assert.ok(all.data.partners.total >= 1 && all.data.customers.total >= 1, JSON.stringify(all.data));
  assert.equal(all.data.partners.area, null);
  const pin = await c.get("/api/stats?pincode=560038");
  assert.ok(Number.isInteger(pin.data.partners.area) && pin.data.partners.area <= pin.data.partners.total, JSON.stringify(pin.data));
  assert.equal((await c.get("/api/stats?pincode=999999")).data.partners.area, 0);
  assert.equal((await c.get("/api/stats?pincode=12ab")).status, 400);
  for (const j of all.data.joined) assert.deepEqual(Object.keys(j).sort(), ["area", "at", "name"], "name, area and time only");
  assert.equal((await client("partner").get("/api/stats")).status, 200);
});

test("free launch mode: customers see numbers without a pass while it's on; off again needs a plan", async () => {
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  const c = client("customer");
  c.token = (await c.post("/api/auth/signup", { email: "freebie@test.lastpick.in", password: "longpassword", name: "Free Bie", phone: "9811155588", consent: fullConsent() })).data.token;
  // a live offer the customer can open (lists may be cached for a minute, so try them until one answers)
  let offer = null, locked = null;
  for (const o of (await c.get("/api/offers?lat=12.97&lng=77.60&radius=9")).data) {
    const r = await c.post(`/api/offers/${o.id}/reveal`);
    if (r.status === 403) { offer = o; locked = r; break; }
  }
  assert.ok(offer, "a live offer to try");
  assert.match(locked.data.error, /Customer Pass/);
  assert.notEqual((await client("customer").post("/api/admin/settings", { freeMode: true })).status, 200, "not for customers");
  assert.equal((await a.post("/api/admin/settings", { freeMode: true })).data.freeMode, true);
  assert.equal((await c.get("/api/config")).data.freeMode, true);
  const open = await c.post(`/api/offers/${offer.id}/reveal`);
  assert.ok(!(open.status === 403 && /Customer Pass/.test(open.data.error || "")), JSON.stringify(open.data));
  assert.equal((await a.post("/api/admin/settings", { freeMode: false })).data.freeMode, false);
  assert.equal((await c.get("/api/config")).data.freeMode, false);
  assert.equal((await c.post(`/api/offers/${offer.id}/reveal`)).status, 403);
});

test("offers are a list of items: the best deal sets the price, bad items are refused", async () => {
  const p = client("partner"); await p.login("owner@test.lastpick.in");
  const bad = await p.post("/api/owner/offers", { title: "Sweets sale", category: "food", items: [{ n: "Kaju", a: 100, p: 120 }], endsAt: Date.now() + 20 * 60000 });
  assert.equal(bad.status, 400, JSON.stringify(bad.data));
  const r = await p.post("/api/owner/offers", { title: "Evening sweets", category: "food", endsAt: Date.now() + 20 * 60000,
    items: [{ n: "Kaju katli", a: 400, p: 200 }, { n: "Samosa (4)", a: 60, p: 40 }] });
  // posting hours, or today's 3 posts already used by earlier tests (ended offers still count)
  if (r.status === 412 || (r.status === 409 && /offers a day/.test(r.data?.error || ""))) return;
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const mine = (await p.get("/api/owner/offers")).data.find((o) => o.id === r.data.id);
  assert.equal(mine.price, 200); assert.equal(mine.origPrice, 400);
  assert.deepEqual(mine.items.map((i) => i.n), ["Kaju katli", "Samosa (4)"]);
  await p.post(`/api/owner/offers/${r.data.id}/end`);
});

test("admin filters by area and category; Business Pro day packs; maintenance off ends a running window", async () => {
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  const areas = (await a.get("/api/admin/areas")).data;
  assert.ok(areas.states.length >= 1 && areas.cities.length >= 1 && areas.pincodes.length >= 1, JSON.stringify(areas));
  const pin = areas.pincodes[0];
  const inPin = (await a.get(`/api/admin/businesses?pincode=${pin.pincode}`)).data;
  assert.ok(inPin.length >= 1 && inPin.every((b) => b.pincode === pin.pincode));
  const byCat = (await a.get(`/api/admin/businesses?category=${inPin[0].category}&state=${encodeURIComponent(pin.state)}`)).data;
  assert.ok(byCat.length >= 1 && byCat.every((b) => b.categories.includes(inPin[0].category) && b.state === pin.state));
  assert.equal((await a.get("/api/admin/businesses?category=no-such-category")).data.length, 0);
  assert.equal((await a.get(`/api/admin/businesses?q=${encodeURIComponent(inPin[0].name.slice(0, 4))}`)).data.some((b) => b.id === inPin[0].id), true);
  const s = (await a.get(`/api/admin/stats?pincode=${pin.pincode}`)).data;
  assert.ok(s.totals.partners >= 1 && s.filter.pincode === pin.pincode);
  assert.equal((await a.get("/api/admin/stats?category=no-such-category")).data.totals.partners, 0);
  assert.equal((await a.get(`/api/admin/pincodes?state=${encodeURIComponent(pin.state)}`)).status, 200);

  // packs paid outside the app: 5, 15 or 30 days added to the current end date
  const before = (await a.post(`/api/admin/businesses/${inPin[0].id}/plan`, { action: "pack", days: 5 })).data.planUntil;
  const after = (await a.post(`/api/admin/businesses/${inPin[0].id}/plan`, { action: "pack", days: 15 })).data.planUntil;
  assert.ok(before > Date.now() && Math.round((after - before) / 86400000) === 15);
  assert.equal((await a.post(`/api/admin/businesses/${inPin[0].id}/plan`, { action: "pack", days: 7 })).status, 400);
  assert.equal((await a.post(`/api/admin/businesses/${inPin[0].id}/plan`, { action: "extendTrial", days: 120 })).status, 200);

  // switching maintenance off also ends a window that is running now
  await a.post("/api/admin/settings", { maintenance: { on: false, from: Date.now() - 60000, until: Date.now() + 3600000, apps: ["customer", "partner"] } });
  assert.equal((await a.get("/api/admin/settings")).data.maintenance.from != null, true);
  const off = (await a.post("/api/admin/settings", { maintenance: { endNow: true } })).data;
  assert.equal(off.maintenance.from, null);
});

test("My items (names only), optional quantity, and plans counted from Day 1 till 11:59 PM", async () => {
  const o = client("partner"); await o.login("owner@test.lastpick.in");
  const a1 = (await o.post("/api/owner/items", { name: "Chicken biryani (full)" })).data;
  assert.ok(a1.id && a1.name === "Chicken biryani (full)");
  assert.equal((await o.post("/api/owner/items", { name: "chicken BIRYANI (full)" })).data.id, a1.id); // no duplicates
  await o.post("/api/owner/items", { name: "Rice; 25 kg > bag" });
  let mine = (await o.get("/api/owner/items")).data;
  assert.ok(mine.some((x) => x.name === "Rice 25 kg bag"), JSON.stringify(mine)); // ";" and ">" taken out
  assert.equal((await o.post("/api/owner/items", { name: "x" })).status, 400);
  assert.equal((await o.post(`/api/owner/items/${a1.id}/remove`)).data.removed, true);
  mine = (await o.get("/api/owner/items")).data;
  assert.ok(!mine.some((x) => x.id === a1.id));
  assert.equal((await o.post(`/api/owner/items/${a1.id}/remove`)).status, 404);

  // a post with a quantity: the quantity is kept, and the posted name joins My items
  const r = await o.post("/api/owner/offers", { title: "Lunch specials", category: "food", items: [{ n: "Mutton biryani (full)", a: 380, p: 299, q: "5 plates" }], endsAt: Date.now() + 3600000 });
  if (r.status === 200) {
    assert.equal(r.data.items[0].q, "5 plates");
    assert.ok((await o.get("/api/owner/items")).data.some((x) => x.name === "Mutton biryani (full)"));
  }

  // Day 1 rule: a 5-day pack runs till 11:59:59 PM India time on the 5th day, counting today
  const ad = client("admin"); await ad.login("admin@test.lastpick.in");
  const me = (await o.get("/api/me")).data;
  const id = me.user?.id || me.id;
  await ad.post(`/api/admin/businesses/${id}/plan`, { action: "lock" }).catch(() => {});
  const sub = (await o.get("/api/me/subscriptions")).data.owner;
  const IST = 19800000, dayOf = (t) => Math.floor((t + IST) / 86400000);
  if (sub?.active && sub.packDays) {
    const days = dayOf(sub.currentPeriodEnd) - dayOf(sub.periodStart) + 1;
    assert.ok(days >= sub.packDays, JSON.stringify(sub));
    assert.equal(new Date(sub.currentPeriodEnd + IST).getUTCHours(), 23);
  }
});

test("admin: Customer Pass switch, Business Pro counts per pincode", async () => {
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  const before = (await a.get("/api/admin/settings")).data.customerPass;
  assert.equal(typeof before, "boolean");
  assert.equal((await a.post("/api/admin/settings", { customerPass: !before })).data.customerPass, !before);
  assert.equal((await client("customer").get("/api/config")).data.customersFree, before); // switched: free is now the opposite of the pass
  await a.post("/api/admin/settings", { customerPass: before });
  const s = (await a.get("/api/admin/stats")).data.totals;
  assert.ok(Number.isInteger(s.ownersEnding) && Number.isInteger(s.customersRegistered), JSON.stringify(s));
  const pins = (await a.get("/api/admin/pincodes")).data.pincodes;
  assert.ok(pins.length && pins.every((x) => Number.isInteger(x.subs) && Number.isInteger(x.ending)));
});

test("file storage: save, read back and delete (database store when R2 keys are absent)", async () => {
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  const r = await a.get("/api/admin/storage-check");
  assert.equal(r.status, 200);
  assert.equal(r.data.saved, true);
  assert.equal(r.data.readBack, true);
  assert.equal(r.data.store, "database");
  assert.equal((await client("customer").get("/api/admin/storage-check")).status >= 400, true);
});

test("partners can't change their category; admins can (live offers end, reason logged)", async () => {
  const o = client("partner"); await o.login("owner@test.lastpick.in");
  const biz = (await o.get("/api/business")).data;
  const base = { name: biz.name, phone: "9988776655", city: biz.city, state: biz.state, pincode: biz.pincode, area: biz.area, lat: biz.lat, lng: biz.lng };
  const tryChange = await o.put("/api/business", { ...base, category: "fashion", categories: ["fashion"] });
  assert.equal(tryChange.status, 409);
  assert.match(tryChange.data.error, /contact LastPick support/);
  const same = await o.put("/api/business", { ...base, category: biz.category, categories: biz.categories, about: "Same category, new text" });
  assert.equal(same.status, 200);
  const id = (await o.get("/api/me")).data.id;
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  assert.equal((await a.post(`/api/admin/businesses/${id}/category`, { category: "farm" })).status, 400); // reason needed
  const ch = await a.post(`/api/admin/businesses/${id}/category`, { category: "farm", reason: "Shop now sells vegetables" });
  assert.equal(ch.status, 200);
  assert.equal(ch.data.category, "farm");
  const after = (await o.get("/api/business")).data;
  assert.equal(after.category, "farm");
  assert.deepEqual(after.categories, ["farm"]);
  assert.equal((await o.get("/api/owner/offers")).data.filter?.((x) => x.status === "live").length ?? 0, 0);
  // a moderator or a partner can't do it
  assert.equal((await o.post(`/api/admin/businesses/${id}/category`, { category: "food", reason: "try" })).status >= 400, true);
  await a.post(`/api/admin/businesses/${id}/category`, { category: biz.category, reason: "back for the next tests" });
});

test("rentals: draft, photo, publish 15/30 days, near me, contact, rented out, reopen", async () => {
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  const o = client("partner"); await o.login("owner@test.lastpick.in");
  const biz = (await o.get("/api/business")).data;
  const id = (await o.get("/api/me")).data.id;
  // only partners registered for Rentals can post
  assert.equal((await o.post("/api/owner/rentals", { kind: "home", type: "2BHK", rent: 14000 })).status, 409);
  await a.post(`/api/admin/businesses/${id}/category`, { category: "rentals", reason: "test: house owner" });
  assert.equal((await o.post("/api/owner/rentals", { kind: "home", type: "Castle", rent: 14000 })).status, 400);
  const l = (await o.post("/api/owner/rentals", { kind: "home", type: "2BHK", rent: 14000, deposit: 50000, size: 1100, furnishing: "semi", tenant: "family", amenities: ["Wi-Fi", "Parking", "Moat"] })).data;
  assert.equal(l.status, "draft");
  assert.deepEqual(l.amenities, ["Wi-Fi", "Parking"]);
  // publish needs a photo
  assert.equal((await o.post(`/api/owner/rentals/${l.id}/publish`, { days: 15 })).status, 409);
  // photo limits: size and type are checked before upload
  assert.equal((await o.post(`/api/owner/rentals/${l.id}/media`, { kind: "photo", type: "image/jpeg", bytes: 2_000_000 })).status, 400);
  assert.equal((await o.post(`/api/owner/rentals/${l.id}/media`, { kind: "video", type: "video/mp4", bytes: 30_000_000 })).status, 400);
  const up = (await o.post(`/api/owner/rentals/${l.id}/media`, { kind: "photo", type: "image/jpeg", bytes: 120 })).data;
  assert.equal(up.uploadUrl, null); // no R2 in tests: the photo goes through the server
  const px = "data:image/jpeg;base64," + Buffer.from("fake-jpeg").toString("base64");
  const med = (await o.post(`/api/owner/rentals/${l.id}/media/${up.mediaId}/data`, { data: px })).data;
  assert.equal(med.photos.length, 1);
  // without free mode and without payment keys: publishing asks to pay
  await a.post("/api/admin/settings", { freeMode: false });
  const pay = (await o.post(`/api/owner/rentals/${l.id}/publish`, { days: 30 })).data;
  assert.deepEqual([pay.live, pay.pay.price, pay.pay.days], [false, 499, 30]);
  // free launch mode: live at once, Day 1 = today
  await a.post("/api/admin/settings", { freeMode: true });
  assert.equal((await o.post(`/api/owner/rentals/${l.id}/publish`, { days: 7 })).status, 400);
  const pub = (await o.post(`/api/owner/rentals/${l.id}/publish`, { days: 15 })).data;
  assert.equal(pub.live, true);
  assert.ok(pub.listing.endsAt > Date.now() + 13 * 86400000 && pub.listing.endsAt < Date.now() + 16 * 86400000);
  // customers near the owner see it (homes, not workspaces)
  const cust = client("customer");
  const near = (await cust.get(`/api/rentals?lat=${biz.lat}&lng=${biz.lng}&kind=home`)).data;
  assert.ok(near.some((x) => x.id === l.id && x.cover));
  assert.equal((await cust.get(`/api/rentals?lat=${biz.lat}&lng=${biz.lng}&kind=work`)).data.some((x) => x.id === l.id), false);
  assert.equal((await cust.get(`/api/rentals/${l.id}`)).data.photos.length, 1);
  assert.equal((await cust.post(`/api/rentals/${l.id}/contact`)).status, 401);
  // rented out: hidden at once; reopen within 7 days
  const closed = (await o.post(`/api/owner/rentals/${l.id}/close`)).data;
  assert.deepEqual([closed.status, closed.closedReason], ["closed", "rented"]);
  assert.equal((await cust.get(`/api/rentals?lat=${biz.lat}&lng=${biz.lng}&kind=home`)).data.some((x) => x.id === l.id), false);
  assert.equal((await o.post(`/api/owner/rentals/${l.id}/reopen`)).data.status, "live");
  const mine = (await o.get("/api/owner/rentals")).data;
  assert.ok(mine.some((x) => x.id === l.id && x.views >= 1));
  await o.post(`/api/owner/rentals/${l.id}/remove`);
  await a.post("/api/admin/settings", { freeMode: false });
  await a.post(`/api/admin/businesses/${id}/category`, { category: biz.category, reason: "back for the next tests" });
});

test("support desk: ticket numbers, photos, area in-charges see only their area, solved / resolved on call", async () => {
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  const p = client("partner"); await p.login("owner@test.lastpick.in");
  const biz = (await p.get("/api/business")).data;
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const t = (await p.post("/api/support", { topic: "Payment or plan", message: "Paid but plan not showing", photos: [png] })).data;
  assert.match(t.number, /^LP-\d+$/);
  const c = client("customer"); await c.post("/api/auth/login", { email: "freecust@test.lastpick.in", password: "longpassword" }).then((r) => { c.token = r.data.token; });
  const ct = (await c.post("/api/support", { topic: "Shop not answering calls", message: "Nobody picks up", place: { state: "Far State", city: "Elsewhere", pincode: "999999" } })).data;
  // an in-charge for the partner's state only
  // super admin creates a separate Support Desk account with a password
  assert.equal((await a.post("/api/desk/incharges", { name: "Ravi", email: "owner@test.lastpick.in", password: "deskpass123", states: [biz.state] })).status, 409, "app e-mails can't be reused");
  assert.equal((await a.post("/api/desk/incharges", { name: "Ravi", email: "ravi.desk@test.lastpick.in", password: "short", states: [biz.state] })).status, 400);
  const made = await a.post("/api/desk/incharges", { name: "Ravi", email: "ravi.desk@test.lastpick.in", password: "deskpass123", states: [biz.state] });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  assert.equal((await client("customer").post("/api/auth/login", { email: "ravi.desk@test.lastpick.in", password: "deskpass123" })).status, 403, "desk accounts can't use the apps");
  const d = client("admin");
  let li = await d.post("/api/auth/login", { email: "ravi.desk@test.lastpick.in", password: "deskpass123" }); d.token = li.data.token;
  assert.equal((await d.get("/api/desk/me")).data.role, "support");
  assert.equal((await d.get("/api/admin/stats")).status, 403, "in-charges can't open the admin panel");
  const list = (await d.get("/api/desk/tickets?view=open")).data;
  assert.ok(list.tickets.some((x) => x.id === t.id));
  assert.ok(!list.tickets.some((x) => x.id === ct.id), "other areas are hidden");
  assert.equal((await d.get(`/api/desk/tickets/${ct.id}`)).status, 404);
  const full = (await d.get(`/api/desk/tickets/${t.id}`)).data;
  assert.equal(full.messages[0].photos.length, 1);
  assert.equal((await d.post(`/api/desk/tickets/${t.id}/reply`, { message: "We're checking with the bank." })).status, 200);
  assert.equal((await p.get(`/api/support/${t.id}`)).data.status, "answered");
  // resolved on a call needs a note
  assert.equal((await d.post(`/api/desk/tickets/${t.id}/resolve`, { call: true })).status, 400);
  assert.equal((await d.post(`/api/desk/tickets/${t.id}/resolve`, { call: true, note: "Called, plan fixed" })).status, 200);
  const done = (await p.get(`/api/support/${t.id}`)).data;
  assert.equal(done.status, "closed"); assert.equal(done.resolvedBy, "call");
  // the customer says solved; super admin sees all and the in-charge workload
  const rs = await c.post(`/api/support/${ct.id}/resolve`); assert.equal(rs.data?.resolved, true, JSON.stringify([ct, rs]));
  assert.equal((await a.get(`/api/desk/tickets/${ct.id}`)).data.resolvedBy, "customer");
  const ics = (await a.get("/api/desk/incharges")).data;
  assert.ok(ics.some((x) => x.email === "ravi.desk@test.lastpick.in"), JSON.stringify(ics));
  assert.equal((await d.get("/api/desk/incharges")).status, 403);
  assert.equal((await d.post("/api/desk/incharges", { name: "X", email: "x2@test.lastpick.in", password: "deskpass123", states: [biz.state] })).status, 403, "in-charges can't add in-charges");
  // reset password, then remove
  assert.equal((await a.post(`/api/desk/incharges/${made.data.id}/password`, { password: "newdesk1234" })).status, 200);
  assert.equal((await d.get("/api/desk/me")).status, 401, "old login ends after a password change");
  li = await d.post("/api/auth/login", { email: "ravi.desk@test.lastpick.in", password: "newdesk1234" }); assert.equal(li.status, 200);
  assert.equal((await a.post(`/api/desk/incharges/${made.data.id}/remove`)).status, 200);
  assert.equal((await d.post("/api/auth/login", { email: "ravi.desk@test.lastpick.in", password: "newdesk1234" })).status, 400);
});
