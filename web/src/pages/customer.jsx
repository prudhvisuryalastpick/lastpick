import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/index.js";
import { SavingsCard } from "./impact.jsx";
import { SponsoredBanner } from "./revenue.jsx";
import { BackButton, CategoryChips, Countdown, Disclaimer, Empty, MapView, NeedLogin, OfferCard, OfferImage, Sheet, Spinner, catLabel } from "../components.jsx";
import { APP_NAME, CATEGORIES, IS_CUSTOMER_APP, IS_NATIVE, IS_OWNER_APP, MAJOR_CITIES, PARTNER_URL, PLANS, REPORT_REASONS, categoryOf, cityKey } from "../lib/config.js";
import { HOME_TILES, Icon, catStyle } from "../lib/icons.jsx";
import { RatingBadge, ReviewSheet, ReviewsBlock } from "./reviews.jsx";
import { ago, day, daysLeft, discount, distanceKm, errText, isJob, kmText, prettyPhone, rupee, telLink, timeLeft, validPhone, waLink } from "../lib/format.js";
import { navigate, nearestCity, useApp, useNow } from "../state.jsx";
import { RADIUS_OPTIONS, validPincode } from "../lib/geo.js";

function useLiveOffers(city) {
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setOffers(null); setError("");
    const load = () => api.listLive(city).then((o) => alive && setOffers(o)).catch((e) => alive && setError(errText(e)));
    load();
    const i = setInterval(load, 120000);
    return () => { alive = false; clearInterval(i); };
  }, [city]);
  return { offers, error };
}

// Offers for the area the customer chose: within N km of them, in a pincode, or a whole city.
function useAreaOffers() {
  const { area, location, locationStatus, city } = useApp();
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState("");
  const needGps = area.mode === "near" && !location.exact;
  const key = area.mode === "near" ? `near:${area.radius}:${location.lat.toFixed(3)},${location.lng.toFixed(3)}:${location.exact}`
    : area.mode === "pincode" ? `pin:${area.pincode}` : `city:${city.key}`;
  useEffect(() => {
    if (needGps) { setOffers(null); return; }
    let alive = true;
    setOffers(null); setError("");
    const load = () => (area.mode === "near" ? api.listNearby(location.lat, location.lng, area.radius)
      : area.mode === "pincode" ? api.listByPincode(area.pincode) : api.listLive(city.key))
      .then((o) => alive && setOffers(o)).catch((e) => alive && setError(errText(e)));
    load();
    const i = setInterval(load, 120000);
    return () => { alive = false; clearInterval(i); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { offers, error, needGps, locationStatus };
}

export function areaLabel(area, city) {
  if (area.mode === "near") return `Within ${area.radius} km of you`;
  if (area.mode === "pincode") return `Pincode ${area.pincode}`;
  return city.name;
}

// Choose where to see offers: near me (radius), a pincode, or a whole city.
function AreaSheet({ onClose }) {
  const { area, setArea, locationStatus } = useApp();
  const [pin, setPin] = useState(area.mode === "pincode" ? area.pincode : "");
  const [showCities, setShowCities] = useState(false);
  if (showCities) return <CityPicker onClose={onClose} onPicked={() => setArea({ mode: "city" })} />;
  return (
    <Sheet onClose={onClose}>
      <h2 className="title" style={{ fontSize: 19 }}>Show offers</h2>
      <div className="label-up" style={{ padding: "14px 0 6px" }}>Near me</div>
      {locationStatus === "denied" || locationStatus === "unavailable"
        ? <div className="banner warn" style={{ margin: 0 }}>Location is off. Allow location for this site/app to see offers near you, or use your pincode below.</div>
        : <div className="chips" style={{ padding: 0 }}>{RADIUS_OPTIONS.map((r) => (
          <button key={r} className={"chip " + (area.mode === "near" && area.radius === r ? "on" : "")} onClick={() => { setArea({ mode: "near", radius: r }); onClose(); }}>Within {r} km</button>
        ))}</div>}
      <div className="label-up" style={{ padding: "16px 0 6px" }}>In my pincode</div>
      <form className="gap" onSubmit={(e) => { e.preventDefault(); if (validPincode(pin)) { setArea({ mode: "pincode", pincode: pin.trim() }); onClose(); } }}>
        <input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="6-digit pincode" aria-label="Pincode"
          style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 12, padding: "11px 12px" }} />
        <button className="btn dark sm" disabled={!validPincode(pin)}>Show</button>
      </form>
      <div className="label-up" style={{ padding: "16px 0 6px" }}>Whole city</div>
      <button className="btn ghost" onClick={() => setShowCities(true)}>🏙️ Choose a city</button>
    </Sheet>
  );
}

// Pick which city's offers to show. Cities with live offers come first.
function CityPicker({ onClose, onPicked }) {
  const { city, setCity, location } = useApp();
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.listCities().then((live) => {
      const map = new Map(live.map((c) => [c.key, c]));
      MAJOR_CITIES.forEach((m) => { const k = cityKey(m.name); if (!map.has(k)) map.set(k, { key: k, name: m.name, state: m.state, lat: m.lat, lng: m.lng, liveOffers: 0 }); });
      setList([...map.values()].sort((a, b) => b.liveOffers - a.liveOffers || a.name.localeCompare(b.name)));
    }).catch(() => setList(MAJOR_CITIES.map((m) => ({ key: cityKey(m.name), ...m, liveOffers: 0 }))));
  }, []);
  const pick = (c) => { setCity({ key: c.key, name: c.name, state: c.state, lat: c.lat, lng: c.lng }); onPicked?.(); onClose(); };
  const shown = (list || []).filter((c) => !q || `${c.name} ${c.state}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet onClose={onClose}>
      <h2 className="title" style={{ fontSize: 19 }}>Choose your city</h2>
      <div className="form" style={{ padding: "10px 0 6px" }}>
        <div className="fld"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search city or state" aria-label="Search city" /></div>
        {location.exact && <button className="btn ghost" onClick={() => { const n = nearestCity(location, list || MAJOR_CITIES); if (n) pick(n); }}>📍 Use nearest city to me</button>}
      </div>
      {!list ? <Spinner /> : shown.length === 0
        ? <div className="muted pad">No match. Offers appear here once a business in that city posts one.</div>
        : shown.map((c) => (
          <button key={c.key} className="menu-item" style={{ borderRadius: 0 }} onClick={() => pick(c)}>
            <span>{c.key === city.key ? "✅" : "🏙️"}</span>
            <span className="grow"><b>{c.name}</b> <span className="muted small">{c.state}</span></span>
            <span className="muted small">{c.liveOffers ? `${c.liveOffers} live` : ""}</span>
          </button>
        ))}
    </Sheet>
  );
}

// ------------------------------------------------------------------ Home
const hourText = (h) => (h === 0 || h === 24 ? "12 AM" : h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`);
const initialsOf = (name) => String(name || "").trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
const offLabel = (o) => (o.price === 0 ? "FREE" : discount(o) > 0 ? `-${discount(o)}%` : "");

export function Home() {
  const { location, isCustomer, session, profile, city, area, setArea, freeMode, config } = useApp();
  const { offers, error, needGps, locationStatus } = useAreaOffers();
  const [picking, setPicking] = useState(false);
  const [allCats, setAllCats] = useState(false);
  const now = useNow(30000);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("ending");
  const listRef = useRef(null);

  const live = useMemo(() => (offers || []).filter((o) => o.endsAt > now), [offers, now]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return live
      .filter((o) => cat === "all" || o.category === cat)
      .filter((o) => !needle || `${o.title} ${o.description} ${o.business?.name} ${o.business?.area} ${categoryOf(o.category).label}`.toLowerCase().includes(needle))
      .map((o) => ({ o, km: distanceKm(location, o.business) }))
      .sort((a, b) => (b.o.featured ? 1 : 0) - (a.o.featured ? 1 : 0) || (sort === "near" ? (a.km ?? 1e9) - (b.km ?? 1e9) : sort === "off" ? discount(b.o) - discount(a.o) : a.o.endsAt - b.o.endsAt))
      .map((x) => x.o);
  }, [live, cat, q, sort, location]);
  const byCat = (...ids) => live.filter((o) => ids.includes(o.category)).sort((a, b) => a.endsAt - b.endsAt);

  const browsing = !q.trim() && cat === "all";
  const toList = () => setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  const pick = (id) => { setCat(cat === id ? "all" : id); setAllCats(false); toList(); };
  const noLocation = needGps && locationStatus !== "asking";
  const hours = config?.hours || { open: 6, close: 23 };
  const where = area.mode === "near"
    ? (location.exact ? (nearestCity(location)?.name || "Your location") : locationStatus === "asking" ? "Finding you…" : "Location is off")
    : areaLabel(area, city);
  const ending = [...live].sort((a, b) => a.endsAt - b.endsAt).slice(0, 8);
  // featured: boosted offers first, then the biggest discounts
  const featured = [...live.filter((o) => o.featured), ...[...live].filter((o) => !o.featured).sort((a, b) => discount(b) - discount(a))].slice(0, 4);

  return (
    <>
      <div className="chead">
        <div className="chead-top">
          <button className="cwho" onClick={() => setPicking(true)} aria-label="Change area">
            <span className="cavatar">{initialsOf(profile?.name) || <Icon d="place" size={20} stroke={2} />}</span>
            <span style={{ minWidth: 0 }}>
              <span className="k">{area.mode === "near" ? `Deals within ${area.radius} km` : "Deals in"}</span>
              <span className="v"><Icon d="place" size={16} stroke={2} />{where}<Icon d="chevDown" size={14} stroke={2.2} /></span>
            </span>
          </button>
          {session
            ? <a className="cround" href="#/support" aria-label="Help and support"><Icon d="help" size={20} stroke={2} /></a>
            : <a className="cround" href="#/login" aria-label="Log in"><Icon d="user" size={20} stroke={2} /><span className="pip" /></a>}
        </div>
        <div className="cstatus">
          {config?.night
            ? <span className="live night"><i />Night · hotels &amp; travel open</span>
            : <span className="live"><i />Open now{offers ? ` · ${live.length} live deal${live.length === 1 ? "" : "s"}` : ""}</span>}
          <span className="hrs"><Icon d="clock" size={14} stroke={2} />{config?.night ? `Shops open at ${hourText(hours.open)}` : `Shops close ${hourText(hours.close)}`}</span>
        </div>
        <label className="csearch">
          <Icon d="search" size={20} stroke={2} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && toList()} placeholder="Search food, rooms, salons, bus seats" aria-label="Search offers" />
          {q && <button type="button" className="clear" aria-label="Clear search" onClick={() => setQ("")}><Icon d="M6 6l12 12M18 6L6 18" size={14} stroke={2.4} /></button>}
        </label>
      </div>

      {noLocation ? <PinScreen onCity={() => setPicking(true)} /> : <>
        <div className="tilecard">
          <div className="th"><span>What do you need today?</span><button onClick={() => setAllCats(true)}>All</button></div>
          <div className="tilegrid">
            {HOME_TILES.map((t) => {
              const st = catStyle(t.id);
              return (
                <button key={t.id} className={"tile" + (cat === t.id ? " on" : "")} aria-pressed={cat === t.id} onClick={() => pick(t.id)}>
                  <span className="ti" style={{ background: st.tint, color: st.ink }}><Icon d={st.icon} size={24} /></span>
                  {t.tag && <span className="tag" style={{ background: t.tagBg }}>{t.tag}</span>}
                  <span className="tl">{st.short}</span>
                </button>
              );
            })}
            <button className="tile" onClick={() => setAllCats(true)}>
              <span className="ti" style={{ background: "#F0EFF4", color: "#3A3550" }}><Icon d="more" size={24} /></span><span className="tl">More</span>
            </button>
          </div>
        </div>

        <div className="quick">
          <button className="qbtn" onClick={() => { setArea({ mode: "near", radius: area.mode === "near" ? area.radius : 5 }); toList(); }}><Icon d="near" size={22} />Near me</button>
          <a className="qbtn" href="#/map"><Icon d="map" size={22} />Map</a>
          <button className="qbtn" onClick={() => setPicking(true)}><Icon d="pin" size={22} />Pincode</button>
          <a className="qbtn" href="#/savings"><Icon d="heart" size={22} />Savings</a>
        </div>

        {!isCustomer && (session
          ? !freeMode && <a className="cbanner" href="#/plans"><span className="bi"><Icon d="lock" size={20} /></span><span>Your free month has ended. Plans from <b>{rupee(Math.round(PLANS.customer.options[3].price / 12))}/month</b> to see businesses' numbers</span></a>
          : <a className="cbanner" href="#/login"><span className="bi"><Icon d="gift" size={20} /></span><span><b>First month free.</b> Log in to see business numbers and call them directly</span></a>)}
        {needGps && <div className="cbanner"><span className="bi"><Icon d="near" size={20} /></span>Finding offers within {area.radius} km of you…</div>}
        {config?.night && <div className="nightcard"><Icon d="moon" size={22} /><span><b>Night hours.</b> Hotels and travel are open 24×7. Food, shops and other offers open again at {hourText(hours.open)}.</span></div>}

        {browsing && offers && <>
          <SponsoredBanner />
          <Featured offers={featured} />
          <MiniRail title="Ending soon" icon="clock" color="#B35A00" items={ending} action="See all" onAction={() => { setSort("ending"); toList(); }} />
          <MiniRail title="Food deals" icon="food" color="#B35A00" items={byCat("food")} action="See all" onAction={() => pick("food")} />
          <MiniRail title="Hotel rooms tonight" icon="stay" color="#1E4BB8" items={byCat("stay")} action="See all" onAction={() => pick("stay")} />
          <TripList items={byCat("travel", "trips", "rental")} />
          <MiniRail title="Grocery & medical stores" icon="grocery" color="#0F7A43" items={byCat("grocery", "pharmacy")} />
          <MiniRail title="Salon & makeup, less price today" icon="salon" color="#6B2FB3" items={byCat("beauty", "makeup")} action="See all" onAction={() => pick("beauty")} />
          <MiniRail title="Photographers, decorators & caterers" icon="camera" color="#1E4BB8" items={byCat("photo", "decor", "catering")} />
          <MiniRail title="Laundry, cleaning, tailors & bike service" icon="laundry" color="#0B5C80" items={byCat("laundry", "cleaning", "tailor", "vehicle", "services", "pets")} />
          <HealthList items={byCat("health")} onAll={() => pick("health")} />
          <MiniRail title="Gym, classes & schools" icon="ball" color="#3E7A0F" items={byCat("sports", "education", "admissions")} />
          <MiniRail title="Shops & more" icon="bag" color="#8A6100" items={byCat("retail", "electronics", "other")} />
          <Shops offers={live} />
          <SavingsCard />
        </>}

        <div ref={listRef} className="shead" style={{ scrollMarginTop: 12 }}>
          <h2>{q.trim() ? `Results for "${q.trim()}"` : cat !== "all" ? <><Icon d={catStyle(cat).icon} size={18} stroke={2.2} style={{ color: catStyle(cat).ink }} />{categoryOf(cat).label}</> : area.mode === "near" ? "All deals near you" : `All deals · ${areaLabel(area, city)}`}</h2>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" style={{ border: 0, background: "none", fontWeight: 700, color: "var(--muted)", fontSize: 12.5 }}>
            <option value="ending">Ending soon</option><option value="near">Nearest</option><option value="off">Biggest discount</option>
          </select>
        </div>
        {(cat !== "all" || q.trim()) && <div className="filterbar">
          {cat !== "all" && <button className="fchip" onClick={() => setCat("all")}>{catStyle(cat).short}<Icon d="M6 6l12 12M18 6L6 18" size={12} stroke={2.6} /></button>}
          <span className="muted small" style={{ fontWeight: 600 }}>{shown.length} deal{shown.length === 1 ? "" : "s"}</span>
        </div>}
        <div style={{ height: 10 }} />
        {error && <div className="pad"><div className="error">{error}</div></div>}
        {!offers && !error && !needGps && <Spinner />}
        {offers && shown.length === 0 && <Empty icon={<span className="emptyic"><Icon d="search" size={30} /></span>} title={q.trim() || cat !== "all" ? "Nothing here right now" : area.mode === "near" ? `No live offers within ${area.radius} km yet` : area.mode === "pincode" ? `No live offers in ${area.pincode} yet` : `No live offers in ${city.name} yet`}
          action={<button className="btn ghost" onClick={() => (cat !== "all" || q ? (setCat("all"), setQ("")) : setPicking(true))}>{cat !== "all" || q ? "Show all deals" : area.mode === "near" && area.radius < 30 ? "Search a wider area" : "Enter a pincode"}</button>}>Try another category, or check back this evening.</Empty>}
        {shown.map((o) => <OfferCard key={o.id} offer={o} />)}
      </>}
      {picking && <AreaSheet onClose={() => setPicking(false)} />}
      {allCats && <AllCategories value={cat} onPick={pick} onClose={() => setAllCats(false)} />}
    </>
  );
}

// Big rotating banner: boosted (paid) offers first, then the biggest discounts.
const FEATURE_BG = { food: "#8A3B00", stay: "#1E3A8F", travel: "#0F5E52", trips: "#6B1640", rental: "#6B1640", health: "#0F5E52", beauty: "#5B2393" };
function Featured({ offers }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (offers.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % offers.length), 5000);
    return () => clearInterval(t);
  }, [offers.length]);
  if (!offers.length) return null;
  const o = offers[i % offers.length];
  const bg = FEATURE_BG[o.category] || "#3A1D8F";
  const st = catStyle(o.category);
  return (
    <a className="feature" href={"#/offer/" + o.id} style={{ background: bg }} key={o.id}>
      <span className="kick">{o.featured ? "Featured · " : ""}{categoryOf(o.category).label}{offLabel(o) ? " · " + offLabel(o) : ""}</span>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span className="fi" style={{ color: bg }}><Icon d={st.icon} size={26} stroke={2} /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <b style={{ fontSize: 16, lineHeight: 1.25 }}>{o.title}</b>
          <span style={{ fontSize: 12.5, opacity: .9 }}>{o.business?.name}{o.business?.area ? " · " + o.business.area : ""}</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, opacity: .95 }}><b style={{ fontSize: 16 }}>{o.price === 0 ? "Free" : rupee(o.price)}</b> {o.origPrice > o.price && <s style={{ opacity: .7 }}>{rupee(o.origPrice)}</s>} · ends in {timeLeft(o.endsAt - Date.now())}</span>
        <span className="go" style={{ color: bg }}>See deal</span>
      </div>
      {offers.length > 1 && <div className="dots" onClick={(e) => e.preventDefault()}>{offers.map((x, k) => <button key={x.id} className={k === i % offers.length ? "on" : ""} aria-label={`Banner ${k + 1}`} onClick={(e) => { e.preventDefault(); setI(k); }} />)}</div>}
    </a>
  );
}

function SectionHead({ title, icon, color, action, onAction, badge }) {
  return (
    <div className="shead">
      <h2><Icon d={icon} size={18} stroke={2.2} style={{ color }} />{title}</h2>
      {badge ? <span className="badge">{badge}</span> : action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}

function MiniRail({ title, icon, color, items, action, onAction }) {
  const { location } = useApp();
  if (!items.length) return null;
  return (
    <>
      <SectionHead title={title} icon={icon} color={color} action={action} onAction={onAction} />
      <div className="hrail">{items.map((o) => {
        const km = distanceKm(location, o.business);
        return (
          <a key={o.id} className="mini" href={"#/offer/" + o.id}>
            <OfferImage offer={o} className="mt" size={34}>
              {offLabel(o) && <span className="b1">{offLabel(o)}</span>}
              <span className="b2">{timeLeft(o.endsAt - Date.now())}</span>
            </OfferImage>
            <span className="mb">
              <b className="tt">{o.title}</b>
              <span className="w">{o.business?.name}{km != null && km < 100 ? " · " + kmText(km) : ""}</span>
              <span className="pr"><b>{o.price === 0 ? "Free" : rupee(o.price)}</b> {o.origPrice > o.price && <s>{rupee(o.origPrice)}</s>}</span>
            </span>
          </a>
        );
      })}</div>
    </>
  );
}

function HealthList({ items, onAll }) {
  const { location } = useApp();
  if (!items.length) return null;
  return (
    <>
      <SectionHead title="Clinics & check-ups" icon="M12 6v12M6 12h12M4 4h16v16H4z" color="#0F6E5C" action="See all" onAction={onAll} />
      <div className="listbox">{items.slice(0, 4).map((o) => {
        const km = distanceKm(location, o.business);
        return (
          <a key={o.id} className="lrow" href={"#/offer/" + o.id}>
            <span className="li" style={{ background: "#E4F5F2", color: "#0F6E5C" }}><Icon d="doctor" size={22} stroke={2} /></span>
            <span className="lt"><b>{o.title}</b><span>{o.business?.name}{km != null && km < 100 ? " · " + kmText(km) : ""}{o.quantity ? " · " + o.quantity : ""}</span></span>
            <span className="lcta" style={{ color: "#0F6E5C" }}>{o.price === 0 ? "Register" : "View"}</span>
          </a>
        );
      })}</div>
    </>
  );
}

function TripList({ items }) {
  if (!items.length) return null;
  return (
    <>
      <SectionHead title="Travel, trips & cabs" icon="bus" color="#0F6E5C" badge="Open 24×7" />
      <div className="trips">{items.slice(0, 4).map((o) => (
        <a key={o.id} className="trip" href={"#/offer/" + o.id}>
          <span className="r1"><span className="tt">{o.title}</span><span className="p">{rupee(o.price)}<small> /seat</small></span></span>
          <span className="r2">
            <span className="ini" style={{ background: "#FCE9F2", color: "#9C1F5A" }}>{initialsOf(o.business?.name)}</span>
            <span className="ellipsis">{o.business?.name} · ends in {timeLeft(o.endsAt - Date.now())}</span>
            {o.quantity && <span className="seats" style={{ color: "#9C1F5A" }}>{o.quantity}</span>}
          </span>
        </a>
      ))}</div>
    </>
  );
}



// Local businesses with live offers, as round badges (tap = their soonest-ending offer).
function Shops({ offers }) {
  const seen = new Map();
  [...offers].sort((a, b) => a.endsAt - b.endsAt).forEach((o) => { if (o.business?.name && !seen.has(o.business.name)) seen.set(o.business.name, o); });
  const list = [...seen.values()].slice(0, 5);
  if (list.length < 2) return null;
  return (
    <>
      <div className="shead"><h2>Local businesses near you</h2></div>
      <div className="shops">{list.map((o) => {
        const st = catStyle(o.category);
        return (
          <a key={o.id} className="shop" href={"#/offer/" + o.id}>
            <span className="sa" style={{ background: st.ink, borderColor: st.tint }}>{initialsOf(o.business.name)}</span>
            <span className="sn">{o.business.name}</span>
          </a>
        );
      })}</div>
    </>
  );
}

function AllCategories({ value, onPick, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <h2 className="title" style={{ fontSize: 19, marginBottom: 16 }}>All categories</h2>
      <div className="tilegrid">
        <button className={"tile" + (value === "all" ? " on" : "")} onClick={() => onPick("all")}>
          <span className="ti" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><Icon d="more" size={24} /></span><span className="tl">Everything</span>
        </button>
        {CATEGORIES.map((c) => {
          const st = catStyle(c.id);
          return (
            <button key={c.id} className={"tile" + (value === c.id ? " on" : "")} onClick={() => onPick(c.id)}>
              <span className="ti" style={{ background: st.tint, color: st.ink }}><Icon d={st.icon} size={24} /></span><span className="tl">{c.label}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// Location is off or not allowed: ask for the pincode instead.
function PinScreen({ onCity }) {
  const { setArea } = useApp();
  const [pin, setPin] = useState("");
  const submit = (e) => { e.preventDefault(); if (validPincode(pin)) setArea({ mode: "pincode", pincode: pin }); };
  return (
    <div className="pinscreen">
      <div className="pinradar" aria-hidden="true"><span className="c1" /><span className="c2" /><span className="sw2" /><span className="pin">📍</span></div>
      <h1 className="title" style={{ fontSize: 28, lineHeight: 1.08 }}>We couldn't find your location</h1>
      <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.5 }}>Location is off or not allowed. Enter your 6-digit pincode and we'll show offers from businesses there.</p>
      <form className="gap" style={{ marginTop: 16 }} onSubmit={submit}>
        <input className="pininput" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="560038" aria-label="Your pincode" />
        <button className="btn main" style={{ width: 96, flex: "none" }} disabled={!validPincode(pin)}>Show</button>
      </form>
      <button className="btn ghost" style={{ marginTop: 20 }} onClick={() => window.location.reload()}>📍 Try my location again</button>
      <button className="link small" style={{ marginTop: 14, display: "block" }} onClick={onCity}>Or browse a whole city</button>
      <div className="note center">Your location stays on your phone. It's never saved.</div>
    </div>
  );
}

// ------------------------------------------------------------------ Map
export function MapPage() {
  const { location, city, area } = useApp();
  const { offers, needGps } = useAreaOffers();
  const first = offers?.find((o) => o.business?.lat != null)?.business;
  const center = area.mode === "near" && location.exact ? location
    : area.mode === "pincode" && first ? first : { lat: city.lat ?? location.lat, lng: city.lng ?? location.lng };
  return (
    <>
      <div className="phead"><span className="cround"><Icon d="map" size={20} stroke={2} /></span><div><h1>Deals {area.mode === "near" ? "near you" : area.mode === "pincode" ? "in " + area.pincode : "in " + city.name}</h1>
        <div className="sub">{needGps ? "Allow location, or choose a pincode on Home." : `${areaLabel(area, city)}. Change it on Home.`}</div></div></div>
      {offers ? <MapView offers={offers} center={center} /> : <Spinner />}
    </>
  );
}

// ------------------------------------------------------------------ Offer detail
export function OfferPage({ id }) {
  const { session, profile, isCustomer, location, toast, business, freeMode } = useApp();
  const [offer, setOffer] = useState(undefined);
  const [contact, setContact] = useState(null);
  const [contactErr, setContactErr] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmShare, setConfirmShare] = useState(false);
  const now = useNow();
  const own = !!business && offer?.businessId === business.id;

  const [photo, setPhoto] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getOffer(id).then((o) => {
      if (!alive) return;
      setOffer(o);
      if (o) { api.addView(id); if (o.hasPhoto) api.getOfferPhoto(id).then((p) => alive && p && setPhoto(p)); }
    }).catch(() => alive && setOffer(null));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!offer || !session || !(isCustomer || own)) return;
    api.revealContact(offer.id).then(setContact).catch((e) => setContactErr(errText(e)));
    if (isCustomer) api.mySharedOfferIds().then((ids) => setShared(ids.includes(offer.id))).catch(() => {});
  }, [offer, session, isCustomer, own]);

  if (offer === undefined) return <Spinner />;
  if (!offer) return <><div style={{ position: "relative", height: 60 }}><BackButton to="/" /></div><Empty icon="🫥" title="Offer not available">It may have ended or been removed.</Empty></>;

  const rem = offer.endsAt - now;
  const ended = rem <= 0 || offer.status !== "live";
  const km = distanceKm(location, offer.business);
  const contactText = `Hi, I saw your offer on ${APP_NAME}: "${offer.title}". Is it still available?`;

  const share = async () => {
    if (!validPhone(profile?.phone)) { toast("Add your phone number in Account first"); navigate("/account"); return; }
    setBusy(true); setConfirmShare(false);
    try { await api.shareNumber(offer.id); setShared(true); toast(`Your number was sent to ${offer.business?.name}`); }
    catch (e) { toast(errText(e)); }
    setBusy(false);
  };
  const askShare = () => {
    if (!validPhone(profile?.phone)) { toast("Add your phone number in Account first"); navigate("/account"); return; }
    setConfirmShare(true);
  };

  return (
    <>
      <OfferImage offer={photo ? { ...offer, photoUrl: photo } : offer} className="hero">
        <BackButton to="/" />
        {!ended && <Countdown end={offer.endsAt} />}
      </OfferImage>
      <div className="pad">
        <div className="catline"><span className="catpill" style={{ background: catStyle(offer.category).tint, color: catStyle(offer.category).ink }}><Icon d={catStyle(offer.category).icon} size={14} stroke={2.2} />{categoryOf(offer.category).label}</span><span className="muted small">{offer.business?.area}{km != null && km < 100 ? " · " + kmText(km) : ""}</span></div>
        <h1 className="title" style={{ margin: "6px 0 6px", lineHeight: 1.2 }}>{offer.title}</h1>
        {offer.description && <div className="muted" style={{ whiteSpace: "pre-line" }}>{offer.description}</div>}

        <div className="box row" style={{ marginTop: 14 }}>
          <div className="price"><b style={{ fontSize: 26 }}>{offer.price === 0 ? "Free" : rupee(offer.price)}</b>{offer.origPrice > offer.price && <><s>{rupee(offer.origPrice)}</s><span className="pill p-ok">{discount(offer)}% off</span></>}</div>
          <div style={{ textAlign: "right" }}><div className="muted small">{ended ? "Status" : "Ends in"}</div><b style={{ color: rem < 3600000 ? "var(--bad)" : "var(--ink)" }}>{ended ? "Ended" : timeLeft(rem)}</b></div>
        </div>
        {offer.quantity && <div className="row" style={{ marginTop: 10 }}><span className="muted">Available</span><b>{offer.quantity}</b></div>}

        <div className="panel" style={{ margin: "14px 0 0" }}>
          <div className="owner-row">
            <div className="avatar">{(offer.business?.name || "?")[0]}</div>
            <div className="grow"><b>{offer.business?.name}</b> <RatingBadge rating={offer.business?.rating} /><div className="verified" style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon d="shield" size={14} stroke={2.2} />Verified partner · {offer.business?.area}{offer.business?.city ? ", " + offer.business.city : ""}</div></div>
          </div>

          {own ? (
            <div className="banner ok" style={{ margin: "12px 0 0" }}>This is your offer. Customers with the Customer Pass see your number here.</div>
          ) : !session || !isCustomer ? (
            <>
              <div className="num blur" style={{ marginTop: 12 }} aria-hidden="true">+91 98••• •••••</div>
              {freeMode ? <>
                <div className="muted" style={{ marginTop: 6 }}>Log in to see the owner's number, call or WhatsApp them, and share your number. Your first month is free.</div>
                <a className="btn main" style={{ marginTop: 12 }} href={`#/login?next=${encodeURIComponent("/offer/" + offer.id)}`}><Icon d="lock" size={18} stroke={2.2} />Log in to see the number</a>
              </> : IS_NATIVE ? <>
                <div className="muted" style={{ marginTop: 6 }}>{session ? `Your account doesn't have an active ${PLANS.customer.name}.` : "Log in to see the owner's number."}</div>
                {!session && <a className="btn main" style={{ marginTop: 12 }} href={`#/login?next=${encodeURIComponent("/offer/" + offer.id)}`}>Log in</a>}
              </> : <>
                <div className="muted" style={{ marginTop: 6 }}>Subscribe to see the owner's number, call or WhatsApp them, and share your number with them.</div>
                <a className="btn main" style={{ marginTop: 12 }} href={session ? "#/plans" : `#/login?next=${encodeURIComponent("/offer/" + offer.id)}`}>
                  {session ? `🔓 See plans · from ${rupee(Math.round(PLANS.customer.options[3].price / 12))}/month` : "🔓 Log in · first month free"}
                </a>
              </>}
            </>
          ) : contactErr ? (
            <div className="error" style={{ marginTop: 12 }}>{contactErr}</div>
          ) : !contact ? <Spinner /> : (
            <>
              <div className="num" style={{ marginTop: 12 }}>{prettyPhone(contact.phone)}</div>
              <div className="two" style={{ marginTop: 10 }}>
                <a className="btn call" href={telLink(contact.phone)} onClick={() => api.logContact(offer.id, "Called")}><Icon d="phone" size={18} stroke={2.2} />Call</a>
                {contact.whatsapp
                  ? <a className="btn wa" href={waLink(contact.phone, contactText)} target="_blank" rel="noreferrer" onClick={() => api.logContact(offer.id, "WhatsApp")}><Icon d="whatsapp" size={18} stroke={2.2} />WhatsApp</a>
                  : <button className="btn ghost" disabled>WhatsApp off</button>}
              </div>
              {!ended && (
                <button className="btn ghost" style={{ marginTop: 10 }} disabled={shared || busy} onClick={askShare}>
                  <Icon d={shared ? "check" : "share"} size={18} stroke={2.2} />{shared ? "Your number was shared with the owner" : busy ? "Sharing…" : `Share my number${profile?.phone ? ` (${prettyPhone(profile.phone)})` : ""} with the owner`}
                </button>
              )}
            </>
          )}
        </div>

        <ReviewsBlock business={offer.business} own={own} />
        <Disclaimer />
        {session && !own && <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setReporting(true)}><Icon d="flag" size={16} stroke={2.2} />Report this offer</button>}
      </div>
      {reporting && <ReportSheet offerId={offer.id} onClose={() => setReporting(false)} />}
      {confirmShare && (
        <Sheet onClose={() => setConfirmShare(false)}>
          <h2 className="title" style={{ fontSize: 19 }}>Share your number?</h2>
          <p className="muted"><b>{offer.business?.name}</b> will get your name ({profile?.name || "not set"}) and mobile number <b>{prettyPhone(profile?.phone)}</b>, so they can call or WhatsApp you about "{offer.title}".</p>
          <p className="muted small">They may use it only for this offer. You can report misuse from this page. See the <a className="link" href="#/privacy">privacy notice</a>.</p>
          <div className="gap"><button className="btn ghost" onClick={() => setConfirmShare(false)}>Cancel</button><button className="btn main" onClick={share}>Share my number</button></div>
        </Sheet>
      )}
    </>
  );
}

function ReportSheet({ offerId, onClose }) {
  const { toast } = useApp();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.report(offerId, reason, details.trim()); toast("Thanks. Our team will review this offer."); onClose(); }
    catch (e) { toast(errText(e)); setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="title" style={{ fontSize: 19 }}>Report this offer</h2>
      <div className="form" style={{ padding: "12px 0 0" }}>
        <div className="fld"><label>What's wrong?</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="fld"><label>Details (optional)</label><textarea rows="3" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
        <button className="btn main" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send report"}</button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Contacts
export function Contacts() {
  return <NeedLogin why="Log in to see your contacts"><ContactsInner /></NeedLogin>;
}
function ContactsInner() {
  const { isCustomer } = useApp();
  const [list, setList] = useState(null);
  const [phones, setPhones] = useState({});
  const [rating, setRating] = useState(null);
  useEffect(() => { if (isCustomer) api.myContacts().then(setList).catch(() => setList([])); }, [isCustomer]);
  const reveal = async (offerId) => {
    try { const c = await api.revealContact(offerId); setPhones((p) => ({ ...p, [offerId]: c })); } catch (e) { setPhones((p) => ({ ...p, [offerId]: { error: errText(e) } })); }
  };
  useEffect(() => { (list || []).forEach((c) => !phones[c.offer.id] && reveal(c.offer.id)); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="phead"><span className="cround"><Icon d="phone" size={20} stroke={2} /></span><div><h1>History</h1><div className="sub">Businesses you contacted. Tap call or WhatsApp to reach them again.</div></div></div>
      <div style={{ height: 12 }} />
      {!isCustomer ? (
        <Empty icon={<span className="emptyic"><Icon d="lock" size={30} /></span>} title="Your free month has ended" action={<a className="btn main" href="#/plans">See plans · from {rupee(PLANS.customer.price)}/month</a>}>Businesses you contact will appear here.</Empty>
      ) : !list ? <Spinner /> : list.length === 0 ? (
        <Empty icon={<span className="emptyic"><Icon d="phone" size={30} /></span>} title="No businesses contacted yet" action={<a className="btn ghost" href="#/">Browse deals</a>}>Open a deal to see the owner's number. Everyone you contact shows up here.</Empty>
      ) : list.map((c) => {
        const p = phones[c.offer.id];
        return (
          <div className="item" key={c.offer.id}>
            <a href={"#/offer/" + c.offer.id} style={{ flex: "none" }}><OfferImage offer={c.offer} className="ic" /></a>
            <a className="grow" href={"#/offer/" + c.offer.id}>
              <b className="ellipsis" style={{ display: "block", fontSize: 14 }}>{c.offer.business?.name}</b>
              <div className="muted small ellipsis">{c.offer.title}</div>
              <div className="muted small">{c.how} · {ago(c.at)}{p?.error ? " · can't contact now" : ""}</div>
            </a>
            {p?.phone && <a className="icon-btn" aria-label="Call" href={telLink(p.phone)} onClick={() => api.logContact(c.offer.id, "Called")}><Icon d="phone" size={18} stroke={2} /></a>}
            {p?.phone && p.whatsapp && <a className="icon-btn wa" aria-label="WhatsApp" target="_blank" rel="noreferrer" href={waLink(p.phone, `Hi, about your ${APP_NAME} offer: "${c.offer.title}"`)} onClick={() => api.logContact(c.offer.id, "WhatsApp")}><Icon d="whatsapp" size={18} stroke={2} /></a>}
            {c.offer.businessId && <button className="icon-btn soft" aria-label={`Rate ${c.offer.business?.name}`} onClick={() => setRating(c.offer)}><Icon d="star" size={18} stroke={2} /></button>}
          </div>
        );
      })}
      {rating && <ContactReview offer={rating} onClose={() => setRating(null)} />}
    </>
  );
}

// A titled box of menu rows, each with an icon tile: [icon, label, link or action, tint?, ink?, newTab?]
function MenuGroup({ title, items }) {
  const rows = items.filter(Boolean);
  return (
    <>
      <div className="secthead">{title}</div>
      <div className="menubox">{rows.map(([icon, label, to, tint, ink, newTab]) => {
        const inner = <><span className="mic" style={tint ? { background: tint, color: ink } : null}><Icon d={icon} size={18} stroke={2.1} /></span>{label}<span className="chev"><Icon d="chevRight" size={18} stroke={2} /></span></>;
        return typeof to === "function"
          ? <button key={label} className="mi" onClick={to}>{inner}</button>
          : <a key={label} className="mi" href={to} {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}>{inner}</a>;
      })}</div>
    </>
  );
}

function ContactReview({ offer, onClose }) {
  const [existing, setExisting] = useState(undefined);
  useEffect(() => { api.myReview(offer.businessId).then(setExisting).catch(() => setExisting(null)); }, [offer.businessId]);
  if (existing === undefined) return null;
  return <ReviewSheet businessId={offer.businessId} businessName={offer.business?.name} existing={existing} onClose={onClose} onDone={onClose} />;
}

// ------------------------------------------------------------------ Account
export function Account() {
  return <NeedLogin why="Log in to your account"><AccountInner /></NeedLogin>;
}
function AccountInner() {
  const { profile, subs, business, isStaff, refresh, toast, setMode, freeMode, trial } = useApp();
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const dirty = name !== (profile?.name || "") || phone !== (profile?.phone || "");

  const save = async () => {
    if (!name.trim()) return toast("Please enter your name");
    if (!validPhone(phone)) return toast("Please enter a valid Indian mobile number");
    setSaving(true);
    try { await api.updateProfile({ name: name.trim(), phone: phone.trim() }); await refresh(); toast("Saved"); } catch (e) { toast(errText(e)); }
    setSaving(false);
  };
  const cancel = async (plan) => {
    try { await api.cancelPlan(plan); await refresh(); toast("Subscription cancelled. It stays active until the end of this period."); } catch (e) { toast(errText(e)); }
    setCancelling(null);
  };

  return (
    <>
      <div className="acchead"><span className="cavatar">{initialsOf(profile?.name) || "?"}</span><div style={{ minWidth: 0 }}><h1>{profile?.name || "Your account"}</h1><div className="muted small ellipsis">{profile?.email}{profile?.phone ? " · " + prettyPhone(profile.phone) : ""}</div></div></div>
      <div className="lift2">

      {["customer", "owner"].map((plan) => {
        const s = subs[plan];
        if (plan === "owner" && (IS_CUSTOMER_APP || !business)) return null;
        if (plan === "customer" && IS_OWNER_APP) return null;
        const left = daysLeft(trial?.[plan]);
        const [cls, icon, title, sub] = s?.active
          ? ["ok", "✅", `${PLANS[plan].name} · ${s.status === "cancelled" ? "cancelled" : "active"}`, `${s.status === "cancelled" ? "Ends" : "Renews"} ${day(s.currentPeriodEnd)}`]
          : left > 0 ? ["ok", "🎁", `Free month · ${left} day${left > 1 ? "s" : ""} left`, `Free until ${day(trial[plan])}. Then ${PLANS[plan].name} from ${rupee(PLANS[plan].price)}/month.`]
            : plan === "owner" && business.status !== "verified" ? ["no", "⏳", "Free month starts at verification", `Then ${PLANS.owner.name} from ${rupee(PLANS.owner.price)}/month.`]
              : freeMode ? ["ok", "🎉", "Free during launch", "Your free month is over, but everything stays free during launch."]
                : ["no", "⚠️", `${PLANS[plan].name} · not active`, plan === "customer" ? "Pick a plan to see businesses' numbers" : "Pick a plan to keep posting offers"];
        return (
          <div key={plan} className={"status " + cls} style={{ margin: "0 14px 12px", background: "#fff", boxShadow: "var(--shadow)" }}>
            <span className="mic" style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", flex: "none", background: cls === "ok" ? "var(--ok-soft)" : "var(--warn-soft)", color: cls === "ok" ? "var(--ok)" : "var(--warn)" }}><Icon d={cls === "ok" ? (s?.active ? "check" : "gift") : "clock"} size={20} stroke={2.2} /></span>
            <div className="grow"><b>{title}</b><div className="muted small">{sub}</div></div>
            {s?.active && s.status !== "cancelled" && !IS_NATIVE
              ? <button className="btn ghost sm" onClick={() => setCancelling(plan)}>Cancel</button>
              : <a className="btn ghost sm" href={"#/plans" }>Plans</a>}
          </div>
        );
      })}

      </div>
      <div className="secthead">Your details</div>
      <div className="form panel" style={{ margin: "0 14px 6px", padding: 14 }}>
        <div className="fld"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="fld"><label>Phone number</label><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
          <span className="hint">Shared with an owner only when you tap "Share my number".</span></div>
        {dirty && <button className="btn dark" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>}
      </div>

      <MenuGroup title="Your LastPick" items={[
        !IS_OWNER_APP && ["heart", "My savings", "#/savings", "#E3F4EA", "#0F7A43"],
        (IS_OWNER_APP || business) && ["chart", `Business from ${APP_NAME}`, "#/owner/insights"],
        ["card", "Plans and pricing", "#/plans"],
        isStaff && ["shield", profile?.role === "moderator" ? "Moderator panel" : "Admin panel", "#/admin"],
        IS_CUSTOMER_APP ? ["store", "Own a business? Get LastPick Business", PARTNER_URL, "#FFF1E0", "#B35A00", true]
          : IS_OWNER_APP ? ["store", "Business profile", "#/owner/business"]
            : ["store", business ? "Switch to owner mode" : "Post offers as a business owner", () => { setMode("owner"); navigate("/owner"); }, "#FFF1E0", "#B35A00"],
      ]} />
      <MenuGroup title="Help" items={[
        ["chat", "Help & support (chat with us)", "#/support", "#E4F5F2", "#0F6E5C"],
        ["handshake", `How ${APP_NAME} works & rules`, "#/rules"],
        ["receipt", "Complaints", "#/grievance"],
        ["mail", "Contact us", "#/contact"],
      ]} />
      <MenuGroup title="Privacy & legal" items={[
        ["lock", "Privacy & your data", "#/account/privacy"],
        ["doc", "Terms & disclaimer", "#/terms"],
        ["shield", "Privacy notice", "#/privacy"],
        ["rupeeSave", "Refund & cancellation policy", "#/refund"],
      ]} />
      <div className="menubox"><button className="mi bad" onClick={async () => { await api.signOut(); navigate("/"); }}><span className="mic"><Icon d="logout" size={18} stroke={2.1} /></span>Log out</button></div>
      {cancelling && (
        <Sheet onClose={() => setCancelling(null)}>
          <h2 className="title" style={{ fontSize: 19 }}>Cancel {PLANS[cancelling].name}?</h2>
          <p className="muted">You keep access until {day(subs[cancelling].currentPeriodEnd)}. After that {cancelling === "customer" ? "owners' numbers are hidden again" : "your offers stop showing to customers"}.</p>
          <div className="gap"><button className="btn ghost" onClick={() => setCancelling(null)}>Keep plan</button><button className="btn danger" onClick={() => cancel(cancelling)}>Cancel plan</button></div>
        </Sheet>
      )}
    </>
  );
}
