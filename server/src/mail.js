// Sends e-mail (sign-up codes, password resets, approvals, payment receipts) through Brevo only.
// BREVO_API_KEY is the Brevo API key; MAIL_FROM is the sender, e.g. "LastPick <support@lastpick.in>"
// (a sender or domain verified in Brevo).
import { BREVO_API_KEY, MAIL_FROM, MAIL_REPLY_TO } from "./config.js";

function parseFrom(from) {
  const m = String(from).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1] || "LastPick", email: m[2] } : { name: "LastPick", email: String(from).trim() };
}

export const mailProvider = () => (MAIL_FROM && BREVO_API_KEY ? "brevo" : "");

// SMS codes are not used. Kept so older callers fail clearly.
export async function sendSms() { throw new Error("SMS is not set up"); }

export async function sendEmail(to, subject, text) {
  if (!mailProvider()) throw new Error("E-mail is not set up (BREVO_API_KEY or MAIL_FROM missing)");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: parseFrom(MAIL_FROM), replyTo: { email: MAIL_REPLY_TO }, to: [{ email: to }], subject, textContent: text }),
  });
  if (!r.ok) throw new Error(`E-mail (Brevo) failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
}
