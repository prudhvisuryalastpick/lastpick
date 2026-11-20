// Passwords (scrypt) and sign-in tokens (JWT, HS256). Built on node:crypto, no extra packages.
import crypto from "node:crypto";
import { JWT_SECRET, TOKEN_DAYS } from "./config.js";
import { one } from "./db.js";
import { unauth } from "./util.js";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const scrypt = (pw, salt) => new Promise((res, rej) =>
  crypto.scrypt(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(pw), salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith("scrypt$")) {
    await scrypt("x", "timing-equaliser"); // same work whether or not the account exists
    return false;
  }
  const [, , , , salt, key] = stored.split("$");
  const got = await scrypt(String(pw), Buffer.from(salt, "base64"));
  const want = Buffer.from(key, "base64");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const b64u = (b) => Buffer.from(b).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");

export function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ sub: user.id, tv: user.token_version || 0, iat: now, exp: now + TOKEN_DAYS * 86400 }));
  return `${head}.${body}.${sign(`${head}.${body}`)}`;
}
function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const want = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

// Returns { user } for a valid login, or { reason } saying why the token no longer works.
// Only ONE device can be logged in: each new login bumps token_version, so older tokens end with "signed_in_elsewhere".
export async function userFromRequest(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return {};
  const p = verifyToken(h.slice(7));
  if (!p) return { reason: "expired" };
  const u = await one("SELECT id, email, name, phone, role, regions, token_version, consent, partner_consent FROM users WHERE id = $1", [p.sub]);
  if (!u) return { reason: "expired" };
  if (u.token_version !== p.tv) return { reason: "signed_in_elsewhere" };
  return { user: u };
}
const REASONS = {
  signed_in_elsewhere: "You were logged out because your account was logged in on another device. Only one device can be logged in at a time.",
  expired: "Your login has expired. Please log in again.",
};
export function needUser(ctx) {
  if (ctx.user) return ctx.user;
  const e = unauth(REASONS[ctx.authReason] || "Please log in");
  if (ctx.authReason) e.code = ctx.authReason;
  throw e;
}
