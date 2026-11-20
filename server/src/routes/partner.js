// Business partner side: business profile, posting and ending offers, leads, reviews of my business.
import { needUser } from "../auth.js";
import { clearCache } from "../cache.js";
import { many, one, q, tx } from "../db.js";
import { freeMode, planActive } from "../plans.js";
import { limit } from "../ratelimit.js";
import { audit, mapBusiness, mapOffer, mapReview, needConsent, offerSelect } from "../shared.js";
import {
  ALWAYS_OPEN, POSTING_HOURS, closingTimeIST, postingOpen, MAX_OFFER_MS, POSTS_PER_DAY, bad, cityKey, denied, hasContactInfo, indianPhone, isDataImage, ms, needUuid, notFound, precondition, startOfDayIST, str,
} from "../util.js";

// Keep in sync with CATEGORIES in web/src/lib/config.js. A business posts offers ONLY in the categories it
// registered (a bakery posts only bakery offers). Every business may also post "jobs": a job opening at its
// own shop, shown like an advertisement only to customers in that area.
const CATEGORY_IDS = ["food", "stay", "travel", "grocery", "beauty", "laundry", "vehicle", "sports", "admissions", "education",
  "retail", "electronics", "services", "photo", "decor", "makeup", "tailor", "pets", "other"];
const DAY = 86400000; // everything posted ends the same day (before midnight, India time)
export const normCategory = (c) => (CATEGORY_IDS.includes(c) ? c : "other");
const MAX_CATEGORIES = 3;

async function myBusiness(uid) {
  const b = await one(`SELECT b.*, c.phone, c.whatsapp FROM businesses b LEFT JOIN business_contacts c ON c.business_id = b.id WHERE b.id = $1`, [uid]);
  return mapBusiness(b);
}

export function partnerRoutes(r) {
  // ---------- business profile ----------
  r.get("/api/business", async (ctx) => myBusiness(needUser(ctx).id));

  r.put("/api/business", async (ctx) => {
    const u = needUser(ctx);
    const b = ctx.body || {};
    const name = str(b.name, 100);
    const category = normCategory(b.category);
    const categories = [...new Set([category, ...(Array.isArray(b.categories) ? b.categories : []).filter((c) => CATEGORY_IDS.includes(c))])].slice(0, MAX_CATEGORIES);
    const phone = indianPhone(b.phone);
    const pincode = String(b.pincode || "").replace(/\D/g, "");
    const lat = typeof b.lat === "number" && Math.abs(b.lat) <= 90 ? b.lat : null;
    const lng = typeof b.lng === "number" && Math.abs(b.lng) <= 180 ? b.lng : null;
    if (name.length < 2) throw bad("Please enter your business name");
    if (!phone) throw bad("Please enter a valid Indian phone number for your business");
    if (pincode && pincode.length !== 6) throw bad("Enter a 6-digit pincode");
    const city = str(b.city, 80);
    const fields = [name, category, categories, str(b.about, 1000), str(b.address, 300), str(b.area, 100), city, str(b.state, 60), cityKey(city), pincode, lat, lng];
    await tx(async (c) => {
      const prev = (await c.query("SELECT categories FROM businesses WHERE id = $1 FOR UPDATE", [u.id])).rows[0];
      if (prev) {
        const changed = [...prev.categories].sort().join() !== [...categories].sort().join();
        await c.query(`UPDATE businesses SET name = $2, category = $3, categories = $4, about = $5, address = $6, area = $7, city = $8, state = $9,
                       city_key = $10, pincode = $11, lat = $12, lng = $13, updated_at = now()${changed ? ", categories_changed_at = now()" : ""} WHERE id = $1`, [u.id, ...fields]);
      } else {
        await c.query(`INSERT INTO businesses (id, name, category, categories, about, address, area, city, state, city_key, pincode, lat, lng)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, [u.id, ...fields]);
      }
      await c.query(`INSERT INTO business_contacts (business_id, phone, whatsapp) VALUES ($1, $2, $3)
                     ON CONFLICT (business_id) DO UPDATE SET phone = $2, whatsapp = $3, updated_at = now()`, [u.id, phone, b.whatsapp !== false]);
    });
    clearCache("feed:"); clearCache("cities:");
    return myBusiness(u.id);
  });

  // ---------- offers ----------
  r.get("/api/owner/offers", async (ctx) => {
    const u = needUser(ctx);
    const free = await freeMode();
    const rows = await many(`SELECT ${offerSelect(free)} FROM offers o JOIN businesses b ON b.id = o.owner_id WHERE o.owner_id = $1 ORDER BY o.created_at DESC LIMIT 200`, [u.id]);
    return rows.map(mapOffer);
  });

  r.post("/api/owner/offers", async (ctx) => {
    const u = needUser(ctx);
    needConsent(u, "partner");
    const d = ctx.body || {};
    const b = await one("SELECT b.*, c.phone FROM businesses b LEFT JOIN business_contacts c ON c.business_id = b.id WHERE b.id = $1", [u.id]);
    if (!b) throw precondition("Set up your business first");
    if (["rejected", "suspended"].includes(b.status)) throw denied("Your business is " + b.status);
    // only trusted partners post: the LastPick team must verify the business first
    if (b.status !== "verified") {
      const e = denied("Only verified partners can post. Our team checks every business, usually within 1 working day. We'll let you know when you're verified.");
      e.code = "not_verified";
      throw e;
    }
    if (!(await planActive(u.id, "owner"))) throw denied("Your free month has ended. Pick a Business Pro plan to post offers.");
    if (!b.phone) throw precondition("Add your contact number in Business profile first");
    if (!b.city || !b.state || !b.pincode) throw precondition("Add your city, state and pincode in Business profile first");

    const title = str(d.title, 120);
    const origPrice = Number(d.origPrice), price = Number(d.price), endsAt = Number(d.endsAt);
    if (title.length < 3) throw bad("Title is too short");
    const allowed = b.categories?.length ? b.categories : [b.category || "other"];
    const category = d.category === "jobs" ? "jobs" : d.category ? normCategory(d.category) : allowed[0];
    const hiring = category === "jobs";
    // a business posts only in its registered categories (plus job openings at its own shop)
    if (!hiring && !allowed.includes(category)) throw denied("Your business can post only in its registered category. Every business can also post a job opening.");
    if (!postingOpen()) throw precondition(`Posting is open from ${POSTING_HOURS.from} AM to 10:30 PM (India time). Please post again at ${POSTING_HOURS.from} AM.`);
    const closing = closingTimeIST(category);
    const lastTime = ALWAYS_OPEN.includes(category) ? "12 midnight" : "11 PM";
    if (hiring) {
      if (!(price > 0) || price > 1e7) throw bad("Enter the pay for this job");
    } else {
      // offers and discounts only: the offer price must be lower than the normal price
      if (!(origPrice > 0) || !(price >= 0) || !(price < origPrice) || origPrice > 1e9) throw bad("Offer price must be lower than the normal price");
    }
    // same day only: ends by 11 PM (hotels and travel: 12 midnight)
    if (!(endsAt > Date.now()) || endsAt > closing) throw bad(`Offers are for the same day only: they must end by ${lastTime} (India time)`);
    const photoThumb = isDataImage(d.photoThumb, 30000) ? d.photoThumb : null;
    const photo = isDataImage(d.photo, 200000) ? d.photo : null;

    await limit(u.id, "offer", 30, 86400);
    const result = await tx(async (c) => {
      // lock the business row so two posts at the same moment can't both slip under the daily limit
      await c.query("SELECT 1 FROM businesses WHERE id = $1 FOR UPDATE", [u.id]);
      const today = (await c.query("SELECT count(*)::int AS n FROM offers WHERE owner_id = $1 AND created_at >= $2", [u.id, new Date(startOfDayIST())])).rows[0].n;
      if (today >= POSTS_PER_DAY) throw precondition(`You can post ${POSTS_PER_DAY} offers a day. You can post again tomorrow from 4 AM.`);
      const { rows } = await c.query(
        `INSERT INTO offers (owner_id, title, description, category, emoji, photo_thumb, has_photo, orig_price, price, quantity, ends_at, flags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [u.id, title, str(d.description, 1000), category, str(d.emoji, 8) || "📦", photoThumb, !!photo, hiring ? price : origPrice, price, str(d.quantity, 60),
          new Date(endsAt), !hiring && 1 - price / origPrice >= 0.9 ? ["very-high-discount"] : []]);
      if (photo) await c.query("INSERT INTO offer_photos (offer_id, data) VALUES ($1, $2)", [rows[0].id, photo]);
      return { id: rows[0].id, postsLeftToday: POSTS_PER_DAY - today - 1 };
    });
    clearCache("feed:"); clearCache("cities:");
    audit("offer_created", u.id, { offerId: result.id, category });
    return { ...result, visible: b.status === "verified" };
  });

  r.post("/api/owner/offers/:id/end", async (ctx) => {
    const u = needUser(ctx);
    needUuid(ctx.params.id, "offer");
    const r2 = await q("UPDATE offers SET status = 'ended' WHERE id = $1 AND owner_id = $2 AND status = 'live'", [ctx.params.id, u.id]);
    if (!r2.rowCount) throw notFound("Offer not found");
    await q("DELETE FROM offer_photos WHERE offer_id = $1", [ctx.params.id]); // full photo goes as soon as the offer ends
    await q("UPDATE offers SET has_photo = false WHERE id = $1", [ctx.params.id]);
    clearCache("feed:"); clearCache("cities:");
  });

  r.get("/api/owner/archive", async (ctx) => {
    const u = needUser(ctx);
    const rows = await many("SELECT * FROM offer_archive WHERE owner_id = $1 ORDER BY ends_at DESC LIMIT 100", [u.id]);
    return rows.map((a) => ({
      id: a.id, title: a.title, category: a.category, emoji: a.emoji, origPrice: Number(a.orig_price), price: Number(a.price),
      views: a.views, leads: a.leads, status: a.status, createdAt: ms(a.created_at), endsAt: ms(a.ends_at),
    }));
  });

  // ---------- leads (customers who shared their number) ----------
  r.get("/api/owner/leads", async (ctx) => {
    const u = needUser(ctx);
    if (!(await planActive(u.id, "owner"))) return []; // leads show only while Business Pro is active; partners see the customer's name, never the number
    const rows = await many("SELECT * FROM leads WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 300", [u.id]);
    return rows.map((x) => ({ id: x.id, offerId: x.offer_id, offerTitle: x.offer_title, offerEmoji: x.offer_emoji, name: x.name, status: x.status, createdAt: ms(x.created_at) }));
  });
  r.patch("/api/owner/leads/:id", async (ctx) => {
    const u = needUser(ctx);
    needUuid(ctx.params.id, "lead");
    if (!["new", "contacted", "closed"].includes(ctx.body.status)) throw bad("Unknown status");
    const r2 = await q("UPDATE leads SET status = $3 WHERE id = $1 AND owner_id = $2", [ctx.params.id, u.id, ctx.body.status]);
    if (!r2.rowCount) throw notFound("Lead not found");
  });

  // ---------- reviews of my business ----------
  r.get("/api/owner/reviews", async (ctx) => {
    const u = needUser(ctx);
    return (await many("SELECT * FROM reviews WHERE business_id = $1 ORDER BY created_at DESC LIMIT 200", [u.id])).map(mapReview);
  });
  r.post("/api/reviews/:id/reply", async (ctx) => {
    const u = needUser(ctx);
    needUuid(ctx.params.id, "review");
    const rv = await one("SELECT business_id FROM reviews WHERE id = $1", [ctx.params.id]);
    if (!rv || rv.business_id !== u.id) throw denied("Only the business owner can reply");
    const text = str(ctx.body.text, 500);
    if (hasContactInfo(text)) throw bad("Please don't include phone numbers, e-mails or links in a reply");
    await limit(u.id, "reply", 50, 86400);
    await q("UPDATE reviews SET reply_text = $2, reply_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1", [ctx.params.id, text || null]);
  });
}
