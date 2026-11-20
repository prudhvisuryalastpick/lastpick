// Ways LastPick earns as a platform (besides Customer Pass and Business Pro, see plans.js):
//   Boosted offers    a partner pays to feature one offer at the top of customers' home screens (6/12/24 hours).
//   Sponsored banners the LastPick team sells the home-screen banner in a city to a business or brand.
//   Revenue page      the admin sees subscriptions, boosts and banners in one place.
// Payments are not live yet. In free-launch mode boosts switch on at once and are recorded as waived;
// otherwise a boost waits until an admin confirms the payment (e.g. a UPI transfer) and switches it on.
import { needUser } from "../auth.js";
import { clearCache } from "../cache.js";
import { many, one, q } from "../db.js";
import { freeMode } from "../plans.js";
import { limit } from "../ratelimit.js";
import { audit } from "../shared.js";
import { bad, cityKey, denied, ms, needUuid, notFound, precondition, str } from "../util.js";

// Boost prices in rupees, by hours. Keep in sync with BOOST_PRICES in web/src/lib/config.js.
export const BOOST_PRICES = { 6: 49, 12: 79, 24: 99 };
// Plan prices in rupees by months. Keep in sync with PLANS in web/src/lib/config.js.
export const PLAN_PRICES = {
  customer: { 1: 149, 3: 399, 6: 749, 12: 1399 },
  owner: { 1: 499, 3: 1349, 6: 2499, 12: 4499 },
};
// price of a plan for any number of months (longer plans cost less per month)
export const planPrice = (plan, months) => {
  const p = PLAN_PRICES[plan]; const m = Math.max(1, Number(months) || 1);
  if (p[m]) return p[m];
  return Math.floor(m / 12) * p[12] + (m % 12 ? planPrice(plan, m % 12) : 0); // e.g. 24 months = 2 × 12; 2 months = 2 × 1
};

const mapBoost = (b) => b && ({
  id: b.id, offerId: b.offer_id, ownerId: b.owner_id, hours: b.hours, price: b.price, status: b.status, paidBy: b.paid_by,
  startsAt: ms(b.starts_at), endsAt: ms(b.ends_at), note: b.note, createdAt: ms(b.created_at),
  live: b.status === "active" && !!b.ends_at && new Date(b.ends_at) > new Date(),
  offerTitle: b.offer_title, businessName: b.b_name, city: b.b_city,
});
const mapBanner = (b) => b && ({
  id: b.id, title: b.title, subtitle: b.subtitle, advertiser: b.advertiser, cityKey: b.city_key, offerId: b.offer_id,
  price: b.price, startsAt: ms(b.starts_at), endsAt: ms(b.ends_at), active: b.active, createdAt: ms(b.created_at),
  live: b.active && new Date(b.starts_at) <= new Date() && new Date(b.ends_at) > new Date(),
});
function needAdmin(ctx) {
  const u = needUser(ctx);
  if (u.role !== "admin") throw denied("Only super admins can manage revenue");
  return u;
}
const BOOST_ROWS = `SELECT x.*, o.title AS offer_title, b.name AS b_name, b.city AS b_city
  FROM offer_boosts x JOIN offers o ON o.id = x.offer_id JOIN businesses b ON b.id = x.owner_id`;

// ---------------------------------------------------------------- partner (business app)
export function boostPartnerRoutes(r) {
  r.get("/api/owner/boosts", async (ctx) => {
    const u = needUser(ctx);
    return (await many(`${BOOST_ROWS} WHERE x.owner_id = $1 ORDER BY x.created_at DESC LIMIT 50`, [u.id])).map(mapBoost);
  });

  r.post("/api/owner/offers/:id/boost", async (ctx) => {
    const u = needUser(ctx);
    needUuid(ctx.params.id, "offer");
    const hours = Number(ctx.body?.hours);
    const price = BOOST_PRICES[hours];
    if (!price) throw bad("Choose 6, 12 or 24 hours");
    const o = await one("SELECT id, owner_id, status, ends_at FROM offers WHERE id = $1", [ctx.params.id]);
    if (!o || o.owner_id !== u.id) throw notFound("Offer not found");
    if (o.status !== "live" || new Date(o.ends_at) <= new Date()) throw precondition("This offer has ended");
    const open = await one("SELECT 1 FROM offer_boosts WHERE offer_id = $1 AND (status = 'pending' OR (status = 'active' AND ends_at > now()))", [o.id]);
    if (open) throw precondition("This offer is already boosted (or waiting for payment confirmation)");
    await limit(u.id, "boost", 10, 86400);
    const free = await freeMode();
    const row = await one(
      `INSERT INTO offer_boosts (offer_id, owner_id, hours, price, status, paid_by, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, ${free ? "now()" : "NULL"}, ${free ? "LEAST(now() + make_interval(hours => $3::int), $7::timestamptz)" : "NULL"})
       RETURNING *`,
      [o.id, u.id, hours, price, free ? "active" : "pending", free ? "launch_free" : null, o.ends_at]);
    if (free) clearCache();
    audit("boost_requested", u.id, { boostId: row.id, offerId: o.id, hours, price, free });
    return mapBoost(row);
  });
}

// ---------------------------------------------------------------- customer app: sponsored banners
export function bannerRoutes(r) {
  r.get("/api/banners", async (ctx) => {
    const city = cityKey(ctx.query.city || "");
    const rows = await many(
      `SELECT * FROM banners WHERE active AND starts_at <= now() AND ends_at > now() AND (city_key IS NULL OR city_key = $1)
       ORDER BY created_at DESC LIMIT 5`, [city || null]);
    return rows.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, advertiser: b.advertiser, offerId: b.offer_id }));
  });
}

// ---------------------------------------------------------------- admin: boosts, banners, revenue
export function revenueAdminRoutes(r) {
  r.get("/api/admin/boosts", async (ctx) => {
    needAdmin(ctx);
    const status = ["pending", "active", "rejected"].includes(ctx.query.status) ? ctx.query.status : "pending";
    return (await many(`${BOOST_ROWS} WHERE x.status = $1 ORDER BY x.created_at DESC LIMIT 100`, [status])).map(mapBoost);
  });

  // approve = the partner has paid (e.g. UPI): switch the boost on now; reject = not paid / not allowed
  r.post("/api/admin/boosts/:id", async (ctx) => {
    const admin = needAdmin(ctx);
    needUuid(ctx.params.id, "boost");
    const action = ctx.body?.action;
    if (!["approve", "reject"].includes(action)) throw bad("action must be approve or reject");
    const b = await one("SELECT x.*, o.ends_at AS offer_ends, o.status AS offer_status FROM offer_boosts x JOIN offers o ON o.id = x.offer_id WHERE x.id = $1", [ctx.params.id]);
    if (!b) throw notFound("Boost not found");
    if (b.status !== "pending") throw precondition("This boost was already decided");
    const note = str(ctx.body?.note, 300);
    if (action === "approve") {
      if (b.offer_status !== "live" || new Date(b.offer_ends) <= new Date()) throw precondition("The offer has ended; reject this boost instead");
      await q(`UPDATE offer_boosts SET status = 'active', paid_by = 'manual', starts_at = now(),
               ends_at = LEAST(now() + make_interval(hours => hours), $2::timestamptz), decided_by = $3, note = $4 WHERE id = $1`,
        [b.id, b.offer_ends, admin.id, note]);
      clearCache();
    } else {
      await q("UPDATE offer_boosts SET status = 'rejected', decided_by = $2, note = $3 WHERE id = $1", [b.id, admin.id, note]);
    }
    audit(`boost_${action}d`, admin.id, { boostId: b.id, offerId: b.offer_id, price: b.price });
    return mapBoost(await one(`${BOOST_ROWS} WHERE x.id = $1`, [b.id]));
  });

  r.get("/api/admin/banners", async (ctx) => {
    needAdmin(ctx);
    return (await many("SELECT * FROM banners ORDER BY created_at DESC LIMIT 100")).map(mapBanner);
  });

  r.post("/api/admin/banners", async (ctx) => {
    const admin = needAdmin(ctx);
    const d = ctx.body || {};
    const title = str(d.title, 80), advertiser = str(d.advertiser, 80);
    if (title.length < 3) throw bad("Add a banner title");
    if (advertiser.length < 2) throw bad("Who is paying for this banner?");
    const days = Number(d.days);
    if (!(days >= 1 && days <= 90)) throw bad("A banner runs 1 to 90 days");
    const price = Math.round(Number(d.price) || 0);
    if (price < 0 || price > 1e7) throw bad("Check the price");
    let offerId = null;
    if (d.offerId) { needUuid(d.offerId, "offer"); if (!(await one("SELECT 1 FROM offers WHERE id = $1", [d.offerId]))) throw notFound("Offer not found"); offerId = d.offerId; }
    const row = await one(
      `INSERT INTO banners (title, subtitle, advertiser, city_key, offer_id, price, ends_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7::int), $8) RETURNING *`,
      [title, str(d.subtitle, 140), advertiser, d.city ? cityKey(d.city) : null, offerId, price, days, admin.id]);
    audit("banner_created", admin.id, { bannerId: row.id, price, days });
    return mapBanner(row);
  });

  r.post("/api/admin/banners/:id/stop", async (ctx) => {
    const admin = needAdmin(ctx);
    needUuid(ctx.params.id, "banner");
    const row = await one("UPDATE banners SET active = false WHERE id = $1 RETURNING *", [ctx.params.id]);
    if (!row) throw notFound("Banner not found");
    audit("banner_stopped", admin.id, { bannerId: row.id });
    return mapBanner(row);
  });

  // Earnings this month (India time), from real records: plan sales (plan_sales), paid boosts and sold banners.
  // Monthly recurring revenue (MRR) = each active paid plan's price ÷ its months.
  r.get("/api/admin/revenue", async (ctx) => {
    needAdmin(ctx);
    const month = "date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'";
    const active = await many(`SELECT plan, coalesce(months, 1) AS months, count(*)::int AS n FROM subscriptions
      WHERE status IN ('active', 'cancelled') AND current_period_end > now() AND provider NOT IN ('trial', 'launch') GROUP BY plan, coalesce(months, 1)`);
    const sales = await many(`SELECT plan, months, count(*)::int AS n, coalesce(sum(amount), 0)::int AS amount FROM plan_sales
      WHERE created_at >= ${month} GROUP BY plan, months`);
    const planSummary = (plan) => {
      const a = active.filter((x) => x.plan === plan), s = sales.filter((x) => x.plan === plan);
      return {
        active: a.reduce((t, x) => t + x.n, 0),
        mrr: Math.round(a.reduce((t, x) => t + x.n * planPrice(plan, x.months) / x.months, 0)),
        soldThisMonth: s.reduce((t, x) => t + x.amount, 0),
        soldCount: s.reduce((t, x) => t + x.n, 0),
        byMonths: Object.fromEntries([1, 3, 6, 12].map((m) => [m, a.filter((x) => Number(x.months) === m).reduce((t, x) => t + x.n, 0)])),
      };
    };
    const boosts = await one(`SELECT
        coalesce(sum(price) FILTER (WHERE paid_by IN ('manual', 'gateway') AND starts_at >= ${month}), 0)::int AS paid,
        count(*) FILTER (WHERE paid_by IN ('manual', 'gateway') AND starts_at >= ${month})::int AS paid_count,
        coalesce(sum(price) FILTER (WHERE paid_by = 'launch_free' AND created_at >= ${month}), 0)::int AS waived,
        count(*) FILTER (WHERE paid_by = 'launch_free' AND created_at >= ${month})::int AS waived_count,
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'active' AND ends_at > now())::int AS live
      FROM offer_boosts`);
    const banners = await one(`SELECT coalesce(sum(price) FILTER (WHERE created_at >= ${month}), 0)::int AS sold,
        count(*) FILTER (WHERE created_at >= ${month})::int AS sold_count,
        count(*) FILTER (WHERE active AND starts_at <= now() AND ends_at > now())::int AS live FROM banners`);
    const customerPass = planSummary("customer"), businessPro = planSummary("owner");
    return {
      freeMode: await freeMode(),
      subscriptions: { customerPass, businessPro, prices: PLAN_PRICES, mrr: customerPass.mrr + businessPro.mrr },
      boosts: { paid: boosts.paid, paidCount: boosts.paid_count, waived: boosts.waived, waivedCount: boosts.waived_count, pending: boosts.pending, live: boosts.live, prices: BOOST_PRICES },
      banners: { sold: banners.sold, soldCount: banners.sold_count, live: banners.live },
      totalThisMonth: customerPass.soldThisMonth + businessPro.soldThisMonth + boosts.paid + banners.sold,
    };
  });
}
