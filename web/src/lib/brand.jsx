// One logo per app, so the customer, partner and admin apps never look the same.
//   customer: teal tile, white price tag with a lime dot ("deals near you")
//   partner:  warm gold tile, white shop awning ("your shop")
//   admin:    dark slate tile, white shield with a tick ("the LastPick team")
import { APP_NAME, IS_ADMIN_APP, IS_OWNER_APP } from "./config.js";

const VARIANT = IS_ADMIN_APP ? "admin" : IS_OWNER_APP ? "partner" : "customer";

const MARKS = {
  customer: {
    bg: ["#0E6B66", "#06373A"], label: APP_NAME, sub: "Deals near you", theme: "#06373A",
    art: `<path d="M17 18h14l16 16-13 13-17-16z" fill="#fff"/><circle cx="24" cy="25" r="3.4" fill="#D9F99D"/>`,
  },
  partner: {
    bg: ["#E8A33D", "#7A3410"], label: `${APP_NAME} Business`, sub: "For partners", theme: "#3B1606",
    art: `<path d="M14 26l4-9h28l4 9z" fill="#fff"/><path d="M14 26c0 3 2.5 5 6 5s6-2 6-5c0 3 2.5 5 6 5s6-2 6-5c0 3 2.5 5 6 5s6-2 6-5" fill="#FED7AA"/><rect x="17" y="31" width="30" height="16" rx="2" fill="#fff"/><rect x="28" y="36" width="8" height="11" rx="1" fill="#E8A33D"/>`,
  },
  admin: {
    bg: ["#334155", "#0F172A"], label: `${APP_NAME} Admin`, sub: "Team only", theme: "#0F172A",
    art: `<path d="M32 14l15 6v10c0 10-6.5 17-15 20-8.5-3-15-10-15-20V20z" fill="#fff"/><path d="M25 32l5 5 9-10" stroke="#334155" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
};
export const BRAND = MARKS[VARIANT];

export function logoSvg(v = VARIANT) {
  const m = MARKS[v];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.bg[0]}"/><stop offset="1" stop-color="${m.bg[1]}"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#lg)"/>${m.art}</svg>`;
}

export function Logo({ size = 38 }) {
  return <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: logoSvg() }} />;
}

// Logo + app name, used on the welcome and login screens.
export function Brand({ light = false, style }) {
  return (
    <div className={"brand brandmark" + (light ? " light" : "")} style={style}>
      <Logo size={40} />
      <span><b>{BRAND.label}</b><small>{BRAND.sub}</small></span>
    </div>
  );
}

// Tab icon, page title and browser colour per app.
export function applyBrand() {
  if (typeof document === "undefined") return;
  const href = "data:image/svg+xml," + encodeURIComponent(logoSvg());
  let link = document.querySelector("link[rel='icon']");
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
  link.type = "image/svg+xml"; link.href = href;
  document.title = VARIANT === "customer" ? `${APP_NAME} · Today's deals near you` : BRAND.label;
  const meta = document.querySelector("meta[name='theme-color']");
  if (meta) meta.content = BRAND.theme;
}
