import { useEffect, useRef, useState } from "react";
import { APP_NAME, COMPANY_LINE, IS_ADMIN_APP, PLANS, SOCIAL, SUPPORT_EMAIL, categoryOf } from "./lib/config.js";
import { api } from "./api/index.js";
import { Icon, catStyle } from "./lib/icons.jsx";
import { clockIST, discount, distanceKm, hoursText, kmText, rupee, timeLeft, isJob } from "./lib/format.js";
import { navigate, useApp, useNow } from "./state.jsx";
import { msToNextSlot, quoteForOffer, stripQuotes } from "./lib/quotes.js";

export const Spinner = () => <div className="spinner" aria-label="Loading" />;

// Shown under a problem message (customer and partner apps): where to get help, and how long it takes.
export const TICKET_DAYS = "1–5 working days";
// payment: ask for a clear screenshot of the payment when they e-mail us
export function TicketHint({ style, payment = false }) {
  if (IS_ADMIN_APP) return null;
  const mail = <a className="link" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(payment ? "Payment problem" : "Problem in LastPick")}`}>{SUPPORT_EMAIL}</a>;
  return <div className="muted small" style={{ marginTop: 6, ...style }}>Still a problem? <a className="link" href="#/grievance">Raise a ticket</a>, or e-mail {payment ? "a clear screenshot of the payment" : "the details (a screenshot helps)"} to {mail}. We resolve it in {TICKET_DAYS}.</div>;
}

// ---- live counts (real numbers from /api/stats, refreshed every minute) ----
export function useStats(pincode) {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.stats(pincode).then((r) => alive && setS(r)).catch(() => {});
    load(); const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [pincode]);
  return s;
}
// counts up from 0 when shown (or from the old number when it changes), then shows "+"
export function CountUp({ n }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current, to = Number(n) || 0, t0 = performance.now(), dur = 900;
    if (matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(to); from.current = to; return; }
    let raf;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); setV(Math.round(start + (to - start) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); else from.current = to; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <>{v.toLocaleString("en-IN")}{Number(n) > 0 ? "+" : ""}</>;
}
// two boxes side by side: [area count] [LastPick total]
export function StatPair({ left, right }) {
  return (
    <div className="statpair">
      {[left, right].filter(Boolean).map((b, i) => (
        <div key={i} className={"statbox " + (i ? "dark" : "")}>
          <div className="sl">{b.label}</div>
          <div className="sn" aria-live="polite"><CountUp n={b.n} /></div>
          {b.sub && <div className="ss">{b.sub}</div>}
        </div>
      ))}
    </div>
  );
}
// newly verified partners, one line at a time (real businesses: name and area only)
export function JoinedTicker({ joined }) {
  const [i, setI] = useState(0);
  const now = useNow(30000);
  useEffect(() => { if (!joined?.length) return; const t = setInterval(() => setI((x) => (x + 1) % joined.length), 3500); return () => clearInterval(t); }, [joined?.length]);
  if (!joined?.length) return null;
  const j = joined[i % joined.length];
  const mins = Math.max(1, Math.round((now - j.at) / 60000));
  const ago = mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : `${Math.round(mins / 1440)} day${mins >= 2880 ? "s" : ""} ago`;
  return (
    <div className="ticker" role="status"><span className="dot" aria-hidden="true" />
      <span key={i} className="tk"><b>{j.name}</b>{j.area ? ` from ${j.area}` : ""} joined · {ago}</span></div>
  );
}
export function CompanyLine({ style }) {
  return <div className="muted small center" style={{ padding: "4px 16px 18px", ...style }}>{COMPANY_LINE}</div>;
}

export function Empty({ icon, title, children, action }) {
  return <div className="empty"><div className="e">{icon}</div><b>{title}</b><div>{children}</div>{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>;
}

export function Countdown({ end }) {
  const now = useNow();
  const ms = end - now;
  return <span className={"tm " + (ms < 3600000 ? "hot" : "")} title={ms > 0 ? "Ends at " + clockIST(end) : ""}>{ms > 0 ? "Ends in " + hoursText(ms) : "Ended"}</span>;
}

// The offer's photo, or its category icon on the category colour when there's no photo.
export function OfferImage({ offer, className = "top", children, size }) {
  if (offer.photoUrl) return <div className={className} style={{ backgroundImage: `url("${offer.photoUrl}")` }}>{children}</div>;
  const s = catStyle(offer.category);
  const px = size || (className.includes("hero") ? 84 : className.includes("ic") || className.includes("li") ? 22 : 40);
  return <div className={className} style={{ background: s.tint, color: s.ink }}><Icon d={s.icon} size={px} stroke={1.6} />{children}</div>;
}

export function OfferCard({ offer, preview = false }) {
  const { location, isCustomer } = useApp();
  const km = distanceKm(location, offer.business);
  const r = offer.business?.rating;
  const body = (
    <>
      <OfferImage offer={offer}>{isJob(offer) ? <span className="off">JOB</span> : offer.price != null && discount(offer) > 0 && <span className="off">-{discount(offer)}%</span>}</OfferImage>
      <div className="body">
        <div className="t">{offer.featured && <span className="featpill">Featured</span>}{offer.title}</div>
        <div className="s">{offer.business?.name}{r?.count ? <> · <span className="star">★ {Number(r.avg).toFixed(1)}</span></> : null} · {offer.business?.area}{km != null && km < 100 ? " · " + kmText(km) : ""}</div>
        <div className="foot">
          <div className="price">{isJob(offer) ? <b>Pay {rupee(offer.price)}</b> : <><b>{offer.price == null ? "₹ –" : offer.price === 0 ? "Free" : rupee(offer.price)}</b>{offer.price != null && offer.origPrice > offer.price && <><s>{rupee(offer.origPrice)}</s><span className="pct">{discount(offer)}% off</span></>}</>}</div>
          <Countdown end={offer.endsAt} />
        </div>
        <OfferQuote offer={offer} />
        {!(isCustomer || preview) && <div className="lock">Number locked · get the Customer Pass</div>}
      </div>
    </>
  );
  if (preview) return <div className="card" style={{ pointerEvents: "none" }}>{body}</div>;
  return <a className="card" href={"#/offer/" + offer.id}>{body}</a>;
}

// Re-renders exactly when the quotes change (every 30 minutes).
export function useQuoteTick() {
  const [, set] = useState(0);
  useEffect(() => { let t; const arm = () => { t = setTimeout(() => { set((n) => n + 1); arm(); }, msToNextSlot()); }; arm(); return () => clearTimeout(t); }, []);
}
// The short moral quote shown on every post. Picked automatically; changes every 30 minutes.
export function OfferQuote({ offer, big = false }) {
  useQuoteTick();
  return <div className={"oquote" + (big ? " big" : "")}><span aria-hidden="true">“</span>{quoteForOffer(offer)}</div>;
}
// Quotes scrolling from right to left. A fresh set every 30 minutes.
export const QUOTE_SHOW_MS = 7000;

export function QuoteStrip({ partner = false, variant = "bar" }) {
  useQuoteTick();
  const q = stripQuotes(partner);
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), QUOTE_SHOW_MS);
    return () => clearInterval(t);
  }, []);
  const text = q[i % q.length];
  return (
    <div className={variant === "bar" ? "qstrip" : "qstrip q" + variant} aria-live="polite">
      <span key={i + text} className="qitem qone"><i aria-hidden="true">✦</i>{text}</span>
    </div>
  );
}

export function CategoryChips({ value, onChange, categories }) {
  return (
    <div className="chips">
      <button className={"chip " + (value === "all" ? "on" : "")} onClick={() => onChange("all")}>✨ All</button>
      {categories.map((c) => <button key={c.id} className={"chip " + (value === c.id ? "on" : "")} onClick={() => onChange(c.id)}><Icon d={catStyle(c.id).icon} size={16} style={{ marginRight: 6, color: value === c.id ? "#fff" : catStyle(c.id).ink }} />{c.label}</button>)}
    </div>
  );
}

// fromDay: show "from ₹16.6 a day" (Plans page) instead of the 30-day price
export function PlanCard({ plan, fromDay }) {
  const p = PLANS[plan];
  return (
    <div className="plan">
      <div style={{ fontWeight: 700, opacity: .8 }}>{p.name}</div>
      <div style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 18, marginTop: 4 }}>{p.tagline}{p.perPost || p.perDay ? ` · just ${p.perPost || p.perDay}` : ""}</div>
      {fromDay ? <div className="amt">from ₹{fromDay}<small> a day</small></div> : <div className="amt">{rupee(p.price)}<small> / {p.period || "30 days"}</small></div>}
      <ul>{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

export function Toggle({ on, onChange, title, sub }) {
  return (
    <div className="toggle">
      <div><b style={{ fontSize: 14 }}>{title}</b>{sub && <div className="muted small">{sub}</div>}</div>
      <button type="button" aria-pressed={on} className={"sw " + (on ? "on" : "")} onClick={() => onChange(!on)} />
    </div>
  );
}

export function Sheet({ onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="sheet">{children}</div></div>;
}

export function BackButton({ to }) {
  return <button className="back" aria-label="Back" onClick={() => (to ? navigate(to) : window.history.length > 1 ? window.history.back() : navigate("/"))}><Icon d="back" size={20} stroke={2.2} /></button>;
}

// Requires login; otherwise shows a prompt that returns here after login.
export function NeedLogin({ children, why = "Log in to continue" }) {
  const { session, loading } = useApp();
  if (loading) return <Spinner />;
  if (!session) {
    const next = encodeURIComponent(window.location.hash.slice(1) || "/");
    return <Empty icon={<span className="emptyic"><Icon d="lock" size={30} /></span>} title={why} action={<a className="btn main" style={{ maxWidth: 320 }} href={`#/login?next=${next}`}><Icon d="user" size={18} stroke={2.2} />Log in or sign up</a>}>It takes less than a minute.</Empty>;
  }
  return children;
}

export const Disclaimer = () => (
  <div className="note">
    {APP_NAME} only connects customers and owners. The offer, payment and service are between you and the other party, and {APP_NAME} is not
    responsible for them. Never pay an advance to someone you haven't verified. See our <a className="link" href="#/terms">terms</a>.
  </div>
);

// Leaflet map, loaded only when shown.
// Map of offers around the customer. Built ONCE, then only the markers and centre are updated, so it doesn't flash
// or lose its tiles when the list refreshes. Re-measures itself when its box changes size (the usual reason a
// Leaflet map shows grey or half-loaded tiles).
export function MapView({ offers, center }) {
  const ref = useRef(null);
  const mapRef = useRef(null);   // { L, map, layer, me }
  const fitted = useRef(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false, ro = null;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        if (cancelled || !ref.current) return;
        const map = L.map(ref.current, { zoomControl: true }).setView([center.lat, center.lng], 12);
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
        let errors = 0;
        tiles.on("tileerror", () => { errors += 1; if (errors > 20) setFailed(true); });
        tiles.on("load", () => { errors = 0; });
        tiles.addTo(map);
        const layer = L.layerGroup().addTo(map);
        const me = L.circleMarker([center.lat, center.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2f7bff", fillOpacity: 1 }).addTo(map);
        mapRef.current = { L, map, layer, me };
        // measure again once the page has laid out, and whenever the box resizes
        requestAnimationFrame(() => map.invalidateSize());
        setTimeout(() => map.invalidateSize(), 400);
        if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(() => map.invalidateSize()); ro.observe(ref.current); }
        setReady(true);
      } catch (e) {
        console.error(e);
        setFailed(true);
      }
    })();
    return () => { cancelled = true; if (ro) ro.disconnect(); if (mapRef.current) { mapRef.current.map.remove(); mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // markers: replaced when the offers change, without rebuilding the map
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    m.layer.clearLayers();
    m.me.setLatLng([center.lat, center.lng]);
    const pts = [];
    (offers || []).filter((o) => o.business?.lat != null).forEach((o) => {
      const icon = m.L.divIcon({ className: "", html: `<div class="price-pin">${rupee(o.price)}</div>`, iconSize: null });
      m.L.marker([o.business.lat, o.business.lng], { icon }).addTo(m.layer).on("click", () => navigate("/offer/" + o.id));
      pts.push([o.business.lat, o.business.lng]);
    });
    // zoom to fit only the first time, so a refresh doesn't jump the map while someone is looking around
    if (!fitted.current) {
      if (pts.length) m.map.fitBounds([...pts, [center.lat, center.lng]], { padding: [40, 40], maxZoom: 14 });
      else m.map.setView([center.lat, center.lng], 12);
      fitted.current = true;
    }
  }, [ready, offers, center.lat, center.lng]);
  if (failed) return <Empty icon="🗺️" title="Map couldn't load" action={<button className="btn ghost" onClick={() => window.location.reload()}>Try again</button>}>Check your internet connection and try again.</Empty>;
  return <div className="map-box" ref={ref} />;
}

export const catLabel = (id) => { const c = categoryOf(id); return `${c.icon} ${c.label}`; };

// Keeps a page's data fresh: loads now, again every 20 seconds, and whenever the window comes back into view.
// load(first) gets true only for the first load, so later reloads can skip the spinner.
export function useLive(load, deps = [], ms = 20000) {
  useEffect(() => {
    load(true);
    const t = setInterval(() => { if (document.visibilityState !== "hidden") load(false); }, ms);
    const back = () => { if (document.visibilityState !== "hidden") load(false); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// Instagram and YouTube icons. While a link isn't set yet, the icon is shown greyed out with "coming soon".
export function SocialLinks({ style, className = "" }) {
  const items = [
    ["instagram", "Instagram", <svg key="i" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>],
    ["youtube", "YouTube", <svg key="y" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></svg>],
  ];
  return (
    <div className={"social-links " + className} style={style}>
      {items.map(([k, label, icon]) => (SOCIAL[k]
        ? <a key={k} href={SOCIAL[k]} target="_blank" rel="noopener noreferrer" aria-label={`${APP_NAME} on ${label}`} title={label}>{icon}</a>
        : <span key={k} className="soon" aria-label={`${label} (coming soon)`} title={`${label} (coming soon)`}>{icon}</span>))}
    </div>
  );
}

