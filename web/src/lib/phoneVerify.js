// Mobile number check at sign-up with Firebase Phone Authentication (Google texts a 6-digit code to the phone).
// Firebase is loaded only when needed, so it adds nothing to the app's start-up time.
// After the right code is entered, Firebase gives a signed token that the LastPick server checks (server/src/firebase.js).
import { FIREBASE } from "./config.js";

export const phoneCheckOn = () => !!(FIREBASE.apiKey && FIREBASE.projectId);
let auth = null, verifier = null, confirmation = null;

async function fb() {
  const [{ initializeApp, getApps }, authMod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  if (!auth) {
    const app = getApps()[0] || initializeApp(FIREBASE);
    auth = authMod.getAuth(app);
    auth.languageCode = "en";
  }
  return { auth, ...authMod };
}

// Plain-language messages for Firebase's error codes.
export function phoneError(e) {
  const c = String(e?.code || "");
  if (c.includes("invalid-phone-number")) return "This mobile number isn't valid. Please check it.";
  if (c.includes("too-many-requests")) return "Too many tries from this device. Please wait a while and try again.";
  if (c.includes("invalid-verification-code")) return "The mobile (SMS) code is not right. Please check the SMS and try again.";
  if (c.includes("code-expired")) return "The mobile (SMS) code has expired. Tap Resend code.";
  if (c.includes("quota-exceeded") || c.includes("billing")) return "We can't send SMS codes right now. Please try again later.";
  if (c.includes("captcha")) return "The security check didn't finish. Please try again.";
  if (c.includes("network")) return "Can't reach the verification service. Check your internet and try again.";
  return e?.message || "Couldn't verify the mobile number. Please try again.";
}

// Sends the SMS code. `buttonId` is the element the invisible security check (reCAPTCHA) attaches to.
export async function sendPhoneCode(phoneE164, buttonId) {
  const f = await fb();
  try { verifier?.clear(); } catch { /* ignore */ }
  verifier = new f.RecaptchaVerifier(f.auth, buttonId, { size: "invisible" });
  confirmation = await f.signInWithPhoneNumber(f.auth, phoneE164, verifier);
}

// Checks the code the person typed; returns the signed token for the LastPick server.
export async function confirmPhoneCode(code) {
  if (!confirmation) throw Object.assign(new Error("Please send the SMS code first."), { code: "no-confirmation" });
  const f = await fb();
  const cred = await confirmation.confirm(String(code).trim());
  const token = await cred.user.getIdToken(true);
  await f.signOut(f.auth).catch(() => {}); // LastPick has its own login; Firebase was only for the check
  return token;
}
