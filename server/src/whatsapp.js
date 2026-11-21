// WhatsApp messages through Meta's WhatsApp Cloud API (graph.facebook.com), with approved message templates.
//  - Login codes: an "Authentication" template (Meta's standard one-time-code template with a "Copy code" button).
//  - Account updates (approved, receipt, …): an optional "Utility" template with two variables: name and the update.
// Settings (Supabase function secrets, set by the deploy from GitHub):
//   WA_PHONE_NUMBER_ID  the phone number ID from Meta (WhatsApp -> API setup)
//   WA_ACCESS_TOKEN     a permanent System User token with the whatsapp_business_messaging permission
//   WA_OTP_TEMPLATE     name of the approved authentication template (default lastpick_otp), language WA_LANG (default en)
//   WA_UPDATE_TEMPLATE  name of the approved utility template for updates (optional; empty = no update messages)
import { WA_ACCESS_TOKEN, WA_API_BASE, WA_API_VERSION, WA_LANG, WA_OTP_TEMPLATE, WA_PHONE_NUMBER_ID, WA_UPDATE_TEMPLATE } from "./config.js";

export const whatsappOn = () => !!(WA_PHONE_NUMBER_ID && WA_ACCESS_TOKEN);

async function send(to, template) {
  if (!whatsappOn()) throw new Error("WhatsApp is not set up");
  const r = await fetch(`${WA_API_BASE}/${WA_API_VERSION}/${WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: String(to).replace(/\D/g, ""), type: "template", template }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp failed (${r.status}): ${JSON.stringify(j?.error || j).slice(0, 300)}`);
  return j;
}

// The 6-digit login code. Authentication templates take the code in the body and in the "Copy code" button.
export function sendWhatsAppCode(to, code) {
  return send(to, {
    name: WA_OTP_TEMPLATE, language: { code: WA_LANG },
    components: [
      { type: "body", parameters: [{ type: "text", text: code }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
    ],
  });
}

// An account update (business approved, payment received, …): "Hi {{1}}, … {{2}}".
export const updatesOn = () => whatsappOn() && !!WA_UPDATE_TEMPLATE;
export function sendWhatsAppUpdate(to, name, text) {
  if (!updatesOn()) throw new Error("WhatsApp updates are not set up");
  // WhatsApp template variables can't contain new lines or many spaces in a row
  const clean = (s, n) => String(s || "").replace(/\s*\n+\s*/g, " · ").replace(/ {4,}/g, "   ").trim().slice(0, n);
  return send(to, {
    name: WA_UPDATE_TEMPLATE, language: { code: WA_LANG },
    components: [{ type: "body", parameters: [{ type: "text", text: clean(name, 60) || "there" }, { type: "text", text: clean(text, 900) }] }],
  });
}
