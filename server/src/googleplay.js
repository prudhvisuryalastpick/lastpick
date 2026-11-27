// Google Play billing: check a purchase with Google before switching a plan on, then "consume" it so the same
// product can be bought again (our plans are prepaid packs, bought again to renew).
// Needs GOOGLE_PLAY_SERVICE_ACCOUNT (a service account JSON key with access to the app in Play Console).
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { GOOGLE_OAUTH_URL, GOOGLE_PLAY_API_BASE, GOOGLE_PLAY_PACKAGE, GOOGLE_PLAY_SERVICE_ACCOUNT } from "./config.js";
import { log } from "./log.js";
import { precondition } from "./util.js";

// Product IDs to create in Play Console (Monetize → Products → In-app products), same prices as the website.
export const GOOGLE_PRODUCTS = {
  business_pro_5d: { plan: "owner", days: 5 },
  business_pro_15d: { plan: "owner", days: 15 },
  business_pro_30d: { plan: "owner", days: 30 },
  rental_15d: { plan: "rental", days: 15 },
  rental_30d: { plan: "rental", days: 30 },
};
export const productFor = (plan, days) => Object.keys(GOOGLE_PRODUCTS).find((k) => GOOGLE_PRODUCTS[k].plan === plan && GOOGLE_PRODUCTS[k].days === Number(days)) || null;

let account = null;
function serviceAccount() {
  if (account) return account;
  if (!GOOGLE_PLAY_SERVICE_ACCOUNT) return null;
  const raw = GOOGLE_PLAY_SERVICE_ACCOUNT.trim().startsWith("{") ? GOOGLE_PLAY_SERVICE_ACCOUNT : Buffer.from(GOOGLE_PLAY_SERVICE_ACCOUNT, "base64").toString("utf8");
  try { const j = JSON.parse(raw); if (j.client_email && j.private_key) account = j; } catch { /* bad key: treated as not set up */ }
  return account;
}
export const googlePlayOn = () => !!serviceAccount();

// the person's id, hashed: sent to Google with the purchase so a purchase can't be claimed by someone else
export const accountTag = (userId) => crypto.createHash("sha256").update(`lastpick:${userId}`).digest("hex");

const b64url = (x) => Buffer.from(x).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
let token = null, tokenUntil = 0;
async function accessToken() {
  if (token && Date.now() < tokenUntil) return token;
  const sa = serviceAccount();
  if (!sa) throw precondition("Google Play payments aren't set up yet. Please try again later.");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: GOOGLE_OAUTH_URL, iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key);
  const r = await fetch(GOOGLE_OAUTH_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${head}.${claims}.${b64url(sig)}`,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { log.error("google auth failed", { status: r.status, error: j.error }); throw precondition("We couldn't reach Google Play to confirm the payment. Please try again in a minute."); }
  token = j.access_token; tokenUntil = Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000;
  return token;
}

const purchaseUrl = (productId, purchaseToken) =>
  `${GOOGLE_PLAY_API_BASE}/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

// Google's record of one purchase: purchaseState 0 = paid, 1 = cancelled, 2 = pending; purchaseType 0 = test
export async function getPurchase(productId, purchaseToken) {
  const r = await fetch(purchaseUrl(productId, purchaseToken), { headers: { Authorization: `Bearer ${await accessToken()}` } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 404 || r.status === 400 || r.status === 410) return null;
  if (!r.ok) { log.error("google purchase check failed", { status: r.status, error: j.error?.message }); throw precondition("We couldn't reach Google Play to confirm the payment. Please try again in a minute."); }
  return j;
}

// lets the person buy the same pack again later (and tells Google we delivered it, so it isn't auto-refunded)
export async function consumePurchase(productId, purchaseToken) {
  const r = await fetch(`${purchaseUrl(productId, purchaseToken)}:consume`, { method: "POST", headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!r.ok) log.warn("google consume failed", { status: r.status, productId });
  return r.ok;
}
