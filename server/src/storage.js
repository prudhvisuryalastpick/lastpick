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
  if (!res.ok && !(method === "DELETE" && res.status === 404)) throw new Error(`R2 ${method} failed (${res.status})`);
}

// A short-lived link anyone holding it can open (photos stay private: links expire).
export function signedUrl(key, seconds = 3600) {
  const url = new URL(R2_ENDPOINT);
  const path = keyPath(key);
  const amz = stamp(), day = amz.slice(0, 8), scope = `${day}/${REGION}/${SVC}/aws4_request`;
  const qs = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${R2_ACCESS_KEY_ID}/${scope}`, "X-Amz-Date": amz,
    "X-Amz-Expires": String(seconds), "X-Amz-SignedHeaders": "host",
  });
  const query = [...qs.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const canonical = ["GET", path, query, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, hash(canonical)].join("\n");
  const sig = crypto.createHmac("sha256", signingKey(day)).update(toSign).digest("hex");
  return `${url.origin}${path}?${query}&X-Amz-Signature=${sig}`;
}

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

export const newKey = (folder, ext = "jpg") => `${folder}/${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
