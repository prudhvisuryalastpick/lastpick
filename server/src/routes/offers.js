// Customer side: offer feeds (near me, pincode, city), offer pages, the number exchange and reports.
import { needUser } from "../auth.js";
import { cached } from "../cache.js";
import { many, one, q, rmany, rone } from "../db.js";
import { freeMode, planActive } from "../plans.js";
import { limit } from "../ratelimit.js";
import { audit, mapOffer, needConsent, offerSelect, offerSummary, visibleSql } from "../shared.js";
import { ALWAYS_OPEN, BUSINESS_HOURS, runs24x7, bad, denied, isNight, needUuid, notFound, precondition, str } from "../util.js";

const isStaff = (u) => u && ["admin", "moderator"].includes(u.role);

export async function loadOffer(id) {
  needUuid(id, "offer");
  const free = await freeMode();
  const sql = `SELECT ${offerSelect(free)} FROM offers o JOIN businesses b ON b.id = o.owner_id WHERE o.id = $1`;
  // replica first; a brand-new offer the replica hasn't received yet (under a second) comes from the main database
  const r = (await rone(sql, [id])) || (await one(sql, [id]));
  return r ? mapOffer(r) : null;
}
// The offer as this user may see it: visible to everyone, or their own, or staff.
async function offerFor(ctx, id) {
  const o = await loadOffer(id);
  if (!o || !(o.visible || o.ownerId === ctx.user?.id || isStaff(ctx.user))) throw notFound("Offer not found");
  return o;
}

// After working hours only hotels and local ads stay listed.
const hoursSql = () => (isNight() ? `o.category IN (${ALWAYS_OPEN.map((c) => `'${c}'`).join(", ")})` : "true");
function needOpen(o) {
  if (isNight() && !runs24x7(o.category)) {
    const e = precondition(`This business is closed for the night. Contact them after ${BUSINESS_HOURS.open} AM. Hotels and local ads stay open 24×7.`);
    e.code = "closed_for_night";
    throw e;
  }
}

async function feed(where, params, cacheKey) {
  const free = await freeMode();
  const night = isNight();
  return cached(`feed2:${free}:${night}:${cacheKey}`, 30000, async () => {
    const rows = await rmany(
      `SELECT ${offerSelect(free)} FROM offers o JOIN businesses b ON b.id = o.owner_id
       WHERE ${visibleSql(free)} AND ${hoursSql()} AND o.category <> 'jobs' AND ${where} ORDER BY o.ends_at LIMIT 300`, params);
    return rows.map(mapOffer);
  });
}
const notEnded = (list) => list.filter((o) => o.endsAt > Date.now());

// Job openings are shown only in the local area: within LOCAL_KM of the customer (near me), or the same pincode.
// Never in the whole-city feed.
export const LOCAL_KM = 10;
const LOCAL_SQL = `o.category <> 'jobs'`;

// Read-only offer pages, used by all three apps.
export function offerViewRoutes(r) {
  r.get("/api/offers/:id", async (ctx) => offerFor(ctx, ctx.params.id));
  // photos are switched off (no uploads); kept so older app versions get an empty answer
  r.get("/api/offers/:id/photo", async () => ({ photo: null }));
}

export function offerRoutes(r) {
  // ?lat=&lng=&radius=  |  ?pincode=  |  ?city=
  r.get("/api/offers", async ({ query }) => {
    if (query.lat != null && query.lng != null) {
      // ~1 km grid, so small GPS jitter reuses the cached result
      const lat = Math.round(Number(query.lat) * 100) / 100, lng = Math.round(Number(query.lng) * 100) / 100;
      const km = Math.min(50, Math.max(1, Number(query.radius) || 30));
      if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) throw bad("Bad location");
      const dLat = km / 111.2, dLng = km / (111.2 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
      const dist = "2 * 6371 * asin(sqrt(power(sin(radians(b.lat - $5) / 2), 2) + cos(radians($5)) * cos(radians(b.lat)) * power(sin(radians(b.lng - $6) / 2), 2)))";
      return notEnded(await feed(
        `b.lat BETWEEN $1 AND $2 AND b.lng BETWEEN $3 AND $4 AND ${dist} <= $7 AND (${LOCAL_SQL} OR ${dist} <= $8)`,
        [lat - dLat, lat + dLat, lng - dLng, lng + dLng, lat, lng, km, LOCAL_KM], `near:${lat},${lng},${km}`));
    }
    if (query.pincode) {
      const pin = String(query.pincode).replace(/\D/g, "");
      if (pin.length !== 6) throw bad("Enter a 6-digit pincode");
      return notEnded(await feed("b.pincode = $1", [pin], `pin:${pin}`));
    }
    const city = str(query.city, 80);
    if (!city) throw bad("Pick a city");
    return notEnded(await feed(`b.city_key = $1 AND ${LOCAL_SQL}`, [city], `city:${city}`));
  }, { cache: "public, max-age=30, s-maxage=60" }); // same for everyone: Cloudflare keeps a copy for 60 s

  r.get("/api/cities", async () => {
    const free = await freeMode();
    return cached(`cities:${free}`, 300000, async () => {
      const rows = await rmany(
        `SELECT b.city_key AS key, max(b.city) AS name, max(b.state) AS state, avg(b.lat) AS lat, avg(b.lng) AS lng,
                count(o.id) FILTER (WHERE ${visibleSql(free)})::int AS live
         FROM businesses b LEFT JOIN offers o ON o.owner_id = b.id
         WHERE b.status = 'verified' AND b.city_key <> '' GROUP BY b.city_key ORDER BY live DESC LIMIT 300`);
      return rows.map((c) => ({ key: c.key, name: c.name, state: c.state, lat: c.lat, lng: c.lng, liveOffers: c.live }));
    });
  }, { cache: "public, max-age=300" });

  r.post("/api/offers/:id/view", async (ctx) => {
    needUuid(ctx.params.id, "offer");
    await limit("ip:" + ctx.ip, "view", 300, 3600);
    await q("UPDATE offers SET views = views + 1 WHERE id = $1 AND status = 'live'", [ctx.params.id]);
  });

  // ---------- number exchange ----------
  // The owner's number is never in the offer. Logged-in customers get it here (free; the Customer Pass is switched off).
  r.post("/api/offers/:id/reveal", async (ctx) => {
    const u = needUser(ctx);
    needConsent(u);
    const o = await offerFor(ctx, ctx.params.id);
    const own = o.ownerId === u.id;
    if (!own) needOpen(o);
    const customer = await planActive(u.id, "customer");
    if (!customer && !own && !isStaff(u)) throw denied("Subscribe to the Customer Pass to see this number");
    const c = await one("SELECT phone FROM business_contacts WHERE business_id = $1", [o.ownerId]);
    if (!c) throw notFound("The owner has not added a contact number");
    if (customer && !own) {
      const prev = await one("SELECT how FROM customer_contacts WHERE customer_id = $1 AND offer_id = $2", [u.id, o.id]);
      if (!prev) {
        await limit(u.id, "reveal", 60, 3600, "You've viewed a lot of numbers. Please try again in an hour.");
        audit("number_viewed", u.id, { offerId: o.id, businessId: o.ownerId });
      }
      await q(`INSERT INTO customer_contacts (customer_id, offer_id, business_id, how, offer) VALUES ($1, $2, $3, 'Viewed number', $4)
               ON CONFLICT (customer_id, offer_id) DO UPDATE SET at = now(), offer = $4`, [u.id, o.id, o.ownerId, offerSummary(o)]);
    }
    return { phone: c.phone }; // call only: customers get no WhatsApp link
  });

  r.post("/api/offers/:id/log", async (ctx) => {
    const u = needUser(ctx);
    needConsent(u);
    if (!(await planActive(u.id, "customer"))) return { ok: false };
    const o = await offerFor(ctx, ctx.params.id);
    if (o.ownerId === u.id) return { ok: false };
    const how = str(ctx.body.how, 40) || "Contacted";
    await q(`INSERT INTO customer_contacts (customer_id, offer_id, business_id, how, offer) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (customer_id, offer_id) DO UPDATE SET how = $4, at = now(), offer = $5`, [u.id, o.id, o.ownerId, how, offerSummary(o)]);
    return { ok: true };
  });

  // The customer chooses to send their name and number to the business (a lead).
  r.post("/api/offers/:id/share", async (ctx) => {
    const u = needUser(ctx);
    needConsent(u);
    if (!(await planActive(u.id, "customer"))) throw denied("Subscribe to the Customer Pass first");
    const o = await offerFor(ctx, ctx.params.id);
    if (!o.visible) throw precondition("This offer has ended");
    needOpen(o);
    if (o.ownerId === u.id) throw precondition("This is your own offer");
    const me = await one("SELECT name, phone FROM users WHERE id = $1", [u.id]);
    if (!me?.phone) throw precondition("Add your phone number in Account first");
    const prev = await one("SELECT 1 FROM leads WHERE offer_id = $1 AND customer_id = $2", [o.id, u.id]);
    if (!prev) {
      await limit(u.id, "share", 30, 3600, "You've shared your number a lot. Please try again in an hour.");
      audit("number_shared", u.id, { offerId: o.id, businessId: o.ownerId });
    }
    await q(`INSERT INTO leads (offer_id, owner_id, customer_id, name, phone, offer_title, offer_emoji) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (offer_id, customer_id) DO UPDATE SET name = $4, phone = $5`, [o.id, o.ownerId, u.id, me.name || "Customer", me.phone, o.title, o.emoji]);
    await q(`INSERT INTO customer_contacts (customer_id, offer_id, business_id, how, offer) VALUES ($1, $2, $3, 'Shared my number', $4)
             ON CONFLICT (customer_id, offer_id) DO UPDATE SET how = 'Shared my number', at = now(), offer = $4`, [u.id, o.id, o.ownerId, offerSummary(o)]);
    return { ok: true };
  });

  r.get("/api/me/shared-offer-ids", async (ctx) => {
    const u = needUser(ctx);
    return (await many("SELECT offer_id FROM leads WHERE customer_id = $1", [u.id])).map((x) => x.offer_id);
  });

  r.get("/api/me/contacts", async (ctx) => {
    const u = needUser(ctx);
    const rows = await many("SELECT * FROM customer_contacts WHERE customer_id = $1 ORDER BY at DESC LIMIT 200", [u.id]);
    return rows.map((x) => {
      const o = x.offer || {};
      return {
        how: x.how, at: new Date(x.at).getTime(),
        offer: { id: x.offer_id, businessId: x.business_id, title: o.title, emoji: o.emoji, category: o.category, photoUrl: o.photoThumb || null,
          price: o.price, origPrice: o.origPrice, endsAt: o.endsAt, business: { name: o.businessName, area: o.area } },
      };
    });
  });

  // ---------- reports ----------
  r.post("/api/offers/:id/report", async (ctx) => {
    const u = needUser(ctx);
    const o = await loadOffer(ctx.params.id);
    if (!o) throw notFound("Offer not found");
    await limit(u.id, "report", 20, 86400);
    const reason = str(ctx.body.reason, 80);
    if (!reason) throw bad("Pick a reason");
    await q(`INSERT INTO reports (type, offer_id, business_id, state, city, reporter_id, reason, details) VALUES ('offer', $1, $2, $3, $4, $5, $6, $7)`,
      [o.id, o.ownerId, o.business.state, o.business.city, u.id, reason, str(ctx.body.details, 500)]);
    await q("UPDATE businesses SET report_count = report_count + 1 WHERE id = $1", [o.ownerId]);
  });
}
