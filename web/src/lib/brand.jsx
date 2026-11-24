// The "LP" monogram logo: L and P in white, with a price-tag hole in the P (partner adds a PARTNER label).
// Same mark in each app's own colour, so the apps never look the same:
//   customer: teal tile, lime dot · partner: gold tile, cream dot · admin: slate tile, blue dot
import { APP_NAME, IS_ADMIN_APP, IS_OWNER_APP } from "./config.js";
import { logoSvg as rawLogoSvg } from "./brand-svg.js";

const VARIANT = IS_ADMIN_APP ? "admin" : IS_OWNER_APP ? "partner" : "customer";

const MARKS = {
  customer: {
    bg: ["#13867F", "#06373A"], label: APP_NAME, sub: "Deals near you", theme: "#06373A",
  },
  partner: {
    bg: ["#F2B654", "#8A3B0E"], label: `${APP_NAME} Partner`, sub: "For businesses", theme: "#3B1606",
  },
  admin: {
    bg: ["#475569", "#0F172A"], label: `${APP_NAME} Admin`, sub: "Team only", theme: "#0F172A",
  },
};
export const BRAND = MARKS[VARIANT];

export function logoSvg(v = VARIANT) {
  return rawLogoSvg(v);
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
