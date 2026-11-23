// Public counts shown in the apps and on lastpick.in (all real, from the database; cached for a minute):
//   GET /api/stats?pincode=500072
//   -> { partners: { area, total }, customers: { total }, joinedWeek, joined: [{ name, area, at }] }
// partners = verified businesses; area = in that pincode. customers = accounts that aren't a business or an admin.
// "joined" = the last few verified businesses (business name and area only; no phone numbers or owner names).
import { cached } from "../cache.js";
import { one, q } from "../db.js";
import { bad } from "../util.js";

export function statRoutes(r) {
  r.get("/api/stats", async (ctx) => {
    const pin = String(ctx.query.pincode || "").trim();
    if (pin && !/^\d{6}$/.test(pin)) throw bad("Pincode must be 6 digits");
    const total = await cached("stats:total", 60000, async () => {
      const t = await one(
        `SELECT (SELECT count(*) FROM businesses WHERE status = 'verified')::int AS partners,
                (SELECT count(*) FROM users u WHERE u.role <> 'admin' AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = u.id))::int AS customers,
                (SELECT count(*) FROM businesses WHERE status = 'verified' AND coalesce(reviewed_at, created_at) > now() - interval '7 days')::int AS joined_week`);
      const joined = (await q(
        `SELECT name, coalesce(nullif(area, ''), city) AS area, coalesce(reviewed_at, created_at) AS at
           FROM businesses WHERE status = 'verified' ORDER BY coalesce(reviewed_at, created_at) DESC LIMIT 8`)).rows;
      return { ...t, joined: joined.map((j) => ({ name: j.name, area: j.area || "", at: new Date(j.at).getTime() })) };
    });
    const area = pin ? await cached(`stats:pin:${pin}`, 60000, async () =>
      (await one("SELECT count(*)::int AS n FROM businesses WHERE status = 'verified' AND pincode = $1", [pin])).n) : null;
    return {
      partners: { area, total: total.partners }, customers: { total: total.customers },
      joinedWeek: total.joined_week, joined: total.joined,
    };
  }, { cache: "public, max-age=60" });
}
