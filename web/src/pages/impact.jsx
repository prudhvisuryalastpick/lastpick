// Savings and business dashboards, Help & support conversations, the platform rules page,
// (the admissions-season section was removed: every offer now ends within 24 hours).
import { useEffect, useState } from "react";
import { api } from "../api/index.js";
import { BackButton, Empty, NeedLogin, Spinner, useLive } from "../components.jsx";
import { Icon, catStyle } from "../lib/icons.jsx";
import {
  APP_NAME, IS_OWNER_APP, SUPPORT_EMAIL, SUPPORT_HOURS, SUPPORT_PHONE, SUPPORT_WHATSAPP, categoryOf,
} from "../lib/config.js";
import { ago, errText, rupee, telLink, waLink } from "../lib/format.js";
import { navigate, useApp } from "../state.jsx";

const Back = () => <div style={{ position: "relative", height: 62 }}><BackButton /></div>;

function Bars({ months, field, color = "var(--deep)", money = true }) {
  const max = Math.max(1, ...months.map((m) => m[field] || 0));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, padding: "8px 0 0" }} role="img"
      aria-label={months.map((m) => `${m.label}: ${money ? rupee(m[field]) : m[field]}`).join(", ")}>
      {months.map((m) => (
        <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span className="muted" style={{ fontSize: 10.5, fontWeight: 700 }}>{m[field] ? (money ? rupee(m[field]) : m[field]) : ""}</span>
          <div style={{ width: "100%", maxWidth: 34, height: Math.max(4, (m[field] / max) * 80), background: color, borderRadius: 6, opacity: m[field] ? 1 : 0.25 }} />
          <span className="muted small">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ customer: how much I saved
export function Savings() {
  return <NeedLogin why="Log in to see your savings"><SavingsInner /></NeedLogin>;
}
function SavingsInner() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.mySavings().then(setD).catch((e) => setErr(errText(e))); }, []);
  if (err) return <><Back /><Empty icon="📉" title="Couldn't load your savings">{err}</Empty></>;
  if (!d) return <Spinner />;
  return (
    <>
      <PageHead title={<>My savings</>} sub={<>Deals you went for through {APP_NAME}, {d.period}</>} />
      <div className="plan" style={{ margin: "14px 16px 12px", padding: 18 }}>
        <div style={{ opacity: .8, fontSize: 13 }}>You saved</div>
        <div className="amt" style={{ fontSize: 36 }}>{rupee(d.saved)}</div>
        <div style={{ opacity: .85, fontSize: 13 }}>{rupee(d.savedThisMonth)} this month · {d.percent}% off on average</div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="n">{d.businessesHelped}</div><div className="l">Local businesses you supported</div></div>
        <div className="kpi"><div className="n">{rupee(d.spentLocal)}</div><div className="l">Business you gave to locals</div></div>
        <div className="kpi"><div className="n">{d.deals}</div><div className="l">Deals you contacted</div></div>
        <div className="kpi"><div className="n" style={{ color: d.categories[0] ? catStyle(d.categories[0].category).ink : "var(--muted)" }}>{d.categories[0] ? <Icon d={catStyle(d.categories[0].category).icon} size={26} stroke={2} /> : "–"}</div><div className="l">{d.categories[0] ? `Most saved on ${categoryOf(d.categories[0].category).label}` : "No category yet"}</div></div>
      </div>
      <div className="panel" style={{ marginTop: 12 }}><b>Savings by month</b><Bars months={d.months} field="saved" color="var(--ok)" /></div>
      {d.recent.length > 0 && <div className="panel"><b>Recent</b>
        {d.recent.map((r, i) => <div key={i} className="row" style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
          <div><div style={{ fontWeight: 600 }}>{r.title}</div><div className="muted small">{r.business} · {r.how} · {ago(r.at)}</div></div>
          <b style={{ color: "var(--ok)" }}>{rupee(r.saved)}</b></div>)}
      </div>}
      <div className="note pad" style={{ paddingTop: 0 }}>Savings = normal price minus offer price for every deal you viewed, called, WhatsApped or shared your number for. The deal itself happens with the business, so this is an estimate.</div>
    </>
  );
}

// ------------------------------------------------------------------ partner: business generated
export function BusinessInsights() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.ownerInsights().then(setD).catch((e) => setErr(errText(e))); }, []);
  if (err) return <><Back /><Empty icon="📉" title="Couldn't load your numbers">{err}</Empty></>;
  if (!d) return <Spinner />;
  const f = d.funnel;
  const steps = [["Saw your offers", f.views], ["Viewed your number", f.numberViews], ["Called you", f.calls], ["WhatsApped you", f.whatsapp], ["Shared their number", f.shared]];
  const top = Math.max(1, ...steps.map((s) => s[1]));
  return (
    <>
      <PageHead title={<>Business from {APP_NAME}</>} sub={<>{d.period}</>} />
      <div className="plan" style={{ margin: "14px 16px 12px", padding: 18 }}>
        <div style={{ opacity: .8, fontSize: 13 }}>Business generated (estimated)</div>
        <div className="amt" style={{ fontSize: 36 }}>{rupee(d.businessGenerated)}</div>
        <div style={{ opacity: .85, fontSize: 13 }}>{rupee(d.businessThisMonth)} this month · from {d.customers} interested customers</div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="n">{d.customers}</div><div className="l">Customers who contacted you</div></div>
        <div className="kpi"><div className="n">{d.leads}</div><div className="l">Leads ({d.leadsFollowedUp} followed up)</div></div>
        <div className="kpi"><div className="n">{d.views}</div><div className="l">Offer views ({d.posts} posts)</div></div>
        <div className="kpi"><div className="n">{d.rating ? `${d.rating.avg}★` : "–"}</div><div className="l">{d.rating ? `${d.rating.count} reviews` : "No reviews yet"}</div></div>
      </div>
      <div className="panel" style={{ marginTop: 12 }}><b>Business by month</b><Bars months={d.months} field="value" /></div>
      <div className="panel"><b>How customers reached you</b>
        {steps.map(([l, n]) => <div key={l} style={{ marginTop: 10 }}>
          <div className="row small"><span>{l}</span><b>{n}</b></div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--soft)", marginTop: 4 }}><div style={{ height: 8, borderRadius: 4, width: `${(n / top) * 100}%`, background: "var(--deep)" }} /></div>
        </div>)}
        <div className="muted small" style={{ marginTop: 10 }}>{d.conversion}% of people who saw your offers contacted you.</div>
      </div>
      {d.topOffers.length > 0 && <div className="panel"><b>Your best offers</b>
        {d.topOffers.map((o, i) => <div key={i} className="row" style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
          <div><div style={{ fontWeight: 600 }}>{o.title}</div><div className="muted small">{o.customers} customers</div></div><b>{rupee(o.value)}</b></div>)}
      </div>}
      <div className="note pad" style={{ paddingTop: 0 }}>Business generated = offer price × every customer who viewed your number, called, WhatsApped or shared their number. Payment happens directly between you and the customer, so this is an estimate.</div>
    </>
  );
}

// Small summary cards for the home screens
// Page header in the app colour, with a back button
export function PageHead({ title, sub, to }) {
  return (
    <div className="phead">
      <button className="cround" aria-label="Back" onClick={() => (to ? navigate(to) : window.history.length > 1 ? window.history.back() : navigate("/"))}><Icon d="back" size={20} stroke={2.2} /></button>
      <div style={{ minWidth: 0 }}><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
    </div>
  );
}

export function SavingsCard() {
  const { session } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { if (session) api.mySavings().then(setD).catch(() => {}); }, [session]);
  if (!session || !d || !d.deals) return null;
  return (
    <a className="thanks" href="#/savings">
      <span className="hi"><Icon d="heart" size={24} stroke={2} /></span>
      <div><b>You helped {d.businessesHelped} local business{d.businessesHelped === 1 ? "" : "es"}</b><span>and saved {rupee(d.saved)}. Thank you for buying local.</span></div>
    </a>
  );
}
export function BusinessCard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.ownerInsights().then(setD).catch(() => {}); }, []);
  if (!d) return null;
  return <a className="banner sub" href="#/owner/insights">📈<span><b>{rupee(d.businessGenerated)}</b> business from {d.customers} customer{d.customers === 1 ? "" : "s"} through {APP_NAME}. See details ›</span></a>;
}

// ------------------------------------------------------------------ Help & support
const FAQ = {
  customer: [
    ["How does it work?", `Businesses near you post deals. Open one, see the business's number and contact them. Businesses never see your number. You pay the business directly; ${APP_NAME} only connects you.`],
    ["The business didn't honour the offer", "Open the offer and tap Report. We review every report and can warn, hide or suspend the business. You can also leave an honest review."],
    ["Is my number safe?", "Businesses never see your number; they see only your name if you tap \"I'm interested\". You can download or delete your data anytime in Account → Privacy."],
    ["Why was I logged out?", "For safety, your account may be limited to one device at a time. When it is, logging in on a new phone logs out the old one."],
  ],
  partner: [
    ["How do I get verified?", "Fill in your business profile with your shop location and contact number. Our team checks it, usually within 1 working day."],
    ["How many offers can I post?", "3 posts a day per business, posted between 4 AM and 10:30 PM. Everything is for the same day: it ends by 11 PM and is removed at 12 midnight. Hotels, travel and logistics can post any time and run for up to 24 hours."],
    ["What can I post?", "Only offers in the category you registered: a bakery posts bakery offers, a salon posts salon offers. No halls, movie tickets or selling personal items. Only verified (trusted) partners can post; we check every business first."],
    ["Is there a free version?", "No. Posting needs an active Business Pro plan, and seeing business numbers needs the Customer Pass. Longer plans cost less per month."],
    ["A customer misbehaved", "Open Leads, or contact us below. Customers who break the rules can be blocked."],
  ],
};
export const SUPPORT_TOPICS = ["Using the app", "Login or account", "An offer or business", "A customer or lead", "Posting offers", "Business verification", "Plans and payments", "Safety concern", "Something else"];

export function Support() {
  const { session } = useApp();
  const role = IS_OWNER_APP ? "partner" : "customer";
  const [mine, setMine] = useState(null);
  const [form, setForm] = useState({ topic: SUPPORT_TOPICS[0], message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = () => api.mySupport().then(setMine).catch(() => setMine([]));
  useEffect(() => { if (session) load(); }, [session]);
  const send = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const r = await api.createSupport({ ...form, role }); navigate("/support/" + r.id); }
    catch (x) { setErr(errText(x)); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title={<>Help & support</>} sub={<>We're here {SUPPORT_HOURS}</>} />
      <div className="kpis">
        <a className="kpi" href="#support-chat" style={{ textDecoration: "none", color: "inherit" }}><div className="n kic"><Icon d="chat" size={22} stroke={2} /></div><div className="l">Chat with us in the app</div></a>
        {SUPPORT_WHATSAPP && <a className="kpi" href={waLink(SUPPORT_WHATSAPP, `Hi ${APP_NAME} support,`)} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}><div className="n kic" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><Icon d="whatsapp" size={22} stroke={2} /></div><div className="l">WhatsApp {SUPPORT_WHATSAPP}</div></a>}
        {SUPPORT_PHONE && <a className="kpi" href={telLink(SUPPORT_PHONE)} style={{ textDecoration: "none", color: "inherit" }}><div className="n kic"><Icon d="phone" size={22} stroke={2} /></div><div className="l">Call {SUPPORT_PHONE}</div></a>}
        <a className="kpi" href={"mailto:" + SUPPORT_EMAIL} style={{ textDecoration: "none", color: "inherit" }}><div className="n kic"><Icon d="mail" size={22} stroke={2} /></div><div className="l">{SUPPORT_EMAIL}</div></a>
      </div>
      <div className="sect"><h3>Common questions</h3></div>
      <div className="panel">{FAQ[role].map(([q, a], i) => <details key={q} style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : 0 }}><summary style={{ fontWeight: 600, cursor: "pointer" }}>{q}</summary><p className="muted small" style={{ margin: "8px 0 0" }}>{a}</p></details>)}</div>
      <div className="sect" id="support-chat"><h3>Ask us</h3></div>
      {!session ? <div className="panel small">Please <a className="link" href="#/login?next=/support">log in</a> to chat with us, or e-mail {SUPPORT_EMAIL}.</div> : <>
        <form className="form" style={{ paddingTop: 0 }} onSubmit={send}>
          <div className="fld"><label htmlFor="sup-topic">Topic</label><select id="sup-topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>{SUPPORT_TOPICS.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="fld"><label htmlFor="sup-msg">Your question</label><textarea id="sup-msg" rows="3" maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell us what happened or what you need" /></div>
          {err && <div className="error">{err}</div>}
          <button className="btn main" disabled={busy || form.message.trim().length < 5}>{busy ? "Sending…" : "Send to support"}</button>
        </form>
        {mine && mine.length > 0 && <><div className="sect"><h3>Your conversations</h3></div>
          {mine.map((t) => <a key={t.id} className="menu-item" href={"#/support/" + t.id}>
            <span style={{ flex: 1 }}><b>{t.topic}</b><span className="muted small" style={{ display: "block" }}>{t.lastFromStaff ? "Support: " : "You: "}{t.lastMessage.slice(0, 60)}</span></span>
            <span className="small" style={{ fontWeight: 700, color: t.status === "answered" ? "var(--ok)" : "var(--muted)" }}>{t.status === "answered" ? "Replied" : t.status === "closed" ? "Closed" : "Waiting"}</span><span className="chev">›</span></a>)}</>}
      </>}
      <div className="note pad">For a formal complaint with a ticket number, use <a className="link" href="#/grievance">Complaints</a>. See also <a className="link" href="#/rules">How {APP_NAME} works & rules</a>.</div>
    </>
  );
}

export function SupportThread({ id }) {
  return <NeedLogin why="Log in to see this conversation"><Thread id={id} load={() => api.supportThread(id)} reply={(m) => api.supportReply(id, m)} /></NeedLogin>;
}
function Thread({ id, load, reply, staff = false, onClose }) {
  const [t, setT] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const refresh = () => load().then(setT).catch((e) => setErr(errText(e)));
  useEffect(() => { refresh(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (e) => { e.preventDefault(); setBusy(true); try { await reply(msg); setMsg(""); await refresh(); } catch (x) { setErr(errText(x)); } setBusy(false); };
  if (err && !t) return <Empty icon="💬" title="Conversation not found">{err}</Empty>;
  if (!t) return <Spinner />;
  return (
    <>
      {!staff && <Back />}
      <div className="page-h" style={{ paddingTop: 0 }}><h1 className="title">{t.topic}</h1>
        <div className="muted small">{t.user ? `${t.user.name} · ${t.user.email} · ${t.role}` : t.status === "answered" ? "Support replied" : t.status === "closed" ? "Closed" : "We'll reply soon"}</div></div>
      <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
        {t.messages.map((m, i) => {
          const mineSide = staff ? m.fromStaff : !m.fromStaff;
          return <div key={i} style={{ alignSelf: mineSide ? "flex-end" : "flex-start", maxWidth: "82%", background: mineSide ? "var(--deep)" : "#fff", color: mineSide ? "#fff" : "var(--ink)", borderRadius: 16, padding: "10px 12px", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: 11, opacity: .75, fontWeight: 700 }}>{m.fromStaff ? `${APP_NAME} support` : staff ? "Customer" : "You"} · {ago(m.at)}</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{m.body}</div></div>;
        })}
      </div>
      <form className="form" style={{ paddingTop: 0 }} onSubmit={send}>
        <div className="fld"><label htmlFor="reply">{staff ? "Reply" : "Message"}</label><textarea id="reply" rows="2" maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} /></div>
        {err && <div className="error">{err}</div>}
        <div className="gap"><button className="btn main" disabled={busy || !msg.trim()}>{busy ? "Sending…" : "Send"}</button>
          {staff && <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Close conversation</button>}</div>
      </form>
    </>
  );
}

// Admin panel tab: support inbox
export function AdminSupport({ toast }) {
  const [status, setStatus] = useState("open");
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const load = (first = false) => { if (first) setList(null); return api.adminSupport(status).then(setList).catch((e) => { if (first) { toast(errText(e)); setList([]); } }); };
  useLive(load, [status]);
  if (open) return <>
    <div className="pad" style={{ paddingBottom: 0 }}><button className="link" onClick={() => { setOpen(null); load(); }}>‹ All conversations</button></div>
    <Thread id={open} staff load={() => api.adminSupportThread(open)} reply={(m) => api.adminSupportReply(open, m)}
      onClose={async () => { await api.adminSupportReply(open, "", true); toast("Closed"); setOpen(null); load(); }} />
  </>;
  return (
    <>
      <div className="chips" style={{ paddingTop: 4 }}>{["open", "answered", "closed"].map((s) => <button key={s} className={"chip " + (status === s ? "on" : "")} onClick={() => setStatus(s)}>{s === "open" ? "Waiting for us" : s === "answered" ? "Replied" : "Closed"}</button>)}</div>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="✅" title="Nothing here">No conversations.</Empty> : list.map((t) => (
        <button key={t.id} className="menu-item" onClick={() => setOpen(t.id)}>
          <span style={{ flex: 1, textAlign: "left" }}><b>{t.topic}</b> <span className="muted small">· {t.role} · {t.user?.name || t.user?.email}</span>
            <span className="muted small" style={{ display: "block" }}>{t.lastMessage.slice(0, 90)}</span></span>
          <span className="muted small">{ago(t.updatedAt)}</span><span className="chev">›</span></button>))}
    </>
  );
}

// ------------------------------------------------------------------ how LastPick works & rules (plain-language summary of the Terms)
export function Rules() {
  const R = ({ icon, title, children }) => <div className="panel" style={{ display: "flex", gap: 12 }}><span style={{ fontSize: 26 }} aria-hidden="true">{icon}</span><div><b>{title}</b><div className="muted small" style={{ marginTop: 4, lineHeight: 1.5 }}>{children}</div></div></div>;
  return (
    <>
      <PageHead title={<>How {APP_NAME} works & our rules</>} sub={<>The short version. Full text: <a className="link" href="#/terms">Terms</a>.</>} />
      <R icon="🤝" title={`${APP_NAME} is only a platform`}>We connect customers with local businesses and service providers. We don't sell, deliver, book, collect payment for, or guarantee any offer. Boosted and sponsored posts are paid placements, not recommendations. The deal is between you and them.</R>
      <R icon="⚖️" title="We are not responsible for the deal">Quality, safety, price, availability, refunds and anything that goes wrong in the deal are the responsibility of the business or person offering it. This doesn't take away your rights under Indian consumer law.</R>
      <R icon="⭐" title="Reviews and action on providers">Only customers who contacted a provider through {APP_NAME} can review it. If a provider fails, misleads or behaves badly, report it. We review reports and reviews and act on the provider: warning, hiding offers, suspension or removal.</R>
      <R icon="⏰" title="Today's deals only">Offers are shown from 4 AM to 11 PM, valid for that day only, and removed at 12 midnight. Only hotels, travel and logistics are available 24×7: they can post at any time, and their offers run for up to 24 hours.</R>
      <R icon="🏪" title="Rules for partners">Genuine offers at real prices, posted only after LastPick verifies your business, with the licences your work needs (e.g. FSSAI for food, recognition for schools and colleges). Post only in your own registered category, up to 3 posts a day, between 4 AM and 10:30 PM (hotels, travel and logistics: any time). No movie tickets, halls or selling personal items. Use customers' numbers only to reply about their request.</R>
      <R icon="🙋" title="Rules for customers">Check the offer and the provider before paying. Never pay an advance to someone you haven't verified. Write honest reviews about your own experience.</R>
      <R icon="🔐" title="Your consent and your data">We ask for your consent before using your details, and before sharing your number with any business. Accounts can be limited to one device at a time, to keep them safe. Download or delete your data anytime.</R>
      <R icon="🚫" title="Not allowed">Alcohol, tobacco, drugs, prescription medicines, weapons, gambling, adult content, counterfeit or stolen goods, fake reviews, spam, or anything illegal or unsafe.</R>
      <div className="pad"><a className="btn ghost" href="#/support">Need help? Contact support</a></div>
    </>
  );
}
