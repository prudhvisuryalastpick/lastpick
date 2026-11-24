// "Install app" (add to home screen). Android/Chrome: the browser's own install prompt, caught here at start-up.
// iPhone/iPad: Apple has no install prompt, so the app shows the Safari steps instead.
let deferred = null;
const subs = new Set();
const ping = () => subs.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; ping(); });
  window.addEventListener("appinstalled", () => { deferred = null; try { localStorage.setItem("lp_installed", "1"); } catch {} ping(); });
}
export const isInstalled = () => {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone) return true;
  try { return localStorage.getItem("lp_installed") === "1"; } catch { return false; }
};
const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);
export const isIOS = () => /iphone|ipad|ipod/i.test(ua()) || (/macintosh/i.test(ua()) && typeof document !== "undefined" && "ontouchend" in document);
// Instagram, Facebook, WhatsApp and other in-app browsers can't install: the page must be opened in Safari/Chrome first.
export const inAppBrowser = () => /instagram|fban|fbav|fb_iab|whatsapp|line\/|snapchat|twitter/i.test(ua());
export const canPrompt = () => !!deferred;
export function onInstallChange(f) { subs.add(f); return () => subs.delete(f); }
// Returns "installed" | "dismissed" | "ios" | "inapp" | "manual" (no prompt available: show the browser-menu steps)
export async function install() {
  if (inAppBrowser()) return "inapp";
  if (deferred) {
    const e = deferred; deferred = null; ping();
    e.prompt();
    const r = await e.userChoice.catch(() => null);
    return r?.outcome === "accepted" ? "installed" : "dismissed";
  }
  return isIOS() ? "ios" : "manual";
}
