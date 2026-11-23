// Login (test accounts for now), profile, plans, consent, privacy rights and complaints. Served by every server.
import { Buffer } from "node:buffer";
import { singleDeviceOn } from "../settings.js";
import { notify } from "../notify.js";
import crypto from "node:crypto";
import { checkPassword, hashPassword, issueToken, needUser } from "../auth.js";
import { MAIL_FROM, SERVICE, SIGNUP, SMS_SENDER, WA_DAILY_CAP, WA_LOGIN, WA_VERIFY } from "../config.js";
import { mailProvider, sendEmail, sendSms } from "../mail.js";
import { sendWhatsAppCode, whatsappOn } from "../whatsapp.js";
// WhatsApp login is kept but only used when WA_LOGIN=on (and the WhatsApp keys are set)
const waLogin = () => WA_LOGIN && whatsappOn();
// how the mobile number is checked at sign-up: a WhatsApp code (WA_VERIFY=on), an SMS code (SMS_SENDER), or not at all
const phoneChannel = () => (WA_VERIFY && whatsappOn() ? "whatsapp" : SMS_SENDER ? "sms" : "");
const PHOTO_MAX = 400_000; // data URL characters (~300 KB)
import { many, one, q, tx } from "../db.js";
import { log } from "../log.js";
import { freeMode } from "../plans.js";
import { enqueue } from "../queue.js";
import { limit, overLimit } from "../ratelimit.js";
import { audit, mapSub } from "../shared.js";
import {
  ALWAYS_OPEN, BUSINESS_HOURS, CONSENT_VERSION, GRIEVANCE_TYPES, TRIAL_DAYS, bad, isNight, tooMany, denied, indianPhone, maskEmail, maskPhone, mobileProblem, ms, normEmail, notFound, precondition, str, validEmail, isDataImage,
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
    phoneVerified: !!u.phone_verified_at, needsProfile: !u.name, lastLoginAt: ms(u.last_login_at), lastLoginDevice: u.last_login_device || "",
    hasPhoto: !!(await one("SELECT 1 FROM user_photos WHERE user_id = $1", [id])),
  };
}

// Records an acceptance of the Terms. The person must have scrolled through the whole document (readFull), and the
// exact text they saw is stored (once per text, by its SHA-256 fingerprint) with time, device and network address.
async function recordConsent(client, uid, body, userAgent, ip = "") {
  const kind = body?.kind === "partner" ? "partner" : "user";
  if (body?.version !== CONSENT_VERSION) throw precondition("Please update the app to see the latest Terms and Conditions");
  if (kind === "user" && body?.adult !== true) throw bad("You must be 18 or older to use LastPick");
  if (body?.readFull !== true) throw bad("Please read the whole Terms and Conditions (scroll to the end) before agreeing");
  const text = typeof body?.docText === "string" ? body.docText : "";
  if (!text || text.length > 200000 || !text.includes(`Version ${CONSENT_VERSION}`)) throw bad("Please update the app to see the latest Terms and Conditions");
  const hash = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  if (body?.docHash && body.docHash !== hash) throw bad("The Terms didn't arrive complete. Please try again.");
  const items = Array.isArray(body?.items) ? body.items.map((x) => str(x, 60)).filter(Boolean).slice(0, 10) : [];
  await client.query("INSERT INTO consent_documents (hash, version, text) VALUES ($1, $2, $3) ON CONFLICT (hash) DO NOTHING", [hash, CONSENT_VERSION, text]);
  await client.query("INSERT INTO consent_log (user_id, kind, version, items, user_agent, doc_hash, read_full, ip) VALUES ($1, $2, $3, $4, $5, $6, true, $7)",
    [uid, kind, CONSENT_VERSION, items, userAgent, hash, String(ip || "").slice(0, 64)]);
  await client.query(`UPDATE users SET ${kind === "partner" ? "partner_consent" : "consent"} = $2, updated_at = now() WHERE id = $1`,
    [uid, { version: CONSENT_VERSION, at: new Date().toISOString() }]);
}

// A new login. One device at a time: this login signs out every other device.
// Admins can let customers stay logged in on several devices (partner and admin logins stay one device).
async function startSession(u, userAgent, how) {
  const oneDevice = SERVICE !== "customer" || await singleDeviceOn();
  const device = deviceName(userAgent);
  const fresh = await one(`UPDATE users SET token_version = token_version + $3, last_login_at = now(), last_login_device = $2
                           WHERE id = $1 RETURNING id, token_version`, [u.id, device, oneDevice ? 1 : 0]);
  audit("login", u.id, { service: SERVICE, device, how });
  return issueToken(fresh);
}

export function accountRoutes(r) {
  // ---------- login ----------
  // Log in with e-mail OR mobile number, plus password (same account in the customer and partner apps).
  r.post("/api/auth/login", async ({ body, ip, userAgent }) => {
    const id = String(body.login ?? body.email ?? "").trim();
    const byEmail = id.includes("@");
    const email = byEmail ? normEmail(id) : "";
    const phone = byEmail ? "" : indianPhone(id);
    const wrong = "Wrong e-mail / mobile number or password";
    if ((byEmail ? !validEmail(email) : !phone) || typeof body.password !== "string") throw bad(wrong);
    const key = byEmail ? "email:" + email : "phone:" + phone;
    // only wrong passwords count: 10 per account or 30 per network in 15 minutes, then a 15-minute lockout
    const busy = "Too many wrong attempts. Try again in 15 minutes";
    if ((await overLimit(key, "loginFail", 10, 900)) || (await overLimit("ip:" + ip, "loginFail", 30, 900))) throw tooMany(busy);
    const u = byEmail
      ? await one("SELECT id, email, role, password_hash, token_version FROM users WHERE lower(email) = $1", [email])
      : await one("SELECT id, email, role, password_hash, token_version FROM users WHERE phone = $1 ORDER BY created_at LIMIT 1", [phone]);
    const ok = await checkPassword(body.password, u?.password_hash);
    if (!u || !ok) {
      await limit(key, "loginFail", 10, 900, busy);
      await limit("ip:" + ip, "loginFail", 30, 900, busy);
      throw bad(wrong);
    }
    // the admin server lets only admins and moderators in
    if (SERVICE === "admin" && !isStaff(u)) throw denied("This account has no admin access");
    return { token: await startSession(u, userAgent, "password"), user: { id: u.id, email: u.email } };
  }, { limit: "auth" });

  // ---------- e-mail one-time codes (sign-up verification) ----------
  const codeHash = (email, code) => crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
  const checkCode = async (email, code) => {
    const sms = String(email).startsWith("sms:"), wa = /^wav?:/.test(String(email));
    const what = wa ? "WhatsApp" : sms ? "mobile (SMS)" : "e-mail";
    const row = await one("UPDATE otp_codes SET attempts = attempts + 1 WHERE email = $1 RETURNING code_hash, expires_at, attempts", [email]);
    if (!row || new Date(row.expires_at) < new Date()) throw bad(`The ${what} code has expired. Ask for a new one.`);
    if (row.attempts > 5) throw bad(`Too many wrong tries for the ${what} code. Ask for a new one.`);
    const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(codeHash(email, String(code || "").trim())));
    if (!ok) throw bad(wa ? "That WhatsApp code is not right. Please check the message and try again." : sms ? "The mobile (SMS) code is not right. Please check the SMS and try again." : "The e-mail code is not right. Please check the e-mail and try again.");
    await q("DELETE FROM otp_codes WHERE email = $1", [email]);
  };
  // which e-mail a code goes to: the one typed, or for a mobile number the e-mail on that account (no SMS yet)
  const codeEmail = async (body) => {
    if (body.login !== undefined) { const id = String(body.login).trim(); body = id.includes("@") ? { email: id } : { phone: id }; }
    if (body.phone !== undefined && body.phone !== null && body.phone !== "") {
      const p = indianPhone(body.phone);
      if (!p) throw bad("Please enter a valid Indian mobile number");
      const u = await one("SELECT email FROM users WHERE phone = $1 AND email IS NOT NULL ORDER BY created_at LIMIT 1", [p]);
      if (!u) throw notFound("No account with this mobile number yet. Log in with your e-mail, or sign up.");
      return normEmail(u.email);
    }
    const email = normEmail(body.email);
    if (!validEmail(email)) throw bad("Please enter a valid email");
    return email;
  };
  r.post("/api/auth/otp/send", async ({ body, ip }) => {
    if (!MAIL_FROM) throw precondition("E-mail codes aren't switched on yet.");
    await limit("ip:" + ip, "otp", 10, 3600);
    const email = await codeEmail(body || {});
    await limit("email:" + email, "otp", 5, 3600, "Too many codes for this e-mail. Try again in an hour.");
    const code = String(crypto.randomInt(100000, 1000000));
    await q(`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
             ON CONFLICT (email) DO UPDATE SET code_hash = $2, expires_at = now() + interval '10 minutes', attempts = 0, created_at = now()`,
      [email, codeHash(email, code)]);
    await sendEmail(email, `${code} is your LastPick code`,
      `Your LastPick code is ${code}\n\nIt expires in 10 minutes. Never share it with anyone: LastPick and businesses will never ask for it.\nIf you didn't ask for it, ignore this e-mail.`);
    return { sent: true, to: maskEmail(email), expiresIn: 600 };
  }, { limit: "auth" });

  // Mobile number check at sign-up: a random 6-digit code on WhatsApp ("wav:+91…") or by SMS ("sms:+91…"),
  // stored like the e-mail codes. The app calls /api/auth/otp/send-phone; send-sms is the older name.
  const sendPhoneCode = async ({ body, ip }) => {
    const channel = phoneChannel();
    if (!channel) throw precondition("Mobile codes aren't switched on yet.");
    const bad1 = mobileProblem(body?.phone);
    if (bad1) throw bad(bad1);
    const phone = indianPhone(body.phone);
    if (await one("SELECT 1 FROM users WHERE phone = $1", [phone])) throw precondition("This mobile number is already registered. Log in instead (the same account works in the customer and partner apps).");
    await limit("ip:" + ip, "sms", 10, 3600);
    await limit("phone:" + phone, "sms", 4, 3600, "Too many codes for this number. Try again in an hour.");
    await limit("phone:" + phone, "smsGap", 1, 30, "Please wait 30 seconds before asking for another code.");
    if (channel === "whatsapp") await limit("all", "waDay", WA_DAILY_CAP, 86400, "Codes are busy right now. Please try again in a little while.");
    const code = String(crypto.randomInt(100000, 1000000));
    const key = (channel === "whatsapp" ? "wav:" : "sms:") + phone;
    await q(`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
             ON CONFLICT (email) DO UPDATE SET code_hash = $2, expires_at = now() + interval '10 minutes', attempts = 0, created_at = now()`,
      [key, codeHash(key, code)]);
    if (channel === "whatsapp") {
      try { await sendWhatsAppCode(phone, code); }
      catch (e) {
        log.error("whatsapp verify code failed", { error: e.message });
        // Our side isn't ready (template missing or not approved, account not allowed yet): don't block sign-ups.
        // The number is saved without a code for this sign-up (30 minutes), and the admin sees it in the logs.
        if (/\((?:132000|132001|132005|132007|132012|132015|132016|131031|131042|131047|10|100|190|200)\)|template|permission|OAuthException/i.test(e.message)) {
          await q(`INSERT INTO rate_limits (key, action, window_start, n) VALUES ($1, 'waSkip', now(), 1)
                   ON CONFLICT (key, action) DO UPDATE SET window_start = now(), n = 1`, ["phone:" + phone]);
          return { sent: false, skipped: true, channel, expiresIn: 0 };
        }
        throw precondition("We couldn't send the WhatsApp code. Check this number has WhatsApp, and try again in a minute.");
      }
    } else {
      try { await sendSms(phone, `${code} is your LastPick code to verify your mobile number. It expires in 10 minutes. Never share it with anyone.`); }
      catch (e) { log.error("sms failed", { error: e.message }); throw precondition("We couldn't send the SMS right now. Please try again in a few minutes."); }
    }
    return { sent: true, channel, to: maskPhone(phone), expiresIn: 600 };
  };
  r.post("/api/auth/otp/send-phone", sendPhoneCode, { limit: "auth" });
  r.post("/api/auth/otp/send-sms", sendPhoneCode, { limit: "auth" });

  r.post("/api/auth/signup", async ({ body, ip, userAgent }) => {
    if (SERVICE === "admin") throw denied("Admin accounts are created by another admin");
    if (SIGNUP === "closed") throw denied("Sign-up opens soon. Please use a test account.");
    const email = normEmail(body.email);
    const name = str(body.name, 80);
    const phone = indianPhone(body.phone);
    if (!validEmail(email)) throw bad("Please enter a valid email");
    if (typeof body.password !== "string" || body.password.length < 8) throw bad("Password must be at least 8 characters");
    if (name.length < 2) throw bad("Please enter your name");
    if (mobileProblem(body.phone)) throw bad(mobileProblem(body.phone));
    await limit("ip:" + ip, "signup", 10, 3600);
    // say "already registered" BEFORE using up the e-mail code, so a mistake doesn't waste the code
    if (await one("SELECT 1 FROM users WHERE lower(email) = $1", [email])) throw precondition("An account with this e-mail already exists. Log in instead (the same account works in the customer and partner apps).");
    if (phone && await one("SELECT 1 FROM users WHERE phone = $1", [phone])) throw precondition("This mobile number is already registered. Log in instead (the same account works in the customer and partner apps).");
    if (!phone) throw bad("Please enter your mobile number");
    // partner app: a profile photo of the owner is required (for KYC)
    const photo = body.photo == null || body.photo === "" ? null : body.photo;
    if (photo !== null && !isDataImage(photo, PHOTO_MAX)) throw bad("Please add a clear JPEG or PNG photo (under 300 KB)");
    if (SERVICE === "partner" && !photo) throw bad("Please add your profile photo");
    if (MAIL_FROM) await checkCode(email, body.otp); // e-mail must be verified with a one-time code
    const channel = phoneChannel(); // and the mobile number with a WhatsApp or SMS code, when switched on
    // WhatsApp sending was skipped for this number (our side not ready): sign up without the mobile code
    const waSkipped = channel === "whatsapp" && !!(await one(
      "SELECT 1 FROM rate_limits WHERE key = $1 AND action = 'waSkip' AND window_start > now() - interval '30 minutes'", ["phone:" + phone]));
    if (channel && !waSkipped) await checkCode((channel === "whatsapp" ? "wav:" : "sms:") + phone, body.phoneOtp);
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
      if (body.consent) await recordConsent(c, rows[0].id, { kind: "user", version: CONSENT_VERSION, ...body.consent }, userAgent, ip);
      if (photo) await c.query("INSERT INTO user_photos (user_id, data) VALUES ($1, $2)", [rows[0].id, photo]);
      if (channel && !waSkipped) await c.query("UPDATE users SET phone_verified_at = now() WHERE id = $1", [rows[0].id]);
      return rows[0];
    });
    audit("signup", u.id, { service: SERVICE });
    if (SERVICE === "customer") await notify(u.id, "welcome");
    return { token: issueToken(u), user: { id: u.id, email: u.email } };
  }, { limit: "auth" });

  // log out on every device (the app forgets its own token on normal log out)
  r.post("/api/auth/logout-all", async (ctx) => {
    const u = needUser(ctx);
    await q("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [u.id]);
  });

  // SMS codes and password reset come later.
  r.post("/api/auth/otp/verify", async ({ body, ip, userAgent }) => {
    if (!MAIL_FROM) throw precondition("E-mail codes aren't switched on yet.");
    await limit("ip:" + ip, "otpVerify", 30, 900);
    const email = await codeEmail(body || {});
    await checkCode(email, body.code);
    let u = await one("SELECT id, email, role, token_version FROM users WHERE lower(email) = $1", [email]);
    let isNew = false;
    if (!u) {
      // a new e-mail: create the account; the app then asks for name, mobile and consent
      if (SERVICE === "admin") throw denied("This account has no admin access");
      if (SIGNUP === "closed") throw denied("Sign-up opens soon. Please use a test account.");
      u = await one(`INSERT INTO users (email, name, phone, trial_ends_at) VALUES ($1, '', '', now() + make_interval(days => $2))
                     RETURNING id, email, role, token_version`, [email, TRIAL_DAYS]);
      isNew = true;
      audit("signup", u.id, { service: SERVICE, how: "code" });
    }
    if (SERVICE === "admin" && !isStaff(u)) throw denied("This account has no admin access");
    const token = await startSession(u, userAgent, "code");
    if (isNew && SERVICE === "customer") await notify(u.id, "welcome");
    return { token, isNew, user: { id: u.id, email: u.email } };
  }, { limit: "auth" });
  // ---------- log in with mobile number + WhatsApp code (customers and partners; no password, no e-mail) ----------
  // Step 1: a random 6-digit code to the number on WhatsApp. Works for new and existing accounts.
  r.post("/api/auth/wa/send", async ({ body, ip }) => {
    if (!waLogin()) throw precondition("WhatsApp login isn't switched on yet.");
    const problem = mobileProblem(body?.phone);
    if (problem) throw bad(problem);
    const phone = indianPhone(body.phone);
    if (SERVICE === "admin") {
      const staffUser = await one("SELECT role FROM users WHERE phone = $1", [phone]);
      if (!isStaff(staffUser)) throw denied("This number has no admin access");
    }
    await limit("ip:" + ip, "wa", 20, 3600);
    await limit("phone:" + phone, "wa", 5, 3600, "Too many codes for this number. Try again in an hour.");
    await limit("phone:" + phone, "waGap", 1, 30, "Please wait 30 seconds before asking for another code.");
    // money guard: at most WA_DAILY_CAP WhatsApp codes a day for the whole app (each one is billed by Meta)
    await limit("all", "waDay", WA_DAILY_CAP, 86400, "Login codes are busy right now. Please try again in a little while.");
    const code = String(crypto.randomInt(100000, 1000000));
    const key = "wa:" + phone;
    await q(`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
             ON CONFLICT (email) DO UPDATE SET code_hash = $2, expires_at = now() + interval '10 minutes', attempts = 0, created_at = now()`,
      [key, codeHash(key, code)]);
    try { await sendWhatsAppCode(phone, code); }
    catch (e) { log.error("whatsapp code failed", { error: e.message }); throw precondition("We couldn't send the WhatsApp code right now. Check the number has WhatsApp, and try again in a minute."); }
    return { sent: true, to: maskPhone(phone), expiresIn: 600 };
  }, { limit: "auth" });

  // Step 2: the code is right -> logged in. A new number creates the account (the app then asks for name + Terms).
  r.post("/api/auth/wa/verify", async ({ body, ip, userAgent }) => {
    if (!waLogin()) throw precondition("WhatsApp login isn't switched on yet.");
    const phone = indianPhone(body?.phone);
    if (!phone || mobileProblem(body.phone)) throw bad("Enter a valid 10-digit Indian mobile number");
    await limit("ip:" + ip, "waVerify", 40, 900);
    await checkCode("wa:" + phone, body.code);
    let u = await one("SELECT id, email, role, token_version FROM users WHERE phone = $1", [phone]);
    let isNew = false;
    if (!u) {
      if (SERVICE === "admin") throw denied("This number has no admin access");
      if (SIGNUP === "closed") throw denied("Sign-up opens soon.");
      u = await one(`INSERT INTO users (phone, name, trial_ends_at) VALUES ($1, '', now() + make_interval(days => $2))
                     ON CONFLICT (phone) WHERE phone <> '' DO NOTHING RETURNING id, email, role, token_version`, [phone, TRIAL_DAYS])
        || await one("SELECT id, email, role, token_version FROM users WHERE phone = $1", [phone]);
      isNew = true;
      audit("signup", u.id, { service: SERVICE, how: "whatsapp" });
    }
    if (SERVICE === "admin" && !isStaff(u)) throw denied("This number has no admin access");
    const token = await startSession(u, userAgent, "whatsapp");
    return { token, isNew, user: { id: u.id, phone } };
  }, { limit: "auth" });

  // Forgot password: step 1 = /api/auth/otp/send with the e-mail; step 2 = this, with the code and a new password.
  // Logs out every other device and logs in here.
  r.post("/api/auth/reset", async ({ body, ip, userAgent }) => {
    if (!MAIL_FROM) throw precondition("Password reset needs e-mail, which isn't switched on yet. Please contact support.");
    const id = String(body.login ?? body.email ?? "").trim();
    const email = await codeEmail(id.includes("@") ? { email: id } : { phone: id });
    if (typeof body.password !== "string" || body.password.length < 8) throw bad("Password must be at least 8 characters");
    await limit("ip:" + ip, "reset", 10, 3600);
    const u = await one("SELECT id, email, role, token_version FROM users WHERE lower(email) = $1", [email]);
    if (!u) throw notFound("No account with this e-mail or mobile number. Please sign up.");
    if (SERVICE === "admin" && !isStaff(u)) throw denied("This account has no admin access");
    await checkCode(email, body.code);
    // a new password always ends every other login (even when customers may use several devices)
    await q("UPDATE users SET password_hash = $2, token_version = token_version + 1, updated_at = now() WHERE id = $1", [u.id, await hashPassword(body.password)]);
    audit("password_reset", u.id, { service: SERVICE });
    const token = await startSession({ ...u }, userAgent, "reset");
    return { token, user: { id: u.id, email: u.email } };
  }, { limit: "auth" });

  // ---------- profile ----------
  r.get("/api/me", async (ctx) => profile(needUser(ctx).id));
  // the owner's own profile photo (partner KYC): view and change it
  r.get("/api/me/photo", async (ctx) => {
    const row = await one("SELECT data FROM user_photos WHERE user_id = $1", [needUser(ctx).id]);
    return { photo: row?.data || null };
  });
  r.put("/api/me/photo", async (ctx) => {
    const u = needUser(ctx);
    if (!isDataImage(ctx.body?.photo, PHOTO_MAX)) throw bad("Please add a clear JPEG or PNG photo (under 300 KB)");
    await q(`INSERT INTO user_photos (user_id, data) VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [u.id, ctx.body.photo]);
    audit("photo_set", u.id);
    return { ok: true };
  });
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
    const phone = indianPhone(ctx.body.phone) || "";
    if (ctx.body.phone && mobileProblem(ctx.body.phone)) throw bad(mobileProblem(ctx.body.phone));
    const before = await one("SELECT name FROM users WHERE id = $1", [u.id]);
    await tx(async (c) => {
      // one account per mobile number (mobile login sends the code to that account's e-mail)
      if (phone && (await c.query("SELECT 1 FROM users WHERE phone = $1 AND id <> $2", [phone, u.id])).rows.length) throw precondition("This mobile number is already registered. Log in with it instead.");
      // the verified login number stays; a number is only added when the account has none (older e-mail accounts)
      await c.query("UPDATE users SET name = $2, phone = CASE WHEN phone = '' THEN COALESCE(NULLIF($3, ''), phone) ELSE phone END, updated_at = now() WHERE id = $1", [u.id, name, phone]);
      if (ctx.body.consent) await recordConsent(c, u.id, { kind: "user", version: CONSENT_VERSION, ...ctx.body.consent }, ctx.userAgent, ctx.ip);
    });
    if (!before?.name && SERVICE === "customer") await notify(u.id, "welcome"); // first time the account gets a name
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
    freeMode: await freeMode(), night: isNight(), hours: BUSINESS_HOURS, alwaysOpen: ALWAYS_OPEN, emailCodes: !!(MAIL_FROM && mailProvider()), phoneCodes: !!phoneChannel(), phoneChannel: phoneChannel(), whatsappLogin: waLogin(),
  }), { cache: "public, max-age=15" });

  // ---------- consent ----------
  r.post("/api/consent", async (ctx) => {
    const u = needUser(ctx);
    await tx((c) => recordConsent(c, u.id, ctx.body, ctx.userAgent, ctx.ip));
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
