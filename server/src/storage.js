// Files (shop photos, rental photos and videos, ticket photos) live in Cloudflare R2, not in the database.
// The database keeps only a reference: "r2:<key>". Without R2 keys (tests, local runs) the bytes go to the
// stored_files table instead, so everything still works. Built on node:crypto (AWS Signature V4), no packages.
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { R2_ACCESS_KEY_ID, R2_BUCKET, R2_ENDPOINT, R2_SECRET_ACCESS_KEY } from "./config.js";
import { one, q } from "./db.js";

export const R2_ON = !!(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
const REGION = "auto", SVC = "s3";
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const keyPath = (key) => "/" + R2_BUCKET + "/" + key.split("/").map(enc).join("/");
const stamp = (d = new Date()) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");
function signingKey(day) {
  return hmac(hmac(hmac(hmac("AWS4" + R2_SECRET_ACCESS_KEY, day), REGION), SVC), "aws4_request");
}

// A signed request to R2 (PUT / DELETE).
export async function putObject(key, bytes, contentType) { await r2("PUT", key, bytes, contentType); }
async function r2(method, key, body, contentType) {
  const url = new URL(R2_ENDPOINT);
  const path = keyPath(key);
  const amz = stamp(), day = amz.slice(0, 8);
  const payload = hash(body || "");
  const headers = { host: url.host, "x-amz-content-sha256": payload, "x-amz-date": amz, ...(contentType ? { "content-type": contentType } : {}) };
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map((n) => `${n}:${headers[n]}`).join("\n") + "\n", names.join(";"), payload].join("\n");
  const scope = `${day}/${REGION}/${SVC}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, hash(canonical)].join("\n");
  const sig = crypto.createHmac("sha256", signingKey(day)).update(toSign).digest("hex");
  const res = await fetch(url.origin + path, {
    method, body: body || undefined,
    headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` },
  });
  if (method === "HEAD") return res.ok ? Number(res.headers.get("content-length") || 0) : null;
  if (!res.ok && !(method === "DELETE" && res.status === 404)) throw new Error(`R2 ${method} failed (${res.status})`);
}

// size in bytes of a stored file, or null if it isn't there (used to confirm a phone's direct upload)
export async function objectSize(key) { return R2_ON ? r2("HEAD", key) : null; }

// A short-lived link anyone holding it can open (photos stay private: links expire).
export function signedUrl(key, seconds = 3600, at = new Date(), method = "GET") {
  const url = new URL(R2_ENDPOINT);
  const path = keyPath(key);
  const amz = stamp(at), day = amz.slice(0, 8), scope = `${day}/${REGION}/${SVC}/aws4_request`;
  const qs = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${R2_ACCESS_KEY_ID}/${scope}`, "X-Amz-Date": amz,
    "X-Amz-Expires": String(seconds), "X-Amz-SignedHeaders": "host",
  });
  const query = [...qs.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const canonical = [method, path, query, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, hash(canonical)].join("\n");
  const sig = crypto.createHmac("sha256", signingKey(day)).update(toSign).digest("hex");
  return `${url.origin}${path}?${query}&X-Amz-Signature=${sig}`;
}

// A short-lived link the phone uses to upload a file straight to R2 (big photos and videos never pass through
// the server). The server checks the size afterwards with objectSize().
export const uploadUrl = (key, seconds = 900) => signedUrl(key, seconds, new Date(), "PUT");

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i;

// Save a file given as a data URL (what the apps send). Returns the reference to keep in the database.
export async function saveFile(key, dataUrl) {
  const m = DATA_URL.exec(String(dataUrl || ""));
  if (!m) throw new Error("not a file");
  if (R2_ON) {
    await r2("PUT", key, Buffer.from(m[2], "base64"), m[1]);
    return "r2:" + key;
  }
  await q(`INSERT INTO stored_files (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [key, dataUrl]);
  return "db:" + key;
}

// What the apps can show for a stored reference: a signed R2 link, or the data URL itself.
export async function fileUrl(ref, seconds = 3600) {
  if (!ref) return null;
  if (ref.startsWith("data:")) return ref; // older rows saved before R2
  if (ref.startsWith("r2:")) return R2_ON ? signedUrl(ref.slice(3), seconds) : null;
  if (ref.startsWith("db:")) return (await one("SELECT data FROM stored_files WHERE key = $1", [ref.slice(3)]))?.data || null;
  return null;
}

export async function deleteFile(ref) {
  if (!ref) return;
  if (ref.startsWith("r2:") && R2_ON) await r2("DELETE", ref.slice(3));
  if (ref.startsWith("db:")) await q("DELETE FROM stored_files WHERE key = $1", [ref.slice(3)]);
}

export const newKey = (name = "f", ext = "jpg") => `${name}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

// End-to-end check: save a tiny file, read it back through its link, delete it. Used by the admin panel and by
// the deploy pipeline after every release.
export async function storageCheck() {
  const text = "lastpick-check-" + Date.now();
  let ref = null, readBack = false, error = null;
  try {
    ref = await saveFile(`health/${text}.txt`, "data:text/plain;base64," + Buffer.from(text).toString("base64"));
    const url = await fileUrl(ref, 120);
    if (url?.startsWith("data:")) readBack = Buffer.from(url.split(",")[1], "base64").toString() === text;
    else if (url) readBack = (await (await fetch(url)).text()) === text;
  } catch (e) { error = e.message; }
  if (ref) await deleteFile(ref).catch(() => {});
  return { store: R2_ON ? "r2" : "database", saved: !!ref, readBack, error };
}

// Category photos on Home: 5 per category, at fixed keys categories/<id>-<n>.webp (uploaded at deploy; admins
// can replace one: the new file gets its own key, kept in the "category_photos" setting, so phones load the new
// photo instead of a cached old one). Links are signed for the whole day (same link all day, kept cached).
export const CATEGORY_PHOTO_IDS = ["food", "stay", "beauty", "makeup", "gym", "farm", "fashion", "appliances", "rentals", "ads", "other"];
export function categoryPhotoUrls(overrides = {}) {
  if (!R2_ON) return null;
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const out = {};
  for (const id of CATEGORY_PHOTO_IDS) {
    out[id] = [1, 2, 3, 4, 5].map((n) => signedUrl(overrides[`${id}-${n}`] || `categories/${id}-${n}.webp`, 2 * 86400, dayStart));
  }
  return out;
}
