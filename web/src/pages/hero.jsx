// Sticker-style hero for the customer home (approved design): teal glow, light rays, floating bubbles,
// a frosted card, white-outlined stickers, a rotating badge and a category switcher.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../lib/icons.jsx";
import { CountUp } from "../components.jsx";

export const Cupcake = ({ top = "#F9A8D4", swirl = "#EC4899", wrap = "#F59E0B" }) => (
  <svg viewBox="0 0 120 130" width="100%" height="100%" aria-hidden="true">
    <path d="M22 70 L98 70 L88 124 L32 124 Z" fill={wrap} />
    <path d="M38 70 L42 124 M54 70 L55 124 M66 70 L65 124 M82 70 L78 124" stroke="rgba(0,0,0,.15)" strokeWidth="4" />
    <circle cx="35" cy="62" r="20" fill={top} /><circle cx="60" cy="52" r="26" fill={top} /><circle cx="85" cy="62" r="20" fill={top} /><circle cx="60" cy="34" r="16" fill={top} />
    <path d="M30 60 Q45 50 60 58 Q75 50 90 60" stroke={swirl} strokeWidth="5" fill="none" strokeLinecap="round" />
    <circle cx="62" cy="16" r="9" fill="#DC2626" /><path d="M62 8 Q66 0 74 2" stroke="#166534" strokeWidth="3" fill="none" />
  </svg>
);
export const Donut = () => (
  <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
    <circle cx="60" cy="60" r="54" fill="#E0A458" />
    <path d="M60 12 C88 10 110 32 108 58 C110 74 100 96 78 104 C60 112 30 106 18 86 C8 70 10 40 26 26 C36 16 48 12 60 12Z" fill="#7C3F1D" />
    {[["#FDE047", 0], ["#60A5FA", 0.7], ["#F472B6", 1.4], ["#34D399", 2.1], ["#fff", 2.8], ["#FDE047", 3.5], ["#60A5FA", 4.2], ["#F472B6", 4.9], ["#34D399", 5.6]].map(([c, a], i) => (
      <rect key={i} x={60 + 34 * Math.cos(a)} y={60 + 34 * Math.sin(a)} width="9" height="3.5" rx="1.7" fill={c} transform={`rotate(${i * 37} ${60 + 34 * Math.cos(a)} ${60 + 34 * Math.sin(a)})`} />
    ))}
    <circle cx="60" cy="60" r="17" fill="#F5E6D3" />
  </svg>
);
export const CakeSlice = () => (
  <svg viewBox="0 0 130 110" width="100%" height="100%" aria-hidden="true">
    <path d="M10 40 L120 18 L120 96 L10 100 Z" fill="#3B1D16" /><path d="M10 58 L120 44 L120 56 L10 70 Z" fill="#F9E3C2" />
    <path d="M10 82 L120 72 L120 82 L10 90 Z" fill="#F9E3C2" /><path d="M10 40 L120 18 L120 26 L10 48 Z" fill="#5B2A1E" />
    <circle cx="104" cy="14" r="10" fill="#DC2626" />
  </svg>
);
// icon sticker for categories without a drawing
export const IconSticker = ({ icon, bg, fg, size = 64, rot = -6 }) => (
  <span className="istk" style={{ width: size, height: size, background: bg, color: fg, transform: `rotate(${rot}deg)` }}><Icon d={icon} size={Math.round(size * 0.48)} stroke={2} /></span>
);

// Customer home: one line per kind of deal. The banner moves to the next every few seconds, in a new random
// order for each visitor; the button opens that category.
export const CUSTOMER_SLIDES = [
  { cat: "food", tag: "Fresh today, half price", title: "Sweet deals,\nbefore closing", sub: "Cakes, pastries and meals from shops near you, at closing-time prices.", cta: "See food deals",
    art: [[<Cupcake key="a" />, "s1"], [<Cupcake key="b" top="#BFDBFE" swirl="#3B82F6" wrap="#F472B6" />, "s2"], [<Donut key="c" />, "s3"], [<CakeSlice key="d" />, "s4"]], drawn: true },
  { cat: "stay", tag: "Open 24×7", title: "Rooms for\ntonight", sub: "Hotels near you drop prices on rooms still empty tonight.", cta: "See rooms",
    art: [["bed", "#DBEAFE", "#1D4ED8"], ["stay", "#E0E7FF", "#4338CA"], ["clock", "#FEF3C7", "#92400E"]] },
  { cat: "beauty", tag: "Free slots this evening", title: "Look good,\npay less", sub: "Salons and spas fill their empty slots with today-only prices.", cta: "See salon deals",
    art: [["scissors", "#FCE7F3", "#BE185D"], ["brush", "#FDE7F3", "#A3245E"], ["spark", "#FFE4E6", "#BE123C"]] },
  { cat: "travel", tag: "Leaving today", title: "Last-minute\nbus seats", sub: "Operators fill their final seats for less. Open 24×7.", cta: "See bus seats",
    art: [["bus", "#DCFCE7", "#15803D"], ["place", "#CCFBF1", "#0F766E"], ["clock", "#FEF9C3", "#A16207"]] },
  { cat: "makeup", tag: "Book for today", title: "Party ready,\nfor less", sub: "Makeup artists near you with free hours today, at lower prices.", cta: "See makeup",
    art: [["brush", "#FDE7F3", "#A3245E"], ["spark", "#FFE4E6", "#BE123C"], ["heart", "#FCE7F3", "#BE185D"]] },
  { cat: "fashion", tag: "Last pieces", title: "Last sizes,\nlowest prices", sub: "Clothes and shoe shops clearing today's stock near you.", cta: "See fashion",
    art: [["tag", "#EDE9FE", "#6D28D9"], ["bag", "#FCE7F3", "#BE185D"], ["star", "#FEF3C7", "#92400E"]] },
  { cat: "appliances", tag: "Today only", title: "Gadgets at\ntoday's price", sub: "Phones, TVs and appliances from stores near you, for today only.", cta: "See gadgets",
    art: [["tv", "#E0F2FE", "#0369A1"], ["phoneDevice", "#DBEAFE", "#1D4ED8"], ["rupeeSave", "#DCFCE7", "#15803D"]] },
  { cat: "shops", tag: "From your street", title: "Your local shop\nhas a deal", sub: "Every rupee stays local. Call the owner directly.", cta: "See shop deals",
    art: [["store", "#FFEDD5", "#9A3412"], ["bag", "#FEF3C7", "#92400E"], ["heart", "#FCE7F3", "#BE185D"]] },
  { cat: "logistics", tag: "Space on today's trips", title: "Send it today,\nfor less", sub: "Trucks and tempos with free space on today's trips near you.", cta: "See transport",
    art: [["truck", "#E0F2FE", "#0369A1"], ["box", "#FEF3C7", "#92400E"], ["place", "#CCFBF1", "#0F766E"]] },
];

const shuffle = (n) => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const EVERY = 3500;

// counts: [{ icon, n, label }] shown in the bar at the bottom of the banner (exact numbers, counted up from 1)
// slides: the lines the banner moves through (customer lines by default; the partner app passes its own)
export function StickerHero({ top, liveCount, onOpen, counts, slides = CUSTOMER_SLIDES, badge = "DEALS · BEFORE · MIDNIGHT · ", badgeIcon = "clock", variant = "", pill }) {
  const order = useMemo(() => shuffle(slides.length), [slides]);
  const [k, setK] = useState(0);
  useEffect(() => {
    if (slides.length < 2 || matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => { if (!document.hidden) setK((x) => (x + 1) % slides.length); }, EVERY);
    return () => clearInterval(t);
  }, [slides]);
  const s = slides[order[k]];
  const partner = variant === "partner";
  return (
    <section className={"shero" + (variant ? " " + variant : "")} aria-label={partner ? "LastPick Partner" : "Today's deals"}>
      <div className="rays" aria-hidden="true">{[18, 28, 40, 55, 66].map((x, i) => <span key={i} style={{ left: x + "%", width: [60, 26, 90, 30, 70][i] }} />)}</div>
      <div className="bubbles" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i} style={{ left: (i * 37) % 100 + "%", top: 40 + ((i * 53) % 60) + "%", width: [8, 12, 18, 10, 24, 14][i % 6], height: [8, 12, 18, 10, 24, 14][i % 6], animationDelay: (i * 0.8) % 9 + "s" }} />)}</div>
      {top}
      <div className="shero-badge" aria-hidden="true">
        <svg viewBox="0 0 100 100"><defs><path id="hb" d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0" /></defs><text><textPath href="#hb">{badge}</textPath></text></svg>
        <Icon d={badgeIcon} size={26} stroke={2.4} />
      </div>
      <div className="shero-art" key={"a" + k}>
        {partner
          ? s.art.map(([i, bg, fg], k) => <span key={k} className={"stk p" + (k + 1)}><IconSticker icon={i} bg={bg} fg={fg} size={[86, 70, 64, 60][k]} rot={[-8, 10, -5, 8][k]} /></span>)
          : s.drawn
          ? s.art.map(([el, cls]) => <span key={cls} className={"stk " + cls}>{el}</span>)
          : s.art.map(([i, bg, fg], k) => <span key={k} className={"stk s" + (k + 1)}><IconSticker icon={i} bg={bg} fg={fg} size={[110, 84, 70][k]} rot={[-8, 10, -4][k]} /></span>)}
      </div>
      <div className="shero-card">
        <div className="slide" key={"c" + k}>
          <span className="tag"><Icon d="spark" size={13} stroke={2.2} />{s.tag}</span>
          <h1>{s.title}</h1>
          <p>{s.sub}</p>
        </div>
        <div className="row2">
          <button className="pill dark" onClick={() => onOpen(s.cat)}>{s.cta}</button>
          {pill || <span className="pill light">{liveCount != null ? `${liveCount} live near you` : "Live near you"}</span>}
        </div>
      </div>
      {counts?.length > 0 && (
        <div className="shero-switch counts" aria-label="LastPick in numbers">
          {counts.map((c) => (
            <span key={c.label} className="cnt">
              <span className="ic"><Icon d={c.icon} size={16} stroke={2} /></span>
              <span className="cv"><b><CountUp n={c.n} /></b><small>{c.label}</small></span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
