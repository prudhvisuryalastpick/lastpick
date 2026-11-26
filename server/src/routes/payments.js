// Online payments with Razorpay: pay once for a pack of days. No auto-renewal; the person pays again to renew.
//   Customer app: Customer Pass ₹29 / 5 days, ₹59 / 15 days or ₹99 / 30 days.
//   Partner app (verified businesses only): Business Pro ₹119 / 5 days, ₹299 / 15 days or ₹499 / 30 days.
//   Any pack, any number of times (packs: PAY_PACKS in revenue.js).
// Flow: the app asks for an order (POST /api/payments/order) → opens Razorpay Checkout → sends Razorpay's reply to
// POST /api/payments/verify, which checks the signature and extends the plan. If the app never gets that reply (closed
// tab, lost network), POST /api/payments/check asks Razorpay whether the order was paid. Each order counts only once.
import { customersFree } from "../plans.js";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { needUser } from "../auth.js";
import { RAZORPAY_API_BASE, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, SERVICE } from "../config.js";
import { one, q, tx } from "../db.js";
import { log } from "../log.js";
import { notify, PLAN_NAMES } from "../notify.js";
import { limit } from "../ratelimit.js";
import { addPlanDays, audit, mapSub } from "../shared.js";
import { bad, denied, notFound, precondition, str } from "../util.js";
import { PAY_PACKS } from "./revenue.js";

export const paymentsOn = () => !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
const MONTHS = 1; // kept in the months column for reports; the real length is "days"

async function razorpay(method, path, body) {
  const r = await fetch(`${RAZORPAY_API_BASE}/v1${path}`, {
    method,
    headers: { Authorization: "Basic " + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64"), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    log.error("razorpay failed", { path, status: r.status, body: text.slice(0, 300) });
    throw precondition("The payment service is not answering. Please try again in a minute.");
  }
  return JSON.parse(text);
}

// The plan this app sells: customers buy the Customer Pass, partners buy Business Pro.
async function planFor(ctx) {
  const plan = ctx.body.plan;
  if (plan !== "customer" && plan !== "owner") throw bad("Unknown plan");
  if (plan === "customer" && (await customersFree())) throw bad("LastPick is free for customers. There's nothing to pay.");
  if (SERVICE !== "all" && plan !== (SERVICE === "partner" ? "owner" : "customer")) throw denied("This plan can't be bought in this app");
  return plan;
}

const sigOk = (orderId, paymentId, signature) => {
  const want = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  const got = String(signature || "");
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
};

// Marks the order paid and adds 30 days to the plan. Runs once per order, however often it is called.
async function fulfil(order, paymentId) {
  const done = await tx(async (c) => {
    const r = await c.query("UPDATE payments SET status = 'paid', payment_id = $2, paid_at = now() WHERE order_id = $1 AND status = 'created' RETURNING *", [order.order_id, paymentId]);
    if (!r.rows.length) return false; // already counted
    const p = r.rows[0];
    await c.query("INSERT INTO plan_sales (user_id, plan, months, amount, source) VALUES ($1, $2, $3, $4, 'gateway')", [p.user_id, p.plan, p.months, p.amount]);
    await addPlanDays((sql, params) => c.query(sql, params), { userId: p.user_id, plan: p.plan, days: p.days, provider: "razorpay", paymentId, months: p.months });
    return p;
  });
  if (done) {
    audit("plan_paid", done.user_id, { plan: done.plan, amount: done.amount, orderId: done.order_id, paymentId });
    const s = await one("SELECT current_period_end FROM subscriptions WHERE user_id = $1 AND plan = $2", [done.user_id, done.plan]);
    await notify(done.user_id, "plan_active", { planName: PLAN_NAMES[done.plan], months: done.months, days: done.days, amount: done.amount, until: s?.current_period_end });
  }
  return !!done;
}

async function mySub(uid, plan) {
  return mapSub(await one("SELECT * FROM subscriptions WHERE user_id = $1 AND plan = $2", [uid, plan])) || null;
}

async function myOrder(ctx) {
  const u = needUser(ctx);
  const orderId = str(ctx.body.orderId, 60);
  const order = orderId && (await one("SELECT * FROM payments WHERE order_id = $1", [orderId]));
  if (!order || order.user_id !== u.id) throw notFound("Payment not found");
  return { u, order };
}

export function paymentRoutes(r) {
  // 1. create a Razorpay order for a pack of days (body: plan, days; days defaults to 30)
  r.post("/api/payments/order", async (ctx) => {
    const u = needUser(ctx);
    if (!paymentsOn()) throw precondition("Online payment is not set up yet. Please contact support.");
    const plan = await planFor(ctx);
    if (plan === "owner") {
      const b = await one("SELECT status FROM businesses WHERE id = $1", [u.id]);
      if (!b) throw precondition("Register your business first.");
      if (b.status !== "verified") throw precondition("You can buy Business Pro once we verify your business.");
    }
    await limit(u.id, "payOrder", 20, 3600);
    const days = Number(ctx.body.days ?? 30);
    const pack = PAY_PACKS[plan].find((x) => x.days === days);
    if (!pack) throw bad(`Pick one of: ${PAY_PACKS[plan].map((x) => `${x.days} days`).join(", ")}`);
    // one pack at a time: while a plan runs, only a top-up with the same pack (5, 15 or 30 days) is open
    const run = await one("SELECT pack_days FROM subscriptions WHERE user_id = $1 AND plan = $2 AND status IN ('active', 'cancelled') AND current_period_end > now()", [u.id, plan]);
    if (run?.pack_days && run.pack_days !== days) throw precondition(`Your ${run.pack_days}-day plan is running. Top up with ${run.pack_days} more days, or pick another pack after it ends.`);
    const amount = pack.price;
    const ord = await razorpay("POST", "/orders", {
      amount: amount * 100, currency: "INR", receipt: `${plan}-${days}d-${Date.now()}`.slice(0, 40),
      notes: { user_id: u.id, plan, days: String(days), app: "lastpick" },
    });
    await q("INSERT INTO payments (user_id, plan, months, days, amount, order_id) VALUES ($1, $2, $3, $4, $5, $6)", [u.id, plan, MONTHS, days, amount, ord.id]);
    const me = await one("SELECT name, email, phone FROM users WHERE id = $1", [u.id]);
    return {
      keyId: RAZORPAY_KEY_ID, orderId: ord.id, amount: amount * 100, currency: "INR",
      name: "LastPick", description: `${PLAN_NAMES[plan]} · ${days} days`, days,
      prefill: { name: me?.name || "", email: me?.email || "", contact: me?.phone || "" },
    };
  });

  // 2. the app sends Razorpay's reply: check the signature, then add 30 days
  r.post("/api/payments/verify", async (ctx) => {
    const { u, order } = await myOrder(ctx);
    const paymentId = str(ctx.body.paymentId, 60);
    if (!paymentId || !sigOk(order.order_id, paymentId, ctx.body.signature)) {
      log.warn("payment bad signature", { userId: u.id, orderId: order.order_id });
      throw bad("We couldn't confirm this payment. If money was taken, it will be checked automatically; or contact support.");
    }
    await fulfil(order, paymentId);
    return { paid: true, subscription: await mySub(u.id, order.plan) };
  });

  // 3. no reply from the app (tab closed etc.): ask Razorpay whether the order was paid
  r.post("/api/payments/check", async (ctx) => {
    const { u, order } = await myOrder(ctx);
    if (order.status === "paid") return { paid: true, subscription: await mySub(u.id, order.plan) };
    const list = await razorpay("GET", `/orders/${encodeURIComponent(order.order_id)}/payments`);
    const ok = (list.items || []).find((p) => p.status === "captured" || p.status === "authorized");
    if (!ok) return { paid: false };
    await fulfil(order, ok.id);
    return { paid: true, subscription: await mySub(u.id, order.plan) };
  });
}
