// Queries and shapes shared by several routes.
import { q } from "./db.js";
import { log } from "./log.js";
import { OWNER_ACTIVE_SQL } from "./plans.js";
import { CONSENT_VERSION, ms, num, precondition } from "./util.js";

// Consent is checked on the server, not only on screen: no number exchange, review or post without the current notice accepted.
export function needConsent(user, kind = "user") {
  const c = kind === "partner" ? user.partner_consent : user.consent;
  if (c?.version !== CONSENT_VERSION) {
    const e = precondition(kind === "partner"
      ? "Please accept the latest business terms in Business profile before posting."
      : "Please accept the latest privacy notice and terms to continue.");
    e.code = kind === "partner" ? "partner_consent_required" : "consent_required";
    throw e;
  }
}

// Audit log: number views and shares, offers, reviews, admin actions, exports, deletions. Kept 1 year.
export function audit(type, actor, data = {}) {
  return q("INSERT INTO audit_log (type, actor, data) VALUES ($1, $2, $3)", [type, actor || null, data])
    .catch((e) => log.error("audit failed", { error: e.message }));
}

// An offer is shown to customers when it's live, not past its end, its business is verified,
// and the business's free month or Business Pro plan is active (or the app is in free launch mode).
export const visibleSql = (free) => `(o.status = 'live' AND o.ends_at > now() AND b.status = 'verified' AND ${OWNER_ACTIVE_SQL("b", free)})`;

export const offerSelect = (free) => `
  o.id, o.owner_id, o.title, o.description, o.category, o.emoji, NULL::text AS photo_thumb, false AS has_photo,
  o.orig_price::float8 AS orig_price, o.price::float8 AS price, o.quantity, o.items, o.ends_at, o.status, o.views, o.created_at,
  b.name AS b_name, b.area AS b_area, b.city AS b_city, b.state AS b_state, b.city_key AS b_city_key, b.pincode AS b_pincode,
  b.lat AS b_lat, b.lng AS b_lng, b.rating_avg::float8 AS b_rating_avg, b.rating_count AS b_rating_count,
  ${visibleSql(free)} AS visible,
  EXISTS (SELECT 1 FROM offer_boosts x WHERE x.offer_id = o.id AND x.status = 'active' AND x.ends_at > now()) AS featured`;

export const mapOffer = (r) => ({
  id: r.id, businessId: r.owner_id, ownerId: r.owner_id,
  business: {
    id: r.owner_id, name: r.b_name, area: r.b_area, city: r.b_city, state: r.b_state, cityKey: r.b_city_key, pincode: r.b_pincode,
    lat: r.b_lat, lng: r.b_lng, rating: r.b_rating_count ? { avg: num(r.b_rating_avg), count: r.b_rating_count } : null,
  },
  title: r.title, description: r.description, category: r.category, emoji: r.emoji, photoUrl: r.photo_thumb || null, hasPhoto: r.has_photo,
  origPrice: num(r.orig_price), price: num(r.price), quantity: r.quantity, endsAt: ms(r.ends_at), status: r.status, items: r.items || [],
  visible: !!r.visible, views: r.views, createdAt: ms(r.created_at), featured: !!r.featured,
});

// Small copy of an offer kept with a customer's contact history (survives the offer being archived).
export const offerSummary = (o) => ({
  title: o.title, emoji: o.emoji, category: o.category, photoThumb: o.photoUrl || null, price: o.price, origPrice: o.origPrice,
  endsAt: o.endsAt, businessName: o.business.name, area: o.business.area, city: o.business.city,
});

export const mapReview = (r) => ({
  id: r.id, businessId: r.business_id, customerId: r.customer_id, name: r.name, rating: r.rating, text: r.text, offerTitle: r.offer_title,
  status: r.status, edited: r.edited, createdAt: ms(r.created_at), reply: r.reply_text ? { text: r.reply_text, at: ms(r.reply_at) } : null,
});

export const mapSub = (s) => s && ({
  plan: s.plan, status: s.status, currentPeriodEnd: ms(s.current_period_end), provider: s.provider,
  active: ["active", "cancelled"].includes(s.status) && !!s.current_period_end && new Date(s.current_period_end) > new Date(),
});

export const mapBusiness = (b) => b && ({
  id: b.id, ownerId: b.id, name: b.name, category: b.category, categories: b.categories?.length ? b.categories : [b.category || "other"],
  rating: b.rating_count ? { avg: num(b.rating_avg), count: b.rating_count } : null,
  about: b.about, address: b.address, area: b.area, city: b.city, state: b.state, pincode: b.pincode, lat: b.lat, lng: b.lng,
  status: b.status, statusNote: b.status_note, createdAt: ms(b.created_at), trialEndsAt: ms(b.trial_ends_at),
  phone: b.phone || "", whatsapp: b.whatsapp !== false,
});
