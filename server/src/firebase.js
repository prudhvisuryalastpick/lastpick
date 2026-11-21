// Mobile number check with Firebase Phone Authentication.
// The app asks Firebase to text a 6-digit code to the phone; when the person types the right code, Firebase gives the
// app a signed "ID token" that says "this phone number is verified". The server checks that token here: Google's
// signature, our Firebase project, not expired, and the phone number inside it. No Firebase package is needed.
// Uses WebCrypto (crypto.subtle), which works the same on Node and on Supabase Edge Functions.
import { FIREBASE_PROJECT_ID } from "./config.js";

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let cache = { keys: null, until: 0 };

async function googleKeys() {
  if (cache.keys && Date.now() < cache.until) return cache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error(`Could not fetch Google keys (${r.status})`);
  const maxAge = Number((r.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
  const { keys } = await r.json();
  cache = { keys, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
  return keys;
}

const b64uBytes = (s) => {
  const b = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64uJson = (s) => JSON.parse(new TextDecoder().decode(b64uBytes(s)));

// Returns the verified phone number ("+919876543210"), or throws with a plain reason.
// `opts.keys` and `opts.projectId` are for tests.
export async function verifyPhoneToken(token, opts = {}) {
  const projectId = opts.projectId || FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Phone verification is not set up");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const head = b64uJson(parts[0]), p = b64uJson(parts[1]);
  if (head.alg !== "RS256" || !head.kid) throw new Error("bad token header");
  const keys = opts.keys || (await googleKeys());
  const jwk = keys.find((k) => k.kid === head.kid);
  if (!jwk) throw new Error("unknown signing key");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64uBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error("bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("token is for another project");
  if (!(p.exp > now) || !(p.iat <= now + 300) || !p.sub) throw new Error("token expired");
  // the check must be fresh: the code was entered in the last 15 minutes
  if (!(p.auth_time >= now - 15 * 60)) throw new Error("verification is too old");
  if (!p.phone_number) throw new Error("no phone number in token");
  return p.phone_number;
}
