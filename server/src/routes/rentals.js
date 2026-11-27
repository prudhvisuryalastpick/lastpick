// Rentals: homes and workspaces for rent or lease. An owner (a partner registered as "rentals") posts a listing
// for 15 days (₹249) or 30 days (₹499), paid per listing on the website (free while free launch mode is on).
// Up to 5 photos (each under 1 MB) and one video (up to 1 minute, 20 MB) go straight from the phone to R2.
// "Rented out" / "Leased out" or the end date hides it at once; photos and video are deleted 7 days later.
import { needUser } from "../auth.js";
import { clearCache } from "../cache.js";
import { many, one, q, tx } from "../db.js";
import { freeMode } from "../plans.js";
import { limit } from "../ratelimit.js";
import { audit } from "../shared.js";
import { R2_ON, deleteFile, fileUrl, newKey, objectSize, saveFile, uploadUrl } from "../storage.js";
import { bad, denied, isDataImage, ms, needUuid, notFound, precondition, str } from "../util.js";

export const RENTAL_PACKS = [{ days: 15, price: 249 }, { days: 30, price: 499 }];
export const RENTAL_TYPES = {
  home: ["1RK", "1BHK", "2BHK", "3BHK", "4BHK+", "Independent house", "Villa", "PG / Hostel"],
  work: ["Office space", "Coworking desk", "Private cabin", "Library / study hall", "Shop / showroom", "Godown", "Event hall"],
};
export const RENTAL_AMENITIES = {
  home: ["Wi-Fi", "Parking", "Power backup", "Lift", "Water 24x7", "Security", "Gated", "Pets OK"],
  work: ["Wi-Fi", "AC", "Power backup", "Parking", "Washroom", "Pantry", "CCTV", "Meeting room", "Lockers", "24x7 access"],
};
const FURNISHING = ["furnished", "semi", "unfurnished"];
const TENANT = ["family", "bachelors", "anyone"];
export const MAX_PHOTOS = 5, PHOTO_BYTES = 1_000_000, VIDEO_BYTES = 20_000_000;
const MEDIA_KEEP_DAYS = 7;

const int = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n <= max ? n : null; };

async function media(listingId, signed = true) {
  const rows = await many("SELECT id, kind, key, position FROM rental_media WHERE listing_id = $1 AND ready ORDER BY kind, position, created_at", [listingId]);
  const out = { photos: [], video: null };
  for (const m of rows) {
    const url = signed ? await fileUrl(m.key.startsWith("db:") ? m.key : "r2:" + m.key, 3 * 3600) : null;
    if (m.kind === "photo") out.photos.push({ id: m.id, url });
    else out.video = { id: m.id, url };
  }
  return out;
}

function mapListing(l, extra = {}) {
  return {
    id: l.id, kind: l.kind, type: l.type, furnishing: l.furnishing, tenant: l.tenant, rent: l.rent, deposit: l.deposit, size: l.size,
    dayPass: l.day_pass, minLease: l.min_lease, availableFrom: l.available_from, hours: l.hours, about: l.about, amenities: l.amenities,
    area: l.area, city: l.city, state: l.state, pincode: l.pincode, lat: l.lat, lng: l.lng,
    status: l.status, closedReason: l.closed_reason, days: l.days, startsAt: ms(l.starts_at), endsAt: ms(l.ends_at), closedAt: ms(l.closed_at),
    mediaDeleted: !!l.media_deleted_at, views: l.views, calls: l.calls, createdAt: ms(l.created_at),
    ...(l.distance_km != null ? { km: Math.round(l.distance_km * 10) / 10 } : {}),
    ...extra,
  };
}

// fields from the owner's form, checked
function fields(b) {
  const kind = b.kind === "work" ? "work" : "home";
  const type = RENTAL_TYPES[kind].includes(b.type) ? b.type : null;
  if (!type) throw bad("Pick the type");
  const rent = int(b.rent, 10_000_000);
  if (!rent) throw bad("Enter the rent");
  return {
    kind, type,
    furnishing: kind === "home" && FURNISHING.includes(b.furnishing) ? b.furnishing : null,
    tenant: kind === "home" && TENANT.includes(b.tenant) ? b.tenant : null,
    rent, deposit: int(b.deposit, 100_000_000), size: int(b.size, 10_000_000),
    day_pass: kind === "work" ? int(b.dayPass, 100_000) : null,
    min_lease: str(b.minLease, 40) || null, available_from: str(b.availableFrom, 40) || null, hours: str(b.hours, 60) || null,
    about: str(b.about, 1000),
    amenities: [...new Set((Array.isArray(b.amenities) ? b.amenities : []).filter((a) => RENTAL_AMENITIES[kind].includes(a)))],
  };
}

async function ownListing(ctx) {
  const u = needUser(ctx);
  const id = needUuid(ctx.params.id, "listing");
  const l = await one("SELECT * FROM rental_listings WHERE id = $1", [id]);
  if (!l || l.owner_id !== u.id) throw notFound("Listing not found");
  return { u, l };
}

// Puts a listing live for `days` (or extends a live one), from today (Day 1) till 11:59 PM India time on the last day.
export async function activateListing(run, listingId, days) {
  await run(`UPDATE rental_listings SET status = 'live', days = $2, closed_reason = NULL, closed_at = NULL, updated_at = now(),
               starts_at = CASE WHEN status = 'live' AND ends_at > now() THEN starts_at ELSE now() END,
               ends_at = CASE WHEN status = 'live' AND ends_at > now() THEN lp_ist_day_end(ends_at) + make_interval(days => $2)
                              ELSE lp_ist_day_end(now()) + make_interval(days => $2 - 1) END
             WHERE id = $1`, [listingId, days]);
}

export function rentalOwnerRoutes(r) {
  r.get("/api/owner/rentals", async (ctx) => {
    const u = needUser(ctx);
    const rows = await many("SELECT * FROM rental_listings WHERE owner_id = $1 AND status <> 'removed' ORDER BY created_at DESC LIMIT 100", [u.id]);
    const out = [];
    for (const l of rows) {
      const cover = l.media_deleted_at ? null : await one("SELECT key FROM rental_media WHERE listing_id = $1 AND kind = 'photo' AND ready ORDER BY position LIMIT 1", [l.id]);
      out.push(mapListing(l, { cover: cover ? await fileUrl(cover.key.startsWith("db:") ? cover.key : "r2:" + cover.key, 3600) : null }));
    }
    return out;
  });

  r.get("/api/owner/rentals/:id", async (ctx) => {
    const { l } = await ownListing(ctx);
    return mapListing(l, await media(l.id));
  });

  // a new listing (a draft until it's paid for, or published free in free launch mode)
  r.post("/api/owner/rentals", async (ctx) => {
    const u = needUser(ctx);
    const b = await one("SELECT category, categories, status, area, city, state, pincode, lat, lng FROM businesses WHERE id = $1", [u.id]);
    if (!b) throw precondition("Register as a partner first.");
    if (!(b.categories || [b.category]).includes("rentals")) throw precondition("Rentals are for partners registered for Rentals (homes and workspaces).");
    if (b.lat == null || !b.pincode) throw precondition("Add your location and pincode in Business profile first.");
    await limit(u.id, "rentalCreate", 20, 86400);
    const f = fields(ctx.body || {});
    const cols = Object.keys(f);
    const l = await one(`INSERT INTO rental_listings (owner_id, ${cols.join(", ")}, area, city, state, pincode, lat, lng)
                         VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, $${cols.length + 2}, $${cols.length + 3}, $${cols.length + 4}, $${cols.length + 5}, $${cols.length + 6}, $${cols.length + 7})
                         RETURNING *`, [u.id, ...cols.map((c) => f[c]), b.area, b.city, b.state, b.pincode, b.lat, b.lng]);
    audit("rental_created", u.id, { listingId: l.id, kind: f.kind, type: f.type });
    return mapListing(l, { photos: [], video: null });
  });

  r.put("/api/owner/rentals/:id", async (ctx) => {
    const { l } = await ownListing(ctx);
    if (!["draft", "live"].includes(l.status)) throw precondition("This listing has ended. Reopen or renew it first.");
    const f = fields(ctx.body || {});
    const cols = Object.keys(f);
    const row = await one(`UPDATE rental_listings SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`, [l.id, ...cols.map((c) => f[c])]);
    clearCache("rentals:");
    return mapListing(row, await media(l.id));
  });

  // 1. ask to add a photo or the video: with R2 the phone gets a link to upload straight to R2
  r.post("/api/owner/rentals/:id/media", async (ctx) => {
    const { u, l } = await ownListing(ctx);
    if (l.media_deleted_at) throw precondition("This listing's photos were deleted. Post a new listing.");
    const kind = ctx.body?.kind === "video" ? "video" : "photo";
    const bytes = Number(ctx.body?.bytes || 0);
    const type = String(ctx.body?.type || "");
    if (kind === "photo" && !/^image\/(jpeg|png|webp)$/.test(type)) throw bad("Choose a JPEG, PNG or WebP photo");
    if (kind === "video" && !/^video\/(mp4|webm|quicktime|3gpp)$/.test(type)) throw bad("Choose an MP4 video");
    if (kind === "photo" && !(bytes > 0 && bytes <= PHOTO_BYTES)) throw bad("Each photo must be under 1 MB");
    if (kind === "video" && !(bytes > 0 && bytes <= VIDEO_BYTES)) throw bad("The video must be under 20 MB and 1 minute. Shorten or compress it first.");
    const n = (await one("SELECT count(*)::int AS n FROM rental_media WHERE listing_id = $1 AND kind = $2", [l.id, kind])).n;
    if (kind === "photo" && n >= MAX_PHOTOS) throw precondition(`Up to ${MAX_PHOTOS} photos. Remove one first.`);
    if (kind === "video" && n >= 1) throw precondition("One video per listing. Remove the old one first.");
    await limit(u.id, "rentalMedia", 60, 3600);
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/3gpp": "3gp" }[type];
    const key = `rentals/${l.id}/${newKey(kind, ext)}`;
    const m = await one("INSERT INTO rental_media (listing_id, kind, key, position, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING id", [l.id, kind, key, n, bytes]);
    return { mediaId: m.id, uploadUrl: R2_ON ? uploadUrl(key) : null, contentType: type };
  });

  // 2a. without R2 (tests, local runs): the photo itself, as a data URL
  r.post("/api/owner/rentals/:id/media/:mid/data", async (ctx) => {
    const { l } = await ownListing(ctx);
    const m = await one("SELECT * FROM rental_media WHERE id = $1 AND listing_id = $2", [needUuid(ctx.params.mid, "media"), l.id]);
    if (!m) throw notFound("Upload not found");
    if (R2_ON) throw precondition("Upload with the link instead");
    if (!isDataImage(ctx.body?.data, Math.ceil(PHOTO_BYTES * 1.37))) throw bad("Each photo must be under 1 MB");
    const ref = await saveFile(m.key, ctx.body.data);
    await q("UPDATE rental_media SET key = $2, ready = true WHERE id = $1", [m.id, ref]);
    return media(l.id);
  });

  // 2b. after the phone uploaded to R2: check the file is there and within the limit
  r.post("/api/owner/rentals/:id/media/:mid/done", async (ctx) => {
    const { l } = await ownListing(ctx);
    const m = await one("SELECT * FROM rental_media WHERE id = $1 AND listing_id = $2", [needUuid(ctx.params.mid, "media"), l.id]);
    if (!m) throw notFound("Upload not found");
    const size = await objectSize(m.key);
    const max = m.kind === "video" ? VIDEO_BYTES : PHOTO_BYTES;
    if (size == null) throw precondition("The upload didn't finish. Please try again.");
    if (size > max) { await deleteFile("r2:" + m.key).catch(() => {}); await q("DELETE FROM rental_media WHERE id = $1", [m.id]); throw bad(m.kind === "video" ? "The video is over 20 MB. Compress it first." : "The photo is over 1 MB."); }
    await q("UPDATE rental_media SET ready = true, bytes = $2 WHERE id = $1", [m.id, size]);
    clearCache("rentals:");
    return media(l.id);
  });

  r.post("/api/owner/rentals/:id/media/:mid/remove", async (ctx) => {
    const { l } = await ownListing(ctx);
    const m = await one("DELETE FROM rental_media WHERE id = $1 AND listing_id = $2 RETURNING key", [needUuid(ctx.params.mid, "media"), l.id]);
    if (m) await deleteFile(m.key.startsWith("db:") ? m.key : "r2:" + m.key).catch(() => {});
    // keep photo order 0..n
    await q(`UPDATE rental_media x SET position = y.p FROM (SELECT id, row_number() OVER (ORDER BY position, created_at) - 1 AS p FROM rental_media WHERE listing_id = $1 AND kind = 'photo') y WHERE x.id = y.id`, [l.id]);
    clearCache("rentals:");
    return media(l.id);
  });

  // publish (or renew) for 15 or 30 days: free in free launch mode, else paid on the website (Razorpay)
  r.post("/api/owner/rentals/:id/publish", async (ctx) => {
    const { u, l } = await ownListing(ctx);
    const days = Number(ctx.body?.days);
    const pack = RENTAL_PACKS.find((p) => p.days === days);
    if (!pack) throw bad("Pick 15 or 30 days");
    if (l.media_deleted_at) throw precondition("This listing's photos were deleted. Post a new listing.");
    const photos = (await one("SELECT count(*)::int AS n FROM rental_media WHERE listing_id = $1 AND kind = 'photo' AND ready", [l.id])).n;
    if (!photos) throw precondition("Add at least one photo first.");
    const biz = await one("SELECT status FROM businesses WHERE id = $1", [u.id]);
    if (biz?.status !== "verified") throw precondition("Your listing can go live once we verify your account (KYC).");
    if (await freeMode()) {
      await activateListing((sql, p) => q(sql, p), l.id, days);
      audit("rental_published", u.id, { listingId: l.id, days, free: true });
      clearCache("rentals:");
      return { live: true, free: true, listing: mapListing(await one("SELECT * FROM rental_listings WHERE id = $1", [l.id])) };
    }
    return { live: false, pay: { plan: "rental", listingId: l.id, days, price: pack.price } };
  });

  // "Rented out" / "Leased out": hidden at once; photos and video are deleted after 7 days
  r.post("/api/owner/rentals/:id/close", async (ctx) => {
    const { u, l } = await ownListing(ctx);
    if (l.status !== "live" && l.status !== "draft") return mapListing(l);
    const reason = l.kind === "work" ? "leased" : "rented";
    const row = await one("UPDATE rental_listings SET status = 'closed', closed_reason = $2, closed_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [l.id, l.status === "draft" ? "removed" : reason]);
    audit("rental_closed", u.id, { listingId: l.id, reason });
    clearCache("rentals:");
    return mapListing(row);
  });

  // undo within 7 days (only while its paid days haven't run out)
  r.post("/api/owner/rentals/:id/reopen", async (ctx) => {
    const { l } = await ownListing(ctx);
    if (l.status !== "closed" || l.media_deleted_at) throw precondition("This listing can't be reopened. Post it again.");
    if (!l.ends_at || new Date(l.ends_at) <= new Date()) throw precondition("Its days have run out. Renew it instead.");
    const row = await one("UPDATE rental_listings SET status = 'live', closed_reason = NULL, closed_at = NULL, updated_at = now() WHERE id = $1 RETURNING *", [l.id]);
    clearCache("rentals:");
    return mapListing(row);
  });

  r.post("/api/owner/rentals/:id/remove", async (ctx) => {
    const { l } = await ownListing(ctx);
    await q("UPDATE rental_listings SET status = 'removed', closed_reason = 'removed', closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = $1", [l.id]);
    clearCache("rentals:");
    return { removed: true };
  });
}

export function rentalCustomerRoutes(r) {
  // live listings within 30 km: ?lat=&lng=&kind=home|work&type=&max=
  r.get("/api/rentals", async ({ query }) => {
    const lat = Math.round(Number(query.lat) * 100) / 100, lng = Math.round(Number(query.lng) * 100) / 100;
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || query.lat == null) throw bad("Bad location");
    const km = 30, kind = query.kind === "work" ? "work" : "home";
    const dLat = km / 111.2, dLng = km / (111.2 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    const dist = "2 * 6371 * asin(sqrt(power(sin(radians(l.lat - $5) / 2), 2) + cos(radians($5)) * cos(radians(l.lat)) * power(sin(radians(l.lng - $6) / 2), 2)))";
    const rows = await many(
      `SELECT l.*, ${dist} AS distance_km,
              (SELECT key FROM rental_media m WHERE m.listing_id = l.id AND m.kind = 'photo' AND m.ready ORDER BY position LIMIT 1) AS cover_key,
              EXISTS (SELECT 1 FROM rental_media m WHERE m.listing_id = l.id AND m.kind = 'video' AND m.ready) AS has_video,
              (SELECT count(*) FROM rental_media m WHERE m.listing_id = l.id AND m.kind = 'photo' AND m.ready)::int AS photo_count
       FROM rental_listings l
       WHERE l.status = 'live' AND l.ends_at > now() AND l.kind = $8
         AND l.lat BETWEEN $1 AND $2 AND l.lng BETWEEN $3 AND $4 AND ${dist} <= $7
       ORDER BY distance_km LIMIT 200`, [lat - dLat, lat + dLat, lng - dLng, lng + dLng, lat, lng, km, kind]);
    const out = [];
    for (const l of rows) {
      out.push(mapListing(l, { cover: l.cover_key ? await fileUrl(l.cover_key.startsWith("db:") ? l.cover_key : "r2:" + l.cover_key, 3 * 3600) : null, hasVideo: l.has_video, photoCount: l.photo_count }));
    }
    return out;
  });

  r.get("/api/rentals/:id", async (ctx) => {
    const id = needUuid(ctx.params.id, "listing");
    const l = await one("SELECT * FROM rental_listings WHERE id = $1 AND status = 'live' AND ends_at > now()", [id]);
    if (!l) throw notFound("This listing has ended");
    q("UPDATE rental_listings SET views = views + 1 WHERE id = $1", [id]).catch(() => {});
    const biz = await one("SELECT name FROM businesses WHERE id = $1", [l.owner_id]);
    return mapListing(l, { ...(await media(l.id)), owner: biz?.name || "Owner" });
  });

  // the owner's number, for logged-in customers (counts a call)
  r.post("/api/rentals/:id/contact", async (ctx) => {
    const u = needUser(ctx);
    const id = needUuid(ctx.params.id, "listing");
    const l = await one("SELECT owner_id FROM rental_listings WHERE id = $1 AND status = 'live' AND ends_at > now()", [id]);
    if (!l) throw notFound("This listing has ended");
    if (l.owner_id === u.id) throw denied("This is your own listing");
    await limit(u.id, "rentalContact", 60, 86400);
    const c = await one("SELECT phone, whatsapp FROM business_contacts WHERE business_id = $1", [l.owner_id]);
    await q("UPDATE rental_listings SET calls = calls + 1 WHERE id = $1", [id]);
    audit("rental_contact", u.id, { listingId: id });
    return { phone: c?.phone || null, whatsapp: c?.whatsapp !== false };
  });
}

// background: end listings whose days ran out; delete photos/video 7 days after a listing ended
export async function expireRentals() {
  await q("UPDATE rental_listings SET status = 'expired', closed_reason = 'expired', closed_at = now() WHERE status = 'live' AND ends_at <= now()");
  const old = await many(`SELECT id FROM rental_listings WHERE status IN ('closed', 'expired', 'removed') AND media_deleted_at IS NULL
                          AND closed_at < now() - make_interval(days => $1) LIMIT 200`, [MEDIA_KEEP_DAYS]);
  for (const { id } of old) {
    const files = await many("SELECT key FROM rental_media WHERE listing_id = $1", [id]);
    for (const f of files) await deleteFile(f.key.startsWith("db:") ? f.key : "r2:" + f.key).catch(() => {});
    await tx(async (c) => {
      await c.query("DELETE FROM rental_media WHERE listing_id = $1", [id]);
      await c.query("UPDATE rental_listings SET media_deleted_at = now() WHERE id = $1", [id]);
    });
  }
  return old.length;
}
