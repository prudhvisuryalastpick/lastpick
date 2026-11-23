// E-mails to customers and partners about their account (sent through Amazon SES, see mail.js).
// Never blocks the action: if e-mail isn't set up or sending fails, the action still succeeds and the error is logged.
import { mailProvider, sendEmail } from "./mail.js";
import { one } from "./db.js";
import { sendWhatsAppUpdate, updatesOn } from "./whatsapp.js";

export const mailOn = () => !!mailProvider();
const anyOn = () => mailOn() || (WA_KINDS.size > 0 && updatesOn());
const SUPPORT = "support@lastpick.in";
const PARTNER_URL = "https://partner.lastpick.in";
const CUSTOMER_URL = "https://customer.lastpick.in";
const day = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const rupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const sign = `\n\nQuestions? Just reply to this e-mail or write to ${SUPPORT}.\n\nTeam LastPick\nToday's deals near you`;

const TEMPLATES = {
  welcome: (n) => ({
    subject: "Welcome to LastPick",
    text: `Hi ${n},\n\nYour LastPick account is ready. Every day you'll see fresh offers from verified shops, salons, hotels, travel and logistics near you. Tap "I'm interested" and the business gets only your name, never your number.\n\nStart here: ${CUSTOMER_URL}${sign}`,
  }),
  business_received: (n, d) => ({
    subject: "We received your business registration",
    text: `Hi ${n},\n\nThanks for registering ${d.business} on LastPick Business. Our team will check your details, usually within one working day. We'll message you as soon as your business is approved.${sign}`,
  }),
  business_verified: (n, d) => ({
    subject: `${d.business} is approved on LastPick`,
    text: `Hi ${n},\n\nGood news: ${d.business} is now verified on LastPick.${d.trialEnds ? ` Your free period runs until ${day(d.trialEnds)}.` : ""}\n\nYou can post up to 3 offers a day between 4 AM and 10:30 PM (hotels, travel and logistics any time). Post your first offer: ${PARTNER_URL}${sign}`,
  }),
  business_rejected: (n, d) => ({
    subject: `Update on your LastPick registration`,
    text: `Hi ${n},\n\nWe couldn't approve ${d.business} on LastPick yet.${d.note ? `\n\nReason: ${d.note}` : ""}\n\nYou can correct your details and submit again here: ${PARTNER_URL}${sign}`,
  }),
  business_suspended: (n, d) => ({
    subject: `${d.business} is paused on LastPick`,
    text: `Hi ${n},\n\nWe've paused ${d.business} on LastPick, so its offers aren't shown right now.${d.note ? `\n\nReason: ${d.note}` : ""}\n\nIf you think this is a mistake, write to us and we'll look into it.${sign}`,
  }),
  plan_active: (n, d) => ({
    subject: `Payment received: ${d.planName} is active`,
    text: `Hi ${n},\n\nThank you. We've received your payment and your ${d.planName} is active.\n\nPlan: ${d.planName}\nPeriod: ${d.months} month${d.months === 1 ? "" : "s"}\nAmount: ${rupees(d.amount)}\nActive until: ${day(d.until)}\n\nKeep this message as your receipt.${sign}`,
  }),
  plan_ended: (n, d) => ({
    subject: `Your ${d.planName} has ended`,
    text: `Hi ${n},\n\nYour ${d.planName} on LastPick has ended. To continue, renew it from the Plans page in the app.${sign}`,
  }),
  trial_extended: (n, d) => ({
    subject: "Your LastPick free period is extended",
    text: `Hi ${n},\n\nWe've extended your free period on LastPick Business. It now runs until ${day(d.until)}.${sign}`,
  }),
};
export const PLAN_NAMES = { customer: "Customer Pass", owner: "Business Pro" };

// Sends an account update by e-mail (Amazon SES). Payments, receipts, plan changes and password
// resets always go by e-mail. WhatsApp is used only for the mobile verification code; the WhatsApp copy of other
// updates is sent only for kinds listed in WA_KINDS (none for now) when WA_UPDATE_TEMPLATE is set.
const WA_KINDS = new Set([]);
export async function notify(userId, kind, data = {}) {
  if (!anyOn() || !TEMPLATES[kind]) return false;
  try {
    const u = await one("SELECT email, name, phone FROM users WHERE id = $1", [userId]);
    if (!u) return false;
    const first = String(u.name || "there").split(" ")[0];
    const t = TEMPLATES[kind](first, data);
    if (WA_KINDS.has(kind) && updatesOn() && u.phone && !mailOn()) {
      const body = t.text.replace(/^Hi [^,\n]*,\s*/, "").split(sign)[0].replace(/\s+/g, " ").trim();
      await sendWhatsAppUpdate(u.phone, first, `${t.subject}. ${body} Questions: ${SUPPORT}`);
      return true;
    }
    if (!mailOn() || !u.email) return false;
    await sendEmail(u.email, t.subject, t.text);
    return true;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "email failed", kind, error: String(e?.message || e).slice(0, 200) }));
    return false;
  }
}
