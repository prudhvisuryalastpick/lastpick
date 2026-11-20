// Admin panel API. "admin" (super admin) sees all of India. A "moderator" (area agent) sees only their area:
// the states in users.regions, narrowed to users.area_cities and/or users.area_pincodes when those are set.
import { needUser } from "../auth.js";
import { clearCache } from "../cache.js";
import { many, one, q, rmany, rone } from "../db.js";
import { freeMode, setFreeMode, subActive } from "../plans.js";
import { audit } from "../shared.js";
import { platformImpact } from "./insights.js";
import { planPrice } from "./revenue.js";
import { recomputeRating } from "./reviews.js";
import { DAY, PLANS, STATUSES, TRIAL_DAYS, bad, cityKey, denied, maskEmail, maskPhone, ms, needUuid, normEmail, notFound, precondition, str } from "../util.js";

function staff(ctx, { superOnly = false } = {}) {
  const u = needUser(ctx);
  if (u.role === "admin") return { id: u.id, role: "admin", regions: null, canSee: () => true };
  if (u.role === "moderator" && !superOnly) {
    const regions = u.regions || [], cities = u.area_cities || [], pins = u.area_pincodes || [];
    // place = { state, city, pincode }; a missing city or pincode (e.g. a city total) isn't used to narrow
    const canSee = (place) => {
      const p = typeof place === "string" ? { state: place } : place || {};
      if (!regions.includes(p.state)) return false;
      if (cities.length && p.city != null && !cities.includes(cityKey(p.city))) return false;
      if (pins.length && p.pincode != null && !pins.includes(String(p.pincode))) return false;
      return true;
    };
    return { id: u.id, role: "moderator", regions, cities, pincodes: pins, canSee };
  }
  throw denied(superOnly ? "Super admins only" : "Admins only");
}
const superAdmin = (ctx) => staff(ctx, { superOnly: true });
const ACTIVE_SUB = "s.status IN ('active', 'cancelled') AND s.current_period_end > now()";

export function adminRoutes(r) {
  r.get("/api/admin/stats", async (ctx) => {
    const me = staff(ctx);
    const free = await freeMode();
    const t = await rone(`SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM businesses WHERE status = 'verified')::int AS verified,
      (SELECT count(*) FROM businesses WHERE status = 'pending')::int AS pending,
      (SELECT count(*) FROM businesses WHERE status = 'suspended')::int AS suspended,
      (SELECT count(*) FROM subscriptions s WHERE plan = 'customer' AND ${ACTIVE_SUB})::int AS customers,
      (SELECT count(*) FROM subscriptions s WHERE plan = 'owner' AND ${ACTIVE_SUB})::int AS owners,
      (SELECT count(*) FROM leads WHERE created_at > now() - interval '30 days')::int AS leads30,
      (SELECT count(*) FROM reports WHERE status = 'open')::int AS open_reports,
      (SELECT count(*) FROM offer_archive)::int AS archived,
      (SELECT count(*) FROM grievances WHERE status IN ('open', 'acknowledged'))::int AS open_grievances,
      (SELECT count(*) FROM reviews WHERE status = 'published')::int AS reviews`);
    const cities = (await rmany(
      `SELECT b.city_key AS key, max(b.city) AS name, max(b.state) AS state,
              count(DISTINCT b.id) FILTER (WHERE b.status = 'verified')::int AS verified,
              count(o.id) FILTER (WHERE o.status = 'live' AND o.ends_at > now() AND b.status = 'verified')::int AS live
       FROM businesses b LEFT JOIN offers o ON o.owner_id = b.id WHERE b.city_key <> '' GROUP BY b.city_key ORDER BY live DESC LIMIT 300`))
      .map((c) => ({ key: c.key, name: c.name, state: c.state, liveOffers: c.live, verifiedBusinesses: c.verified }))
      .filter((c) => me.canSee({ state: c.state, city: c.name }));
    const impact = await platformImpact();
    const support = await rone("SELECT count(*)::int AS n FROM support_tickets WHERE status = 'open'");
    return {
      role: me.role, regions: me.regions, areaCities: me.cities || [], areaPincodes: me.pincodes || [], freeMode: free, impact, openSupport: support.n,
      totals: {
        users: t.users, verified: t.verified, pending: t.pending, suspended: t.suspended, customers: t.customers, owners: t.owners,
        leads30: t.leads30, openReports: t.open_reports, archived: t.archived, reviews: t.reviews,
        liveOffers: cities.reduce((n, c) => n + c.liveOffers, 0), openGrievances: me.role === "admin" ? t.open_grievances : null,
      },
      cities,
    };
  });

  r.get("/api/admin/users", async (ctx) => {
    superAdmin(ctx);
    const s = str(ctx.query.q, 80);
    let rows;
    const sel = `SELECT u.*, b.name AS b_name, b.city AS b_city, b.state AS b_state, b.status AS b_status,
                 sc.status AS c_status, sc.current_period_end AS c_end, so.status AS o_status, so.current_period_end AS o_end
                 FROM users u LEFT JOIN businesses b ON b.id = u.id
                 LEFT JOIN subscriptions sc ON sc.user_id = u.id AND sc.plan = 'customer'
                 LEFT JOIN subscriptions so ON so.user_id = u.id AND so.plan = 'owner'`;
    if (!s) rows = await many(`${sel} ORDER BY u.created_at DESC LIMIT 50`);
    else if (s.includes("@")) rows = await many(`${sel} WHERE lower(u.email) = $1`, [normEmail(s)]);
    else if (/\d{6,}/.test(s.replace(/\D/g, ""))) rows = await many(`${sel} WHERE u.phone = $1 LIMIT 20`, ["+91" + s.replace(/\D/g, "").slice(-10)]);
    else rows = await many(`${sel} WHERE lower(u.name) LIKE $1 ORDER BY u.name LIMIT 30`, [s.toLowerCase().replace(/[%_\\]/g, "\\$&") + "%"]);
    const sub = (status, end) => (status ? { status, until: ms(end), active: subActive({ status, current_period_end: end }) } : null);
    return rows.map((u) => ({
      // masked: the full phone and e-mail are shown only through /reveal, which is logged
      id: u.id, name: u.name, phone: maskPhone(u.phone), email: maskEmail(u.email), masked: true, role: u.role, regions: u.regions, areaCities: u.area_cities || [], areaPincodes: u.area_pincodes || [], createdAt: ms(u.created_at),
      customer: sub(u.c_status, u.c_end), owner: sub(u.o_status, u.o_end),
      business: u.b_name ? { name: u.b_name, city: u.b_city, state: u.b_state, status: u.b_status } : null,
    }));
  });

  // Show one user's full phone and e-mail. Every reveal is written to the audit log (who, whose, when).
  r.post("/api/admin/users/:id/reveal", async (ctx) => {
    const me = superAdmin(ctx);
    const id = needUuid(ctx.params.id, "user");
    const u = await one("SELECT phone, email FROM users WHERE id = $1", [id]);
    if (!u) throw notFound("User not found");
    audit("admin_reveal_user", me.id, { target: id });
    return { phone: u.phone || "", email: u.email || "" };
  });

  // Admins and area agents, with their areas (full e-mail: they are the LastPick team, not customers).
  r.get("/api/admin/team", async (ctx) => {
    superAdmin(ctx);
    const rows = await many("SELECT id, name, email, role, regions, area_cities, area_pincodes FROM users WHERE role IN ('admin', 'moderator') ORDER BY role, name");
    return rows.map((u) => ({ id: u.id, name: u.name, email: u.email || "", role: u.role, regions: u.regions || [], areaCities: u.area_cities || [], areaPincodes: u.area_pincodes || [] }));
  });

  // Set someone's role: "user", "moderator" (area agent: states, optionally narrowed to cities and/or pincodes) or "admin".
  r.post("/api/admin/role", async (ctx) => {
    const me = superAdmin(ctx);
    const role = ctx.body.role;
    if (!["user", "moderator", "admin"].includes(role)) throw bad("Unknown role");
    const target = await one("SELECT id FROM users WHERE lower(email) = $1", [normEmail(ctx.body.email)]);
    if (!target) throw notFound("No user with that email");
    if (target.id === me.id && role !== "admin") throw precondition("You can't remove your own admin access");
    const list = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []);
    const agent = role === "moderator";
    const regions = agent ? list(ctx.body.regions).map((x) => str(x, 60)).filter(Boolean) : [];
    const cities = agent ? [...new Set(list(ctx.body.cities).map((x) => cityKey(str(x, 60))).filter(Boolean))].slice(0, 50) : [];
    const pincodes = agent ? [...new Set(list(ctx.body.pincodes).map((x) => String(x).replace(/\D/g, "")))].filter((x) => /^[1-9]\d{5}$/.test(x)).slice(0, 200) : [];
    if (agent && !regions.length) throw bad("Pick at least one state for the area agent");
    // changing a role signs that person out everywhere, so the new role applies at once
    await q("UPDATE users SET role = $2, regions = $3, area_cities = $4, area_pincodes = $5, token_version = token_version + 1 WHERE id = $1",
      [target.id, role, regions, cities, pincodes]);
    audit("admin_role", me.id, { target: target.id, role, regions, cities, pincodes });
  });

  r.get("/api/admin/businesses", async (ctx) => {
    const me = staff(ctx);
    const status = STATUSES.includes(ctx.query.status) ? ctx.query.status : null;
    const state = str(ctx.query.state, 60) || null;
    const rows = await many(
      `SELECT b.*, c.phone, (SELECT count(*) FROM business_contacts c2 WHERE c2.phone = c.phone)::int AS same_phone,
              s.status AS s_status, s.current_period_end AS s_end
       FROM businesses b LEFT JOIN business_contacts c ON c.business_id = b.id
       LEFT JOIN subscriptions s ON s.user_id = b.id AND s.plan = 'owner'
       WHERE ($1::text IS NULL OR b.status = $1) AND ($2::text IS NULL OR b.state = $2)
       ORDER BY b.created_at DESC LIMIT 200`, [status, state]);
    return rows.filter((b) => me.canSee({ state: b.state, city: b.city, pincode: b.pincode })).map((b) => {
      const flags = [];
      if (b.report_count >= 2) flags.push(`Reported ${b.report_count}×`);
      if (b.same_phone > 1) flags.push("Same phone as another business");
      if (Date.now() - ms(b.created_at) < 2 * DAY) flags.push("New in last 48 h");
      if (b.categories_changed_at && Date.now() - ms(b.categories_changed_at) < 7 * DAY) flags.push("Changed categories this week");
      return {
        id: b.id, name: b.name, category: b.category, categories: b.categories?.length ? b.categories : [b.category],
        rating: b.rating_count ? { avg: Number(b.rating_avg), count: b.rating_count } : null, address: b.address, area: b.area, city: b.city, state: b.state,
        lat: b.lat, lng: b.lng, status: b.status, statusNote: b.status_note, reportCount: b.report_count, createdAt: ms(b.created_at), phone: maskPhone(b.phone), masked: true, flags,
        trialEndsAt: ms(b.trial_ends_at), planUntil: subActive({ status: b.s_status, current_period_end: b.s_end }) ? ms(b.s_end) : null,
      };
    });
  });

  // Full business phone (to call and verify). Area agents only for businesses in their area; logged.
  r.post("/api/admin/businesses/:id/reveal", async (ctx) => {
    const me = staff(ctx);
    const id = needUuid(ctx.params.id, "business");
    const b = await one("SELECT b.state, b.city, b.pincode, c.phone FROM businesses b LEFT JOIN business_contacts c ON c.business_id = b.id WHERE b.id = $1", [id]);
    if (!b) throw notFound("Business not found");
    if (!me.canSee(b)) throw denied("This business is outside your area");
    audit("admin_reveal_business", me.id, { target: id });
    return { phone: b.phone || "" };
  });

  r.post("/api/admin/businesses/:id/status", async (ctx) => {
    const me = staff(ctx);
    const id = needUuid(ctx.params.id, "business");
    const status = ctx.body.status;
    if (!STATUSES.includes(status)) throw bad("Unknown status");
    const b = await one("SELECT state, city, pincode FROM businesses WHERE id = $1", [id]);
    if (!b) throw notFound("Business not found");
    if (!me.canSee(b)) throw denied("This business is outside your area");
    // the business's free month starts the first time it is verified
    await q(`UPDATE businesses SET status = $2, status_note = $3, reviewed_by = $4, reviewed_at = now(),
             trial_ends_at = CASE WHEN $2 = 'verified' AND trial_ends_at IS NULL THEN now() + make_interval(days => $5) ELSE trial_ends_at END
             WHERE id = $1`, [id, status, str(ctx.body.note, 300), me.id, TRIAL_DAYS]);
    clearCache("feed:"); clearCache("cities:");
    audit("admin_business_status", me.id, { businessId: id, status });
  });

  // Super admins: unlock Business Pro (1/3/6/12 months), extend the free month, or end both.
  r.post("/api/admin/businesses/:id/plan", async (ctx) => {
    const me = superAdmin(ctx);
    const id = needUuid(ctx.params.id, "business");
    const b = await one("SELECT status, trial_ends_at FROM businesses WHERE id = $1", [id]);
    if (!b) throw notFound("Business not found");
    const action = ctx.body.action;
    if (action === "unlock") {
      const months = Number(ctx.body.months);
      if (![1, 3, 6, 12].includes(months)) throw bad("Pick 1, 3, 6 or 12 months");
      await grantPlan(id, "owner", months, me.id);
    } else if (action === "extendTrial") {
      const days = Number(ctx.body.days);
      if (!(days >= 1 && days <= 90)) throw bad("Extend by 1 to 90 days");
      await q("UPDATE businesses SET trial_ends_at = greatest(now(), coalesce(trial_ends_at, now())) + make_interval(days => $2) WHERE id = $1", [id, days]);
    } else if (action === "end") {
      await q("UPDATE subscriptions SET status = 'expired', current_period_end = now(), updated_at = now() WHERE user_id = $1 AND plan = 'owner'", [id]);
      await q("UPDATE businesses SET trial_ends_at = now() WHERE id = $1", [id]);
    } else throw bad("Unknown action");
    clearCache("feed:"); clearCache("cities:");
    audit("admin_business_plan", me.id, { businessId: id, action, months: ctx.body.months || null, days: ctx.body.days || null });
  });

  // Activate or extend a plan by e-mail (e.g. a payment collected outside the app). months = 0 ends it.
  r.post("/api/admin/plans", async (ctx) => {
    const me = superAdmin(ctx);
    const plan = ctx.body.plan;
    const months = Math.max(0, Math.min(24, Number(ctx.body.months) || 0));
    if (!PLANS.includes(plan)) throw bad("Unknown plan");
    const target = await one("SELECT id FROM users WHERE lower(email) = $1", [normEmail(ctx.body.email)]);
    if (!target) throw notFound("No user with that email");
    if (months > 0) await grantPlan(target.id, plan, months, me.id);
    else await q("UPDATE subscriptions SET status = 'expired', current_period_end = now(), updated_at = now() WHERE user_id = $1 AND plan = $2", [target.id, plan]);
    clearCache("feed:");
    audit("admin_plan", me.id, { target: target.id, plan, months });
  });

  r.get("/api/admin/reports", async (ctx) => {
    const me = staff(ctx);
    const rows = await many(
      `SELECT r.*, o.title AS o_title, o.status AS o_status, ob.name AS ob_name, ob.city AS ob_city, coalesce(ob.pincode, rb.pincode) AS pin,
              rv.name AS rv_name, rv.rating AS rv_rating, rv.text AS rv_text, rv.status AS rv_status, rb.name AS rb_name
       FROM reports r LEFT JOIN offers o ON o.id = r.offer_id LEFT JOIN businesses ob ON ob.id = o.owner_id
       LEFT JOIN reviews rv ON rv.id = r.review_id LEFT JOIN businesses rb ON rb.id = rv.business_id
       WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 200`);
    return rows.filter((x) => me.canSee({ state: x.state, city: x.city || null, pincode: x.pin })).map((x) => ({
      id: x.id, type: x.type, reason: x.reason, details: x.details, status: x.status, createdAt: ms(x.created_at), city: x.city, state: x.state,
      offer: x.o_title ? { id: x.offer_id, title: x.o_title, status: x.o_status, business: { name: x.ob_name || "", city: x.ob_city || "" } } : null,
      review: x.rv_name ? { id: x.review_id, name: x.rv_name, rating: x.rv_rating, text: x.rv_text, status: x.rv_status, businessName: x.rb_name || "" } : null,
    }));
  });

  r.post("/api/admin/reports/:id/resolve", async (ctx) => {
    const me = staff(ctx);
    const id = needUuid(ctx.params.id, "report");
    const status = ctx.body.status;
    if (!["dismissed", "actioned"].includes(status)) throw bad("Unknown status");
    const rep = await one(`SELECT r.*, (SELECT pincode FROM businesses WHERE id = coalesce(r.business_id, (SELECT owner_id FROM offers WHERE id = r.offer_id))) AS pin
                           FROM reports r WHERE r.id = $1`, [id]);
    if (!rep) throw notFound("Report not found");
    if (!me.canSee({ state: rep.state, city: rep.city || null, pincode: rep.pin })) throw denied("This report is outside your area");
    if (ctx.body.removeOffer && rep.offer_id) { await q("UPDATE offers SET status = 'removed' WHERE id = $1", [rep.offer_id]); clearCache("feed:"); }
    if (ctx.body.removeOffer && rep.review_id) {
      await q("UPDATE reviews SET status = 'hidden', hidden_by = $2 WHERE id = $1", [rep.review_id, me.id]);
      if (rep.business_id) await recomputeRating(rep.business_id);
    }
    await q("UPDATE reports SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1", [id, status, me.id]);
    audit("admin_report", me.id, { reportId: id, status, removed: !!ctx.body.removeOffer });
  });

  // Free launch mode on/off. Offer visibility is worked out live from plans, so nothing needs re-syncing.
  r.post("/api/admin/config", async (ctx) => {
    const me = superAdmin(ctx);
    const free = ctx.body.freeMode !== false;
    await setFreeMode(free);
    clearCache();
    const n = await one("SELECT count(*)::int AS n FROM businesses");
    audit("admin_config", me.id, { freeMode: free });
    return { freeMode: free, businesses: n.n };
  });

  r.get("/api/admin/grievances", async (ctx) => {
    superAdmin(ctx);
    const status = ["open", "acknowledged", "resolved", "rejected"].includes(ctx.query.status) ? ctx.query.status : "open";
    const rows = await many("SELECT * FROM grievances WHERE status = $1 ORDER BY created_at DESC LIMIT 200", [status]);
    return rows.map((g) => ({
      id: g.ticket, ticket: g.ticket, userId: g.user_id, email: g.email, type: g.type, subject: g.subject, details: g.details, status: g.status,
      reply: g.reply, createdAt: new Date(g.created_at).toISOString(), updatedAt: new Date(g.updated_at).toISOString(),
      ackDue: new Date(g.ack_due).toISOString(), resolveDue: new Date(g.resolve_due).toISOString(),
    }));
  });

  r.post("/api/admin/grievances/:ticket", async (ctx) => {
    const me = superAdmin(ctx);
    const status = ctx.body.status;
    if (!["acknowledged", "resolved", "rejected"].includes(status)) throw bad("Unknown status");
    const r2 = await q("UPDATE grievances SET status = $2, reply = $3, handled_by = $4, updated_at = now() WHERE ticket = $1",
      [str(ctx.params.ticket, 40), status, str(ctx.body.reply, 2000), me.id]);
    if (!r2.rowCount) throw notFound("Ticket not found");
    audit("admin_grievance", me.id, { ticket: ctx.params.ticket, status });
  });
}

async function grantPlan(userId, plan, months, by) {
  // record the sale (a plan activated by an admin = paid outside the app, e.g. UPI)
  await q("INSERT INTO plan_sales (user_id, plan, months, amount, source, created_by) VALUES ($1, $2, $3, $4, 'manual', $5)",
    [userId, plan, months, planPrice(plan, months), by]);
  await q(
    `INSERT INTO subscriptions (user_id, plan, provider, status, months, current_period_end, granted_by)
     VALUES ($1, $2, 'manual', 'active', $3, now() + make_interval(days => $3 * 30), $4)
     ON CONFLICT (user_id, plan) DO UPDATE SET provider = 'manual', status = 'active', months = $3, granted_by = $4, updated_at = now(),
       current_period_end = (CASE WHEN subscriptions.status IN ('active', 'cancelled') AND subscriptions.current_period_end > now()
                                  THEN subscriptions.current_period_end ELSE now() END) + make_interval(days => $3 * 30)`,
    [userId, plan, months, by]);
}
