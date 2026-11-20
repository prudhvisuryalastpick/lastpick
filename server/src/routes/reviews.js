// Reviews: only a customer who contacted a business through LastPick can review it (IS 19000:2022).
// One review per customer per business, editable. Owners reply but can't delete; staff hide reviews that break the rules.
import { needUser } from "../auth.js";
import { clearCache } from "../cache.js";
import { many, one, q, rmany } from "../db.js";
import { limit } from "../ratelimit.js";
import { audit, mapReview, needConsent } from "../shared.js";
import { bad, firstName, hasContactInfo, needUuid, notFound, precondition, str } from "../util.js";

export async function recomputeRating(businessId) {
  await q(`UPDATE businesses SET rating_count = s.n, rating_avg = s.avg FROM
             (SELECT count(*)::int AS n, round(avg(rating)::numeric, 1) AS avg FROM reviews WHERE business_id = $1 AND status = 'published') s
           WHERE id = $1`, [businessId]);
  clearCache("feed:");
}

export function reviewReadRoutes(r) {
  r.get("/api/businesses/:id/reviews", async (ctx) => {
    needUuid(ctx.params.id, "business");
    return (await rmany("SELECT * FROM reviews WHERE business_id = $1 AND status = 'published' ORDER BY created_at DESC LIMIT 30", [ctx.params.id])).map(mapReview);
  });
}

export function reviewRoutes(r) {
  r.get("/api/businesses/:id/my-review", async (ctx) => {
    const u = needUser(ctx);
    needUuid(ctx.params.id, "business");
    const rv = await one("SELECT * FROM reviews WHERE business_id = $1 AND customer_id = $2", [ctx.params.id, u.id]);
    return rv ? mapReview(rv) : null;
  });

  r.post("/api/businesses/:id/reviews", async (ctx) => {
    const u = needUser(ctx);
    needConsent(u);
    const businessId = needUuid(ctx.params.id, "business");
    const rating = Math.round(Number(ctx.body.rating));
    const text = str(ctx.body.text, 500);
    if (!(rating >= 1 && rating <= 5)) throw bad("Pick 1 to 5 stars");
    if (hasContactInfo(text)) throw bad("Please don't include phone numbers, e-mails or links in a review");
    if (businessId === u.id) throw precondition("You can't review your own business");
    const biz = await one("SELECT state FROM businesses WHERE id = $1", [businessId]);
    if (!biz) throw notFound("Business not found");
    const contacted = await one(
      `SELECT offer->>'title' AS title FROM customer_contacts WHERE customer_id = $1 AND business_id = $2
       UNION ALL SELECT offer_title FROM leads WHERE customer_id = $1 AND owner_id = $2 LIMIT 1`, [u.id, businessId]);
    if (!contacted) throw precondition("You can review a business after you contact it through LastPick");
    await limit(u.id, "review", 10, 86400);
    const me = await one("SELECT name FROM users WHERE id = $1", [u.id]);
    const prev = await one("SELECT status FROM reviews WHERE business_id = $1 AND customer_id = $2", [businessId, u.id]);
    await q(`INSERT INTO reviews (business_id, customer_id, name, rating, text, offer_title, state) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (business_id, customer_id) DO UPDATE SET name = $3, rating = $4, text = $5, edited = true, updated_at = now()`,
      [businessId, u.id, firstName(me?.name), rating, text, str(contacted.title || "", 120), biz.state]);
    await recomputeRating(businessId);
    audit("review", u.id, { businessId, rating, edited: !!prev });
    return { ok: true, hidden: prev?.status === "hidden" };
  });

  r.post("/api/reviews/:id/report", async (ctx) => {
    const u = needUser(ctx);
    const reviewId = needUuid(ctx.params.id, "review");
    const rv = await one("SELECT business_id, state FROM reviews WHERE id = $1", [reviewId]);
    if (!rv) throw notFound("Review not found");
    await limit(u.id, "report", 20, 86400);
    const ins = await q(`INSERT INTO reports (type, review_id, business_id, state, reporter_id, reason, details) VALUES ('review', $1, $2, $3, $4, $5, $6)
                         ON CONFLICT DO NOTHING`, [reviewId, rv.business_id, rv.state, u.id, str(ctx.body.reason, 80) || "Breaks the rules", str(ctx.body.details, 500)]);
    if (ins.rowCount) await q("UPDATE reviews SET report_count = report_count + 1 WHERE id = $1", [reviewId]);
  });
}
