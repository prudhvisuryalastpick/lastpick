import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/index.js";
import { SponsoredBanner } from "./revenue.jsx";
import { StickerHero, IconSticker } from "./hero.jsx";
import { TicketHint, BackButton, CategoryChips, Countdown, Disclaimer, Empty, MapView, NeedLogin, OfferCard, OfferImage, Sheet, SocialLinks, Spinner, catLabel, OfferQuote, QuoteStrip } from "../components.jsx";
import { APP_NAME, CATEGORIES, IS_CUSTOMER_APP, IS_NATIVE, IS_OWNER_APP, MAJOR_CITIES, PARTNER_URL, PLANS, REPORT_REASONS, categoryOf, cityKey } from "../lib/config.js";
import { HOME_TILES, Icon, catStyle } from "../lib/icons.jsx";
import { RatingBadge, ReviewSheet, ReviewsBlock } from "./reviews.jsx";
import { ago, clockIST, day, daysLeft, discount, hoursText, distanceKm, errText, isJob, kmText, prettyPhone, rupee, telLink, timeLeft, validPhone, waLink } from "../lib/format.js";
import { navigate, nearestCity, useApp, useNow } from "../state.jsx";

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

// ------------------------------------------------------------------ Home
const hourText = (h) => (h === 0 || h === 24 ? "12 AM" : h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`);
const initialsOf = (name) => String(name || "").trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
const offLabel = (o) => (o.price === 0 ? "FREE" : discount(o) > 0 ? `-${discount(o)}%` : "");

export function Home() {
  const { location, isCustomer, session, profile, config, place, retryLocation, toast } = useApp();
  const { offers, error, needGps, locationStatus } = useAreaOffers();
  const [allCats, setAllCats] = useState(false);
  const [q, setQ] = useState("");
  const now = useNow(30000);
  const all = useMemo(() => (offers || []).filter((o) => o.endsAt > now), [offers, now]);
  const live = useMemo(() => all.filter((o) => !isJob(o)), [all]);
  const ending = useMemo(() => live.filter((o) => o.endsAt - now <= 3600000).sort((a, b) => a.endsAt - b.endsAt).slice(0, 8), [live, now]);
  const featured = useMemo(() => live.filter((o) => o.featured).slice(0, 4), [live]);
  const results = useMemo(() => { const n = q.trim().toLowerCase(); return n ? live.filter((o) => `${o.title} ${o.description} ${o.business?.name} ${categoryOf(o.category)?.label || ""}`.toLowerCase().includes(n)) : []; }, [live, q]);
  const open = (id) => navigate("/c/" + id);
  const noLocation = needGps && locationStatus !== "asking";
  const hours = config?.hours || { open: 4, close: 23 };
  // always the live location (GPS): area name + pincode, e.g. "Nizampet · 500090"
  const where = location.exact
    ? (place?.area || place?.city ? [place.area || place.city, place.pincode].filter(Boolean).join(" · ") : (nearestCity(location)?.name || "Your location"))
    : locationStatus === "asking" ? "Finding you…" : "Location is off";
  const top = (
    <div className="shero-top">
      <button className="cwho glassy" onClick={() => { retryLocation(); if (location.exact) toast("Showing offers within 30 km of you"); }} aria-label="Your location (tap to refresh)">
        <Icon d="place" size={16} stroke={2} /><span>{where}</span>
      </button>
      {session
        ? <a className="cround glassy" href="#/account" aria-label="Your account">{initialsOf(profile?.name) || <Icon d="user" size={18} stroke={2} />}</a>
        : <a className="pill light sm" href="#/login">Log in</a>}
    </div>
  );
  return (
    <>
      <StickerHero top={top} liveCount={offers ? live.length : null} onOpen={open} />
      <QuoteStrip variant="inline" />
      <label className="csearch glassbar">
        <Icon d="search" size={20} stroke={2} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cakes, rooms, salons, bus seats" aria-label="Search offers" />
        {q && <button type="button" className="clear" aria-label="Clear search" onClick={() => setQ("")}><Icon d="M6 6l12 12M18 6L6 18" size={14} stroke={2.4} /></button>}
      </label>
      {noLocation ? <LocationScreen status={locationStatus} onRetry={retryLocation} /> : q.trim() ? (
        <>
          <div className="shead"><h2>Results for "{q.trim()}"</h2></div>
          {results.length === 0 ? <Empty icon={<span className="emptyic"><Icon d="search" size={30} /></span>} title="Nothing matches right now">Try another word, or check back this evening.</Empty> : results.map((o) => <OfferCard key={o.id} offer={o} />)}
        </>
      ) : <>
        {config?.night
          ? <div className="nightcard"><Icon d="moon" size={22} /><span><b>Night hours.</b> Only hotels, travel and logistics are available 24×7. Other offers open again at {hourText(hours.open)} and run till {hourText(hours.close)}.</span></div>
          : <div className="rulecard"><Icon d="clock" size={20} /><span><b>Today's deals only.</b> Offers are shown from {hourText(hours.open)} to {hourText(hours.close)}, valid for today only and removed at 12 midnight. Only hotels, travel and logistics are available 24×7.</span></div>}
        {!isCustomer && session && <a className="cbanner" href="#/plans"><span className="bi"><Icon d="lock" size={20} /></span><span>{PLANS.customer.tagline} · just {PLANS.customer.perDay} ({rupee(PLANS.customer.price)} for {PLANS.customer.period}). See shops' numbers and contact them.</span></a>}
        {error && <div className="pad"><div className="error">{error}</div><TicketHint /></div>}
        <SectionHead title="Shop by category" action="All" onAction={() => setAllCats(true)} />
        <div className="catgrid">
          {HOME_TILES.map((t, k) => { const st = catStyle(t.id); const n = live.filter((o) => o.category === t.id).length; return (
            <button key={t.id} className="cattile" onClick={() => open(t.id)}>
              <IconSticker icon={st.icon} bg={st.tint} fg={st.ink} size={50} rot={[-6, 4, -3, 6][k % 4]} />
              <b>{st.short}</b><span>{offers ? (n ? `${n} live` : "None yet") : " "}</span>
            </button>); })}
        </div>
        <SponsoredBanner />
        {featured.length > 0 && <Featured offers={featured} />}
        {!offers && !error && !needGps && <Spinner />}
        <MiniRail title="Ending in the next hour" icon="clock" color="#B35A00" items={ending} />
        <div className="bigbanners">
          <button className="bigban dark" onClick={() => open("stay")}><span><small>OPEN 24×7</small><b>Rooms for tonight</b><em>Hotels drop prices for empty rooms</em></span><IconSticker icon="bed" bg="#DBEAFE" fg="#1D4ED8" size={70} rot={8} /></button>
          <button className="bigban light" onClick={() => open("travel")}><span><small>LEAVING TODAY</small><b>Last-minute bus seats</b><em>Operators fill their final seats</em></span><IconSticker icon="bus" bg="#DCFCE7" fg="#15803D" size={70} rot={-6} /></button>
        </div>
        <SectionHead title="How LastPick works" />
        <div className="howgrid">
          {[["1", "Find a deal", "Open a category or the map to see what's live near you."], ["2", "Contact the shop", "See the number and call, or tap I'm interested. Shops never see your number."], ["3", "Pay at the shop", "You pay the shop directly. LastPick never takes money for the deal."]].map(([n, t, d]) => (
            <div key={n} className="howcard"><span className="num">{n}</span><b>{t}</b><span>{d}</span></div>))}
        </div>
      </>}
      {allCats && <AllCategories value="all" onPick={(id) => { setAllCats(false); open(id); }} onClose={() => setAllCats(false)} />}
    </>
  );
}

// One category's offers only (Home tiles and the hero open this page).
export function CategoryPage({ id }) {
  const { offers, error, needGps } = useAreaOffers();
  const { location } = useApp();
  const [sort, setSort] = useState("ending");
  const now = useNow(30000);
  const st = catStyle(id);
  const list = useMemo(() => (offers || []).filter((o) => o.endsAt > now && o.category === id)
    .map((o) => ({ o, km: distanceKm(location, o.business) }))
    .sort((a, b) => (b.o.featured ? 1 : 0) - (a.o.featured ? 1 : 0) || (sort === "near" ? (a.km ?? 1e9) - (b.km ?? 1e9) : sort === "off" ? discount(b.o) - discount(a.o) : a.o.endsAt - b.o.endsAt))
    .map((x) => x.o), [offers, id, sort, location, now]);
  return (
    <>
      <div className="phead"><a className="cround" href="#/" aria-label="Back to home"><Icon d="M15 5l-7 7 7 7" size={20} stroke={2.2} /></a><IconSticker icon={st.icon} bg={st.tint} fg={st.ink} size={44} rot={-6} /><div><h1>{categoryOf(id)?.label || "Offers"}</h1><div className="sub">{offers ? `${list.length} live deal${list.length === 1 ? "" : "s"} near you` : "Loading…"}</div></div><QuoteStrip variant="head" /></div>
      <div className="chips" style={{ padding: "4px 14px 10px" }}>
        {[["ending", "Ending soon"], ["near", "Nearest"], ["off", "Biggest discount"]].map(([k, l]) => <button key={k} className={"chip " + (sort === k ? "on" : "")} onClick={() => setSort(k)}>{l}</button>)}
      </div>
      {error && <div className="pad"><div className="error">{error}</div><TicketHint /></div>}
      {!offers && !error && !needGps && <Spinner />}
      {offers && list.length === 0 && <Empty icon={<span className="emptyic"><Icon d={st.icon} size={30} /></span>} title="Nothing here right now" action={<a className="btn ghost" href="#/">Back to all categories</a>}>New deals appear through the day. Check back this evening.</Empty>}
      {list.map((o) => <OfferCard key={o.id} offer={o} />)}
    </>
  );
}

// Big rotating banner: boosted (paid) offers first, then the biggest discounts.
const FEATURE_BG = { food: "#7A3410", stay: "#06373A", travel: "#0B4F4A", beauty: "#6B2350" };
function Featured({ offers }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (offers.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % offers.length), 5000);
    return () => clearInterval(t);
  }, [offers.length]);
  if (!offers.length) return null;
  const o = offers[i % offers.length];
  const bg = FEATURE_BG[o.category] || "#06373A";
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
        <span style={{ fontSize: 13, opacity: .95 }}><b style={{ fontSize: 16 }}>{o.price === 0 ? "Free" : rupee(o.price)}</b> {o.origPrice > o.price && <s style={{ opacity: .7 }}>{rupee(o.origPrice)}</s>} · ends in {hoursText(o.endsAt - Date.now())}</span>
        <span className="go" style={{ color: bg }}>See deal</span>
      </div>
      {offers.length > 1 && <div className="dots" onClick={(e) => e.preventDefault()}>{offers.map((x, k) => <button key={x.id} className={k === i % offers.length ? "on" : ""} aria-label={`Banner ${k + 1}`} onClick={(e) => { e.preventDefault(); setI(k); }} />)}</div>}
    </a>
  );
}

function SectionHead({ title, icon, color, action, onAction, badge }) {
  return (
    <div className="shead">
      <h2>{icon && <Icon d={icon} size={18} stroke={2.2} style={{ color }} />}{title}</h2>
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
              <span className="b2">Ends in {hoursText(o.endsAt - Date.now())}</span>
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

function TripList({ items }) {
  if (!items.length) return null;
  return (
    <>
      <SectionHead title="Bus & travel seats" icon="bus" color="#0F6E5C" badge="Open 24×7" />
      <div className="trips">{items.slice(0, 4).map((o) => (
        <a key={o.id} className="trip" href={"#/offer/" + o.id}>
          <span className="r1"><span className="tt">{o.title}</span><span className="p">{rupee(o.price)}<small> /seat</small></span></span>
          <span className="r2">
            <span className="ini" style={{ background: "#FCE9F2", color: "#9C1F5A" }}>{initialsOf(o.business?.name)}</span>
            <span className="ellipsis">{o.business?.name} · ends in {hoursText(o.endsAt - Date.now())}</span>
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

// Location is off or not allowed. LastPick needs the live location (offers within 30 km), so there is no
// manual pincode: ask the user to turn location on.
function LocationScreen({ status, onRetry }) {
  const denied = status === "denied";
  return (
    <div className="pinscreen">
      <div className="pinradar" aria-hidden="true"><span className="c1" /><span className="c2" /><span className="sw2" /><span className="pin">📍</span></div>
      <h1 className="title" style={{ fontSize: 28, lineHeight: 1.08 }}>Turn on your location</h1>
      <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.5 }}>LastPick shows offers from businesses within 30 km of where you are right now, so it needs your location.</p>
      {denied
        ? <div className="box small" style={{ marginTop: 14, textAlign: "left", lineHeight: 1.55 }}>Location is blocked for LastPick.<br />
            <b>Phone app:</b> Settings → Apps → LastPick → Permissions → Location → Allow.<br />
            <b>Browser:</b> tap the lock icon next to the address → Location → Allow.<br />Then tap the button below.</div>
        : <div className="box small" style={{ marginTop: 14 }}>Turn on Location (GPS) on your phone, then tap the button below.</div>}
      <button className="btn main" style={{ marginTop: 20 }} onClick={onRetry}>📍 Use my location</button>
      <div className="note center">Your location stays on your phone. It's never saved.</div>
    </div>
  );
}

// ------------------------------------------------------------------ Map
export function MapPage() {
  const { location, place, locationStatus, retryLocation } = useApp();
  const { offers, needGps } = useAreaOffers();
  const here = place?.area || place?.city ? [place.area || place.city, place.pincode].filter(Boolean).join(" · ") : "your location";
  return (
    <>
      <div className="phead"><span className="cround"><Icon d="map" size={20} stroke={2} /></span><div><h1>Deals near you</h1>
        <div className="sub">{needGps ? "Turn on location to see offers near you." : `Within 30 km of ${here}.`}</div></div></div>
      {needGps ? (locationStatus === "asking" ? <Spinner /> : <LocationScreen status={locationStatus} onRetry={retryLocation} />)
        : offers ? <MapView offers={offers} center={location} /> : <Spinner />}
    </>
  );
}

// ------------------------------------------------------------------ Offer detail
export function OfferPage({ id }) {
  const { session, profile, isCustomer, location, toast, business } = useApp();
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
  const contactText = isJob(offer) ? `Hi, I saw your job opening on ${APP_NAME}: "${offer.title}". I would like to apply.` : `Hi, I saw your offer on ${APP_NAME}: "${offer.title}". Is it still available?`;

  const share = async () => {
    if (!validPhone(profile?.phone)) { toast("Add your phone number in Account first"); navigate("/account"); return; }
    setBusy(true); setConfirmShare(false);
    try { await api.shareNumber(offer.id); setShared(true); toast(`${offer.business?.name} knows you are interested`); }
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
        <OfferQuote offer={offer} big />

        <div className="box row" style={{ marginTop: 14 }}>
          <div className="price">{isJob(offer) && <span className="muted small" style={{ marginRight: 6 }}>Pay</span>}<b style={{ fontSize: 26 }}>{offer.price === 0 ? "Free" : rupee(offer.price)}</b>{!isJob(offer) && offer.origPrice > offer.price && <><s>{rupee(offer.origPrice)}</s><span className="pill p-ok">{discount(offer)}% off</span></>}</div>
          <div style={{ textAlign: "right" }}><div className="muted small">{ended ? "Status" : "Offer ends in"}</div><b style={{ color: rem < 3600000 ? "var(--bad)" : "var(--ink)" }}>{ended ? "Ended" : hoursText(rem)}</b>{!ended && <div className="muted small">at {clockIST(offer.endsAt)} today</div>}</div>
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
              {IS_NATIVE ? <>
                <div className="muted" style={{ marginTop: 6 }}>{session ? `Your account doesn't have an active ${PLANS.customer.name}.` : "Log in to see the owner's number."}</div>
                {!session && <a className="btn main" style={{ marginTop: 12 }} href={`#/login?next=${encodeURIComponent("/offer/" + offer.id)}`}>Log in</a>}
              </> : <>
                <div className="muted" style={{ marginTop: 6 }}>Subscribe to see the owner's number and contact them, and share your number with them.</div>
                <a className="btn main" style={{ marginTop: 12 }} href={session ? "#/plans" : `#/login?next=${encodeURIComponent("/offer/" + offer.id)}`}>
                  {session ? `🔓 ${PLANS.customer.tagline} · just ${PLANS.customer.perDay}` : "🔓 Log in to see the number"}
                </a>
              </>}
            </>
          ) : contactErr ? (
            <><div className="error" style={{ marginTop: 12 }}>{contactErr}</div><TicketHint /></>
          ) : !contact ? <Spinner /> : (
            <>
              <div className="num" style={{ marginTop: 12 }}>{prettyPhone(contact.phone)}</div>
              <div className="muted small" style={{ marginTop: 6 }}>Contact the business on this number. Businesses never see your number.</div>
              {!ended && (
                <button className="btn ghost" style={{ marginTop: 10 }} disabled={shared || busy} onClick={askShare}>
                  <Icon d="check" size={18} stroke={2.2} />{shared ? "The business knows you're interested" : busy ? "Sending…" : "I'm interested (sends only your name)"}
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
          <h2 className="title" style={{ fontSize: 19 }}>Tell the business you're interested?</h2>
          <p className="muted"><b>{offer.business?.name}</b> will see only your name ({profile?.name || "not set"}). Your number is never shown to businesses; you contact them.</p>
          <div className="gap"><button className="btn ghost" onClick={() => setConfirmShare(false)}>Cancel</button><button className="btn main" onClick={share}>Send my name</button></div>
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
      <div className="phead"><span className="cround"><Icon d="phone" size={20} stroke={2} /></span><div><h1>History</h1><div className="sub">Businesses you contacted, with their numbers.</div></div></div>
      <div style={{ height: 12 }} />
      {!isCustomer ? (
        <Empty icon={<span className="emptyic"><Icon d="lock" size={30} /></span>} title={`Needs the ${PLANS.customer.name}`} action={<a className="btn main" href="#/plans">See plans · from {rupee(PLANS.customer.price)} for 30 days</a>}>Businesses you contact will appear here.</Empty>
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
            {p?.phone && <span className="muted small" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{prettyPhone(p.phone)}</span>}
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
// KYC status: e-mail verified, mobile verified (with "Verify now" by WhatsApp/SMS code), partner photo
export function KycStatus({ compact }) {
  const { profile, business, refresh, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(!!profile?.whatsappOptIn);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const viaWa = profile.phoneCheck === "whatsapp";
  const canVerify = !!profile.phoneCheck && !!profile.phone && !profile.phoneVerified;
  const phoneCheckOn = !!profile.phoneCheck; // mobile check switched off: the number is only saved, not verified
  const allOk = profile.emailVerified && (!phoneCheckOn || profile.phoneVerified) && (!IS_OWNER_APP || profile.hasPhoto);
  const send = async () => {
    if (viaWa && !agree) return toast("Please tick the WhatsApp box first");
    setBusy(true);
    try { const r = await api.sendMyPhoneCode(agree); if (r?.verified) { await refresh(); setOpen(false); } else { setSent(true); toast(`Code sent on ${viaWa ? "WhatsApp" : "SMS"}`); } } catch (x) { toast(errText(x)); }
    setBusy(false);
  };
  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) return toast("Enter the 6-digit code");
    setBusy(true);
    try { await api.verifyMyPhone(code); await refresh(); toast("Mobile number verified"); setOpen(false); } catch (x) { toast(errText(x)); }
    setBusy(false);
  };
  const rows = [
    ["E-mail", profile.emailVerified ? "✓ Verified" : "Not verified", profile.emailVerified],
    phoneCheckOn
      ? ["Mobile number", profile.phoneVerified ? "✓ Verified" : profile.phone ? "Not verified" : "Not added", profile.phoneVerified]
      : ["Mobile number", profile.phone ? "✓ Added" : "Not added", !!profile.phone],
    ...(IS_OWNER_APP ? [["Profile photo", profile.hasPhoto ? "✓ Added" : "Needed", profile.hasPhoto]] : []),
    ...(IS_OWNER_APP && business ? [["Business check by LastPick", business.status === "verified" ? "✓ Verified" : business.status === "pending" ? "In progress" : "Action needed", business.status === "verified"]] : []),
  ];
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", margin: compact ? 0 : "0 14px 12px", boxShadow: compact ? "none" : "var(--shadow)" }}>
      <div className="row" style={{ alignItems: "center" }}>
        <b>KYC</b>
        <span style={{ fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "4px 10px", background: allOk ? "var(--ok-soft)" : "#FFEDD5", color: allOk ? "var(--ok)" : "#9A3412" }}>{allOk ? "✓ Completed" : "● In progress"}</span>
      </div>
      {rows.map(([a, b, ok]) => <div key={a} className="row" style={{ padding: "10px 0", borderBottom: "1px solid var(--soft)", fontSize: 13.5 }}><span>{a}</span><b style={{ color: ok ? "var(--ok)" : "var(--warn)" }}>{b}</b></div>)}
      {canVerify && <button className="btn main" style={{ marginTop: 12, width: "100%" }} onClick={() => setOpen(true)}>Verify mobile number</button>}
      {open && <Sheet onClose={() => setOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Verify {prettyPhone(profile.phone)}</h2>
          {!sent ? <>
            <p className="muted" style={{ margin: 0 }}>We'll send a 6-digit code to this number {viaWa ? "on WhatsApp" : "by SMS"}.</p>
            {viaWa && <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.45 }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
              <span>I agree to get my verification codes and account messages from {APP_NAME} on WhatsApp at this number.</span></label>}
            <button className="btn main" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send code"}</button>
          </> : <>
            <div className="fld"><label htmlFor="kyc-code">6-digit code from {viaWa ? "WhatsApp" : "SMS"}</label>
              <input id="kyc-code" className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" autoFocus /></div>
            <button className="btn main" disabled={busy} onClick={verify}>{busy ? "Checking…" : "Verify"}</button>
            <button className="link small" onClick={send} disabled={busy}>Send a new code</button>
          </>}
        </div>
      </Sheet>}
    </div>
  );
}

export function Account() {
  return <NeedLogin why="Log in to your account"><AccountInner /></NeedLogin>;
}
function AccountInner() {
  const { profile, subs, business, isStaff, refresh, toast, setMode, trial } = useApp();
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
      <KycStatus />

      {["customer", "owner"].map((plan) => {
        const s = subs[plan];
        if (plan === "owner" && (IS_CUSTOMER_APP || !business)) return null;
        if (plan === "customer" && IS_OWNER_APP) return null;
        const left = daysLeft(trial?.[plan]);
        const [cls, icon, title, sub] = s?.active
          ? ["ok", "✅", `${PLANS[plan].name} · active`, `Active till ${day(s.currentPeriodEnd)} · pay again any time to add 30 days`]
          : left > 0 ? ["ok", "🎁", `Extra days from ${APP_NAME} · ${left} day${left > 1 ? "s" : ""} left`, `Until ${day(trial[plan])}. Then ${PLANS[plan].name} from ${rupee(PLANS[plan].price)} for 30 days.`]
            : plan === "owner" && business.status !== "verified" ? ["no", "⏳", "Waiting for verification", `After that, ${PLANS.owner.name} from ${rupee(PLANS.owner.price)} for 30 days.`]
              : ["no", "⚠️", `${PLANS[plan].name} · not active`, plan === "customer" ? "Pick a plan to see businesses' numbers" : "Pick a plan to keep posting offers"];
        return (
          <div key={plan} className={"status " + cls} style={{ margin: "0 14px 12px", background: "#fff", boxShadow: "var(--shadow)" }}>
            <span className="mic" style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", flex: "none", background: cls === "ok" ? "var(--ok-soft)" : "var(--warn-soft)", color: cls === "ok" ? "var(--ok)" : "var(--warn)" }}><Icon d={cls === "ok" ? (s?.active ? "check" : "gift") : "clock"} size={20} stroke={2.2} /></span>
            <div className="grow"><b>{title}</b><div className="muted small">{sub}</div></div>
            <a className="btn ghost sm" href={"#/plans" }>{s?.active ? "Renew" : "Plans"}</a>
          </div>
        );
      })}

      </div>
      <div className="secthead">Your details</div>
      <div className="form panel" style={{ margin: "0 14px 6px", padding: 14 }}>
        <div className="fld"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="fld"><label>Phone number</label><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
          <span className="hint">Never shown to businesses.</span></div>
        {dirty && <button className="btn dark" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>}
      </div>

      <MenuGroup title="Your LastPick" items={[
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
      <div className="center muted small" style={{ padding: "8px 0 4px" }}>Follow {APP_NAME}</div>
      <SocialLinks style={{ justifyContent: "center", paddingBottom: 16 }} />
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
