import { TermsBox } from "./privacy.jsx";
import { partnerTermsSections, partnerTermsText, partnerTermsTitle } from "../lib/terms.js";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/index.js";
import { Empty, NeedLogin, OfferCard, OfferImage, PlanCard, Sheet, Spinner, Toggle } from "../components.jsx";
import { HOURS, fixTitlePercent, runs24x7, APP_NAME, CATEGORIES, CONSENT_VERSION, DURATIONS, EMOJIS, IS_OWNER_APP, MAJOR_CITIES, MAX_CATEGORIES, PLANS, POSTS_PER_DAY, RETENTION, TEMPLATES, JOB_TEMPLATES, categoryOf } from "../lib/config.js";
import { RatingBadge } from "./reviews.jsx";
import { ago, clockIST, day, daysLeft, errText, hoursText, istDayStart, prettyPhone, rupee, telLink, timeLeft, validPhone, waLink } from "../lib/format.js";
import { navigate, useApp, useNow } from "../state.jsx";
import { validPincode } from "../lib/geo.js";
import { addressFromLocation, lookupPincode } from "../lib/address.js";

// Every owner page goes through this gate: login -> business profile -> Owner Pro -> page.
export function OwnerGate({ children, allowWithoutPlan = false }) {
  return <NeedLogin why="Log in to post offers"><Gate allowWithoutPlan={allowWithoutPlan}>{children}</Gate></NeedLogin>;
}
function Gate({ children, allowWithoutPlan }) {
  const { business, isOwner, loading } = useApp();
  if (loading) return <Spinner />;
  if (!business) return <BusinessForm first />;
  if (!isOwner && !allowWithoutPlan) return <OwnerPaywall />;
  return children;
}

function OwnerPaywall() {
  const { business } = useApp();
  return (
    <>
      <div className="page-h owner-row"><div className="avatar">{business.name[0]}</div><div><h1 className="title" style={{ fontSize: 20 }}>{business.name}</h1><div className="muted">Business account · {business.area}</div></div></div>
      <div className="status no"><span style={{ fontSize: 24 }}>⏰</span><div><b>{PLANS.owner.name} is not active</b><div className="muted small">Pick a plan to post offers for customers within 30 km. There is no free version.</div></div></div>
      <PlanCard plan="owner" />
      <div className="pad">
        <a className="btn main" href="#/plans">See plans · from {rupee(PLANS.owner.price)}/month</a>
        <div className="note">Turn empty rooms, seats, halls, slots and leftover stock into sales instead of losses.</div>
      </div>
    </>
  );
}

function StatusBanner() {
  const { business } = useApp();
  if (!business || business.status === "verified") return null;
  const msg = {
    pending: ["warn", "⏳ Your business is waiting for verification. Only verified partners can post, so customers can trust every offer. We usually verify within 1 working day."],
    rejected: ["bad", `✖ Verification was rejected${business.statusNote ? ": " + business.statusNote : ""}. Update your business details or contact support.`],
    suspended: ["bad", `⛔ Your business is suspended${business.statusNote ? ": " + business.statusNote : ""}. Your offers are hidden. Contact support.`],
  }[business.status];
  return msg ? <div className={"banner " + msg[0]}>{msg[1]}</div> : null;
}

// ------------------------------------------------------------------ Dashboard
export function OwnerDashboard() {
  const { business, subs, setMode, trial } = useApp();
  const [offers, setOffers] = useState(null);
  const [leads, setLeads] = useState(null);
  const now = useNow(30000);
  const load = () => { api.myOffers().then(setOffers).catch(() => setOffers([])); api.ownerLeads().then(setLeads).catch(() => setLeads([])); };
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const live = (offers || []).filter((o) => o.status === "live" && o.endsAt > now);
  const monthLeads = (leads || []).filter((l) => l.createdAt > now - 30 * 86400000).length;
  const newLeads = (leads || []).filter((l) => l.status === "new");
  const views = (offers || []).reduce((s, o) => s + (o.views || 0), 0);

  const week = (leads || []).filter((l) => l.createdAt > now - 7 * 86400000);
  const perDay = [6, 5, 4, 3, 2, 1, 0].map((d) => week.filter((l) => Math.floor((now - l.createdAt) / 86400000) === d).length);
  const maxDay = Math.max(1, ...perDay);
  const left = daysLeft(trial?.owner);
  const hour = new Date().getHours();

  return (
    <>
      <div className="bizhero">
        <div className="row">
          <div className="owner-row">
            <div className="avatar">{business.name[0]}</div>
            <div><div className="small" style={{ color: "var(--hero-muted)", fontWeight: 600 }}>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{business.name}</div></div>
          </div>
          <a className="pill" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }} href="#/owner/business">{business.status === "verified" ? "✔ Verified" : business.status === "pending" ? "⏳ In review" : "Profile"}</a>
        </div>
        <div className="row" style={{ alignItems: "flex-end", marginTop: 22 }}>
          <div>
            <div className="small" style={{ color: "var(--hero-muted)", fontWeight: 600 }}>Customers interested this week</div>
            <div className="gap" style={{ alignItems: "baseline", marginTop: 4 }}><span className="big">{leads ? week.length : "…"}</span>
              <span className="pill" style={{ background: "var(--hi)", color: "var(--hi-ink)" }}>{monthLeads} in 30 days</span></div>
          </div>
          <div className="bars" aria-hidden="true">{perDay.map((n, k) => <span key={k} style={{ height: 8 + (n / maxDay) * 56, animationDelay: `${0.1 + k * 0.07}s` }} />)}</div>
        </div>
      </div>
      <div className="kpis three lift">
        <div className="kpi"><div className="n">{offers ? live.length : "…"}</div><div className="l">Live offers</div></div>
        <div className="kpi"><div className="n">{views}</div><div className="l">Views</div></div>
        <div className="kpi"><div className="n">{business.rating?.count ? <>{Number(business.rating.avg).toFixed(1)}<span style={{ color: "#E0A800" }}>★</span></> : "–"}</div><div className="l">{business.rating?.count ? `${business.rating.count} reviews` : "No reviews yet"}</div></div>
      </div>
      <StatusBanner />
      <a className="cta" href="#/owner/post"><span className="plus" aria-hidden="true">＋</span>
        <span className="grow"><b style={{ display: "block", fontSize: 16 }}>Post an offer</b><span className="small" style={{ color: "#C9D8E8" }}>Goes live to customers within 30 km</span></span><span aria-hidden="true">›</span></a>
      <a className="banner" style={{ background: "var(--warn-soft)", color: "var(--warn)" }} href="#/plans">🎁 <span>{subs.owner?.active ? `${PLANS.owner.name} active till ${day(subs.owner.currentPeriodEnd)}`
        : left > 0 ? `Extra days from ${APP_NAME}: ${left} day${left > 1 ? "s" : ""} left. Then ${rupee(PLANS.owner.price)}/month, or less on longer plans.`
          : business.status !== "verified" ? `After verification, ${PLANS.owner.name} from ${rupee(PLANS.owner.price)}/month. There is no free version.`
            : `${PLANS.owner.name} is not active. Plans from ${rupee(PLANS.owner.price)}/month.`}</span></a>
      {live.length > 0 && <>
        <div className="sect"><h3>Live now</h3><a className="link small" href="#/owner/offers">All offers</a></div>
        {live.slice(0, 3).map((o) => (
          <a className="item" key={o.id} href={"#/offer/" + o.id}>
            <OfferImage offer={o} className="ic" />
            <div className="grow"><b className="ellipsis" style={{ display: "block", fontSize: 14 }}>{o.title}</b><div className="muted small">{o.views} views · ends in {timeLeft(o.endsAt - now)}</div></div>
            <span className={"tm " + (o.endsAt - now < 3600000 ? "hot" : "")}>{timeLeft(o.endsAt - now)}</span>
          </a>))}
      </>}
      <a className="menu-item" style={{ marginTop: 10 }} href="#/owner/reviews">⭐ Reviews {business.rating?.count ? <RatingBadge rating={business.rating} /> : <span className="muted small">none yet</span>}<span className="chev">›</span></a>
      <div className="sect"><h3>Latest interested customers</h3><a className="link small" href="#/owner/leads">See all</a></div>
      {!leads ? <Spinner /> : leads.length === 0
        ? <div className="muted pad" style={{ paddingTop: 0 }}>When a customer taps "I'm interested" on your offer, their name appears here. Customers contact you on your number.</div>
        : leads.slice(0, 4).map((l) => <LeadRow key={l.id} lead={l} onChange={load} />)}
      {!IS_OWNER_APP && <div className="pad"><button className="btn ghost" onClick={() => { setMode("customer"); navigate("/"); }}>👤 Switch to customer view</button></div>}
    </>
  );
}

function LeadRow({ lead, onChange }) {
  const { business } = useApp();
  const mark = async () => { if (lead.status === "new") { await api.setLeadStatus(lead.id, "contacted").catch(() => {}); onChange?.(); } };
  return (
    <div className="item">
      <div className="avatar" style={{ width: 40, height: 40, fontSize: 16 }}>{(lead.name || "?")[0]}</div>
      <div className="grow">
        <div className="gap" style={{ alignItems: "center", gap: 6 }}><b style={{ fontSize: 14 }}>{lead.name}</b>
          {lead.status === "new" ? <span className="pill p-new">New</span> : lead.status === "contacted" ? <span className="pill p-mute">Contacted</span> : <span className="pill p-ok">Closed</span>}</div>
        <div className="muted small ellipsis">{lead.offerTitle} · {ago(lead.createdAt)}</div>
      </div>
      {lead.status === "new" && <button className="btn ghost sm" onClick={mark}>Seen</button>}
    </div>
  );
}

// ------------------------------------------------------------------ Leads
export function OwnerLeads() {
  const [leads, setLeads] = useState(null);
  const [filter, setFilter] = useState("all");
  const load = () => api.ownerLeads().then(setLeads).catch(() => setLeads([]));
  useEffect(() => { load(); }, []);
  const shown = (leads || []).filter((l) => filter === "all" || l.status === filter);
  return (
    <>
      <div className="page-h"><h1 className="title">Leads</h1><div className="muted">Customers interested in your offers (names only)</div></div>
      <div className="tabs">{[["all", "All"], ["new", "New"], ["contacted", "Contacted"]].map(([id, l]) => <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{l}</button>)}</div>
      {!leads ? <Spinner /> : shown.length === 0
        ? <Empty icon="📭" title="No leads here yet">When a customer taps "I'm interested" on your offer, their name appears here. Customers contact you on your number.</Empty>
        : shown.map((l) => <LeadRow key={l.id} lead={l} onChange={load} />)}
    </>
  );
}

// ------------------------------------------------------------------ My offers
export function OwnerOffers() {
  const { toast, business } = useApp();
  const [offers, setOffers] = useState(null);
  const [history, setHistory] = useState(null);
  const [tab, setTab] = useState("current");
  const [ending, setEnding] = useState(null);
  const now = useNow(30000);
  const load = () => api.myOffers().then(setOffers).catch(() => setOffers([]));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === "history" && !history) api.myArchive().then(setHistory).catch(() => setHistory([])); }, [tab, history]);
  const end = async () => {
    try { await api.endOffer(ending.id); toast("Offer ended"); load(); } catch (e) { toast(errText(e)); }
    setEnding(null);
  };
  return (
    <>
      <div className="page-h row"><div><h1 className="title">My offers</h1><div className="muted">Views and status of everything you posted</div></div><a className="btn main sm" href="#/owner/post">＋ New</a></div>
      <StatusBanner />
      <div className="muted small pad" style={{ paddingTop: 0 }}>See below how many customers have seen each offer.</div>
      <a className="menu-item" href="#/owner/reviews">⭐ Your reviews {business?.rating?.count ? <RatingBadge rating={business.rating} /> : <span className="muted small">none yet</span>}<span className="chev">›</span></a>
      <div className="tabs"><button className={tab === "current" ? "on" : ""} onClick={() => setTab("current")}>Current</button><button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>History</button></div>
      {tab === "history" ? (
        <>
          <div className="muted small pad" style={{ paddingTop: 0 }}>Offers move here as soon as they end (every offer closes by 11 PM, except hotels, travel and logistics). Kept for {Math.round(RETENTION.archiveDays / 30)} months.</div>
          {(offers || []).filter((o) => !(o.status === "live" && o.endsAt > now)).map((o) => (
            <div className="item" key={o.id}>
              <OfferImage offer={o} className="ic" />
              <div className="grow"><b style={{ fontSize: 14 }}>{o.title}</b>
                <div className="muted small">{rupee(o.price)} <s>{rupee(o.origPrice)}</s> · seen by {o.views || 0}</div>
                <div className="muted small">{o.status === "removed" ? "Removed by LastPick for breaking the rules" : `Ended ${day(Math.min(o.endsAt, now))}`}</div></div>
              <span className="pill p-mute">{o.status === "removed" ? "Removed" : "Ended"}</span>
            </div>
          ))}
          {!history ? <Spinner /> : history.length === 0 && !(offers || []).some((o) => !(o.status === "live" && o.endsAt > now)) ? <Empty icon="🗄️" title="No history yet">Ended offers appear here.</Empty> : history.map((h) => (
            <div className="item" key={h.id}>
              <OfferImage offer={{ ...h, photoUrl: null }} className="ic" />
              <div className="grow"><b style={{ fontSize: 14 }}>{h.title}</b>
                <div className="muted small">{rupee(h.price)} <s>{rupee(h.origPrice)}</s> · {h.views} views · {h.leads} leads</div>
                <div className="muted small">Ended {day(h.endsAt)}</div></div>
            </div>
          ))}
        </>
      ) : !offers ? <Spinner /> : !offers.some((o) => o.status === "live" && o.endsAt > now) ? <Empty icon="🗂️" title="No live offers" action={<a className="btn main" href="#/owner/post">Post an offer</a>}>Ended offers are in History. Anything you need to move: rooms, seats, halls, slots, stock…</Empty>
        : offers.filter((o) => o.status === "live" && o.endsAt > now).map((o) => {
          const live = o.status === "live" && o.endsAt > now;
          const label = live ? (o.visible === false ? "Waiting" : "Live") : o.status === "removed" ? "Removed" : "Ended";
          return (
            <div className="item" key={o.id} style={{ alignItems: "flex-start" }}>
              <OfferImage offer={o} className="ic" />
              <div className="grow">
                <b style={{ fontSize: 14 }}>{o.title}</b>
                <div className="muted small">{rupee(o.price)} <s>{rupee(o.origPrice)}</s>{o.origPrice > o.price ? ` · ${Math.round((1 - o.price / o.origPrice) * 100)}% off` : ""}</div>
                <div className="small" style={{ fontWeight: 700, color: "var(--ink)", margin: "2px 0" }}>👀 Seen by {o.views || 0} customer{o.views === 1 ? "" : "s"}</div>
                <div className="muted small">{live ? `Offer ends in ${hoursText(o.endsAt - now)} (at ${clockIST(o.endsAt)})` : o.status === "removed" ? "Removed by LastPick for breaking the rules" : "Ended"}</div>
                {live && (() => {
                  return <div className="gap" style={{ marginTop: 8, flexWrap: "wrap" }}><a className="chip" href={"#/offer/" + o.id}>View</a>
                    <button className="chip" onClick={() => setEnding(o)}>End now</button></div>;
                })()}
              </div>
              <span className={"pill " + (label === "Live" ? "p-ok" : label === "Waiting" ? "p-warn" : label === "Removed" ? "p-bad" : "p-mute")}>{label}</span>
            </div>
          );
        })}
      {ending && (
        <Sheet onClose={() => setEnding(null)}>
          <h2 className="title" style={{ fontSize: 19 }}>End this offer?</h2>
          <p className="muted">"{ending.title}" will disappear from customers' feeds right away.</p>
          <div className="gap"><button className="btn ghost" onClick={() => setEnding(null)}>Keep it live</button><button className="btn danger" onClick={end}>End offer</button></div>
        </Sheet>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Post an offer
export function PostOffer() {
  const { business, toast, config } = useApp();
  // a partner posts ONLY in its own registered categories (a bakery posts bakery offers), plus job openings at its shop
  const own = business?.categories?.length ? business.categories : [business?.category || "other"];
  const allowed = [...new Set([...own, "jobs"])];
  const [postedToday, setPostedToday] = useState(null);
  useEffect(() => {
    const dayStart = Math.floor((Date.now() + 5.5 * 3600000) / 86400000) * 86400000 - 5.5 * 3600000;
    api.myOffers().then((l) => setPostedToday(l.filter((o) => o.createdAt >= dayStart).length)).catch(() => setPostedToday(0));
  }, []);
  const postsLeft = postedToday == null ? POSTS_PER_DAY : Math.max(0, POSTS_PER_DAY - postedToday);
  const [f, setF] = useState({ category: allowed[0], emoji: "📦", title: "", description: "", origPrice: "", price: "", quantity: "", hours: 6 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const now = useNow(60000);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const job = f.category === "jobs";
  // Everything ends the same day (India time): by 11 PM, or by 12 midnight for hotels, travel and logistics.
  // Posting is open only from 4 AM to 11 PM.
  // Hotels, travel and logistics: post any time, run up to 24 hours.
  const allDay = runs24x7(f.category);
  const dayStart = istDayStart(now);
  const closing = allDay ? now + 24 * 3600000 : dayStart + HOURS.close * 3600000;
  const hourNow = (now - dayStart) / 3600000; // hours since midnight, India time
  const postingOpen = allDay || (hourNow >= HOURS.postFrom && hourNow < HOURS.postTill);
  const hoursLeft = (closing - now) / 3600000;
  const choices = allDay ? [...DURATIONS, 18, 24] : [...DURATIONS.filter((h) => h < hoursLeft), "close"];
  const endsAtOf = (h) => (h === "close" ? closing : Math.min(Date.now() + h * 3600000, allDay ? Date.now() + 24 * 3600000 : closing));
  const closeLabel = allDay ? "24 hours" : "11 PM";
  const whenText = (ts) => (ts - istDayStart(now) >= 86400000 ? `${clockIST(ts)} tomorrow` : clockIST(ts));
  const templates = [...TEMPLATES.filter((t) => own.includes(t.category)), ...JOB_TEMPLATES];
  const useTemplate = (t) => setF((p) => ({ ...p, category: t.category, emoji: t.emoji, title: t.title, origPrice: t.origPrice, price: t.price, quantity: t.quantity, hours: t.hours }));
  const setCategory = (c) => setF((p) => ({ ...p, category: c }));
  // the % off is worked out from the prices, and any "40% off" in the title is kept in step automatically
  const setPrice = (k, v) => setF((p) => {
    const n = { ...p, [k]: v };
    const o = Number(n.origPrice), pr = Number(n.price);
    if (n.category !== "jobs" && o > 0 && n.price !== "" && pr >= 0 && pr < o) n.title = fixTitlePercent(n.title, Math.round((1 - pr / o) * 100));
    return n;
  });

  const price = Number(f.price);
  const orig = job ? price : Number(f.origPrice);
  const problems = [];
  if (f.title.trim().length < 3) problems.push("a title");
  if (job) { if (!(price > 0)) problems.push("the pay"); }
  else {
    if (!(orig > 0)) problems.push("the normal price");
    if (!(price >= 0) || f.price === "") problems.push("the offer price");
    else if (orig > 0 && price >= orig) problems.push("an offer price lower than the normal price");
  }
  const realPct = !job && orig > 0 && f.price !== "" && price >= 0 && price < orig ? Math.round((1 - price / orig) * 100) : null;

  const preview = {
    id: "preview", businessId: business.id, business: { name: business.name, area: business.area, lat: business.lat, lng: business.lng },
    title: f.title || "Your offer title", description: f.description, category: f.category, emoji: f.emoji, photoUrl: null,
    origPrice: orig || 0, price: f.price === "" ? null : price, quantity: f.quantity, endsAt: endsAtOf(f.hours) - Date.now() + now, status: "live",
  };

  const submit = async () => {
    if (problems.length) return;
    setBusy(true); setErr("");
    try {
      await api.createOffer({
        title: f.title.trim(), description: f.description.trim(), category: f.category, emoji: f.emoji,
        origPrice: orig, price, quantity: f.quantity.trim(), endsAt: endsAtOf(f.hours),
      });
      toast(job ? "Your job opening is live 📣" : "Your offer is live 🎉");
      navigate("/owner/offers");
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };

  // Outside posting hours (10:30 PM – 4 AM) a partner who isn't a hotel or travel business can't post anything:
  // show a closed screen instead of a form they can't send.
  const anyAllDay = allowed.some((c) => runs24x7(c));
  if (!postingOpen && !anyAllDay) return (
    <div className="page"><StatusBanner />
      <div className="card" style={{ textAlign: "center", padding: 24, marginTop: 16 }}>
        <div style={{ fontSize: 40 }}>🌙</div>
        <h2>Posting opens at 4 AM</h2>
        <p className="muted">You can post offers between 4 AM and 10:30 PM (India time), and every offer ends by 11 PM the same day. Only hotels, travel and logistics can post at night.</p>
        <a className="btn ghost" href="#/owner/offers">See my offers</a>
      </div>
    </div>
  );
  if (business && business.status !== "verified") return (
    <div className="page"><StatusBanner />
      <div className="card" style={{ textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 40 }}>🛡️</div>
        <h2>Posting is for trusted partners</h2>
        <p className="muted">Once our team verifies your business you can post same-day offers in your own category, and job openings at your shop.</p>
        <a className="btn" href="#/owner/business">Check business profile</a>
      </div>
    </div>
  );
  return (
    <>
      <div className="page-h"><h1 className="title">Post an offer</h1><div className="muted">A real discount for today only</div></div>
      <StatusBanner />
      {(!business.state || !business.city || !business.pincode || business.lat == null) && <a className="banner warn" href="#/owner/business">📍 Add your pincode and shop location in Business profile before posting. Customers see offers near them.</a>}
      <div className="chips">{templates.map((t) => <button key={t.label} className="chip" onClick={() => useTemplate(t)}>{t.label}</button>)}</div>
      <div className="form">
        <div className="fld"><label>Category</label>
          <select value={f.category} onChange={(e) => setCategory(e.target.value)}>{allowed.map((id) => <option key={id} value={id}>{categoryOf(id).label}</option>)}</select>
          <span className="hint">{job
            ? "Workers for your own shop only. Shown to customers within 10 km, like a local ad. Ends today by 11 PM."
            : allDay
              ? "Hotels, travel and logistics run 24×7: post any time, and your offer can run for up to 24 hours."
              : "You can post only in your registered category. Offers run today only and end by 11 PM (India time)."}</span></div>
        <div className="fld"><label>{job ? "Which job?" : "What are you offering?"}</label><input maxLength={120} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={job ? "e.g. Shop helper needed, 9 AM – 6 PM" : "e.g. Fresh cakes half price after 8 PM"} /></div>
        <div className="fld"><label>Details</label><textarea rows="3" maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What's included, timings, conditions…" /></div>
        <div className="two">
          {job
            ? <div className="fld"><label>Pay ₹</label><input type="number" min="1" inputMode="numeric" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="e.g. 12000" /></div>
            : <><div className="fld"><label>Normal price ₹</label><input type="number" min="1" inputMode="numeric" value={f.origPrice} onChange={(e) => setPrice("origPrice", e.target.value)} /></div>
              <div className="fld"><label>Offer price ₹</label><input type="number" min="0" inputMode="numeric" value={f.price} onChange={(e) => setPrice("price", e.target.value)} /></div></>}
        </div>
        {!job && realPct != null && <div className="pctline">Discount: <b>{realPct}% off</b> <span className="muted small">· worked out from your prices{/\d\s*%/.test(f.title) ? ", and updated in your title" : ""}</span></div>}
        <div className="two">
          <div className="fld"><label>{job ? "Pay per" : "How many"}</label><input maxLength={60} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder={job ? "e.g. Pay per month" : "e.g. 3 rooms"} /></div>
          <div className="fld"><label>{job ? "Show for" : "Offer ends in"}</label>
            <select value={choices.includes(f.hours) ? f.hours : "close"} onChange={(e) => set("hours", e.target.value === "close" ? "close" : Number(e.target.value))}>
              {choices.map((h) => <option key={h} value={h}>{h === "close" ? "Till 11 PM (today)" : `${h} hour${h > 1 ? "s" : ""} · till ${whenText(Math.min(now + h * 3600000, closing))}`}</option>)}
            </select>
            <span className="hint">{allDay ? "Runs 24×7: up to 24 hours from now." : "Ends by 11 PM today. Last time to post: 10:30 PM. (Hotels, travel and logistics: any time, up to 24 hours.)"}</span></div>
        </div>
        <div className="muted small">Customers will contact you on <b>{prettyPhone(business.phone)}</b> ({business.city}). <a className="link" href="#/owner/business">Change</a></div>
      </div>
      <div className="label-up">How customers see it</div>
      <div style={{ paddingTop: 8 }}><OfferCard offer={preview} preview /></div>
      <div className="pad" style={{ paddingTop: 0 }}>
        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
        <div className={"banner " + (postsLeft > 0 ? "ok" : "warn")} style={{ margin: "0 0 12px" }}>{postsLeft > 0
          ? `📅 You can post ${postsLeft} more offer${postsLeft > 1 ? "s" : ""} today (${POSTS_PER_DAY} a day).`
          : `📅 You've posted ${POSTS_PER_DAY} offers today. You can post again tomorrow from 4 AM.`}</div>
        {!postingOpen && <div className="banner warn" style={{ margin: "0 0 12px" }}>🌙<span>Posting is closed now. Partners can post from 4 AM to 10:30 PM (India time); hotels, travel and logistics can post any time. Post again at 4 AM.</span></div>}
        <button className="btn main" disabled={busy || problems.length > 0 || postsLeft === 0 || !postingOpen} onClick={submit}>{busy ? "Posting…" : job ? "📣 Post job opening" : "🚀 Make offer live"}</button>
        {problems.length > 0 && <div className="note">Add {problems.join(", ")}.</div>}
        <div className="note">By posting, you confirm this offer is genuine and you will honour it. You are responsible for your offer; {APP_NAME} only connects you with customers.</div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Business profile
export function BusinessPage() {
  return <NeedLogin why="Log in to manage your business"><BusinessForm /></NeedLogin>;
}

function BusinessForm({ first = false }) {
  const { business, profile, refresh, toast } = useApp();
  const needsConsent = profile?.partnerConsentVersion !== CONSENT_VERSION;
  const [f, setF] = useState(() => ({
    name: business?.name || "", category: business?.category || "food", about: business?.about || "", address: business?.address || "",
    area: business?.area || "", city: business?.city || "", state: business?.state || "", pincode: business?.pincode || "", lat: business?.lat ?? null, lng: business?.lng ?? null,
    phone: business?.phone || profile?.phone || "", agree: false,
  }));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [termsDoc, setTermsDoc] = useState(null); // set once the partner has scrolled through the whole Terms
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Pincode first: a valid pincode fills state, city and the list of areas (post offices) for that pincode.
  const [areas, setAreas] = useState([]);
  const [pinState, setPinState] = useState(""); // "", "looking", "found", "unknown", "offline"
  const fillFromPincode = async (pin, keep = {}) => {
    if (!validPincode(pin)) { setAreas([]); setPinState(""); return; }
    setPinState("looking");
    try {
      const r = await lookupPincode(pin);
      if (!r) { setAreas([]); setPinState("unknown"); return; }
      setAreas(r.areas);
      setF((p) => ({ ...p, state: r.state || p.state, city: keep.city || r.city || p.city,
        area: keep.area || (r.areas.includes(p.area) ? p.area : r.areas.length === 1 ? r.areas[0] : p.area) }));
      setPinState("found");
    } catch { setPinState("offline"); }
  };
  useEffect(() => { if (validPincode(f.pincode)) fillFromPincode(f.pincode, { city: f.city, area: f.area }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The shop's location ALWAYS comes from the phone's GPS (no typed pincode, which can be wrong):
  // it saves the map point AND fills address, area, city, state and pincode. Done automatically for a new business.
  const locate = () => {
    if (!navigator.geolocation) return toast("Location isn't available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        setF((x) => ({ ...x, lat, lng }));
        try {
          const a = await addressFromLocation(lat, lng);
          if (a.outsideIndia) { toast("This location is outside India. LastPick is for businesses in India."); }
          else {
            setF((x) => ({ ...x, address: x.address || a.address, area: a.area || x.area, city: a.city || x.city, state: a.state || x.state, pincode: a.pincode || "" }));
            if (a.pincode) await fillFromPincode(a.pincode, { city: a.city, area: a.area });
            toast(a.pincode ? "Shop location and pincode found. Please check the address." : "We couldn't find the pincode for this spot. Step outside or move a little, then tap Detect again.");
          }
        } catch { toast("Location saved. We couldn't fetch the address, please type it."); }
        setLocating(false);
      },
      () => { setLocating(false); toast("Couldn't get your location. Turn on location (GPS), allow it for LastPick, and tap Detect again."); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  useEffect(() => { if (f.lat == null) locate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = [];
  if (f.name.trim().length < 2) missing.push("business name");
  if (!f.area.trim()) missing.push("area");
  if (!f.city.trim()) missing.push("city");
  if (!f.state) missing.push("state");
  if (f.lat == null) missing.push("your shop's location (tap Detect my shop location while at your shop)");
  else if (!validPincode(f.pincode)) missing.push("the pincode (tap Detect my shop location again)");
  if (!validPhone(f.phone)) missing.push("a valid Indian contact number");
  if (needsConsent && (!termsDoc || termsDoc.category !== f.category)) missing.push("reading your whole Partner Agreement (scroll to the end)");
  else if (needsConsent && !f.agree) missing.push("agreement to the Terms and Conditions");

  const save = async () => {
    if (missing.length) return;
    setBusy(true);
    try {
      const city = f.city.trim().replace(/\s+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
      const categories = [f.category];
      await api.saveBusiness({ ...business, ...f, whatsapp: false, categories, name: f.name.trim(), area: f.area.trim(), city, phone: f.phone.trim() });
      if (needsConsent) await api.recordConsent("partner", { items: ["genuine-offers", "categories", "licences", "number-visible", "customer-data-use"], readFull: true, docText: termsDoc.text, docHash: termsDoc.hash });
      await refresh();
      toast(first ? "Business created. Next: choose your plan." : "Business details saved");
      if (!first) navigate("/owner");
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  };

  return (
    <>
      <div className="page-h"><h1 className="title">{first ? "Set up your business" : "Business profile"}</h1>
        <div className="muted">{first ? "Tell customers who you are. We verify every business before its offers go live." : "Customers see these details on your offers"}</div></div>
      {!first && <StatusBanner />}
      <div className="form" style={{ paddingTop: 12 }}>
        <div className="fld"><label>Business name</label><input maxLength={120} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sunrise Bakery" /></div>
        <div className="fld"><label>Main category</label>
          <select value={f.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <span className="hint">You post offers only in this category (plus job openings at your shop).</span></div>
        <div className="fld"><label>Contact number for customers</label><input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="10-digit Indian mobile or landline with STD code" />
          <span className="hint">Shown to logged-in customers on your offers.</span></div>
        <div className="toggle">
          <div><b style={{ fontSize: 14 }}>Shop location (required)</b><div className="muted small">{locating ? "Finding your shop's location…" : f.lat != null ? "Found from your phone's GPS. Do this while you are at your shop." : "Turn on location and be at your shop. We fill the pincode, state, city and area from it."}</div></div>
          <button className="btn ghost sm" type="button" disabled={locating} onClick={locate}>{locating ? "Finding…" : f.lat != null ? "📍 Detect again" : "📍 Detect my shop location"}</button>
        </div>
        <div className="fld"><label>Pincode (from your location)</label><input inputMode="numeric" value={f.pincode} readOnly placeholder="Filled from your location" style={{ background: "var(--soft)" }} />
          <span className="hint">{pinState === "looking" ? "Finding your area…" : f.pincode ? "Customers within 30 km of your shop see your offers." : "Tap Detect my shop location at your shop. The pincode can't be typed, so it is always right."}</span></div>
        <div className="two">
          <div className="fld"><label>State</label>
            <input value={f.state} readOnly placeholder="Filled from your location" style={{ background: "var(--soft)" }} /></div>
          <div className="fld"><label>City / district</label><input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Filled from pincode" /></div>
        </div>
        <div className="fld"><label>Area</label>
          {areas.length > 0
            ? <select value={areas.includes(f.area) ? f.area : ""} onChange={(e) => set("area", e.target.value)}><option value="">Select your area</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
            : <input value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="Your locality, e.g. Nizampet" />}</div>
        <div className="fld"><label>Address</label><input value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Shop number, building, street" /></div>
        <div className="fld"><label>About (optional)</label><textarea rows="2" maxLength={500} value={f.about} onChange={(e) => set("about", e.target.value)} placeholder="What you do, opening hours…" /></div>
        {needsConsent && <div className="muted small" style={{ marginTop: 4 }}>Please read your Partner Agreement for <b>{categoryOf(f.category)?.label}</b> businesses to the end. It changes with the category you pick.</div>}
        {needsConsent && <TermsBox key={f.category} title={partnerTermsTitle(f.category)} sections={partnerTermsSections(f.category)} getText={() => partnerTermsText(f.category)} read={!!termsDoc && termsDoc.category === f.category} onRead={(doc) => setTermsDoc({ ...doc, category: f.category })} />}
        {needsConsent && (
          <label className="toggle" style={{ cursor: "pointer", justifyContent: "flex-start", alignItems: "flex-start" }}>
            <input type="checkbox" aria-label="I agree to the business terms" disabled={!termsDoc || termsDoc.category !== f.category} checked={f.agree && !!termsDoc && termsDoc.category === f.category} onChange={(e) => set("agree", e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
            <span className="small">{termsDoc && termsDoc.category === f.category ? "" : "(Read the whole agreement above first.) "}I have read the entire {APP_NAME} Partner Agreement for {categoryOf(f.category)?.label} businesses above, including the Terms and Conditions, and I agree to it. My details are true, I hold the licences my business needs, and I agree my business contact number is shown to logged-in customers.</span>
          </label>
        )}
        <button className="btn main" disabled={busy || missing.length > 0} onClick={save}>{busy ? "Saving…" : first ? "Create business" : "Save details"}</button>
        {missing.length > 0 && <div className="note" style={{ marginTop: 0 }}>Add {missing.join(", ")}.</div>}
      </div>
    </>
  );
}
