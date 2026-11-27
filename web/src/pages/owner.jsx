import { BIZ_TYPE_KEY } from "./auth.jsx";
import { ContactCard } from "./contactus.jsx";
import { TermsBox } from "./privacy.jsx";
import { POSTING_RULES, POSTING_RULES_VERSION, partnerTermsSections, partnerTermsText, partnerTermsTitle } from "../lib/terms.js";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/index.js";
import { JoinedTicker, StatPair, useStats, TicketHint, Empty, NeedLogin, OfferCard, OfferImage, PlanBar, PlanCard, Sheet, Spinner, Toggle } from "../components.jsx";
import { HOURS, fixTitlePercent, runs24x7, APP_NAME, CATEGORIES, CONSENT_VERSION, DURATIONS, EMOJIS, IS_OWNER_APP, MAJOR_CITIES, MAX_CATEGORIES, PLANS, POSTS_PER_DAY, RETENTION, categoryOf, itemOptions } from "../lib/config.js";
import { RatingBadge } from "./reviews.jsx";
import { Icon } from "../lib/icons.jsx";
import { ago, clockIST, day, daysLeft, errText, hoursText, istDayStart, prettyPhone, rupee, telLink, timeLeft, typePhone, validPhone, waLink } from "../lib/format.js";
import { navigate, useApp, useNow } from "../state.jsx";
import { validPincode } from "../lib/geo.js";
import { addressFromLocation, lookupPincode, nearbyLocalities } from "../lib/address.js";

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

// the business type picked on the sign-up form (first time only)
const signupBizType = () => { try { const c = localStorage.getItem(BIZ_TYPE_KEY); return CATEGORIES.some((x) => x.id === c) ? c : ""; } catch { return ""; } };

function OwnerPaywall() {
  const { business } = useApp();
  const [photo] = useMyPhoto();
  return (
    <>
      <div className="page-h owner-row">{photo ? <img className="avatar" src={photo} alt="" style={{ objectFit: "cover", borderRadius: "50%" }} /> : <div className="avatar">{business.name[0]}</div>}<div><h1 className="title" style={{ fontSize: 20 }}>{business.name}</h1><div className="muted">Business account · {business.area}</div></div></div>
      <div className="status no"><span style={{ fontSize: 24 }}>⏰</span><div><b>{PLANS.owner.name} is not active</b><div className="muted small">Pick a plan to post offers for customers within 30 km.</div></div></div>
      <PlanCard plan="owner" />
      <div className="pad">
        <a className="btn main" href="#/plans">{PLANS.owner.tagline} · just {PLANS.owner.perPost}</a>
        <div className="note">Turn empty rooms, seats, halls, slots and leftover stock into sales instead of losses.</div>
      </div>
    </>
  );
}

// the shop photo (partner KYC), loaded once
function useMyPhoto() {
  const { profile } = useApp();
  const [photo, setPhoto] = useState(null);
  useEffect(() => { if (profile?.hasPhoto) api.myPhoto().then(setPhoto); }, [profile?.hasPhoto]);
  return [photo, setPhoto];
}

// "KYC in progress": shown to a partner whose business is waiting for verification
function KycCard() {
  const { profile, refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const addPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    try { await api.setMyPhoto(await api.profilePhotoFrom(file)); await refresh(); toast("Photo added"); } catch (x) { toast(errText(x)); }
    setBusy(false);
  };
  const rows = [
    ["Shop photo", profile?.hasPhoto ? "✓ Added" : "Needed", profile?.hasPhoto ? "var(--ok)" : "var(--bad)"],
    ["E-mail", profile?.emailVerified ? "✓ Verified" : "Not verified", profile?.emailVerified ? "var(--ok)" : "var(--warn)"],
    profile?.phoneCheck
      ? ["Mobile number", profile?.phoneVerified ? "✓ Verified" : "Not verified (verify in Account)", profile?.phoneVerified ? "var(--ok)" : "var(--warn)"]
      : ["Mobile number", profile?.phone ? "✓ Added" : "Not added", profile?.phone ? "var(--ok)" : "var(--warn)"],
    ["Business details & location", "✓ Sent", "var(--ok)"],
    ["KYC check by LastPick", "In progress", "var(--warn)"],
  ];
  return (
    <div style={{ margin: "0 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 16, padding: 14, color: "#7C2D12" }}>
        <b style={{ fontSize: 15 }}>We're checking your business</b>
        <div className="small" style={{ marginTop: 6, lineHeight: 1.5 }}>Your KYC is in progress. You can finish your shop profile now. Your offers go live for customers once we verify you. We'll e-mail you as soon as it's done.</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, padding: "4px 14px" }}>
        {rows.map(([a, b, c]) => <div key={a} className="row" style={{ padding: "11px 0", borderBottom: "1px solid var(--soft)", fontSize: 13.5 }}><span>{a}</span><b style={{ color: c }}>{b}</b></div>)}
      </div>
      {!profile?.hasPhoto && <div className="muted small" style={{ lineHeight: 1.5 }}>Upload a clear photo of your shop from the front, showing your name board.</div>}
      {!profile?.hasPhoto && <label className={"btn dark" + (busy ? " is-busy" : "")} style={{ cursor: "pointer" }}>{busy ? "Uploading shop photo…" : "Upload shop photo"}
        <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy} onChange={(e) => addPhoto(e.target.files?.[0])} /></label>}
    </div>
  );
}

function StatusBanner() {
  const { business } = useApp();
  if (!business || business.status === "verified") return null;
  if (business.status === "pending") return <KycCard />;
  const msg = {
    rejected: ["bad", `✖ Verification was rejected${business.statusNote ? ": " + business.statusNote : ""}. Update your business details or contact support.`],
    suspended: ["bad", `⛔ Your business is suspended${business.statusNote ? ": " + business.statusNote : ""}. Your offers are hidden. Contact support.`],
  }[business.status];
  return msg ? <div className={"banner " + msg[0]}>{msg[1]}</div> : null;
}

// ------------------------------------------------------------------ Dashboard
export function OwnerDashboard() {
  const { business, subs, setMode, trial, freeMode: freeLaunch } = useApp();
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
  // the plan (days left) is shown in one bar: <PlanBar />
  const cheapest = PLANS.owner.packs[0];
  const hour = new Date().getHours();
  const [photo] = useMyPhoto();
  const stats = useStats(business.pincode || "");

  return (
    <>
      <div className="bizhero">
        <div className="row">
          <div className="owner-row">
            <div className="avatar">{business.name[0]}</div>
            <div><div className="small" style={{ color: "var(--hero-muted)", fontWeight: 600 }}>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{business.name}</div></div>
          </div>
          <div className="gap" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a className="pill" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }} href="#/owner/business">{business.status === "verified" ? "✔ Verified" : business.status === "pending" ? "● KYC in progress" : "Profile"}</a>
          </div>
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
      {business.status === "verified" && <PlanBar />}
      <div className="kpis three lift">
        <div className="kpi"><div className="n">{offers ? live.length : "…"}</div><div className="l">Live offers</div></div>
        <div className="kpi"><div className="n">{views}</div><div className="l">Views</div></div>
        <div className="kpi"><div className="n">{business.rating?.count ? <>{Number(business.rating.avg).toFixed(1)}<span style={{ color: "#E0A800" }}>★</span></> : "–"}</div><div className="l">{business.rating?.count ? `${business.rating.count} reviews` : "No reviews yet"}</div></div>
      </div>
      <StatusBanner />
      {stats && <>
        <StatPair left={business.pincode ? { label: `Partners in ${business.area || business.pincode}`, n: stats.partners.area, sub: `pincode ${business.pincode}` } : null}
          right={{ label: "Partners on LastPick", n: stats.partners.total, sub: stats.joinedWeek ? `${stats.joinedWeek} joined this week` : "verified businesses" }} />
        <JoinedTicker joined={stats.joined} />
      </>}
      <a className="cta" href="#/owner/post"><span className="plus" aria-hidden="true">＋</span>
        <span className="grow"><b style={{ display: "block", fontSize: 16 }}>Post an offer</b><span className="small" style={{ color: "#C9D8E8" }}>Goes live to customers within 30 km</span></span><span aria-hidden="true">›</span></a>
      <ContactCard />
      {business.status !== "verified" && <a className="banner" style={{ background: "var(--warn-soft)", color: "var(--warn)" }} href="#/plans"><span>After verification, {PLANS.owner.name} from {rupee(cheapest.price)} for {cheapest.days} days.</span></a>}
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
  // "Post again": copy a past offer (from its one-line record) into today's post form
  const postAgain = (h) => {
    const items = h.items && typeof h.items === "string"
      ? h.items.split("; ").map((t) => { const m = t.match(/^(.*) (\d+(?:\.\d+)?)>(\d+(?:\.\d+)?)$/); return m ? { n: m[1], a: m[2], p: m[3] } : null; }).filter(Boolean)
      : (h.items || []).map((it) => ({ n: it.n, a: String(it.a), p: String(it.p) }));
    try { sessionStorage.setItem("lp-post-again", JSON.stringify({ category: h.category, title: h.title, items: items.length ? items : [{ n: h.title, a: String(h.origPrice), p: String(h.price) }] })); } catch { /* ignore */ }
    navigate("/owner/post");
  };
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
          <div className="banner ok" style={{ margin: "0 16px 10px" }}>Offers end the same day. Past offers stay here for 1 year as a short one-line record, then they're deleted. "Post again" copies one into today's form (it counts as one of your 3 posts today).</div>
          {(offers || []).filter((o) => !(o.status === "live" && o.endsAt > now)).map((o) => (
            <div className="item" key={o.id}>
              <OfferImage offer={o} className="ic" />
              <div className="grow"><b style={{ fontSize: 14 }}>{o.title}</b>
                <div className="muted small oneline">{o.items?.length ? o.items.map((it) => `${it.n} ${it.a}>${it.p}`).join("; ") : `${rupee(o.price)} (was ${rupee(o.origPrice)})`} · seen by {o.views || 0}</div>
                <div className="muted small">{o.status === "removed" ? "Removed by LastPick for breaking the rules" : `Ended ${day(Math.min(o.endsAt, now))}`}</div></div>
              <span className="pill p-mute">{o.status === "removed" ? "Removed" : "Ended"}</span>
            </div>
          ))}
          {!history ? <Spinner /> : history.length === 0 && !(offers || []).some((o) => !(o.status === "live" && o.endsAt > now)) ? <Empty icon="🗄️" title="No history yet">Ended offers appear here.</Empty> : history.map((h) => (
            <div className="item" key={h.id}>
              <OfferImage offer={{ ...h, photoUrl: null }} className="ic" />
              <div className="grow"><b style={{ fontSize: 14 }}>{h.title}</b>
                <div className="muted small oneline">{h.items || `${rupee(h.price)} (was ${rupee(h.origPrice)})`}</div>
                <div className="muted small">Ended {day(h.endsAt)} · {h.views} views · {h.leads} leads</div></div>
              <button className="btn sm line" onClick={() => postAgain(h)}>Post again</button>
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
  // a partner posts ONLY in its own registered categories (a bakery posts bakery offers). No job openings.
  const own = business?.categories?.length ? business.categories : [business?.category || "other"];
  const allowed = own;
  const [postedToday, setPostedToday] = useState(null);
  useEffect(() => {
    const dayStart = Math.floor((Date.now() + 5.5 * 3600000) / 86400000) * 86400000 - 5.5 * 3600000;
    api.myOffers().then((l) => setPostedToday(l.filter((o) => o.createdAt >= dayStart).length)).catch(() => setPostedToday(0));
  }, []);
  const postsLeft = postedToday == null ? POSTS_PER_DAY : Math.max(0, POSTS_PER_DAY - postedToday);
  // An offer is a list of items (up to 10). Names come from My items (the partner's own list, names only);
  // each day the partner types the actual price, the offer price and, if they like, a quantity ("10 plates").
  const row = (n, unit) => ({ n, a: "", p: "", qn: "", qu: unit });
  const [f, setF] = useState(() => {
    let again = null; try { again = JSON.parse(sessionStorage.getItem("lp-post-again") || "null"); sessionStorage.removeItem("lp-post-again"); } catch { /* ignore */ }
    const cat = again?.category && allowed.includes(again.category) ? again.category : allowed[0];
    const unit = itemOptions(cat).units[0];
    return { category: cat, emoji: "📦", title: again?.title || "", items: (again?.items || []).map((x) => ({ ...row(x.n, unit), a: String(x.a ?? ""), p: String(x.p ?? "") })), hours: runs24x7(cat) ? 6 : "close" };
  });
  const [myItems, setMyItems] = useState(null);
  useEffect(() => { api.myItems().then(setMyItems).catch(() => setMyItems([])); }, []);
  const [adding, setAdding] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const units = itemOptions(f.category).units;
  const setItem = (i, k, v) => setF((p) => ({ ...p, items: p.items.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const picked = (name) => f.items.some((x) => x.n === name);
  const togglePick = (name) => setF((p) => (p.items.some((x) => x.n === name)
    ? { ...p, items: p.items.filter((x) => x.n !== name) }
    : p.items.length >= 10 ? p : { ...p, items: [...p.items, row(name, units[0])] }));
  const removeItem = (i) => setF((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const now = useNow(60000);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const job = f.category === "jobs";
  // Everything ends the same day (India time): by 11 PM, or by 12 midnight for hotels.
  // Posting is open only from 4 AM to 11 PM.
  // Hotels: post any time, run up to 24 hours.
  const allDay = runs24x7(f.category);
  const dayStart = istDayStart(now);
  const closing = allDay ? now + 24 * 3600000 : dayStart + HOURS.close * 3600000;
  const hourNow = (now - dayStart) / 3600000; // hours since midnight, India time
  const postingOpen = allDay || (hourNow >= HOURS.postFrom && hourNow < HOURS.postTill);
  const hoursLeft = (closing - now) / 3600000;
  // Hotels and local ads: a length of time (up to 24 hours). Everyone else: a clock time today, on the hour,
  // at least 30 minutes away (9 PM, 10 PM, ... 11 PM).
  const firstHour = Math.ceil(hourNow + 0.5);
  const clockChoices = []; for (let h = Math.max(firstHour, HOURS.open + 1); h < HOURS.close; h++) clockChoices.push("h" + h);
  const choices = allDay ? [...DURATIONS, 18, 24] : [...clockChoices, "close"];
  const endsAtOf = (h) => (h === "close" ? closing
    : typeof h === "string" && h[0] === "h" ? Math.min(dayStart + Number(h.slice(1)) * 3600000, closing)
      : Math.min(Date.now() + Number(h) * 3600000, allDay ? Date.now() + 24 * 3600000 : closing));
  const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
  const closeLabel = allDay ? "24 hours" : "11 PM";
  const whenText = (ts) => (ts - istDayStart(now) >= 86400000 ? `${clockIST(ts)} tomorrow` : clockIST(ts));
  const setCategory = (c) => setF((p) => ({ ...p, category: c }));
  const items = f.items.map((x) => ({ n: x.n.trim(), a: Number(x.a), p: Number(x.p), q: Number(x.qn) > 0 ? `${Number(x.qn)} ${x.qu || units[0]}` : "", raw: x }));
  const filled = items.filter((x) => x.n || x.raw.a !== "" || x.raw.p !== "");
  const problems = [];
  if (f.title.trim().length < 3) problems.push("an offer name");
  if (!filled.length) problems.push("at least one item from My items");
  filled.forEach((x, i) => {
    if (x.n.length < 2) problems.push(`a name for item ${i + 1}`);
    else if (!(x.a > 0) || x.raw.p === "" || !(x.p >= 0)) problems.push(`both prices for ${x.n}`);
    else if (x.p >= x.a) problems.push(`an offer price for ${x.n} lower than its actual price`);
  });
  const good = filled.filter((x) => x.n.length >= 2 && x.a > 0 && x.p >= 0 && x.p < x.a);
  const best = good.reduce((m, x) => (!m || 1 - x.p / x.a > 1 - m.p / m.a ? x : m), null);
  const orig = best ? best.a : 0, price = best ? best.p : null;
  const realPct = best ? Math.round((1 - best.p / best.a) * 100) : null;

  const preview = {
    id: "preview", businessId: business.id, business: { name: business.name, area: business.area, lat: business.lat, lng: business.lng },
    title: f.title || "Your offer name", description: "", category: f.category, emoji: f.emoji, photoUrl: null, items: good.map(({ n, a, p, q }) => (q ? { n, a, p, q } : { n, a, p })),
    origPrice: orig || 0, price, quantity: "", endsAt: endsAtOf(f.hours) - Date.now() + now, status: "live",
  };

  // "Make offer live" first shows the posting rules; posting happens after "I understand, post my offer"
  const submit = () => { if (!problems.length) setRulesOpen(true); };
  const post = async () => {
    setRulesOpen(false);
    setBusy(true); setErr("");
    try {
      await api.createOffer({
        title: f.title.trim(), category: f.category, emoji: f.emoji,
        items: good.map(({ n, a, p, q }) => (q ? { n, a, p, q } : { n, a, p })), endsAt: endsAtOf(f.hours),
        rulesAccepted: true, rulesVersion: POSTING_RULES_VERSION,
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
        <p className="muted">You can post offers between 4 AM and 10:30 PM (India time), and every offer ends by 11 PM the same day. Only hotels and local ads can post at night.</p>
        <a className="btn ghost" href="#/owner/offers">See my offers</a>
      </div>
    </div>
  );
  if (business && business.status !== "verified") return (
    <div className="page"><StatusBanner />
      <div className="card" style={{ textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 40 }}>🛡️</div>
        <h2>{business.status === "pending" ? "KYC in progress" : "Posting is for trusted partners"}</h2>
        <p className="muted">Once our team verifies your business (KYC) you can post same-day offers in your own category.</p>
        <a className="btn" href="#/owner/business">Check business profile</a>
      </div>
    </div>
  );
  return (
    <>
      <div className="page-h"><h1 className="title">Post an offer</h1><div className="muted">A real discount for today only</div></div>
      <StatusBanner />
      {(!business.state || !business.city || !business.pincode || business.lat == null) && <a className="banner warn" href="#/owner/business">📍 Add your pincode and shop location in Business profile before posting. Customers see offers near them.</a>}
      <div className="form">
        <div className="fld"><label>Category</label>
          <select value={f.category} onChange={(e) => setCategory(e.target.value)}>{allowed.map((id) => <option key={id} value={id}>{categoryOf(id).label}</option>)}</select>
          <span className="hint">{job
            ? "Workers for your own shop only. Shown to customers within 10 km, like a local ad. Ends today by 11 PM."
            : allDay
              ? "Hotels and local ads run 24×7: post any time, and your offer can run for up to 24 hours."
              : "You can post only in your registered category. Offers run today only and end by 11 PM (India time)."}</span></div>
        <div className="fld"><label>Offer name</label><input maxLength={120} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Evening sweets sale" /></div>
        <div className="fld"><label>My items <a className="link small" href="#/owner/items" style={{ float: "right", fontWeight: 600 }}>Manage</a></label>
          {myItems == null ? <Spinner /> : myItems.length
            ? <div className="chips wrap" aria-label="Pick items from My items">{myItems.map((it) => (
                <button key={it.id} type="button" className={"chip " + (picked(it.name) ? "on" : "")} aria-pressed={picked(it.name)} onClick={() => togglePick(it.name)}>{picked(it.name) ? "✓ " : "+ "}{it.name}</button>))}</div>
            : <span className="hint">No items yet. Add your items below once; next time you just pick them.</span>}
          {adding
            ? <div className="card" style={{ marginTop: 8 }}><NewItemForm category={f.category} onAdded={(it) => { setMyItems((l) => [it, ...(l || []).filter((x) => x.id !== it.id)]); if (!picked(it.name)) togglePick(it.name); setAdding(false); }} onCancel={() => setAdding(false)} /></div>
            : <button type="button" className="chip" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={() => setAdding(true)}>+ Add a new item</button>}
        </div>
        {f.items.length > 0 && <div className="fld"><label>Today's prices</label>
          <div className="pitems">
            {f.items.map((x, i) => (
              <div className="pitem" key={x.n}>
                <div className="pin"><b>{x.n}</b><button type="button" className="ix" onClick={() => removeItem(i)} aria-label={`Remove ${x.n} from this offer`}><Icon d="x" size={16} stroke={2.4} /></button></div>
                <div className="pgrid">
                  <label>Actual ₹<input type="number" min="1" inputMode="numeric" value={x.a} onChange={(e) => setItem(i, "a", e.target.value)} placeholder="400" /></label>
                  <label>Offer ₹<input className="op" type="number" min="0" inputMode="numeric" value={x.p} onChange={(e) => setItem(i, "p", e.target.value)} placeholder="200" /></label>
                  <label>Quantity<input type="number" min="1" inputMode="numeric" value={x.qn} onChange={(e) => setItem(i, "qn", e.target.value)} placeholder="Optional" /></label>
                </div>
                {units.length > 1 && <div className="chips wrap" style={{ marginTop: 6 }}>{units.map((u) => (
                  <button key={u} type="button" className={"chip small " + ((x.qu || units[0]) === u ? "on" : "")} aria-pressed={(x.qu || units[0]) === u} onClick={() => setItem(i, "qu", u)}>{u}</button>))}</div>}
                {Number(x.qn) > 0 && <div className="hint">Customers see "{Number(x.qn)} {x.qu || units[0]} left"</div>}
              </div>
            ))}
          </div>
        </div>}
        {realPct != null && <div className="pctline">Best deal: <b>{realPct}% off</b> <span className="muted small">· customers see "Up to {realPct}% off"</span></div>}
        <div className="two">
          <div className="fld"><label>{job ? "Show for" : "Offer ends in"}</label>
            <select value={choices.includes(f.hours) ? f.hours : allDay ? 6 : "close"} onChange={(e) => set("hours", allDay ? Number(e.target.value) : e.target.value)}>
              {choices.map((h) => <option key={h} value={h}>{h === "close" ? `Till ${hourLabel(HOURS.close)} (closing time)`
                : typeof h === "string" ? `Till ${hourLabel(Number(h.slice(1)))}`
                  : `${h} hour${h > 1 ? "s" : ""} · till ${whenText(Math.min(now + h * 3600000, closing))}`}</option>)}
            </select>
            <span className="hint">{allDay ? "Hotels and local ads run 24×7: up to 24 hours from now." : "Pick the time your offer ends today. Everything ends by 11 PM. Last time to post: 10:30 PM."}</span></div>
        </div>
        <div className="muted small">Customers will contact you on <b>{prettyPhone(business.phone)}</b> ({business.city}). <a className="link" href="#/owner/business">Change</a></div>
      </div>
      <div className="label-up">How customers see it</div>
      <div style={{ paddingTop: 8 }}><OfferCard offer={preview} preview /></div>
      <div className="pad" style={{ paddingTop: 0 }}>
        {err && <><div className="error">{err}</div><TicketHint style={{ marginBottom: 10 }} /></>}
        <div className={"banner " + (postsLeft > 0 ? "ok" : "warn")} style={{ margin: "0 0 12px" }}>{postsLeft > 0
          ? `📅 You can post ${postsLeft} more offer${postsLeft > 1 ? "s" : ""} today (${POSTS_PER_DAY} a day).`
          : `📅 You've posted ${POSTS_PER_DAY} offers today. You can post again tomorrow from 4 AM.`}</div>
        {!postingOpen && <div className="banner warn" style={{ margin: "0 0 12px" }}>🌙<span>Posting is closed now. Partners can post from 4 AM to 10:30 PM (India time); hotels and local ads can post any time. Post again at 4 AM.</span></div>}
        <button className="btn main" disabled={busy || problems.length > 0 || postsLeft === 0 || !postingOpen} onClick={submit}>{busy ? "Posting…" : job ? "📣 Post job opening" : "🚀 Make offer live"}</button>
        {problems.length > 0 && <div className="note">Add {problems.join(", ")}.</div>}
        <div className="note">By posting, you confirm this offer is genuine and you will honour it. You are responsible for your offer; {APP_NAME} only connects you with customers.</div>
      </div>
      {rulesOpen && <PostingRules category={f.category} onAgree={post} onClose={() => setRulesOpen(false)} />}
    </>
  );
}

// Shown before every post: the partner scrolls to the end, then posts. The acceptance is saved with the offer.
function PostingRules({ category, onAgree, onClose }) {
  const box = useRef(null);
  const [read, setRead] = useState(false);
  const check = () => { const el = box.current; if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setRead(true); };
  useEffect(() => { check(); }, []); // short enough to fit: no scrolling needed
  return (
    <Sheet onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="rules-h" className="rules">
        <h2 id="rules-h" style={{ marginTop: 0 }}>Before you post</h2>
        <div className="rulesbox" ref={box} onScroll={check} tabIndex={0}>
          {POSTING_RULES.common.map((t) => <p key={t}>{t}</p>)}
          <p><b>{POSTING_RULES.byCategory[category] || POSTING_RULES.byCategory.other}</b></p>
        </div>
        <button className="btn main" disabled={!read} onClick={onAgree}>I understand, post my offer</button>
        <div className="note" style={{ textAlign: "center" }}>{read ? "Your acceptance is saved with this offer." : "Scroll to the end to continue."}</div>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

// Adds one name to My items: the name, plus the category's optional choice ("Chicken biryani (full)", "Deluxe room (ac)").
function NewItemForm({ category, onAdded, onCancel }) {
  const io = itemOptions(category);
  const [name, setName] = useState("");
  const [opt, setOpt] = useState("");
  const [sizes, setSizes] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const toggleSize = (z) => setSizes((l) => (l.includes(z) ? l.filter((x) => x !== z) : [...l, z]));
  const add = async () => {
    const base = name.trim();
    if (base.length < 2) { setErr("Enter an item name first"); return; }
    // "Cotton kurta (men · M, L, XXL)"; sizes keep the shop's order of the list
    const picked = (io.sizes || []).filter((z) => sizes.includes(z));
    const extra = [opt && opt.toLowerCase(), picked.length && picked.join(", ")].filter(Boolean).join(" · ");
    setBusy(true); setErr("");
    try { const it = await api.addMyItem(extra ? `${base} (${extra})` : base); setName(""); setOpt(""); setSizes([]); onAdded?.(it); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  return (
    <div className="newitem">
      <input maxLength={40} value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder={io.example} aria-label="Item name" />
      {io.options && <div className="chips wrap" aria-label={io.label}><span className="muted small" style={{ alignSelf: "center" }}>{io.label}:</span>
        {io.options.map((o) => <button key={o} type="button" className={"chip small " + (opt === o ? "on" : "")} aria-pressed={opt === o} onClick={() => setOpt(opt === o ? "" : o)}>{o}</button>)}</div>}
      {io.sizes && <div className="chips wrap" aria-label={io.sizesLabel}><span className="muted small" style={{ alignSelf: "center" }}>{io.sizesLabel} (pick all you have):</span>
        {io.sizes.map((z) => <button key={z} type="button" className={"chip small " + (sizes.includes(z) ? "on" : "")} aria-pressed={sizes.includes(z)} onClick={() => toggleSize(z)}>{z}</button>)}</div>}
      {err && <div className="error small">{err}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" disabled={busy} aria-busy={busy} onClick={add}>{busy ? <><span className="spin" aria-hidden="true" /> Adding…</> : "+ Add to My items"}</button>
        {onCancel && <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ My items: names only, added once, picked when posting
export function MyItems() {
  return <NeedLogin why="Log in to manage your items"><MyItemsInner /></NeedLogin>;
}
function MyItemsInner() {
  const { business, toast } = useApp();
  const [list, setList] = useState(null);
  const category = business?.category || "other";
  useEffect(() => { api.myItems().then(setList).catch(() => setList([])); }, []);
  const remove = async (it) => {
    try { await api.removeMyItem(it.id); setList((l) => l.filter((x) => x.id !== it.id)); toast?.(`Removed ${it.name}`); } catch (e) { toast?.(errText(e)); }
  };
  return (
    <>
      <div className="page-h"><h1 className="title">My items</h1>
        <div className="muted">Add your items once, names only. When you post, pick them and type that day's prices and quantity.</div></div>
      <div className="form">
        <div className="card myitems">
          {list == null ? <Spinner /> : list.length
            ? list.map((it) => (
              <div className="mi" key={it.id}><span>{it.name}</span>
                <button type="button" className="ix" aria-label={`Remove ${it.name}`} onClick={() => remove(it)}><Icon d="x" size={16} stroke={2.4} /></button></div>))
            : <div className="muted small">No items yet. Add your first one below.</div>}
        </div>
        <div className="fld"><label>Add an item</label>
          <NewItemForm category={category} onAdded={(it) => setList((l) => [it, ...(l || []).filter((x) => x.id !== it.id)])} /></div>
        <a className="btn main" href="#/owner/post">Post an offer</a>
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
    name: business?.name || "", category: business?.category || signupBizType() || "food", about: business?.about || "", address: business?.address || "",
    area: business?.area || "", city: business?.city || "", state: business?.state || "", pincode: business?.pincode || "", lat: business?.lat ?? null, lng: business?.lng ?? null,
    phone: business?.phone || profile?.phone || "", agree: false,
  }));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [termsDoc, setTermsDoc] = useState(null); // set once the partner has scrolled through the whole Terms
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Pincode first: a valid pincode fills state, city and the list of areas (post offices) for that pincode.
  const [areas, setAreas] = useState([]);
  const [nearAreas, setNearAreas] = useState([]); // named colonies near the shop (OpenStreetMap), nearest first
  const [pinState, setPinState] = useState(""); // "", "looking", "found", "unknown", "offline"
  const fillFromPincode = async (pin, keep = {}) => {
    if (!validPincode(pin)) { setAreas([]); setPinState(""); return; }
    setPinState("looking");
    try {
      const r = await lookupPincode(pin);
      if (!r) { setAreas([]); setPinState("unknown"); return; }
      setAreas(r.areas);
      setF((p) => ({ ...p, state: r.state || p.state, city: keep.city || r.city || p.city,
        area: keep.area || p.area || (r.areas.length === 1 ? r.areas[0] : "") }));
      setPinState("found");
    } catch { setPinState("offline"); }
  };
  useEffect(() => { if (validPincode(f.pincode)) fillFromPincode(f.pincode, { city: f.city, area: f.area }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The shop's location ALWAYS comes from the phone's GPS (no typed pincode, which can be wrong):
  // it saves the map point AND fills address, area, city, state and pincode. Done automatically for a new business.
  const locate = () => {
    // In the Play Store app use the phone's own GPS (Capacitor plugin); the web view's location can be an old stored one.
    const nativeGeo = window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.Geolocation : null;
    if (!nativeGeo && !navigator.geolocation) return toast("Location isn't available on this device");
    setLocating(true);
    const onFix = async (p) => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        setF((x) => ({ ...x, lat, lng }));
        try {
          const a = await addressFromLocation(lat, lng);
          if (a.outsideIndia) { toast("This location is outside India. LastPick is for businesses in India."); }
          else {
            setF((x) => ({ ...x, address: x.address || a.address, area: a.area || x.area, city: a.city || x.city, state: a.state || x.state, pincode: a.pincode || "" }));
            // then the exact colony (slower lookup): fill it in and offer the nearby ones as suggestions
            nearbyLocalities(lat, lng).then((near) => {
              setNearAreas(near.filter((x) => x.km <= 3).map((x) => x.name));
              const colony = near.find((x) => x.place !== "suburb" && x.place !== "village" && x.km <= 1.2);
              if (colony) setF((x) => ({ ...x, area: colony.name }));
            }).catch(() => {});
            if (a.pincode) await fillFromPincode(a.pincode, { city: a.city, area: a.area });
            toast(a.pincode ? "Shop location and pincode found. Please check the address." : "We couldn't find the pincode for this spot. Step outside or move a little, then tap Detect again.");
          }
        } catch { toast("Location saved. We couldn't fetch the address, please type it."); }
        setLocating(false);
    };
    const onFail = () => { setLocating(false); toast("Couldn't get your location. Turn on location (GPS), allow it for LastPick, and tap Detect again."); };
    const opts = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
    if (nativeGeo) {
      (async () => {
        try {
          const perm = await nativeGeo.checkPermissions().catch(() => null);
          if (perm && perm.location !== "granted" && perm.coarseLocation !== "granted") {
            const asked = await nativeGeo.requestPermissions().catch(() => null);
            if (asked && asked.location !== "granted" && asked.coarseLocation !== "granted") return onFail();
          }
          await onFix(await nativeGeo.getCurrentPosition(opts));
        } catch { onFail(); }
      })();
      return;
    }
    navigator.geolocation.getCurrentPosition(onFix, onFail, opts);
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
      // the category is fixed after registration (only the LastPick team can change it)
      const categories = business ? (business.categories?.length ? business.categories : [business.category]) : [f.category];
      await api.saveBusiness({ ...business, ...f, category: business ? business.category : f.category, whatsapp: false, categories, name: f.name.trim(), area: f.area.trim(), city, phone: f.phone.trim() });
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
          {business
            ? <><div className="locked-field" aria-label="Category (locked)"><span>{categoryOf(business.category)?.label}</span><span aria-hidden="true">🔒</span></div>
              <span className="hint">Your category can't be changed here. To change it, <a href="#/help">contact LastPick support</a>.</span></>
            : <><select value={f.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              <span className="hint">Choose carefully: you post offers only in this category, and it can't be changed later without contacting support.</span></>}</div>
        <div className="fld"><label>Contact number for customers</label><div className="pfx"><span aria-hidden="true">+91</span><input inputMode="numeric" maxLength={14} value={typePhone(f.phone, { landline: true })} onChange={(e) => set("phone", typePhone(e.target.value, { landline: true }))} placeholder="Mobile, or landline with STD code" /></div>
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
          <input list="lp-area-list" value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="Your colony or locality, e.g. Srinivasa Nagar" />
          <datalist id="lp-area-list">{[...new Set([...nearAreas, ...areas])].map((a) => <option key={a} value={a} />)}</datalist>
          {(nearAreas.length > 0 || areas.length > 0) && <span className="hint">Type your colony or pick one nearby.</span>}</div>
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
