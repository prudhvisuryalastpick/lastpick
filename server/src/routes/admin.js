// Admin panel API. "admin" (super admin) sees all of India. A "moderator" (area agent) sees only their area:
// the states in users.regions, narrowed to users.area_cities and/or users.area_pincodes when those are set.
import { setSetting, singleDeviceOn } from "../settings.js";
import { needUser } from "../auth.js";
import { PLAN_NAMES, notify } from "../notify.js";
import { clearCache } from "../cache.js";
import { many, one, q, rmany, rone, tx } from "../db.js";
import { customerPassOn, freeMode, setFreeMode, subActive } from "../plans.js";
import { maintenanceSetting, setMaintenance } from "../maintenance.js";
import { addPlanDays, audit } from "../shared.js";
import { CATEGORY_PHOTO_IDS, R2_ON, deleteFile, fileUrl, newKey, saveFile, storageCheck } from "../storage.js";
import { getSetting } from "../settings.js";
import { platformImpact } from "./insights.js";
import { CATEGORY_IDS } from "./partner.js";
import { PAY_PACKS, planPrice } from "./revenue.js";
import { recomputeRating } from "./reviews.js";
import { DAY, PLANS, STATUSES, TRIAL_DAYS, bad, cityKey, denied, maskEmail, maskPhone, ms, needUuid, normEmail, notFound, precondition, startOfDayIST, str, isDataImage, indianPhone } from "../util.js";

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

// Area and category filter shared by the admin lists: ?state=&city=&pincode=&category=
// Returns a SQL condition on the businesses table (alias b) plus its parameters, numbered from `start`.
function bizFilter(query, start = 1) {
  const f = { state: str(query.state, 60) || null, city: str(query.city, 80) || null, pincode: (String(query.pincode || "").replace(/\D/g, "").slice(0, 6)) || null, category: str(query.category, 30) || null };
  const where = [], params = [];
  // each "?" in a condition is the same parameter
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll("?", "$" + (start + params.length - 1))); };
  if (f.state) add("b.state = ?", f.state);
  if (f.city) add("b.city_key = ?", cityKey(f.city));
  if (f.pincode) add("b.pincode = ?", f.pincode);
  if (f.category) add("(b.category = ? OR ? = ANY(b.categories))", f.category);
  return { sql: where.length ? where.join(" AND ") : "TRUE", params, f };
}

export function adminRoutes(r) {
  r.get("/api/admin/stats", async (ctx) => {
    const me = staff(ctx);
    const free = await freeMode();
    // partner-side numbers follow the area / category filter; users, support and complaints are for all of India
    const bf = bizFilter(ctx.query || {});
    const t = await rone(`WITH b AS (SELECT * FROM businesses b WHERE ${bf.sql}) SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM b)::int AS partners,
      (SELECT count(*) FROM b WHERE status = 'verified')::int AS verified,
      (SELECT count(*) FROM b WHERE status = 'pending')::int AS pending,
      (SELECT count(*) FROM b WHERE status = 'suspended')::int AS suspended,
      (SELECT count(*) FROM subscriptions s WHERE plan = 'customer' AND ${ACTIVE_SUB})::int AS customers,
      (SELECT count(*) FROM subscriptions s JOIN b ON b.id = s.user_id WHERE s.plan = 'owner' AND ${ACTIVE_SUB})::int AS owners,
      (SELECT count(*) FROM subscriptions s JOIN b ON b.id = s.user_id WHERE s.plan = 'owner' AND ${ACTIVE_SUB} AND s.current_period_end < now() + interval '3 days')::int AS owners_ending,
      (SELECT count(*) FROM users u WHERE u.role = 'user' AND NOT EXISTS (SELECT 1 FROM businesses x WHERE x.id = u.id))::int AS customers_registered,
      (SELECT count(*) FROM users u WHERE u.role = 'user' AND u.created_at >= $${bf.params.length + 1} AND NOT EXISTS (SELECT 1 FROM businesses x WHERE x.id = u.id))::int AS customers_today,
      (SELECT count(*) FROM leads l JOIN b ON b.id = l.owner_id WHERE l.created_at > now() - interval '30 days')::int AS leads30,
      (SELECT count(*) FROM reports r WHERE r.status = 'open' AND (r.business_id IS NULL OR r.business_id IN (SELECT id FROM b)))::int AS open_reports,
      (SELECT count(*) FROM offer_archive a JOIN b ON b.id = a.owner_id)::int AS archived,
      (SELECT count(*) FROM offers o JOIN b ON b.id = o.owner_id WHERE o.status = 'live' AND o.ends_at > now() AND b.status = 'verified')::int AS live,
      (SELECT count(*) FROM offers o JOIN b ON b.id = o.owner_id WHERE o.created_at >= $${bf.params.length + 1})::int AS posted_today,
      (SELECT count(*) FROM b WHERE created_at >= $${bf.params.length + 1})::int AS joined_today,
      (SELECT count(*) FROM grievances WHERE status IN ('open', 'acknowledged'))::int AS open_grievances,
      (SELECT count(*) FROM reviews WHERE status = 'published')::int AS reviews`, [...bf.params, new Date(startOfDayIST())]);

    const cities = (await rmany(
      `SELECT b.city_key AS key, max(b.city) AS name, max(b.state) AS state,
              count(DISTINCT b.id) FILTER (WHERE b.status = 'verified')::int AS verified,
              count(o.id) FILTER (WHERE o.status = 'live' AND o.ends_at > now() AND b.status = 'verified')::int AS live
              , count(DISTINCT b.id)::int AS partners, count(DISTINCT b.id) FILTER (WHERE b.status = 'pending')::int AS pending
       FROM businesses b LEFT JOIN offers o ON o.owner_id = b.id WHERE b.city_key <> '' AND ${bf.sql} GROUP BY b.city_key ORDER BY live DESC, partners DESC LIMIT 300`, bf.params))
      .map((c) => ({ key: c.key, name: c.name, state: c.state, liveOffers: c.live, verifiedBusinesses: c.verified, partners: c.partners, pending: c.pending }))
      .filter((c) => me.canSee({ state: c.state, city: c.name }));
    const impact = await platformImpact();
    const support = await rone("SELECT count(*)::int AS n FROM support_tickets WHERE status = 'open'");
    return {
      role: me.role, regions: me.regions, areaCities: me.cities || [], areaPincodes: me.pincodes || [], freeMode: free, impact, openSupport: support.n, filter: bf.f,
      totals: {
        users: t.users, partners: t.partners, ownersEnding: t.owners_ending, customersRegistered: t.customers_registered, customersToday: t.customers_today, verified: t.verified, pending: t.pending, suspended: t.suspended, customers: t.customers, owners: t.owners,
        leads30: t.leads30, openReports: t.open_reports, archived: t.archived, reviews: t.reviews, postedToday: t.posted_today, joinedToday: t.joined_today,
        liveOffers: me.role === "admin" ? t.live : cities.reduce((n, c) => n + c.liveOffers, 0), openGrievances: me.role === "admin" ? t.open_grievances : null,
      },
      cities,
    };
  });

  // Users, split into customers (no business) and partners (have a business). ?kind=customers|partners&q=
  const userSel = `SELECT u.*, EXISTS (SELECT 1 FROM user_photos p WHERE p.user_id = u.id) AS has_photo, b.name AS b_name, b.category AS b_category, b.area AS b_area, b.city AS b_city, b.state AS b_state,
                   b.pincode AS b_pincode, b.status AS b_status, b.trial_ends_at AS b_trial,
                   sc.status AS c_status, sc.current_period_end AS c_end, so.status AS o_status, so.current_period_end AS o_end
                   FROM users u LEFT JOIN businesses b ON b.id = u.id
                   LEFT JOIN subscriptions sc ON sc.user_id = u.id AND sc.plan = 'customer'
                   LEFT JOIN subscriptions so ON so.user_id = u.id AND so.plan = 'owner'`;
  const kindWhere = (kind) => (kind === "partners" ? "b.id IS NOT NULL" : kind === "customers" ? "b.id IS NULL AND u.role = 'user'" : "TRUE");
  const findUsers = async (kind, s, limit) => {
    const k = kindWhere(kind);
    if (!s) return many(`${userSel} WHERE ${k} ORDER BY u.created_at DESC LIMIT ${limit}`);
    if (s.includes("@")) return many(`${userSel} WHERE ${k} AND lower(u.email) = $1`, [normEmail(s)]);
    if (/\d{6,}/.test(s.replace(/\D/g, ""))) return many(`${userSel} WHERE ${k} AND u.phone = $1 LIMIT 20`, ["+91" + s.replace(/\D/g, "").slice(-10)]);
    return many(`${userSel} WHERE ${k} AND (lower(u.name) LIKE $1 OR lower(b.name) LIKE $1) ORDER BY u.name LIMIT 50`, ["%" + s.toLowerCase().replace(/[%_\\]/g, "\\$&") + "%"]);
  };
  const sub = (status, end) => (status ? { status, until: ms(end), active: subActive({ status, current_period_end: end }) } : null);
  const userRow = (u, full = false) => ({
    // masked: the full phone and e-mail are shown only through /reveal or the CSV export, both logged
    id: u.id, name: u.name, phone: full ? u.phone : maskPhone(u.phone), email: full ? u.email : maskEmail(u.email), masked: !full, role: u.role, regions: u.regions || [], areaCities: u.area_cities || [], areaPincodes: u.area_pincodes || [],
    phoneVerified: !!u.phone_verified_at, createdAt: ms(u.created_at), lastLoginAt: ms(u.last_login_at), lastLoginDevice: u.last_login_device || "",
    consentVersion: u.consent?.version || null, consentAt: u.consent?.at || null, partnerConsentVersion: u.partner_consent?.version || null, partnerConsentAt: u.partner_consent?.at || null,
    customer: sub(u.c_status, u.c_end), owner: sub(u.o_status, u.o_end),
    business: u.b_name ? { name: u.b_name, category: u.b_category, area: u.b_area, city: u.b_city, state: u.b_state, pincode: u.b_pincode, status: u.b_status, hasPhoto: !!u.has_photo, trialEndsAt: ms(u.b_trial) } : null,
  });
  r.get("/api/admin/users", async (ctx) => {
    superAdmin(ctx);
    const rows = await findUsers(ctx.query.kind, str(ctx.query.q, 80), 500);
    return rows.map((u) => userRow(u));
  });
  // Full list with contact details for the CSV download. Logged (who downloaded which list, and when).
  r.get("/api/admin/users/export", async (ctx) => {
    const me = superAdmin(ctx);
    const kind = ctx.query.kind === "partners" ? "partners" : "customers";
    const rows = await many(`${userSel} WHERE ${kindWhere(kind)} ORDER BY u.created_at DESC LIMIT 20000`);
    audit("admin_export_users", me.id, { kind, count: rows.length });
    return rows.map((u) => userRow(u, true));
  });

  // Checks file storage end to end: save a tiny file, read it back through its link, delete it.
  r.get("/api/admin/storage-check", async (ctx) => { superAdmin(ctx); return storageCheck(); });

  // A user's Terms acceptances with the exact text they accepted (for disputes). Logged.
  // the partner's shop photo (admins only; every view is logged)
  r.get("/api/admin/users/:id/photo", async (ctx) => {
    const me = superAdmin(ctx);
    const id = needUuid(ctx.params.id, "user");
    const row = await one("SELECT data FROM user_photos WHERE user_id = $1", [id]);
    audit("admin_view_photo", me.id, { target: id });
    return { photo: await fileUrl(row?.data, 600) };
  });

  r.get("/api/admin/users/:id/consents", async (ctx) => {
    const me = superAdmin(ctx);
    const id = needUuid(ctx.params.id, "user");
    const u = await one("SELECT id, name, email, phone, created_at FROM users WHERE id = $1", [id]);
    if (!u) throw notFound("User not found");
    const rows = await many(`SELECT l.kind, l.version, l.items, l.user_agent, l.ip, l.read_full, l.at, l.doc_hash, d.text
                             FROM consent_log l LEFT JOIN consent_documents d ON d.hash = l.doc_hash
                             WHERE l.user_id = $1 ORDER BY l.at DESC LIMIT 50`, [id]);
    audit("admin_view_consents", me.id, { target: id });
    return {
      user: { id: u.id, name: u.name, email: u.email || "", phone: u.phone || "", createdAt: ms(u.created_at) },
      consents: rows.map((r) => ({ kind: r.kind, version: r.version, items: r.items || [], device: r.user_agent, ip: r.ip, readFull: r.read_full, at: ms(r.at), hash: r.doc_hash, text: r.text || null })),
    };
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
    const rows = await many("SELECT id, name, email, role, regions, area_cities, area_pincodes FROM users WHERE role IN ('admin', 'moderator', 'support') ORDER BY role, name");
    return rows.map((u) => ({ id: u.id, name: u.name, email: u.email || "", role: u.role, regions: u.regions || [], areaCities: u.area_cities || [], areaPincodes: u.area_pincodes || [] }));
  });

  // Set someone's role: "user", "moderator" (area agent: states, optionally narrowed to cities and/or pincodes) or "admin".
  r.post("/api/admin/role", async (ctx) => {
    const me = superAdmin(ctx);
    const role = ctx.body.role;
    if (!["user", "moderator", "admin"].includes(role)) throw bad("Unknown role"); // Support Desk in-charges are separate accounts: /api/desk/incharges
    const existing = ctx.body.userId ? null : await one("SELECT role FROM users WHERE lower(email) = $1", [normEmail(ctx.body.email)]);
    if (existing?.role === "support") throw precondition("This is a Support Desk account. Manage it in the Support Desk → Area in-charges");
    const target = ctx.body.userId
      ? await one("SELECT id FROM users WHERE id = $1", [needUuid(ctx.body.userId, "user")])
      : await one("SELECT id FROM users WHERE lower(email) = $1", [normEmail(ctx.body.email)]);
    if (!target) throw notFound("No such user");
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

  // Registrations by pincode (partners), optionally for one category. Customers don't give a pincode, so only totals.
  // Every state, city and pincode that has a partner: fills the admin's area filter (moderators: their area only)
  r.get("/api/admin/areas", async (ctx) => {
    const me = staff(ctx);
    const rows = await many(`SELECT b.state, max(b.city) AS city, b.city_key, b.pincode, max(b.area) AS area, count(*)::int AS n
                             FROM businesses b WHERE b.state <> '' GROUP BY b.state, b.city_key, b.pincode ORDER BY b.state, 2, b.pincode LIMIT 5000`);
    const seen = rows.filter((x) => me.canSee({ state: x.state, city: x.city, pincode: x.pincode || null }));
    const states = [...new Set(seen.map((x) => x.state))];
    const cities = [...new Map(seen.filter((x) => x.city_key).map((x) => [x.state + "|" + x.city_key, { state: x.state, city: x.city }])).values()];
    const pincodes = seen.filter((x) => x.pincode).map((x) => ({ pincode: x.pincode, area: x.area, city: x.city, state: x.state, partners: x.n }));
    return { states, cities, pincodes };
  });

  r.get("/api/admin/pincodes", async (ctx) => {
    const me = staff(ctx);
    const bf = bizFilter({ ...ctx.query, pincode: "" }, 2);
    const rows = await many(
      `SELECT b.pincode, max(b.area) AS area, max(b.city) AS city, max(b.state) AS state, count(*)::int AS partners,
              count(*) FILTER (WHERE b.status = 'verified')::int AS verified,
              count(*) FILTER (WHERE b.status = 'pending')::int AS pending,
              count(*) FILTER (WHERE b.created_at >= $1)::int AS today,
              (SELECT count(*) FROM offers o WHERE o.owner_id = ANY(array_agg(b.id)) AND o.status = 'live' AND o.ends_at > now())::int AS live,
              (SELECT count(*) FROM subscriptions s WHERE s.user_id = ANY(array_agg(b.id)) AND s.plan = 'owner' AND ${ACTIVE_SUB})::int AS subs,
              (SELECT count(*) FROM subscriptions s WHERE s.user_id = ANY(array_agg(b.id)) AND s.plan = 'owner' AND ${ACTIVE_SUB} AND s.current_period_end < now() + interval '3 days')::int AS ending
       FROM businesses b
       WHERE b.pincode <> '' AND ${bf.sql}
       GROUP BY b.pincode ORDER BY partners DESC, b.pincode LIMIT 500`, [new Date(startOfDayIST()), ...bf.params]);
    const customers = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE created_at >= $1)::int AS today FROM users u WHERE role = 'user' AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = u.id)`, [new Date(startOfDayIST())]);
    return { pincodes: rows.filter((x) => me.canSee({ state: x.state, city: x.city, pincode: x.pincode })), customers: me.role === "admin" ? customers : null };
  });

  r.get("/api/admin/businesses", async (ctx) => {
    const me = staff(ctx);
    const status = STATUSES.includes(ctx.query.status) ? ctx.query.status : null;
    // ?q= business or owner name, or phone; ?plan=active|expiring|none; plus the area / category filter
    const s = str(ctx.query.q, 80).toLowerCase();
    const digits = s.replace(/\D/g, "");
    const plan = ["active", "expiring", "none"].includes(ctx.query.plan) ? ctx.query.plan : null;
    const bf = bizFilter(ctx.query || {}, 5);
    const rows = await many(
      `SELECT b.*, c.phone, u.name AS owner_name, (SELECT count(*) FROM business_contacts c2 WHERE c2.phone = c.phone)::int AS same_phone,
              s.status AS s_status, s.current_period_end AS s_end,
              (SELECT count(*) FROM offers o WHERE o.owner_id = b.id AND o.status = 'live' AND o.ends_at > now())::int AS live,
              (SELECT count(*) FROM offer_archive a WHERE a.owner_id = b.id)::int AS past
       FROM businesses b JOIN users u ON u.id = b.id LEFT JOIN business_contacts c ON c.business_id = b.id
       LEFT JOIN subscriptions s ON s.user_id = b.id AND s.plan = 'owner'
       WHERE ($1::text IS NULL OR b.status = $1)
         AND ($2::text = '' OR lower(b.name) LIKE $3 OR lower(u.name) LIKE $3 OR ($4::text <> '' AND length($4) >= 6 AND c.phone LIKE '%' || $4 || '%'))
         AND ${bf.sql}
       ORDER BY b.created_at DESC LIMIT 500`, [status, s, "%" + s.replace(/[%_\\]/g, "\\$&") + "%", digits, ...bf.params]);
    const now = Date.now();
    const planOf = (b) => {
      const end = subActive({ status: b.s_status, current_period_end: b.s_end }) ? ms(b.s_end) : null;
      return !end ? "none" : end - now < 3 * DAY ? "expiring" : "active";
    };
    return rows.filter((b) => me.canSee({ state: b.state, city: b.city, pincode: b.pincode })).filter((b) => !plan || planOf(b) === plan || (plan === "active" && planOf(b) === "expiring")).map((b) => {
      const flags = [];
      if (b.report_count >= 2) flags.push(`Reported ${b.report_count}×`);
      if (b.same_phone > 1) flags.push("Same phone as another business");
      if (Date.now() - ms(b.created_at) < 2 * DAY) flags.push("New in last 48 h");
      if (b.categories_changed_at && Date.now() - ms(b.categories_changed_at) < 7 * DAY) flags.push("Changed categories this week");
      return {
        id: b.id, name: b.name, ownerName: b.owner_name || "", pincode: b.pincode, liveOffers: b.live, pastOffers: b.past, plan: planOf(b), category: b.category, categories: b.categories?.length ? b.categories : [b.category],
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
    const b = await one("SELECT state, city, pincode, name, status FROM businesses WHERE id = $1", [id]);
    if (!b) throw notFound("Business not found");
    if (!me.canSee(b)) throw denied("This business is outside your area");
    const note = str(ctx.body.note, 300);
    // the business's free month starts the first time it is verified
    await q(`UPDATE businesses SET status = $2, status_note = $3, reviewed_by = $4, reviewed_at = now(),
             trial_ends_at = CASE WHEN $2 = 'verified' AND trial_ends_at IS NULL THEN now() + make_interval(days => $5) ELSE trial_ends_at END
             WHERE id = $1`, [id, status, note, me.id, TRIAL_DAYS]);
    clearCache("feed:"); clearCache("cities:");
    audit("admin_business_status", me.id, { businessId: id, status });
    // tell the partner (only when the status really changes)
    if (status !== b.status && status !== "pending") {
      const after = await one("SELECT trial_ends_at FROM businesses WHERE id = $1", [id]);
      await notify(id, "business_" + status, { business: b.name, note, trialEnds: after?.trial_ends_at });
    }
  });

  // Super admins: replace one of a category's 5 Home photos (stored in R2 under a new key, so phones fetch it).
  r.post("/api/admin/category-photo", async (ctx) => {
    const me = superAdmin(ctx);
    const { category, slot, photo } = ctx.body || {};
    if (!CATEGORY_PHOTO_IDS.includes(category)) throw bad("Pick a category");
    const n = Number(slot);
    if (!(n >= 1 && n <= 5)) throw bad("Pick photo 1 to 5");
    if (!isDataImage(photo, 400_000)) throw bad("Choose a JPEG, PNG or WebP photo");
    if (!R2_ON) throw precondition("Photo storage (R2) isn't set up");
    const ext = /^data:image\/webp/.test(photo) ? "webp" : /^data:image\/png/.test(photo) ? "png" : "jpg";
    const ref = await saveFile(`categories/${category}-${n}-${newKey("v", ext)}`, photo);
    const map = { ...(await getSetting("category_photos", {})) };
    const old = map[`${category}-${n}`];
    map[`${category}-${n}`] = ref.slice(3);
    await setSetting("category_photos", map, me.id);
    if (old) await deleteFile("r2:" + old).catch(() => {});
    audit("admin_category_photo", me.id, { category, slot: n });
    return { ok: true };
  });

  // Super admins: change a partner's category (partners can't). Their live offers end; the reason is logged.
  // Super admins: correct a partner's details (shop name, about, address, area, city, state, pincode, contact number).
  // Only the fields sent change; every change is logged with the old and new value and the reason.
  r.post("/api/admin/businesses/:id/details", async (ctx) => {
    const me = superAdmin(ctx);
    const id = needUuid(ctx.params.id, "business");
    const reason = str(ctx.body?.reason, 300);
    if (reason.length < 3) throw bad("Write the reason (kept in the log)");
    const b = await one("SELECT b.name, b.about, b.address, b.area, b.city, b.state, b.pincode, c.phone FROM businesses b LEFT JOIN business_contacts c ON c.business_id = b.id WHERE b.id = $1", [id]);
    if (!b) throw notFound("Business not found");
    const limits = { name: 120, about: 1000, address: 300, area: 100, city: 80, state: 60, pincode: 6 };
    const set = {}, changes = {};
    for (const k of Object.keys(limits)) {
      if (ctx.body?.[k] == null) continue;
      const v = str(ctx.body[k], limits[k]);
      if (k === "name" && v.length < 2) throw bad("Shop name is too short");
      if (k === "pincode" && !/^\d{6}$/.test(v)) throw bad("Pincode must be 6 digits");
      if ((b[k] || "") !== v) { set[k] = v; changes[k] = { from: b[k] || "", to: v }; }
    }
    let phone = null;
    if (ctx.body?.phone != null) {
      phone = indianPhone(ctx.body.phone);
      if (!phone) throw bad("Enter a valid 10-digit Indian mobile number");
      if (phone !== b.phone) changes.phone = { from: maskPhone(b.phone || ""), to: maskPhone(phone) }; else phone = null;
    }
    if (!Object.keys(changes).length) return { changed: [] };
    await tx(async (c) => {
      const keys = Object.keys(set);
      if (keys.length) {
        const cols = keys.map((k, i) => `${k} = $${i + 2}`);
        if (set.city != null) { cols.push(`city_key = $${keys.length + 2}`); }
        await c.query(`UPDATE businesses SET ${cols.join(", ")}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => set[k]), ...(set.city != null ? [cityKey(set.city)] : [])]);
      }
      if (phone) await c.query(`INSERT INTO business_contacts (business_id, phone, whatsapp) VALUES ($1, $2, true) ON CONFLICT (business_id) DO UPDATE SET phone = $2, updated_at = now()`, [id, phone]);
    });
    clearCache("feed:"); clearCache("cities:");
    await audit("admin_details_changed", me.id, { businessId: id, changes, reason });
    return { changed: Object.keys(changes) };
  });

  r.post("/api/admin/businesses/:id/category", async (ctx) => {
    const me = superAdmin(ctx);
    const id = needUuid(ctx.params.id, "business");
    const category = ctx.body?.category;
    if (!CATEGORY_IDS.includes(category)) throw bad("Pick a category");
    const reason = str(ctx.body?.reason, 300);
    if (reason.length < 3) throw bad("Write the reason (kept in the log)");
    const b = await one("SELECT name, category, categories FROM businesses WHERE id = $1", [id]);
    if (!b) throw notFound("Business not found");
    // a new category often comes with a new shop name (e.g. "Sri Sai Sweets" becomes "Sri Durga Travels")
    const newName = str(ctx.body?.name, 120);
    if (ctx.body?.name != null && newName.length < 2) throw bad("Shop name is too short");
    if (b.category === category && b.categories.length === 1 && (!newName || newName === b.name)) return { category, endedOffers: 0 };
    let ended = 0;
    await tx(async (c) => {
      await c.query("UPDATE businesses SET category = $2, categories = $3, name = coalesce(nullif($4, ''), name), categories_changed_at = now(), updated_at = now() WHERE id = $1", [id, category, [category], newName]);
      ended = (await c.query("UPDATE offers SET status = 'ended' WHERE owner_id = $1 AND status = 'live'", [id])).rowCount;
    });
    clearCache("feed:"); clearCache("cities:");
    audit("admin_category_changed", me.id, { businessId: id, from: b.category, to: category, ...(newName && newName !== b.name ? { nameFrom: b.name, nameTo: newName } : {}), reason, endedOffers: ended });
    return { category, endedOffers: ended, name: newName || b.name };
  });

  // Super admins: app switches (one device at a time for customers).
  const settingsNow = async () => ({ singleDevice: await singleDeviceOn(), freeMode: await freeMode(), customerPass: await customerPassOn(), maintenance: await maintenanceSetting() });
  r.get("/api/admin/settings", async (ctx) => { staff(ctx); return settingsNow(); });
  r.post("/api/admin/settings", async (ctx) => {
    const me = superAdmin(ctx);
    const { singleDevice, freeMode: free, customerPass, maintenance } = ctx.body || {};
    if (typeof singleDevice !== "boolean" && typeof free !== "boolean" && typeof customerPass !== "boolean" && !maintenance) throw bad("Say which switch to turn on or off");
    if (typeof customerPass === "boolean") await setSetting("customer_pass", customerPass, me.id);
    if (maintenance && typeof maintenance === "object") { await setMaintenance(maintenance, me.id); audit("maintenance_changed", me.id, maintenance); }
    if (typeof singleDevice === "boolean") await setSetting("single_device", singleDevice, me.id);
    if (typeof free === "boolean") await setFreeMode(free, me.id);
    audit("setting_changed", me.id, { singleDevice, freeMode: free, customerPass });
    return settingsNow();
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
      await planEmail(id, "owner", months);
    } else if (action === "pack") {
      // a Business Pro pack paid outside the app (UPI, cash): 5, 15 or 30 days, added to the current end date
      const pack = PAY_PACKS.owner.find((p) => p.days === Number(ctx.body.days));
      if (!pack) throw bad("Pick 5, 15 or 30 days");
      await grantDays(id, "owner", pack.days, pack.price, me.id);
      const s2 = await one("SELECT current_period_end FROM subscriptions WHERE user_id = $1 AND plan = 'owner'", [id]);
      await notify(id, "plan_active", { planName: PLAN_NAMES.owner, days: pack.days, amount: pack.price, until: s2?.current_period_end });
    } else if (action === "extendTrial") {
      const days = Number(ctx.body.days);
      if (!(Number.isInteger(days) && days >= 1 && days <= 365)) throw bad("Give 1 to 365 free days");
      const t = await one("UPDATE businesses SET trial_ends_at = greatest(now(), coalesce(trial_ends_at, now())) + make_interval(days => $2) WHERE id = $1 RETURNING trial_ends_at", [id, days]);
      await notify(id, "trial_extended", { until: t.trial_ends_at });
    } else if (action === "end") {
      await q("UPDATE subscriptions SET status = 'expired', current_period_end = now(), updated_at = now() WHERE user_id = $1 AND plan = 'owner'", [id]);
      await q("UPDATE businesses SET trial_ends_at = now() WHERE id = $1", [id]);
      await notify(id, "plan_ended", { planName: PLAN_NAMES.owner });
    } else throw bad("Unknown action");
    clearCache("feed:"); clearCache("cities:");
    audit("admin_business_plan", me.id, { businessId: id, action, months: ctx.body.months || null, days: ctx.body.days || null });
    const after = await one(`SELECT b.trial_ends_at, s.status, s.current_period_end FROM businesses b
                             LEFT JOIN subscriptions s ON s.user_id = b.id AND s.plan = 'owner' WHERE b.id = $1`, [id]);
    return { planUntil: subActive(after) ? ms(after.current_period_end) : null, trialEndsAt: ms(after?.trial_ends_at) };
  });

  // Activate or extend a plan by e-mail (e.g. a payment collected outside the app). months = 0 ends it.
  r.post("/api/admin/plans", async (ctx) => {
    const me = superAdmin(ctx);
    const plan = ctx.body.plan;
    const months = Math.max(0, Math.min(24, Number(ctx.body.months) || 0));
    if (!PLANS.includes(plan)) throw bad("Unknown plan");
    const existing = ctx.body.userId ? null : await one("SELECT role FROM users WHERE lower(email) = $1", [normEmail(ctx.body.email)]);
    if (existing?.role === "support") throw precondition("This is a Support Desk account. Manage it in the Support Desk → Area in-charges");
    const target = ctx.body.userId
      ? await one("SELECT id FROM users WHERE id = $1", [needUuid(ctx.body.userId, "user")])
      : await one("SELECT id FROM users WHERE lower(email) = $1", [normEmail(ctx.body.email)]);
    if (!target) throw notFound(ctx.body.userId ? "User not found" : "No user with that email");
    if (months > 0) { await grantPlan(target.id, plan, months, me.id); await planEmail(target.id, plan, months); }
    else {
      await q("UPDATE subscriptions SET status = 'expired', current_period_end = now(), updated_at = now() WHERE user_id = $1 AND plan = $2", [target.id, plan]);
      await notify(target.id, "plan_ended", { planName: PLAN_NAMES[plan] });
    }
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
  // The free launch mode was removed: there is no free version.
  r.post("/api/admin/config", async (ctx) => {
    superAdmin(ctx);
    throw precondition("There is no free version. Activate plans in Admin → Plans after the customer pays.");
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

// payment receipt e-mail after a plan is activated or extended
async function planEmail(userId, plan, months) {
  const s = await one("SELECT current_period_end FROM subscriptions WHERE user_id = $1 AND plan = $2", [userId, plan]);
  await notify(userId, "plan_active", { planName: PLAN_NAMES[plan], months, amount: planPrice(plan, months), until: s?.current_period_end });
}

// Adds days to a plan (a pack paid outside the app) and records the sale.
async function grantDays(userId, plan, days, amount, by) {
  await q("INSERT INTO plan_sales (user_id, plan, months, amount, source, created_by) VALUES ($1, $2, 1, $3, 'manual', $4)", [userId, plan, amount, by]);
  await addPlanDays(q, { userId, plan, days, provider: "manual", by });
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
