// Sends e-mail (sign-up codes, approvals, payment receipts) through Brevo's transactional e-mail API (free plan: 300 e-mails a day).
// Needs BREVO_API_KEY and MAIL_FROM (a sender address verified in Brevo, e.g. "LastPick <no-reply@lastpick.in>").
import { BREVO_API_KEY, MAIL_FROM, MAIL_REPLY_TO, SMS_SENDER } from "./config.js";

function parseFrom(from) {
  const m = String(from).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1] || "LastPick", email: m[2] } : { name: "LastPick", email: String(from).trim() };
}

// SMS through Brevo's transactional SMS API. `to` is an Indian number like "+919876543210".
export async function sendSms(to, content) {
  if (!SMS_SENDER || !BREVO_API_KEY) throw new Error("SMS is not set up");
  const r = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: SMS_SENDER, recipient: String(to).replace(/[^\d]/g, ""), content }),
  });
  if (!r.ok) throw new Error(`SMS failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

export async function sendEmail(to, subject, text) {
  if (!MAIL_FROM || !BREVO_API_KEY) throw new Error("E-mail is not set up");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: parseFrom(MAIL_FROM), replyTo: { email: MAIL_REPLY_TO }, to: [{ email: to }], subject, textContent: text }),
  });
  if (!r.ok) throw new Error(`E-mail failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
}
