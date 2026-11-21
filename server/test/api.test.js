// End-to-end API test. Needs an EMPTY test database:
//   DATABASE_URL=postgres://postgres@localhost/lastpick_test npm test
// It wipes that database, starts the servers and walks through the main flows.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB = process.env.DATABASE_URL;
if (!DB || !/test/.test(DB)) throw new Error("Set DATABASE_URL to a database whose name contains 'test' (it will be wiped)");
const PASSWORD = "TestPass1234";
const procs = [];
const PORTS = { all: 18080, customer: 18081, partner: 18082, admin: 18083, night: 18084 };

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
  const p = spawn(cmd, args, { cwd: root, env: { ...process.env, SERVICE: service === "night" ? "customer" : service, PORT: String(PORTS[service]), LOG_LEVEL: "error", SIGNUP: "open", IP_LIMIT_MULTIPLIER: "20", RUN_WORKER: service === "night" ? "0" : "1", ...hours }, stdio: ["ignore", "inherit", "inherit"] });
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
  await Promise.all(Object.keys(PORTS).map(startServer));
});
after(() => procs.forEach((p) => p.kill("SIGTERM")));

const tonightIST = () => Math.floor((Date.now() + 19800000) / 86400000) * 86400000 - 19800000 + 86400000 - 1000;
const soon = (min) => Math.min(Date.now() + min * 60000, tonightIST());

test("one account per mobile number", async () => {
  const c = client("customer");
  const a = await c.post("/api/auth/signup", { email: "phone1@test.lastpick.in", password: "longpassword", name: "Phone One", phone: "9811122233", consent: { adult: true, items: ["name"] } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const b = await client("customer").post("/api/auth/signup", { email: "phone2@test.lastpick.in", password: "longpassword", name: "Phone Two", phone: "+91 98111 22233", consent: { adult: true, items: ["name"] } });
  assert.equal(b.status, 409);
  assert.match(b.data.error, /already registered/);
});

test("e-mail codes: refused cleanly while e-mail isn't set up", async () => {
  const r = await client("customer").post("/api/auth/otp/send", { email: "someone@test.lastpick.in" });
  assert.equal(r.status, 409);
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
  const s = await client("customer").post("/api/auth/signup", { email: "new@test.lastpick.in", password: "longpassword", name: "New Person", phone: "9876543210", consent: { adult: true, items: ["name"] } });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal((await client("admin").post("/api/auth/signup", { email: "x@test.lastpick.in", password: "longpassword", name: "X" })).status, 403);
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
  assert.equal((await c.post("/api/consent", { kind: "user", version: "2026-11-20", adult: true, items: ["account"] })).status, 200);
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

test("own category only, everything ends the same day, local job openings", async () => {
  const p = client("partner");
  await p.login("owner@test.lastpick.in");
  // the daily limit was used earlier: lift it for this test by ageing today's posts
  const { Pool } = process.env.LP_PG_SHIM ? await import("./pg-shim.js") : (await import("pg")).default;
  const pool = new Pool({ connectionString: DB });
  await pool.query("UPDATE offers SET created_at = now() - interval '2 days'");
  await pool.end();
  // every business can post a job opening at its shop: pay instead of a discount, up to 7 days, only in the local area
  const job = await p.post("/api/owner/offers", { title: "Shop helper needed, ₹12,000/month", category: "jobs", origPrice: 0, price: 12000, endsAt: soon(30) });
  assert.equal(job.status, 200, JSON.stringify(job.data));
  const cj = client("customer");
  assert.ok((await cj.get("/api/offers?lat=12.97&lng=77.60&radius=5")).data.some((o) => o.id === job.data.id), "near: shown");
  assert.ok((await cj.get("/api/offers?pincode=560001")).data.some((o) => o.id === job.data.id), "same pincode: shown");
  assert.ok(!(await cj.get("/api/offers?lat=13.10&lng=77.62&radius=30")).data.some((o) => o.id === job.data.id), "15 km away: hidden");
  assert.equal((await p.post("/api/owner/offers", { title: "Helper", category: "jobs", price: 500, endsAt: Date.now() + 2 * 86400000 })).status, 400, "nothing runs past today");
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

test("working hours: after 11 PM only hotels and travel", async () => {
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
    assert.ok(runs24x7("stay") && runs24x7("combo", ["food", "pickup"]) && !runs24x7("combo", ["food", "ironing"]) && !runs24x7("food"));
  }
  const cfg = await client("customer").get("/api/config");
  assert.deepEqual(cfg.data.alwaysOpen, ["stay", "travel"]);
  assert.equal(cfg.data.night, false); // test servers run with OPEN_HOUR=0, CLOSE_HOUR=24
  // the night server: hotels and travel still listed, the food offers hidden, and their numbers can't be revealed
  const n = client("night");
  const feed = (await n.get("/api/offers?lat=12.97&lng=77.60&radius=5")).data;
  assert.ok(feed.length > 0 && feed.every((o) => ["stay", "travel"].includes(o.category)), JSON.stringify(feed.map((o) => o.category)));
  assert.equal((await n.get("/api/config")).data.night, true);
  await n.login("customer@test.lastpick.in");
  const day = (await client("customer").get("/api/offers?lat=12.97&lng=77.60&radius=5")).data.find((o) => o.category === "food");
  if (day) {
    const r = await n.post(`/api/offers/${day.id}/reveal`);
    assert.equal(r.data.code, "closed_for_night");
  }
});

test("combos switch, automatic % in the title, 24-hour hotel offers", async () => {
  const { Pool } = process.env.LP_PG_SHIM ? await import("./pg-shim.js") : (await import("pg")).default;
  const pool = new Pool({ connectionString: DB });
  await pool.query("UPDATE offers SET created_at = now() - interval '2 days'"); // lift today's post limit
  await pool.end();
  const p = client("partner"); await p.login("owner@test.lastpick.in");
  const a = client("admin"); await a.login("admin@test.lastpick.in");
  const combo = { title: "Room + dinner + pickup, 30% off", category: "combo", comboItems: ["stay", "food", "pickup"], origPrice: 4000, price: 2800, endsAt: soon(60) };
  // off by default: partners can't post combos and customers don't see them
  assert.equal((await client("customer").get("/api/config")).data.combos, false);
  assert.equal((await p.post("/api/owner/offers", combo)).status, 403);
  assert.equal((await a.post("/api/admin/settings", { combos: true })).data.combos, true);
  assert.equal((await client("customer").get("/api/config")).data.combos, true);
  assert.equal((await p.post("/api/owner/offers", { ...combo, comboItems: ["food"] })).status, 400, "a combo needs 2 or more things");
  const made = await p.post("/api/owner/offers", combo);
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const seen = (await client("customer").get("/api/offers?lat=12.97&lng=77.64&radius=5")).data.find((o) => o.id === made.data.id);
  assert.deepEqual(seen.comboItems, ["stay", "food", "pickup"]);
  // switched off again: hidden
  await a.post("/api/admin/settings", { combos: false });
  assert.ok(!(await client("customer").get("/api/offers?lat=12.97&lng=77.64&radius=5")).data.some((o) => o.id === made.data.id));
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
