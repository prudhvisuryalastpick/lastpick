// Impact dashboards: how much a customer saved, how much business LastPick brought a partner, and platform totals.
// Built from the contact history (kept 12 months under the retention rules), so every figure covers the last 12 months.
// "Business generated" = the offer value of every customer who viewed the number, called, WhatsApped or shared their
// number. It's an estimate: the deal itself happens outside LastPick.
import { needUser } from "../auth.js";
import { rmany as many, rone as one } from "../db.js"; // dashboards read from the replica
import { num } from "../util.js";

const SAVED = "greatest(coalesce((offer->>'origPrice')::numeric, 0) - coalesce((offer->>'price')::numeric, 0), 0)";
const VALUE = "coalesce((offer->>'price')::numeric, 0)";
const MONTH = "to_char(date_trunc('month', at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM')";

// last 6 months, oldest first, zero-filled
function lastMonths(rows, fields) {
  const out = [];
  const now = new Date(Date.now() + 5.5 * 3600000);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const r = rows.find((x) => x.month === key) || {};
    out.push({ month: key, label: d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" }), ...Object.fromEntries(fields.map((f) => [f, num(r[f]) || 0])) });
  }
  return out;
}

export async function platformImpact() {
  const t = await one(`SELECT
      coalesce(sum(${SAVED}), 0)::float8 AS saved, coalesce(sum(${VALUE}), 0)::float8 AS value,
      count(*)::int AS contacts, count(DISTINCT customer_id)::int AS customers, count(DISTINCT business_id)::int AS businesses,
      coalesce(sum(${VALUE}) FILTER (WHERE at > now() - interval '30 days'), 0)::float8 AS value30,
      coalesce(sum(${SAVED}) FILTER (WHERE at > now() - interval '30 days'), 0)::float8 AS saved30
    FROM customer_contacts`);
  const months = await many(`SELECT ${MONTH} AS month, sum(${VALUE})::float8 AS value, sum(${SAVED})::float8 AS saved
    FROM customer_contacts WHERE at > now() - interval '6 months' GROUP BY 1`);
  return { ...t, months: lastMonths(months, ["value", "saved"]) };
}

export function insightRoutes(r, { customer, partner }) {
  if (customer) {
    r.get("/api/me/savings", async (ctx) => {
      const u = needUser(ctx);
      const [t, months, cats, recent] = await Promise.all([
        one(`SELECT count(*)::int AS deals, count(DISTINCT business_id)::int AS businesses,
               coalesce(sum(${SAVED}), 0)::float8 AS saved, coalesce(sum(${VALUE}), 0)::float8 AS spent,
               coalesce(sum(${SAVED}) FILTER (WHERE at > date_trunc('month', now())), 0)::float8 AS saved_this_month
             FROM customer_contacts WHERE customer_id = $1`, [u.id]),
        many(`SELECT ${MONTH} AS month, sum(${SAVED})::float8 AS saved, count(*)::int AS deals
              FROM customer_contacts WHERE customer_id = $1 AND at > now() - interval '6 months' GROUP BY 1`, [u.id]),
        many(`SELECT coalesce(offer->>'category', 'other') AS category, sum(${SAVED})::float8 AS saved, count(*)::int AS deals
              FROM customer_contacts WHERE customer_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [u.id]),
        many(`SELECT offer->>'title' AS title, offer->>'businessName' AS business, ${SAVED}::float8 AS saved, how, at
              FROM customer_contacts WHERE customer_id = $1 ORDER BY at DESC LIMIT 5`, [u.id]),
      ]);
      return {
        saved: t.saved, savedThisMonth: t.saved_this_month, spentLocal: t.spent, deals: t.deals, businessesHelped: t.businesses,
        percent: t.saved + t.spent > 0 ? Math.round((t.saved / (t.saved + t.spent)) * 100) : 0,
        months: lastMonths(months, ["saved", "deals"]),
        categories: cats.map((c) => ({ category: c.category, saved: num(c.saved), deals: c.deals })),
        recent: recent.map((x) => ({ title: x.title, business: x.business, saved: num(x.saved), how: x.how, at: new Date(x.at).getTime() })),
        period: "last 12 months",
      };
    });
  }

  if (partner) {
    r.get("/api/owner/insights", async (ctx) => {
      const u = needUser(ctx);
      const [t, views, leads, months, top, biz] = await Promise.all([
        one(`SELECT count(*)::int AS contacts, count(DISTINCT customer_id)::int AS customers,
               count(*) FILTER (WHERE how = 'Viewed number')::int AS viewed,
               count(*) FILTER (WHERE how = 'Called')::int AS called,
               count(*) FILTER (WHERE how = 'WhatsApp')::int AS whatsapp,
               count(*) FILTER (WHERE how = 'Shared my number')::int AS shared,
               coalesce(sum(${VALUE}), 0)::float8 AS value, coalesce(sum(${SAVED}), 0)::float8 AS discount,
               coalesce(sum(${VALUE}) FILTER (WHERE at > date_trunc('month', now())), 0)::float8 AS value_this_month
             FROM customer_contacts WHERE business_id = $1`, [u.id]),
        one(`SELECT (SELECT coalesce(sum(views), 0) FROM offers WHERE owner_id = $1)
                  + (SELECT coalesce(sum(views), 0) FROM offer_archive WHERE owner_id = $1) AS views,
                    (SELECT count(*) FROM offers WHERE owner_id = $1) + (SELECT count(*) FROM offer_archive WHERE owner_id = $1) AS posts`, [u.id]),
        one(`SELECT count(*)::int AS leads, count(*) FILTER (WHERE status <> 'new')::int AS followed_up FROM leads WHERE owner_id = $1`, [u.id]),
        many(`SELECT ${MONTH} AS month, sum(${VALUE})::float8 AS value, count(DISTINCT customer_id)::int AS customers
              FROM customer_contacts WHERE business_id = $1 AND at > now() - interval '6 months' GROUP BY 1`, [u.id]),
        many(`SELECT offer->>'title' AS title, count(*)::int AS customers, sum(${VALUE})::float8 AS value
              FROM customer_contacts WHERE business_id = $1 GROUP BY 1 ORDER BY 3 DESC NULLS LAST LIMIT 5`, [u.id]),
        one("SELECT rating_avg::float8 AS avg, rating_count AS count FROM businesses WHERE id = $1", [u.id]),
      ]);
      const views_ = num(views.views) || 0;
      return {
        businessGenerated: t.value, businessThisMonth: t.value_this_month, customers: t.customers, contacts: t.contacts,
        discountGiven: t.discount, views: views_, posts: num(views.posts) || 0,
        funnel: { views: views_, numberViews: t.viewed, calls: t.called, whatsapp: t.whatsapp, shared: t.shared },
        leads: leads.leads, leadsFollowedUp: leads.followed_up,
        conversion: views_ > 0 ? Math.round((t.customers / views_) * 1000) / 10 : 0,
        rating: biz?.count ? { avg: biz.avg, count: biz.count } : null,
        months: lastMonths(months, ["value", "customers"]),
        topOffers: top.map((x) => ({ title: x.title, customers: x.customers, value: num(x.value) })),
        period: "last 12 months",
      };
    });
  }
}
