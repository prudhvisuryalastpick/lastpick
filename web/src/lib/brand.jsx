// The "LP" monogram logo: L and P in white, with a price-tag hole in the P.
// Same mark in each app's own colour, so the apps never look the same:
//   customer: teal tile, lime dot · partner: gold tile, cream dot · admin: slate tile, blue dot
import { APP_NAME, IS_ADMIN_APP, IS_OWNER_APP } from "./config.js";

const VARIANT = IS_ADMIN_APP ? "admin" : IS_OWNER_APP ? "partner" : "customer";

const MARKS = {
  customer: {
    bg: ["#13867F", "#06373A"], label: APP_NAME, sub: "Deals near you", theme: "#06373A",
    art: `<path d="M13 14h7.5v28.5H32V50H13z" fill="#fff"/><path d="M35 14h8.5a10.5 10.5 0 0 1 0 21H42.5V50H35z" fill="#fff"/><circle cx="43.5" cy="24.5" r="3.8" fill="#D9F99D"/>`,
  },
  partner: {
    bg: ["#F2B654", "#8A3B0E"], label: `${APP_NAME} Business`, sub: "For partners", theme: "#3B1606",
    art: `<path d="M13 14h7.5v28.5H32V50H13z" fill="#fff"/><path d="M35 14h8.5a10.5 10.5 0 0 1 0 21H42.5V50H35z" fill="#fff"/><circle cx="43.5" cy="24.5" r="3.8" fill="#FFF1D6"/>`,
  },
  admin: {
    bg: ["#475569", "#0F172A"], label: `${APP_NAME} Admin`, sub: "Team only", theme: "#0F172A",
    art: `<path d="M13 14h7.5v28.5H32V50H13z" fill="#fff"/><path d="M35 14h8.5a10.5 10.5 0 0 1 0 21H42.5V50H35z" fill="#fff"/><circle cx="43.5" cy="24.5" r="3.8" fill="#93C5FD"/>`,
  },
};
export const BRAND = MARKS[VARIANT];

export function logoSvg(v = VARIANT) {
  const m = MARKS[v];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.bg[0]}"/><stop offset="1" stop-color="${m.bg[1]}"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#lg)"/>${m.art}</svg>`;
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
