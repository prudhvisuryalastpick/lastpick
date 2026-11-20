import { useEffect, useRef, useState } from "react";
import { api } from "../api/index.js";
import { BusinessCard } from "./impact.jsx";
import { Empty, NeedLogin, OfferCard, PlanCard, Sheet, Spinner, Toggle } from "../components.jsx";
import { ADMISSION_DURATIONS, APP_NAME, CATEGORIES, CONSENT_VERSION, DURATIONS, EMOJIS, INDIAN_STATES, IS_OWNER_APP, MAJOR_CITIES, MAX_CATEGORIES, PLANS, POSTS_PER_DAY, RETENTION, TEMPLATES, TINTS, categoryOf } from "../lib/config.js";
import { RatingBadge } from "./reviews.jsx";
import { ago, day, daysLeft, errText, prettyPhone, rupee, telLink, timeLeft, validPhone, waLink } from "../lib/format.js";
import { navigate, useApp, useNow } from "../state.jsx";
import { validPincode } from "../lib/geo.js";

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
      <div className="status no"><span style={{ fontSize: 24 }}>⏰</span><div><b>Your free month has ended</b><div className="muted small">Pick a plan to keep your offers live for customers within 30 km.</div></div></div>
      <PlanCard plan="owner" />
      <div className="pad">
        <a className="btn main" href="#/plans">See plans · from {rupee(Math.round(PLANS.owner.options[3].price / 12))}/month</a>
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
  const { business, subs, setMode, freeMode, trial } = useApp();
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
      <BusinessCard />
      <a className="cta" href="#/owner/post"><span className="plus" aria-hidden="true">＋</span>
        <span className="grow"><b style={{ display: "block", fontSize: 16 }}>Post an offer</b><span className="small" style={{ color: "#CFC8E8" }}>Goes live to customers within 30 km</span></span><span aria-hidden="true">›</span></a>
      <a className="banner" style={{ background: "var(--warn-soft)", color: "var(--warn)" }} href="#/plans">🎁 <span>{subs.owner?.active ? `${PLANS.owner.name} active till ${day(subs.owner.currentPeriodEnd)}`
        : left > 0 ? `Free month: ${left} day${left > 1 ? "s" : ""} left. Then ${rupee(PLANS.owner.price)}/month, or less on longer plans.`
          : business.status !== "verified" ? `Your free month starts the day we verify you. Then ${rupee(PLANS.owner.price)}/month.`
            : freeMode ? "Free during launch. We'll tell you before paid plans start." : `Your free month has ended. Plans from ${rupee(Math.round(PLANS.owner.options[3].price / 12))}/month.`}</span></a>
      {live.length > 0 && <>
        <div className="sect"><h3>Live now</h3><a className="link small" href="#/owner/offers">All offers</a></div>
        {live.slice(0, 3).map((o) => (
          <a className="item" key={o.id} href={"#/offer/" + o.id}>
            <div className="ic" style={o.photoUrl ? { backgroundImage: `url("${o.photoUrl}")` } : { background: TINTS[o.category] || TINTS.other }}>{!o.photoUrl && o.emoji}</div>
            <div className="grow"><b className="ellipsis" style={{ display: "block", fontSize: 14 }}>{o.title}</b><div className="muted small">{o.views} views · ends in {timeLeft(o.endsAt - now)}</div></div>
            <span className={"tm " + (o.endsAt - now < 3600000 ? "hot" : "")}>{timeLeft(o.endsAt - now)}</span>
          </a>))}
      </>}
      <a className="menu-item" style={{ marginTop: 10 }} href="#/owner/reviews">⭐ Reviews {business.rating?.count ? <RatingBadge rating={business.rating} /> : <span className="muted small">none yet</span>}<span className="chev">›</span></a>
      <div className="sect"><h3>Latest interested customers</h3><a className="link small" href="#/owner/leads">See all</a></div>
      {!leads ? <Spinner /> : leads.length === 0
        ? <div className="muted pad" style={{ paddingTop: 0 }}>When a customer taps "Share my number" on your offer, they appear here.</div>
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
        <div className="muted small">{prettyPhone(lead.phone)}</div>
        <div className="muted small ellipsis">{lead.offerEmoji} {lead.offerTitle} · {ago(lead.createdAt)}</div>
      </div>
      <a className="icon-btn" aria-label="Call" href={telLink(lead.phone)} onClick={mark}>📞</a>
      <a className="icon-btn wa" aria-label="WhatsApp" target="_blank" rel="noreferrer" onClick={mark}
        href={waLink(lead.phone, `Hi ${lead.name}, this is ${business?.name} from ${APP_NAME}, about "${lead.offerTitle}".`)}>💬</a>
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
      <div className="page-h"><h1 className="title">Leads</h1><div className="muted">Customers who shared their number with you</div></div>
      <div className="tabs">{[["all", "All"], ["new", "New"], ["contacted", "Contacted"]].map(([id, l]) => <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{l}</button>)}</div>
      {!leads ? <Spinner /> : shown.length === 0
        ? <Empty icon="📭" title="No leads here yet">When a customer taps "Share my number" on your offer, they appear here.</Empty>
        : shown.map((l) => <LeadRow key={l.id} lead={l} onChange={load} />)}
    </>
  );
}

// ------------------------------------------------------------------ My offers
export function OwnerOffers() {
  const { toast } = useApp();
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
      <div className="tabs"><button className={tab === "current" ? "on" : ""} onClick={() => setTab("current")}>Current</button><button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>History</button></div>
      {tab === "history" ? (
        <>
          <div className="muted small pad" style={{ paddingTop: 0 }}>Offers move here {RETENTION.endedOfferVisibleDays} days after they end and are kept for {Math.round(RETENTION.archiveDays / 30)} months.</div>
          {!history ? <Spinner /> : history.length === 0 ? <Empty icon="🗄️" title="No history yet">Ended offers appear here.</Empty> : history.map((h) => (
            <div className="item" key={h.id}>
              <div className="ic" style={{ background: TINTS[h.category] || TINTS.other }}>{h.emoji}</div>
              <div className="grow"><b style={{ fontSize: 14 }}>{h.title}</b>
                <div className="muted small">{rupee(h.price)} <s>{rupee(h.origPrice)}</s> · {h.views} views · {h.leads} leads</div>
                <div className="muted small">Ended {day(h.endsAt)}</div></div>
            </div>
          ))}
        </>
      ) : !offers ? <Spinner /> : offers.length === 0 ? <Empty icon="🗂️" title="No offers yet" action={<a className="btn main" href="#/owner/post">Post your first offer</a>}>Anything you need to move: rooms, seats, halls, slots, stock…</Empty>
        : offers.map((o) => {
          const live = o.status === "live" && o.endsAt > now;
          const label = live ? (o.visible === false ? "Waiting" : "Live") : o.status === "removed" ? "Removed" : "Ended";
          return (
            <div className="item" key={o.id} style={{ alignItems: "flex-start" }}>
              <div className="ic" style={o.photoUrl ? { backgroundImage: `url("${o.photoUrl}")` } : { background: TINTS[o.category] || TINTS.other }}>{!o.photoUrl && o.emoji}</div>
              <div className="grow">
                <b style={{ fontSize: 14 }}>{o.title}</b>
                <div className="muted small">{rupee(o.price)} <s>{rupee(o.origPrice)}</s> · {o.views} views</div>
                <div className="muted small">{live ? "Ends in " + timeLeft(o.endsAt - now) : o.status === "removed" ? "Removed by LastPick for breaking the rules" : "Ended"}</div>
                {live && <div className="gap" style={{ marginTop: 8 }}><a className="chip" href={"#/offer/" + o.id}>View</a><button className="chip" onClick={() => setEnding(o)}>End now</button></div>}
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
  // verified (trusted) partners can post in any category; their own categories come first
  const own = business?.categories?.length ? business.categories : [business?.category || "other"];
  const allowed = [...new Set([...own, ...CATEGORIES.map((c) => c.id)])];
  const [postedToday, setPostedToday] = useState(null);
  useEffect(() => {
    const dayStart = Math.floor((Date.now() + 5.5 * 3600000) / 86400000) * 86400000 - 5.5 * 3600000;
    api.myOffers().then((l) => setPostedToday(l.filter((o) => o.createdAt >= dayStart).length)).catch(() => setPostedToday(0));
  }, []);
  const postsLeft = postedToday == null ? POSTS_PER_DAY : Math.max(0, POSTS_PER_DAY - postedToday);
  const [f, setF] = useState({ category: allowed[0], emoji: "📦", title: "", description: "", origPrice: "", price: "", quantity: "", hours: 6 });
  const [photo, setPhoto] = useState(null); // { file, url } (compressed when posting)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();
  const now = useNow(60000);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const templates = TEMPLATES.filter((t) => allowed.includes(t.category));
  const useTemplate = (t) => setF((p) => ({ ...p, category: t.category, emoji: t.emoji, title: t.title, origPrice: t.origPrice, price: t.price, quantity: t.quantity, hours: t.hours }));

  const orig = Number(f.origPrice), price = Number(f.price);
  const problems = [];
  if (f.title.trim().length < 3) problems.push("a title");
  if (!(orig > 0)) problems.push("the normal price");
  const job = f.category === "jobs";
  if (!(price >= 0) || f.price === "") problems.push(job ? "the pay" : "the offer price");
  else if (!job && orig > 0 && price >= orig) problems.push("an offer price lower than the normal price");

  const preview = {
    id: "preview", businessId: business.id, business: { name: business.name, area: business.area, lat: business.lat, lng: business.lng },
    title: f.title || "Your offer title", description: f.description, category: f.category, emoji: f.emoji, photoUrl: photo?.url || null,
    origPrice: orig || 1, price: price || 0, quantity: f.quantity, endsAt: now + f.hours * 3600000, status: "live",
  };

  const onPhoto = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Please choose a photo");
    if (file.size > 15 * 1024 * 1024) return toast("Photo must be under 15 MB");
    setPhoto({ file, url: URL.createObjectURL(file) });
  };

  const submit = async () => {
    if (problems.length) return;
    setBusy(true); setErr("");
    try {
      const pics = photo ? await api.uploadPhoto(photo.file) : null;
      await api.createOffer({
        title: f.title.trim(), description: f.description.trim(), category: f.category, emoji: f.emoji,
        photoThumb: pics?.thumb || null, photo: pics?.photo || null,
        origPrice: orig, price, quantity: f.quantity.trim(), endsAt: Date.now() + f.hours * 3600000,
      });
      toast("Your offer is live 🎉");
      navigate("/owner/offers");
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };

  if (business && business.status !== "verified") return (
    <div className="page"><StatusBanner />
      <div className="card" style={{ textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 40 }}>🛡️</div>
        <h2>Posting is for trusted partners</h2>
        <p className="muted">Once our team verifies your business you can post anything that brings you customers: deals, health camps, admissions, trips, things to sell or job openings.</p>
        <a className="btn" href="#/owner/business">Check business profile</a>
      </div>
    </div>
  );
  return (
    <>
      <div className="page-h"><h1 className="title">Post an offer</h1><div className="muted">Anything you need to move before it becomes a loss</div></div>
      <StatusBanner />
      {(!business.state || !business.city || !business.pincode || business.lat == null) && <a className="banner warn" href="#/owner/business">📍 Add your pincode and shop location in Business profile before posting. Customers see offers near them.</a>}
      <div className="chips">{templates.map((t) => <button key={t.label} className="chip" onClick={() => useTemplate(t)}>{t.emoji} {t.label}</button>)}</div>
      <div className="form">
        <div className="fld"><label>Photo (optional)</label>
          {photo
            ? <div className="photo-prev" style={{ backgroundImage: `url("${photo.url}")` }}><button className="back" style={{ left: "auto", right: 10 }} aria-label="Remove photo" onClick={() => setPhoto(null)}>×</button></div>
            : <div className="photo-drop" onClick={() => fileRef.current.click()}>📷 Add a photo of the offer</div>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files[0]); e.target.value = ""; }} />
        </div>
        {!photo && <div className="fld"><label>Or pick an icon</label><div className="emoji-pick">{EMOJIS.map((e) => <button key={e} className={f.emoji === e ? "on" : ""} onClick={() => set("emoji", e)}>{e}</button>)}</div></div>}
        <div className="fld"><label>Category</label>
          <select value={f.category} onChange={(e) => set("category", e.target.value)}>{allowed.map((id) => { const c = categoryOf(id); return <option key={id} value={id}>{c.icon} {c.label}</option>; })}</select>
          <span className="hint">Verified partners can post anything that brings business: deals, camps, admissions, trips, sales or jobs.</span></div>
        <div className="fld"><label>What are you offering?</label><input maxLength={120} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Marriage hall free on 24 Nov" /></div>
        <div className="fld"><label>Details</label><textarea rows="3" maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What's included, timings, conditions…" /></div>
        <div className="two">
          {f.category === "jobs"
            ? <div className="fld" style={{ gridColumn: "1 / -1" }}><label>Pay ₹ (per day or per month; say which in the title)</label><input type="number" min="1" inputMode="numeric" value={f.price} onChange={(e) => setF((p) => ({ ...p, price: e.target.value, origPrice: e.target.value }))} /></div>
            : <><div className="fld"><label>Normal price ₹</label><input type="number" min="1" inputMode="numeric" value={f.origPrice} onChange={(e) => set("origPrice", e.target.value)} /></div>
              <div className="fld"><label>Offer price ₹</label><input type="number" min="0" inputMode="numeric" value={f.price} onChange={(e) => set("price", e.target.value)} /></div></>}
        </div>
        <div className="two">
          <div className="fld"><label>How many</label><input maxLength={60} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="e.g. 3 rooms" /></div>
          <div className="fld"><label>Offer ends in</label>
            <select value={f.hours} onChange={(e) => set("hours", Number(e.target.value))}>
              {(f.category === "admissions" ? ADMISSION_DURATIONS : DURATIONS).map((h) => <option key={h} value={h}>{h < 24 ? `${h} hour${h > 1 ? "s" : ""}` : `${h / 24} day${h > 24 ? "s" : ""}`}</option>)}
            </select></div>
        </div>
        <div className="muted small">Customers will contact you on <b>{prettyPhone(business.phone)}</b> ({business.city}). <a className="link" href="#/owner/business">Change</a></div>
      </div>
      <div className="label-up">How customers see it</div>
      <div style={{ paddingTop: 8 }}><OfferCard offer={preview} preview /></div>
      <div className="pad" style={{ paddingTop: 0 }}>
        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
        <div className={"banner " + (postsLeft > 0 ? "ok" : "warn")} style={{ margin: "0 0 12px" }}>{postsLeft > 0
          ? `📅 You can post ${postsLeft} more offer${postsLeft > 1 ? "s" : ""} today (${POSTS_PER_DAY} a day).`
          : `📅 You've posted ${POSTS_PER_DAY} offers today. You can post again after midnight.`}</div>
        <button className="btn main" disabled={busy || problems.length > 0 || postsLeft === 0} onClick={submit}>{busy ? "Posting…" : "🚀 Make offer live"}</button>
        {problems.length > 0 && <div className="note">Add {problems.join(", ")}.</div>}
        {config?.night && !(config.alwaysOpen || []).includes(f.category) && <div className="banner warn" style={{ margin: "0 0 10px" }}>🌙<span>It's after working hours, so this goes live at {config.hours?.open ?? 6} AM. Good time to post a sale or a camp registration.</span></div>}
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
    extra: (business?.categories || []).filter((c) => c !== business?.category),
    name: business?.name || "", category: business?.category || "food", about: business?.about || "", address: business?.address || "",
    area: business?.area || "", city: business?.city || "", state: business?.state || "", pincode: business?.pincode || "", lat: business?.lat ?? null, lng: business?.lng ?? null,
    phone: business?.phone || profile?.phone || "", whatsapp: business?.whatsapp ?? true, agree: false,
  }));
  const toggleExtra = (id) => setF((p) => ({ ...p, extra: p.extra.includes(id) ? p.extra.filter((x) => x !== id) : p.extra.length < MAX_CATEGORIES - 1 ? [...p.extra, id] : p.extra }));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const locate = () => {
    if (!navigator.geolocation) return toast("Location isn't available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { set("lat", p.coords.latitude); set("lng", p.coords.longitude); setLocating(false); toast("Location saved"); },
      () => { setLocating(false); toast("Couldn't get your location. Allow location access and try again."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const missing = [];
  if (f.name.trim().length < 2) missing.push("business name");
  if (!f.area.trim()) missing.push("area");
  if (!f.city.trim()) missing.push("city");
  if (!f.state) missing.push("state");
  if (!validPincode(f.pincode)) missing.push("a 6-digit pincode");
  if (f.lat == null) missing.push("your shop's map location (tap Use my location at your shop)");
  if (!validPhone(f.phone)) missing.push("a valid Indian contact number");
  if (needsConsent && !f.agree) missing.push("agreement to the business terms");

  const save = async () => {
    if (missing.length) return;
    setBusy(true);
    try {
      const city = f.city.trim().replace(/\s+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
      const categories = [f.category, ...f.extra.filter((c) => c !== f.category)].slice(0, MAX_CATEGORIES);
      await api.saveBusiness({ ...business, ...f, categories, name: f.name.trim(), area: f.area.trim(), city, phone: f.phone.trim() });
      if (needsConsent) await api.recordConsent("partner", { items: ["genuine-offers", "categories", "licences", "number-visible", "customer-data-use"] });
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
          <select value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value, extra: p.extra.filter((x) => x !== e.target.value) }))}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select>
          <span className="hint">You can post offers only in your categories. Food registered? Then you post food offers.</span></div>
        <div className="fld"><label>Also offer (optional, up to {MAX_CATEGORIES - 1})</label>
          <div className="gap" style={{ flexWrap: "wrap", gap: 6 }}>{CATEGORIES.filter((c) => c.id !== f.category).map((c) => (
            <button type="button" key={c.id} className={"chip " + (f.extra.includes(c.id) ? "on" : "")} onClick={() => toggleExtra(c.id)}
              disabled={!f.extra.includes(c.id) && f.extra.length >= MAX_CATEGORIES - 1}>{c.icon} {c.label}</button>))}</div></div>
        <div className="fld"><label>Contact number for customers</label><input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="10-digit Indian mobile or landline with STD code" />
          <span className="hint">Shown to logged-in customers on your offers.</span></div>
        <Toggle on={f.whatsapp} onChange={(v) => set("whatsapp", v)} title="Customers can WhatsApp this number" />
        <div className="fld"><label>Address</label><input value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Shop number, street" /></div>
        <div className="two">
          <div className="fld"><label>Area</label><input value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Indiranagar" /></div>
          <div className="fld"><label>City</label><input list="lp-cities" value={f.city} placeholder="e.g. Bengaluru"
            onChange={(e) => { const v = e.target.value; const m = MAJOR_CITIES.find((c) => c.name.toLowerCase() === v.trim().toLowerCase()); setF((p) => ({ ...p, city: v, state: m ? m.state : p.state })); }} />
            <datalist id="lp-cities">{MAJOR_CITIES.map((c) => <option key={c.name} value={c.name} />)}</datalist></div>
        </div>
        <div className="fld"><label>Pincode</label><input inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 560038" />
          <span className="hint">Customers searching this pincode will see your offers.</span></div>
        <div className="fld"><label>State</label>
          <select value={f.state} onChange={(e) => set("state", e.target.value)}><option value="">Select state</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select>
          <span className="hint">LastPick is available for businesses in India.</span></div>
        <div className="toggle">
          <div><b style={{ fontSize: 14 }}>Shop location (required)</b><div className="muted small">{f.lat != null ? `Saved (${Number(f.lat).toFixed(4)}, ${Number(f.lng).toFixed(4)})` : "Do this at your shop. Customers within their chosen distance (e.g. 30 km) see your offers."}</div></div>
          <button className="btn ghost sm" type="button" disabled={locating} onClick={locate}>{locating ? "Locating…" : "📍 Use my location"}</button>
        </div>
        <div className="fld"><label>About (optional)</label><textarea rows="2" maxLength={500} value={f.about} onChange={(e) => set("about", e.target.value)} placeholder="What you do, opening hours…" /></div>
        {needsConsent && (
          <label className="toggle" style={{ cursor: "pointer", justifyContent: "flex-start", alignItems: "flex-start" }}>
            <input type="checkbox" aria-label="I agree to the business terms" checked={f.agree} onChange={(e) => set("agree", e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
            <span className="small">I confirm these details are true and I'm allowed to run this business. My offers will be genuine, at real prices, in my categories only, and I hold the licences my business needs (e.g. FSSAI for food).
              I agree my business contact number is shown to logged-in customers, and I'll use customers' numbers only to reply about their offer. I'm responsible for my offers; {APP_NAME} only connects me with customers. <a className="link" href="#/terms">Business terms</a></span>
          </label>
        )}
        <button className="btn main" disabled={busy || missing.length > 0} onClick={save}>{busy ? "Saving…" : first ? "Create business" : "Save details"}</button>
        {missing.length > 0 && <div className="note" style={{ marginTop: 0 }}>Add {missing.join(", ")}.</div>}
      </div>
    </>
  );
}
