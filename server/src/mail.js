// Sends e-mail through Amazon SES (API v2) with no extra packages: requests are signed with AWS Signature V4
// using the container's task-role credentials (ECS provides them at 169.254.170.2).
import crypto from "node:crypto";
import { AWS_REGION, MAIL_FROM } from "./config.js";

let creds = null;
async function credentials() {
  if (creds && creds.exp - Date.now() > 5 * 60000) return creds;
  const env = process.env;
  if (env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
    const r = await fetch("http://169.254.170.2" + env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI);
    if (!r.ok) throw new Error("No AWS credentials for e-mail");
    const j = await r.json();
    creds = { id: j.AccessKeyId, secret: j.SecretAccessKey, token: j.Token, exp: Date.parse(j.Expiration) };
  } else if (env.AWS_ACCESS_KEY_ID) {
    creds = { id: env.AWS_ACCESS_KEY_ID, secret: env.AWS_SECRET_ACCESS_KEY, token: env.AWS_SESSION_TOKEN, exp: Date.now() + 3600000 };
  } else throw new Error("No AWS credentials for e-mail");
  return creds;
}

const hmac = (key, s) => crypto.createHmac("sha256", key).update(s).digest();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

export async function sendEmail(to, subject, text) {
  if (!MAIL_FROM) throw new Error("E-mail is not set up");
  const c = await credentials();
  const host = `email.${AWS_REGION}.amazonaws.com`, path = "/v2/email/outbound-emails";
  const body = JSON.stringify({ FromEmailAddress: MAIL_FROM, Destination: { ToAddresses: [to] },
    Content: { Simple: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Text: { Data: text, Charset: "UTF-8" } } } } });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""), day = amzDate.slice(0, 8);
  const headers = { "content-type": "application/json", host, "x-amz-date": amzDate, ...(c.token ? { "x-amz-security-token": c.token } : {}) };
  const names = Object.keys(headers).sort();
  const canonical = ["POST", path, "", ...names.map((h) => `${h}:${headers[h]}`), "", names.join(";"), sha(body)].join("\n");
  const scope = `${day}/${AWS_REGION}/ses/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac("AWS4" + c.secret, day), AWS_REGION), "ses"), "aws4_request");
  const sig = crypto.createHmac("sha256", key).update(toSign).digest("hex");
  const r = await fetch(`https://${host}${path}`, { method: "POST", body,
    headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${c.id}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` } });
  if (!r.ok) throw new Error(`E-mail failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
}
