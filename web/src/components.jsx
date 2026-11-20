import { useEffect, useRef, useState } from "react";
import { APP_NAME, PLANS, categoryOf } from "./lib/config.js";
import { Icon, catStyle } from "./lib/icons.jsx";
import { discount, distanceKm, kmText, rupee, timeLeft, isJob } from "./lib/format.js";
import { navigate, useApp, useNow } from "./state.jsx";

export const Spinner = () => <div className="spinner" aria-label="Loading" />;

export function Empty({ icon, title, children, action }) {
  return <div className="empty"><div className="e">{icon}</div><b>{title}</b><div>{children}</div>{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>;
}

export function Countdown({ end }) {
  const now = useNow();
  const ms = end - now;
  return <span className={"tm " + (ms < 3600000 ? "hot" : "")}>{timeLeft(ms)}</span>;
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
      <OfferImage offer={offer}>{isJob(offer) ? <span className="off">JOB</span> : discount(offer) > 0 && <span className="off">-{discount(offer)}%</span>}</OfferImage>
      <div className="body">
        <div className="t">{offer.featured && <span className="featpill">Featured</span>}{offer.title}</div>
        <div className="s">{offer.business?.name}{r?.count ? <> · <span className="star">★ {Number(r.avg).toFixed(1)}</span></> : null} · {offer.business?.area}{km != null && km < 100 ? " · " + kmText(km) : ""}</div>
        <div className="foot">
          <div className="price">{isJob(offer) ? <b>Pay {rupee(offer.price)}</b> : <><b>{rupee(offer.price)}</b>{offer.origPrice > offer.price && <s>{rupee(offer.origPrice)}</s>}</>}</div>
          <Countdown end={offer.endsAt} />
        </div>
        {!(isCustomer || preview) && <div className="lock">🔒 Number locked</div>}
      </div>
    </>
  );
  if (preview) return <div className="card" style={{ pointerEvents: "none" }}>{body}</div>;
  return <a className="card" href={"#/offer/" + offer.id}>{body}</a>;
}

export function CategoryChips({ value, onChange, categories }) {
  return (
    <div className="chips">
      <button className={"chip " + (value === "all" ? "on" : "")} onClick={() => onChange("all")}>✨ All</button>
      {categories.map((c) => <button key={c.id} className={"chip " + (value === c.id ? "on" : "")} onClick={() => onChange(c.id)}><Icon d={catStyle(c.id).icon} size={16} style={{ marginRight: 6, color: value === c.id ? "#fff" : catStyle(c.id).ink }} />{c.label}</button>)}
    </div>
  );
}

export function PlanCard({ plan }) {
  const p = PLANS[plan];
  return (
    <div className="plan">
      <div style={{ fontWeight: 700, opacity: .8 }}>{p.name}</div>
      <div className="amt">{rupee(p.price)}<small> / month</small></div>
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
export function MapView({ offers, center }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let map, cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        if (cancelled || !ref.current) return;
        map = L.map(ref.current, { zoomControl: true }).setView([center.lat, center.lng], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
        L.circleMarker([center.lat, center.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2f7bff", fillOpacity: 1 }).addTo(map);
        const pts = [];
        offers.filter((o) => o.business?.lat != null).forEach((o) => {
          const icon = L.divIcon({ className: "", html: `<div class="price-pin">${o.emoji || ""} ${rupee(o.price)}</div>`, iconSize: null });
          L.marker([o.business.lat, o.business.lng], { icon }).addTo(map).on("click", () => navigate("/offer/" + o.id));
          pts.push([o.business.lat, o.business.lng]);
        });
        if (pts.length) map.fitBounds([...pts, [center.lat, center.lng]], { padding: [40, 40], maxZoom: 14 });
      } catch (e) {
        console.error(e);
        setFailed(true);
      }
    })();
    return () => { cancelled = true; if (map) map.remove(); };
  }, [offers, center.lat, center.lng]);
  if (failed) return <Empty icon="🗺️" title="Map couldn't load">Check your internet connection.</Empty>;
  return <div className="map-box" ref={ref} />;
}

export const catLabel = (id) => { const c = categoryOf(id); return `${c.icon} ${c.label}`; };
