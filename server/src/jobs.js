// Background jobs and scheduled upkeep.
import { many, q, tx } from "./db.js";
import { onJob, schedule } from "./queue.js";
import { recomputeRating } from "./routes/reviews.js";
import { RETENTION, isNight } from "./util.js";

// Ended offers leave the live offers table at once: they are copied to offer_archive (the partner's History, with
// views and lead counts) and deleted. Customers never see old offers; leads keep their own copy of the offer title.
export async function archiveEnded() {
  return tx(async (c) => {
    const r = await c.query(
      `WITH old AS (DELETE FROM offers o WHERE o.ends_at <= now() OR o.status <> 'live' RETURNING o.*)
       INSERT INTO offer_archive (id, owner_id, business_name, city, state, city_key, title, category, emoji, orig_price, price, views, leads, status, created_at, ends_at)
       SELECT old.id, old.owner_id, b.name, b.city, b.state, b.city_key, old.title, old.category, old.emoji, old.orig_price, old.price, old.views,
              (SELECT count(*) FROM leads l WHERE l.offer_id = old.id), old.status, old.created_at, least(old.ends_at, now())
       FROM old JOIN businesses b ON b.id = old.owner_id
       ON CONFLICT (id) DO NOTHING`);
    return r.rowCount;
  });
}

export function registerJobs() {
  // Removes everything left of a deleted account (its login already stopped working).
  onJob("purge_user", async ({ uid }) => {
    const reviewed = await many("SELECT DISTINCT business_id FROM reviews WHERE customer_id = $1", [uid]);
    await q("DELETE FROM users WHERE id = $1", [uid]); // cascades: business, offers, photos, leads, contacts, reviews, plans
    await q("DELETE FROM rate_limits WHERE key = $1", [uid]);
    for (const r of reviewed) await recomputeRating(r.business_id);
  });

  // Hourly: plans whose paid period ended are marked expired.
  schedule("expire-plans", { every: 3600000 }, async () => {
    const r = await q("UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE status IN ('active', 'cancelled') AND current_period_end < now()");
    return { expired: r.rowCount };
  });

  // Every 5 minutes: close offers whose time is up, even if the partner forgets, and wipe them from the live list.
  // After 11 PM (India time) every offer except hotels, travel and logistics (24x7) is closed, whatever end time it had.
  schedule("close-offers", { every: 300000 }, async () => {
    const timeUp = await q("UPDATE offers SET status = 'ended' WHERE status = 'live' AND ends_at <= now()");
    // the closing hour comes from BUSINESS_HOURS (11 PM to 4 AM by default), same rule as the rest of the app
    const night = isNight() ? await q(`UPDATE offers SET status = 'ended', ends_at = least(ends_at, now())
                           WHERE status = 'live' AND category NOT IN ('stay', 'travel', 'logistics')`) : { rowCount: 0 };
    return { timeUp: timeUp.rowCount, closedAt11pm: night.rowCount, archived: await archiveEnded() };
  });

  // Every 10 minutes: full photos of offers that just ended are deleted (thumbnails stay until the offer is archived).
  schedule("drop-ended-photos", { every: 600000 }, async () => {
    const r = await q(`WITH ended AS (UPDATE offers SET has_photo = false WHERE has_photo AND (ends_at < now() OR status <> 'live') RETURNING id)
                       DELETE FROM offer_photos p USING ended WHERE p.offer_id = ended.id`);
    return { photosDeleted: r.rowCount };
  });

  // Nightly, 02:30 India time: archive anything left over, then delete old activity (DPDP retention).
  schedule("nightly-cleanup", { dailyIST: "02:30" }, async () => {
    const archived = await archiveEnded();
    const del = async (sql, days) => (await q(sql, [days])).rowCount;
    const ago = "now() - make_interval(days => $1)";
    return {
      archived,
      archiveDeleted: await del(`DELETE FROM offer_archive WHERE ends_at < ${ago}`, RETENTION.archiveDays),
      leadsDeleted: await del(`DELETE FROM leads WHERE created_at < ${ago}`, RETENTION.leadsDays),
      contactsDeleted: await del(`DELETE FROM customer_contacts WHERE at < ${ago}`, RETENTION.contactsDays),
      reportsDeleted: await del(`DELETE FROM reports WHERE status <> 'open' AND created_at < ${ago}`, RETENTION.reportsDays),
      auditDeleted: await del(`DELETE FROM audit_log WHERE at < ${ago}`, RETENTION.auditDays),
      consentDeleted: await del(`DELETE FROM consent_log c WHERE at < ${ago} AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id)`, RETENTION.auditDays),
      deletedAccountsDeleted: await del(`DELETE FROM deleted_accounts WHERE deleted_at < ${ago}`, RETENTION.auditDays),
      grievancesDeleted: await del(`DELETE FROM grievances WHERE status IN ('resolved', 'rejected') AND updated_at < ${ago}`, RETENTION.closedGrievanceDays),
      ratesDeleted: await del(`DELETE FROM rate_limits WHERE window_start < ${ago}`, 2),
      jobsDeleted: await del(`DELETE FROM jobs WHERE done_at < ${ago}`, 14),
    };
  });
}
