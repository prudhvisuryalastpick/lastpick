// Sends e-mail (sign-up codes, approvals, payment receipts).
// Amazon SES only (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_REGION). No other e-mail provider is used.
// MAIL_FROM is the sender, e.g. "LastPick <no-reply@lastpick.in>" (its domain must be verified in Amazon SES).
import { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_REGION, MAIL_FROM, MAIL_REPLY_TO, SES_API_BASE } from "./config.js";

function parseFrom(from) {
  const m = String(from).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1] || "LastPick", email: m[2] } : { name: "LastPick", email: String(from).trim() };
}

export const sesOn = () => !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
export const mailProvider = () => (MAIL_FROM && sesOn() ? "ses" : "");

// SMS codes are not used (mobile numbers are checked on WhatsApp). Kept so older callers fail clearly.
export async function sendSms() { throw new Error("SMS is not set up"); }

// ---- AWS Signature Version 4 with Web Crypto (works in Node 22, Deno / Supabase and Workers) ----
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(key, s) {
  const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(s));
}
export async function signAws({ method, url, body, region, service, accessKey, secretKey, now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20261122T101500Z
  const day = amzDate.slice(0, 8);
  const payloadHash = await sha256(body);
  const headers = { host: u.host, "content-type": "application/json", "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash };
  const names = Object.keys(headers).sort();
  const canonical = [method, u.pathname || "/", u.search.slice(1), names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonical)].join("\n");
  let key = await hmac("AWS4" + secretKey, day);
  key = await hmac(key, region); key = await hmac(key, service); key = await hmac(key, "aws4_request");
  const signature = hex(await hmac(key, toSign));
  const { host, ...rest } = headers;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}

async function sendSes(to, subject, text) {
  const from = parseFrom(MAIL_FROM);
  const url = `${SES_API_BASE || `https://email.${AWS_SES_REGION}.amazonaws.com`}/v2/email/outbound-emails`;
  const body = JSON.stringify({
    FromEmailAddress: `${from.name} <${from.email}>`,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: MAIL_REPLY_TO ? [MAIL_REPLY_TO] : [],
    Content: { Simple: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Text: { Data: text, Charset: "UTF-8" } } } },
  });
  const headers = await signAws({ method: "POST", url, body, region: AWS_SES_REGION, service: "ses", accessKey: AWS_ACCESS_KEY_ID, secretKey: AWS_SECRET_ACCESS_KEY });
  const r = await fetch(url, { method: "POST", headers, body });
  if (!r.ok) throw new Error(`E-mail (SES) failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
}

export async function sendEmail(to, subject, text) {
  if (!mailProvider()) throw new Error("E-mail is not set up (Amazon SES keys or MAIL_FROM missing)");
  return sendSes(to, subject, text);
}
