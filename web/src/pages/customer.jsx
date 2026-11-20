import { useEffect, useMemo, useState } from "react";
import { api } from "../api/index.js";
import { AdmissionsRail, SavingsCard } from "./impact.jsx";
import { BackButton, CategoryChips, Countdown, Disclaimer, Empty, MapView, NeedLogin, OfferCard, OfferImage, Sheet, Spinner, catLabel } from "../components.jsx";
import { APP_NAME, CATEGORIES, IS_CUSTOMER_APP, IS_NATIVE, IS_OWNER_APP, MAJOR_CITIES, PARTNER_URL, PLANS, REPORT_REASONS, TINTS, cityKey } from "../lib/config.js";
import { RatingBadge, ReviewSheet, ReviewsBlock } from "./reviews.jsx";
import { ago, day, daysLeft, discount, distanceKm, errText, kmText, prettyPhone, rupee, telLink, timeLeft, validPhone, waLink } from "../lib/format.js";
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
export function Home() {
  const { location, isCustomer, session, city, area, freeMode, trial, config } = useApp();
  const { offers, error, needGps, locationStatus } = useAreaOffers();
  const [picking, setPicking] = useState(false);
  const now = useNow(30000);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("ending");

  const shown = useMemo(() => {
    if (!offers) return [];
    const needle = q.trim().toLowerCase();
    return offers
      .filter((o) => o.endsAt > now && (cat === "all" || o.category === cat))
      .filter((o) => !needle || `${o.title} ${o.description} ${o.business?.name} ${o.business?.area}`.toLowerCase().includes(needle))
      .map((o) => ({ o, km: distanceKm(location, o.business) }))
      .sort((a, b) => sort === "near" ? (a.km ?? 1e9) - (b.km ?? 1e9) : sort === "off" ? discount(b.o) - discount(a.o) : a.o.endsAt - b.o.endsAt)
      .map((x) => x.o);
  }, [offers, cat, q, sort, location, now]);

  const usedCats = CATEGORIES.filter((c) => offers?.some((o) => o.category === c.id));

  const ending = shown.filter((o) => o.endsAt - now < 6 * 3600000).slice(0, 3);
  const left = daysLeft(trial?.customer);
  const noLocation = needGps && locationStatus !== "asking";

  return (
    <>
      <div className="homehead">
        <button className="locbtn" onClick={() => setPicking(true)} aria-label="Change city">
          <span className="livedot" aria-hidden="true" />
          <span><span className="k">{area.mode === "near" ? `Within ${area.radius} km of you` : "Showing offers"}</span>
            <span className="v">{area.mode === "near" ? (location.exact ? (nearestCity(location)?.name || "Your location") : locationStatus === "asking" ? "Finding you…" : "Location is off") : areaLabel(area, city)} ▾</span></span>
        </button>
        {session
          ? <a className="trialpill" href="#/plans">{left > 0 ? `Free · ${left} day${left > 1 ? "s" : ""} left` : freeMode ? "Free during launch" : "See plans"}</a>
          : <a className="trialpill" href="#/login">🎁 1 month free</a>}
      </div>
      {noLocation ? <PinScreen onCity={() => setPicking(true)} /> : <>
        <div className="searchbox"><span aria-hidden="true">🔎</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rooms, halls, cakes, bus seats…" aria-label="Search offers" /></div>
        {!isCustomer && (session
          ? !freeMode && <a className="banner sub" href="#/plans">🔓<span>Your free month has ended. Plans from <b>{rupee(Math.round(PLANS.customer.options[3].price / 12))}/month</b> to see businesses' numbers</span></a>
          : <a className="banner sub" href="#/login">🎁<span><b>First month free.</b> Log in to see business numbers and call them directly</span></a>)}
        {needGps && <div className="banner ok">📍 Finding offers within {area.radius} km of you…</div>}
        {config?.night && <div className="banner" style={{ background: "#1C0F4A", color: "#fff" }}>🌙<span><b>Night hours.</b> Only jobs and travel are open now. Shops, doctors and other offers open again at {config.hours?.open ?? 6} AM.</span></div>}
        <SavingsCard />
        <CategoryChips value={cat} onChange={setCat} categories={usedCats.length ? usedCats : CATEGORIES} />
        {!q && cat === "all" && <AdmissionsRail offers={offers} />}
        {ending.length > 0 && !q && cat === "all" && <>
          <div className="sect"><h2>Ending soon</h2><span className="muted small" style={{ fontWeight: 600 }}>{shown.length} offers nearby</span></div>
          <div className="rail">{ending.map((o) => (
            <a key={o.id} href={"#/offer/" + o.id} className={"railcard" + (o.photoUrl ? " photo" : "")} style={o.photoUrl ? { backgroundImage: `url("${o.photoUrl}")` } : null}>
              {!o.photoUrl && <span className="emo" aria-hidden="true">{o.emoji}</span>}
              <span className="when">{timeLeft(o.endsAt - now)} left</span>
              <span className="tt">{o.title}</span>
              <span className="pp"><b style={{ fontSize: 15 }}>{rupee(o.price)}</b> {o.origPrice > o.price && <s>{rupee(o.origPrice)}</s>}{distanceKm(location, o.business) != null ? " · " + kmText(distanceKm(location, o.business)) : ""}</span>
            </a>))}</div>
        </>}
        <div className="sect">
          <h3>{offers ? (area.mode === "near" ? "Near you" : `${shown.length} live offer${shown.length === 1 ? "" : "s"}`) : needGps ? "Offers near you" : "Loading offers"}</h3>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="ending">Ending soon</option><option value="near">Nearest</option><option value="off">Biggest discount</option>
          </select>
        </div>
        {error && <div className="pad"><div className="error">{error}</div></div>}
        {!offers && !error && !needGps && <Spinner />}
        {offers && shown.length === 0 && <Empty icon="🕵️" title={area.mode === "near" ? `No live offers within ${area.radius} km yet` : area.mode === "pincode" ? `No live offers in ${area.pincode} yet` : `No live offers in ${city.name} yet`}
          action={<button className="btn ghost" onClick={() => setPicking(true)}>{area.mode === "near" && area.radius < 30 ? "Search a wider area" : "Enter a pincode"}</button>}>Try another category, or check back this evening.</Empty>}
        {shown.map((o) => <OfferCard key={o.id} offer={o} />)}
      </>}
      {picking && <AreaSheet onClose={() => setPicking(false)} />}
    </>
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
      <div className="page-h"><h1 className="title">Offers {area.mode === "near" ? "near you" : area.mode === "pincode" ? "in " + area.pincode : "in " + city.name}</h1>
        <div className="muted">{needGps ? "Allow location, or choose a pincode on the Offers tab." : `${areaLabel(area, city)}. Change it on the Offers tab.`}</div></div>
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
        <div className="muted">{catLabel(offer.category)} · {offer.business?.area}{km != null && km < 100 ? " · " + kmText(km) : ""}</div>
        <h1 className="title" style={{ margin: "6px 0 6px", lineHeight: 1.2 }}>{offer.title}</h1>
        {offer.description && <div className="muted" style={{ whiteSpace: "pre-line" }}>{offer.description}</div>}

        <div className="box row" style={{ marginTop: 14 }}>
          <div className="price">{offer.category === "jobs"
            ? <><b style={{ fontSize: 26 }}>Pay {rupee(offer.price)}</b><span className="pill p-ok">Job opening</span></>
            : <><b style={{ fontSize: 26 }}>{rupee(offer.price)}</b>{offer.origPrice > offer.price && <><s>{rupee(offer.origPrice)}</s><span className="pill p-ok">{discount(offer)}% off</span></>}</>}</div>
          <div style={{ textAlign: "right" }}><div className="muted small">{ended ? "Status" : "Ends in"}</div><b style={{ color: rem < 3600000 ? "var(--bad)" : "var(--ink)" }}>{ended ? "Ended" : timeLeft(rem)}</b></div>
        </div>
        {offer.quantity && <div className="row" style={{ marginTop: 10 }}><span className="muted">Available</span><b>{offer.quantity}</b></div>}

        <div className="panel" style={{ margin: "14px 0 0" }}>
          <div className="owner-row">
            <div className="avatar">{(offer.business?.name || "?")[0]}</div>
            <div className="grow"><b>{offer.business?.name}</b> <RatingBadge rating={offer.business?.rating} /><div className="verified">✔ Verified owner · {offer.business?.area}{offer.business?.city ? ", " + offer.business.city : ""}</div></div>
          </div>

          {own ? (
            <div className="banner ok" style={{ margin: "12px 0 0" }}>This is your offer. Customers with the Customer Pass see your number here.</div>
          ) : !session || !isCustomer ? (
            <>
              <div className="num blur" style={{ marginTop: 12 }} aria-hidden="true">+91 98••• •••••</div>
              {freeMode ? <>
                <div className="muted" style={{ marginTop: 6 }}>Log in to see the owner's number, call or WhatsApp them, and share your number. Your first month is free.</div>
                <a className="btn main" style={{ marginTop: 12 }} href={`#/login?next=${encodeURIComponent("/offer/" + offer.id)}`}>🔓 Log in to see the number</a>
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
                <a className="btn call" href={telLink(contact.phone)} onClick={() => api.logContact(offer.id, "Called")}>📞 Call</a>
                {contact.whatsapp
                  ? <a className="btn wa" href={waLink(contact.phone, contactText)} target="_blank" rel="noreferrer" onClick={() => api.logContact(offer.id, "WhatsApp")}>💬 WhatsApp</a>
                  : <button className="btn ghost" disabled>WhatsApp off</button>}
              </div>
              {!ended && (
                <button className="btn ghost" style={{ marginTop: 10 }} disabled={shared || busy} onClick={askShare}>
                  {shared ? "✓ Your number was shared with the owner" : busy ? "Sharing…" : `🙋 Share my number${profile?.phone ? ` (${prettyPhone(profile.phone)})` : ""} with the owner`}
                </button>
              )}
            </>
          )}
        </div>

        <ReviewsBlock business={offer.business} own={own} />
        <Disclaimer />
        {session && !own && <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setReporting(true)}>🚩 Report this offer</button>}
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
      <div className="page-h"><h1 className="title">My contacts</h1><div className="muted">Owners you viewed, called, messaged or shared your number with</div></div>
      {!isCustomer ? (
        <Empty icon="🔒" title="Your free month has ended" action={<a className="btn main" href="#/plans">See plans · from {rupee(PLANS.customer.price)}/month</a>}>Businesses you contact will appear here.</Empty>
      ) : !list ? <Spinner /> : list.length === 0 ? (
        <Empty icon="📇" title="No contacts yet" action={<a className="btn ghost" href="#/">Browse offers</a>}>Open an offer to see the owner's number.</Empty>
      ) : list.map((c) => {
        const p = phones[c.offer.id];
        return (
          <div className="item" key={c.offer.id}>
            <a className="ic" href={"#/offer/" + c.offer.id} style={c.offer.photoUrl ? { backgroundImage: `url("${c.offer.photoUrl}")` } : { background: TINTS[c.offer.category] || TINTS.other }}>{!c.offer.photoUrl && c.offer.emoji}</a>
            <a className="grow" href={"#/offer/" + c.offer.id}>
              <b className="ellipsis" style={{ display: "block", fontSize: 14 }}>{c.offer.business?.name}</b>
              <div className="muted small ellipsis">{c.offer.title}</div>
              <div className="muted small">{p?.phone ? prettyPhone(p.phone) : p?.error ? "Number unavailable" : "…"} · {c.how} · {ago(c.at)}</div>
            </a>
            {p?.phone && <a className="icon-btn" aria-label="Call" href={telLink(p.phone)} onClick={() => api.logContact(c.offer.id, "Called")}>📞</a>}
            {p?.phone && p.whatsapp && <a className="icon-btn wa" aria-label="WhatsApp" target="_blank" rel="noreferrer" href={waLink(p.phone, `Hi, about your ${APP_NAME} offer: "${c.offer.title}"`)} onClick={() => api.logContact(c.offer.id, "WhatsApp")}>💬</a>}
            {c.offer.businessId && <button className="icon-btn" aria-label={`Rate ${c.offer.business?.name}`} onClick={() => setRating(c.offer)}>⭐</button>}
          </div>
        );
      })}
      {rating && <ContactReview offer={rating} onClose={() => setRating(null)} />}
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
      <div className="page-h owner-row"><div className="avatar">{(profile?.name || "?")[0]}</div><div><h1 className="title" style={{ fontSize: 20 }}>{profile?.name || "Your account"}</h1><div className="muted">{profile?.email}</div></div></div>

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
          <div key={plan} className={"status " + cls}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <div className="grow"><b>{title}</b><div className="muted small">{sub}</div></div>
            {s?.active && s.status !== "cancelled" && !IS_NATIVE
              ? <button className="btn ghost sm" onClick={() => setCancelling(plan)}>Cancel</button>
              : <a className="btn ghost sm" href={"#/plans" }>Plans</a>}
          </div>
        );
      })}

      <div className="label-up" style={{ marginTop: 10 }}>Your details</div>
      <div className="form" style={{ paddingTop: 8 }}>
        <div className="fld"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="fld"><label>Phone number</label><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
          <span className="hint">Shared with an owner only when you tap "Share my number".</span></div>
        {dirty && <button className="btn dark" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>}
      </div>

      <div style={{ marginTop: 6 }}>
        {IS_CUSTOMER_APP
          ? <a className="menu-item" href={PARTNER_URL} target="_blank" rel="noreferrer">🏪 Own a business? Get the LastPick Business app<span className="chev">›</span></a>
          : IS_OWNER_APP
            ? <a className="menu-item" href="#/owner/business">🏪 Business profile<span className="chev">›</span></a>
            : <button className="menu-item" onClick={() => { setMode("owner"); navigate("/owner"); }}>🏪 {business ? "Switch to owner mode" : "Post offers as a business owner"}<span className="chev">›</span></button>}
        {isStaff && <a className="menu-item" href="#/admin">🛡️ {profile?.role === "moderator" ? "Moderator panel" : "Admin panel"}<span className="chev">›</span></a>}
        <a className="menu-item" href="#/plans">💳 Plans and pricing<span className="chev">›</span></a>
        <a className="menu-item" href="#/account/privacy">🔐 Privacy & your data<span className="chev">›</span></a>
        {!IS_OWNER_APP && <a className="menu-item" href="#/savings">💚 My savings<span className="chev">›</span></a>}
        {(IS_OWNER_APP || business) && <a className="menu-item" href="#/owner/insights">📈 Business from {APP_NAME}<span className="chev">›</span></a>}
        <a className="menu-item" href="#/support">🛟 Help & support (chat with us)<span className="chev">›</span></a>
        <a className="menu-item" href="#/rules">🤝 How {APP_NAME} works & rules<span className="chev">›</span></a>
        <a className="menu-item" href="#/grievance">🧾 Complaints<span className="chev">›</span></a>
        <a className="menu-item" href="#/terms">📜 Terms & disclaimer<span className="chev">›</span></a>
        <a className="menu-item" href="#/privacy">🔏 Privacy notice<span className="chev">›</span></a>
        <a className="menu-item" href="#/refund">💸 Refund & cancellation policy<span className="chev">›</span></a>
        <a className="menu-item" href="#/contact">✉️ Contact us<span className="chev">›</span></a>
        <button className="menu-item" style={{ color: "var(--bad)" }} onClick={async () => { await api.signOut(); navigate("/"); }}>↩ Log out<span className="chev">›</span></button>
      </div>

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
