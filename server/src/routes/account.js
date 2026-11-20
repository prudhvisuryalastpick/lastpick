// Login (test accounts for now), profile, plans, consent, privacy rights and complaints. Served by every server.
import { combosOn } from "../settings.js";
import crypto from "node:crypto";
import { checkPassword, hashPassword, issueToken, needUser } from "../auth.js";
import { MAIL_FROM, SERVICE, SIGNUP } from "../config.js";
import { sendEmail } from "../mail.js";
import { many, one, q, tx } from "../db.js";
import { log } from "../log.js";
import { freeMode } from "../plans.js";
import { enqueue } from "../queue.js";
import { limit, overLimit } from "../ratelimit.js";
import { audit, mapSub } from "../shared.js";
import {
  ALWAYS_OPEN, BUSINESS_HOURS, CONSENT_VERSION, GRIEVANCE_TYPES, TRIAL_DAYS, bad, isNight, tooMany, denied, indianPhone, ms, normEmail, notFound, precondition, str, validEmail,
} from "../util.js";

const isStaff = (u) => u && ["admin", "moderator"].includes(u.role);
// "Android phone", "iPhone", "Windows computer"… shown to the user, never the full user-agent
function deviceName(ua = "") {
  const os = /Android/i.test(ua) ? "Android phone" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows computer"
    : /Macintosh/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux computer" : "device";
  const app = /LastPick|wv\)/i.test(ua) ? "app" : "browser";
  return `${os} (${app})`;
}

async function profile(id) {
  const u = await one("SELECT * FROM users WHERE id = $1", [id]);
  if (!u) throw notFound("Account not found");
  return {
    id: u.id, name: u.name, phone: u.phone, email: u.email || "", role: u.role, regions: u.regions || [], areaCities: u.area_cities || [], areaPincodes: u.area_pincodes || [],
    trialEndsAt: ms(u.trial_ends_at), consentVersion: u.consent?.version || null, partnerConsentVersion: u.partner_consent?.version || null,
    needsProfile: !u.name, lastLoginAt: ms(u.last_login_at), lastLoginDevice: u.last_login_device || "",
  };
}

async function recordConsent(client, uid, body, userAgent) {
  const kind = body?.kind === "partner" ? "partner" : "user";
  if (body?.version !== CONSENT_VERSION) throw precondition("Please update the app to see the latest privacy notice");
  if (kind === "user" && body?.adult !== true) throw bad("You must be 18 or older to use LastPick");
  const items = Array.isArray(body?.items) ? body.items.map((x) => str(x, 60)).filter(Boolean).slice(0, 10) : [];
  await client.query("INSERT INTO consent_log (user_id, kind, version, items, user_agent) VALUES ($1, $2, $3, $4, $5)", [uid, kind, CONSENT_VERSION, items, userAgent]);
  await client.query(`UPDATE users SET ${kind === "partner" ? "partner_consent" : "consent"} = $2, updated_at = now() WHERE id = $1`,
    [uid, { version: CONSENT_VERSION, at: new Date().toISOString() }]);
}

export function accountRoutes(r) {
  // ---------- login ----------
  r.post("/api/auth/login", async ({ body, ip, userAgent }) => {
    const email = normEmail(body.email);
    if (!validEmail(email) || typeof body.password !== "string") throw bad("Wrong email or password");
    // only wrong passwords count: 10 per account or 30 per network in 15 minutes, then a 15-minute lockout
    const busy = "Too many wrong attempts. Try again in 15 minutes";
    if ((await overLimit("email:" + email, "loginFail", 10, 900)) || (await overLimit("ip:" + ip, "loginFail", 30, 900))) throw tooMany(busy);
    const u = await one("SELECT id, email, role, password_hash, token_version FROM users WHERE lower(email) = $1", [email]);
    const ok = await checkPassword(body.password, u?.password_hash);
    if (!u || !ok) {
      await limit("email:" + email, "loginFail", 10, 900, busy);
      await limit("ip:" + ip, "loginFail", 30, 900, busy);
      throw bad("Wrong email or password");
    }
    // the admin server lets only admins and moderators in
    if (SERVICE === "admin" && !isStaff(u)) throw denied("This account has no admin access");
    // one device at a time: this login signs out every other device
    const device = deviceName(userAgent);
    const fresh = await one(`UPDATE users SET token_version = token_version + 1, last_login_at = now(), last_login_device = $2
                             WHERE id = $1 RETURNING id, token_version`, [u.id, device]);
    audit("login", u.id, { service: SERVICE, device });
    return { token: issueToken(fresh), user: { id: u.id, email: u.email } };
  }, { limit: "auth" });

  // ---------- e-mail one-time codes (sign-up verification) ----------
  const codeHash = (email, code) => crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
  const checkCode = async (email, code) => {
    const row = await one("UPDATE otp_codes SET attempts = attempts + 1 WHERE email = $1 RETURNING code_hash, expires_at, attempts", [email]);
    if (!row || new Date(row.expires_at) < new Date()) throw bad("The code has expired. Ask for a new one.");
    if (row.attempts > 5) throw bad("Too many wrong tries. Ask for a new code.");
    const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(codeHash(email, String(code || "").trim())));
    if (!ok) throw bad("That code is not right. Please check the e-mail and try again.");
    await q("DELETE FROM otp_codes WHERE email = $1", [email]);
  };
  r.post("/api/auth/otp/send", async ({ body, ip }) => {
    if (!MAIL_FROM) throw precondition("E-mail codes aren't switched on yet.");
    const email = normEmail(body.email);
    if (!validEmail(email)) throw bad("Please enter a valid email");
    await limit("ip:" + ip, "otp", 10, 3600);
    await limit("email:" + email, "otp", 5, 3600, "Too many codes for this e-mail. Try again in an hour.");
    const code = String(crypto.randomInt(100000, 1000000));
    await q(`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
             ON CONFLICT (email) DO UPDATE SET code_hash = $2, expires_at = now() + interval '10 minutes', attempts = 0, created_at = now()`,
      [email, codeHash(email, code)]);
    await sendEmail(email, `${code} is your LastPick code`,
      `Your LastPick verification code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this e-mail.`);
    return { sent: true };
  }, { limit: "auth" });

  r.post("/api/auth/signup", async ({ body, ip, userAgent }) => {
    if (SERVICE === "admin") throw denied("Admin accounts are created by another admin");
    if (SIGNUP === "closed") throw denied("Sign-up opens soon. Please use a test account.");
    const email = normEmail(body.email);
    const name = str(body.name, 80);
    const phone = indianPhone(body.phone);
    if (!validEmail(email)) throw bad("Please enter a valid email");
    if (typeof body.password !== "string" || body.password.length < 8) throw bad("Password must be at least 8 characters");
    if (name.length < 2) throw bad("Please enter your name");
    if (body.phone && !phone) throw bad("Please enter a valid Indian mobile number");
    await limit("ip:" + ip, "signup", 10, 3600);
    if (MAIL_FROM) await checkCode(email, body.otp); // e-mail must be verified with a one-time code
    const hash = await hashPassword(body.password);
    const u = await tx(async (c) => {
      const dup = await c.query("SELECT 1 FROM users WHERE lower(email) = $1", [email]);
      if (dup.rows.length) throw precondition("An account with this email already exists");
      if (phone) {
        const dupPhone = await c.query("SELECT 1 FROM users WHERE phone = $1", [phone]);
        if (dupPhone.rows.length) throw precondition("This mobile number is already registered. Log in instead.");
      }
      const { rows } = await c.query(
        `INSERT INTO users (email, password_hash, name, phone, trial_ends_at) VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
         RETURNING id, email, token_version`, [email, hash, name, phone || "", TRIAL_DAYS]);
      if (body.consent) await recordConsent(c, rows[0].id, { kind: "user", version: CONSENT_VERSION, ...body.consent }, userAgent);
      return rows[0];
    });
    audit("signup", u.id, { service: SERVICE });
    return { token: issueToken(u), user: { id: u.id, email: u.email } };
  }, { limit: "auth" });

  // log out on every device (the app forgets its own token on normal log out)
  r.post("/api/auth/logout-all", async (ctx) => {
    const u = needUser(ctx);
    await q("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [u.id]);
  });

  // SMS codes and password reset come later.
  const later = async () => { throw precondition("One-time codes aren't switched on yet. Please log in with e-mail and password."); };
  r.post("/api/auth/otp/verify", later, { limit: "auth" });
  r.post("/api/auth/reset", async () => { throw precondition("Password reset isn't switched on yet. Please contact support."); }, { limit: "auth" });

  // ---------- profile ----------
  r.get("/api/me", async (ctx) => profile(needUser(ctx).id));
  r.patch("/api/me", async (ctx) => {
    const u = needUser(ctx);
    const name = str(ctx.body.name, 80);
    const phone = indianPhone(ctx.body.phone);
    if (name.length < 2) throw bad("Please enter your name");
    if (ctx.body.phone && !phone) throw bad("Please enter a valid Indian mobile number");
    await q("UPDATE users SET name = $2, phone = $3, updated_at = now() WHERE id = $1", [u.id, name, phone || ""]);
    return profile(u.id);
  });
  r.post("/api/me/complete-profile", async (ctx) => {
    const u = needUser(ctx);
    const name = str(ctx.body.name, 80);
    if (name.length < 2) throw bad("Please enter your name");
    await tx(async (c) => {
      await c.query("UPDATE users SET name = $2, phone = COALESCE(NULLIF($3, ''), phone), updated_at = now() WHERE id = $1", [u.id, name, indianPhone(ctx.body.phone) || ""]);
      if (ctx.body.consent) await recordConsent(c, u.id, { kind: "user", version: CONSENT_VERSION, ...ctx.body.consent }, ctx.userAgent);
    });
    return profile(u.id);
  });

  // ---------- plans ----------
  r.get("/api/me/subscriptions", async (ctx) => {
    const u = needUser(ctx);
    const rows = await many("SELECT * FROM subscriptions WHERE user_id = $1", [u.id]);
    return { customer: mapSub(rows.find((s) => s.plan === "customer")) || null, owner: mapSub(rows.find((s) => s.plan === "owner")) || null };
  });
  // Online payments are on hold; admins switch plans on by hand in Admin -> Businesses / Plans.
  r.post("/api/billing", async (ctx) => {
    needUser(ctx);
    if (await freeMode()) throw precondition("LastPick is free during launch. No payment is needed.");
    throw precondition("Online payments are not set up yet. Please contact support.");
  });
  r.get("/api/config", async () => ({
    freeMode: await freeMode(), night: isNight(), hours: BUSINESS_HOURS, alwaysOpen: ALWAYS_OPEN, combos: await combosOn(),
  }), { cache: "public, max-age=15" });

  // ---------- consent ----------
  r.post("/api/consent", async (ctx) => {
    const u = needUser(ctx);
    await tx((c) => recordConsent(c, u.id, ctx.body, ctx.userAgent));
    return { ok: true, version: CONSENT_VERSION };
  });

  // ---------- privacy rights (DPDP Act 2023) ----------
  r.get("/api/privacy/export", async (ctx) => {
    const u = needUser(ctx);
    await limit(u.id, "export", 5, 86400);
    const id = u.id;
    const [profileRow, business, contact, subscriptions, offers, offerHistory, contacts, numbersShared, leadsReceived, reviewsWritten, reviewsOfMyBusiness, grievances, consents] = await Promise.all([
      one("SELECT id, email, name, phone, role, regions, area_cities, area_pincodes, trial_ends_at, consent, partner_consent, created_at FROM users WHERE id = $1", [id]),
      one("SELECT * FROM businesses WHERE id = $1", [id]),
      one("SELECT phone, whatsapp, updated_at FROM business_contacts WHERE business_id = $1", [id]),
      many("SELECT plan, status, current_period_end, provider, updated_at FROM subscriptions WHERE user_id = $1", [id]),
      many("SELECT id, title, description, category, orig_price, price, quantity, ends_at, status, views, created_at FROM offers WHERE owner_id = $1", [id]),
      many("SELECT * FROM offer_archive WHERE owner_id = $1", [id]),
      many("SELECT offer_id, business_id, how, at, offer - 'photoThumb' AS offer FROM customer_contacts WHERE customer_id = $1", [id]),
      many("SELECT offer_id, owner_id, name, phone, offer_title, status, created_at FROM leads WHERE customer_id = $1", [id]),
      many("SELECT offer_id, customer_id, name, phone, offer_title, status, created_at FROM leads WHERE owner_id = $1", [id]),
      many("SELECT business_id, rating, text, offer_title, status, reply_text, created_at, updated_at FROM reviews WHERE customer_id = $1", [id]),
      many("SELECT customer_id, name, rating, text, status, reply_text, created_at FROM reviews WHERE business_id = $1", [id]),
      many("SELECT ticket, type, subject, details, status, reply, created_at, updated_at FROM grievances WHERE user_id = $1", [id]),
      many("SELECT kind, version, items, at FROM consent_log WHERE user_id = $1", [id]),
    ]);
    audit("data_export", id);
    return {
      exportedAt: new Date().toISOString(), app: "LastPick", account: { uid: id, email: profileRow?.email || "" },
      profile: profileRow, business, businessContact: contact, subscriptions, offers, offerHistory, contacts, numbersShared,
      leadsReceived, reviewsWritten, reviewsOfMyBusiness, grievances, consents,
    };
  });

  // Delete my account. The login stops working at once; the queue removes everything else.
  r.post("/api/privacy/delete", async (ctx) => {
    const u = needUser(ctx);
    if (ctx.body.confirm !== "DELETE") throw bad("Type DELETE to confirm");
    if (isStaff(u)) throw precondition("Staff accounts must have their admin role removed by another admin before they can be deleted");
    await tx(async (c) => {
      const biz = await c.query("SELECT 1 FROM businesses WHERE id = $1", [u.id]);
      await c.query("INSERT INTO deleted_accounts (user_id, email_hash, had_business) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING",
        [u.id, crypto.createHash("sha256").update(String(u.email || "").toLowerCase()).digest("hex"), biz.rows.length > 0]);
      await c.query("UPDATE businesses SET status = 'suspended', status_note = 'Account deleted' WHERE id = $1", [u.id]);
      await c.query("UPDATE users SET token_version = token_version + 1, email = NULL, password_hash = NULL WHERE id = $1", [u.id]);
      await enqueue("purge_user", { uid: u.id }, { client: c, delaySec: 5 });
    });
    audit("account_deleted", u.id);
    return { ok: true };
  });

  // ---------- complaints (IT Rules 2021, Consumer Protection (E-Commerce) Rules 2020) ----------
  r.post("/api/grievances", async (ctx) => {
    const u = needUser(ctx);
    await limit(u.id, "grievance", 5, 86400);
    const subject = str(ctx.body.subject, 120), details = str(ctx.body.details, 2000);
    const type = GRIEVANCE_TYPES.includes(ctx.body.type) ? ctx.body.type : "Something else";
    if (subject.length < 3 || details.length < 10) throw bad("Please add a subject and some details");
    const ticket = "LP" + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomInt(10, 99);
    await q(`INSERT INTO grievances (ticket, user_id, email, type, subject, details, ack_due, resolve_due)
             VALUES ($1, $2, $3, $4, $5, $6, now() + interval '1 day', now() + interval '15 days')`, [ticket, u.id, u.email || "", type, subject, details]);
    audit("grievance", u.id, { ticket });
    return { ticket };
  });
  r.get("/api/grievances/mine", async (ctx) => {
    const u = needUser(ctx);
    const rows = await many("SELECT * FROM grievances WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [u.id]);
    return rows.map((g) => ({ ticket: g.ticket, type: g.type, subject: g.subject, details: g.details, status: g.status, reply: g.reply, createdAt: ms(g.created_at), updatedAt: ms(g.updated_at) }));
  });

  // ---------- crash reports from the apps ----------
  r.post("/api/client-error", async (ctx) => {
    await limit("ip:" + ctx.ip, "clientError", 20, 3600);
    const d = ctx.body || {};
    log.error("client error", { source: "client", message: str(d.message, 500), stack: str(d.stack, 3000), url: str(d.url, 300), app: str(d.app, 20), version: str(d.version, 20), uid: ctx.user?.id || null });
  });
}
