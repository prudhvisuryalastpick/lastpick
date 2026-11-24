// The LP tile as SVG, plain JS so the build (vite.config.js) can use it too. Colours and art per app.
export const MARK_ART = {
  customer: { bg: ["#13867F", "#06373A"], art: `<path d="M13 14h7.5v28.5H32V50H13z" fill="#fff"/><path d="M35 14h8.5a10.5 10.5 0 0 1 0 21H42.5V50H35z" fill="#fff"/><circle cx="43.5" cy="24.5" r="3.8" fill="#D9F99D"/>` },
  partner: { bg: ["#F2B654", "#8A3B0E"], art: `<g transform="translate(7.5 1) scale(.77)"><path d="M13 14h7.5v28.5H32V50H13z" fill="#fff"/><path d="M35 14h8.5a10.5 10.5 0 0 1 0 21H42.5V50H35z" fill="#fff"/><circle cx="43.5" cy="24.5" r="3.8" fill="#FFF1D6"/></g><text x="32" y="55.5" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="8.6" font-weight="800" letter-spacing="1.1" fill="#fff">PARTNER</text>` },
  admin: { bg: ["#475569", "#0F172A"], art: `<path d="M13 14h7.5v28.5H32V50H13z" fill="#fff"/><path d="M35 14h8.5a10.5 10.5 0 0 1 0 21H42.5V50H35z" fill="#fff"/><circle cx="43.5" cy="24.5" r="3.8" fill="#93C5FD"/>` },
};
export function logoSvg(v) {
  const m = MARK_ART[v];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.bg[0]}"/><stop offset="1" stop-color="${m.bg[1]}"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#lg)"/>${m.art}</svg>`;
}
