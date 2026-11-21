// Sends e-mail (sign-up codes) through Brevo's transactional e-mail API (free plan: 300 e-mails a day).
// Needs BREVO_API_KEY and MAIL_FROM (a sender address verified in Brevo, e.g. "LastPick <no-reply@lastpick.in>").
import { BREVO_API_KEY, MAIL_FROM } from "./config.js";

function parseFrom(from) {
  const m = String(from).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1] || "LastPick", email: m[2] } : { name: "LastPick", email: String(from).trim() };
}

export async function sendEmail(to, subject, text) {
  if (!MAIL_FROM || !BREVO_API_KEY) throw new Error("E-mail is not set up");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: parseFrom(MAIL_FROM), to: [{ email: to }], subject, textContent: text }),
  });
  if (!r.ok) throw new Error(`E-mail failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
}
