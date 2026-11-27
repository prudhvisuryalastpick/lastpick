// Support Desk (support.lastpick.in): the team and area in-charges answer tickets and call backs.
// Admins see all of India; in-charges see only tickets from their states / cities / pincodes (the server filters).
import { useEffect, useState } from "react";
import { api } from "../api/index.js";
import { Empty, NeedLogin, Spinner } from "../components.jsx";
import { Logo } from "../lib/brand.jsx";
import { INDIAN_STATES } from "../lib/config.js";
import { ago, errText, prettyPhone, telLink } from "../lib/format.js";
import { HELP_TOPICS } from "../lib/helptopics.js";
import { navigate, useApp } from "../state.jsx";
import { Bubbles } from "./impact.jsx";

export function Desk() {
  return <NeedLogin why="Log in to the Support Desk"><DeskInner /></NeedLogin>;
}

const VIEWS = [["open", "Waiting for us"], ["overdue", "Overdue"], ["waiting", "Waiting for customer"], ["resolved", "Resolved"], ["all", "All"]];
const RESOLVED = { customer: "Customer said solved", call: "Resolved on a call", staff: "Resolved by team", auto: "Closed (no reply in 3 days)" };
const areaText = (a) => [a?.city, a?.pincode, a?.state].filter(Boolean).join(" · ") || "Area not known";

function DeskInner() {
  const { isDesk, isAdmin, profile, toast } = useApp();
  const [tab, setTab] = useState("tickets");
  if (!isDesk) return <Empty icon="⛔" title="Support team only">This account isn't part of the support team. Ask a LastPick admin to add you as an area in-charge.</Empty>;
  const myArea = isAdmin ? "All of India" : [(profile?.regions || []).join(", "), (profile?.areaCities || []).join(", "), (profile?.areaPincodes || []).join(", ")].filter(Boolean).join(" · ");
  const tabs = [["tickets", "Tickets"], ["callbacks", "Call backs"], ...(isAdmin ? [["incharges", "Area in-charges"]] : [])];
  return (
    <div className="adm">
      <nav className="adm-nav" aria-label="Support Desk sections">
        <div className="adm-brand"><Logo size={34} /><div><b>Support Desk</b><div className="small">{myArea}</div></div></div>
        {tabs.map(([id, label]) => <button key={id} type="button" className={"adm-tab" + (tab === id ? " on" : "")} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><span>{label}</span></button>)}
        <div className="adm-me small">{profile?.name || profile?.email}<br /><button type="button" className="link" onClick={async () => { await api.signOut(); navigate("/login"); }}>Log out</button></div>
      </nav>
      <main className="adm-main">
        {tab === "tickets" && <Tickets toast={toast} />}
        {tab === "callbacks" && <Callbacks toast={toast} />}
        {tab === "incharges" && isAdmin && <Incharges toast={toast} />}
      </main>
    </div>
  );
}

function Tickets({ toast }) {
  const [view, setView] = useState("open");
  const [filter, setFilter] = useState({ area: "", topic: "", q: "" });
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const load = (quiet = false) => api.deskTickets({ view, ...filter }, quiet).then((d) => { setData(d); setErr(""); }).catch((e) => setErr(errText(e)));
  useEffect(() => { setData(null); load(); const t = setInterval(() => { if (document.visibilityState !== "hidden") load(true); }, 60000); return () => clearInterval(t); }, [view, filter.area, filter.topic]); // eslint-disable-line react-hooks/exhaustive-deps
  if (open) return <TicketView id={open} toast={toast} onBack={() => { setOpen(null); load(); }} />;
  const c = data?.counts || {};
  return (
    <>
      <h1 className="adm-h1">Tickets</h1>
      <div className="chips">{VIEWS.map(([id, label]) => <button key={id} className={"chip" + (view === id ? " on" : "")} onClick={() => setView(id)}>{label}{c[id] ? ` · ${c[id]}` : ""}</button>)}</div>
      <form className="desk-filter" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input placeholder="Search #LP-number, name, phone" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <input placeholder="City, pincode or state" value={filter.area} onChange={(e) => setFilter({ ...filter, area: e.target.value })} onBlur={() => load()} />
        <select value={filter.topic} onChange={(e) => setFilter({ ...filter, topic: e.target.value })}><option value="">All topics</option>{HELP_TOPICS.map((t) => <option key={t.topic}>{t.topic}</option>)}</select>
        <button className="btn ghost">Search</button>
      </form>
      {err && <div className="error">{err}</div>}
      {!data ? <Spinner /> : data.tickets.length === 0 ? <Empty icon="✅" title="Nothing here">{view === "open" ? "No one is waiting for a reply. 🎉" : "No tickets in this view."}</Empty> :
        <div className="desk-list">{data.tickets.map((t) => (
          <button key={t.id} className={"desk-row" + (t.overdue ? " overdue" : "")} onClick={() => setOpen(t.id)}>
            <span className="desk-no">#{t.number}{t.escalated ? " ⚑" : ""}</span>
            <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
              <span className="desk-title"><b>{t.topic}</b> <span className="muted small">· {t.role === "partner" ? t.business || "Partner" : t.user?.name || "Customer"}</span></span>
              <span className="muted small desk-last">{t.lastFromStaff ? "You: " : ""}{t.lastMessage}</span>
              <span className="small muted">📍 {areaText(t.area)}</span>
            </span>
            <span className="small" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              {t.status === "open" ? <b style={{ color: t.overdue ? "var(--bad, #c0392b)" : "inherit" }}>{t.waitingDays ? `${t.waitingDays} business day${t.waitingDays > 1 ? "s" : ""}` : "Today"}</b>
                : t.status === "closed" ? <span className="muted">{RESOLVED[t.resolvedBy] || "Closed"}</span> : <span className="muted">Replied</span>}
              <span className="muted" style={{ display: "block" }}>{ago(t.updatedAt)}</span>
            </span>
          </button>))}</div>}
      <p className="muted small">Customers are told we reply within 1–5 business days. Tickets turn red after 4 business days. Answered tickets with no reply close by themselves after 3 days.</p>
    </>
  );
}

function PhotoAdd({ photos, setPhotos }) {
  const pick = async (e) => {
    const { compressPhoto } = await import("../lib/image.js");
    const files = [...(e.target.files || [])].slice(0, 3 - photos.length); e.target.value = "";
    const out = []; for (const f of files) { try { out.push(await compressPhoto(f, 1280, 340000)); } catch { /* skip */ } }
    setPhotos([...photos, ...out].slice(0, 3));
  };
  return <div className="tk-photos">{photos.map((p, i) => <span key={i} className="tk-thumb"><img src={p} alt="" /><button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>×</button></span>)}
    {photos.length < 3 && <label className="tk-add"><input type="file" accept="image/*" multiple hidden onChange={pick} />+ Photo</label>}</div>;
}

function TicketView({ id, toast, onBack }) {
  const [t, setT] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState("");
  const [callNote, setCallNote] = useState(null); // null = closed; string = the "resolved on call" box is open
  const refresh = () => api.deskTicket(id).then(setT).catch((e) => setErr(errText(e)));
  useEffect(() => { refresh(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (what, fn, done) => { setBusy(what); setErr(""); try { await fn(); toast(done); await refresh(); return true; } catch (e) { setErr(errText(e)); return false; } finally { setBusy(""); } };
  if (err && !t) return <><button className="link" onClick={onBack}>‹ All tickets</button><Empty icon="🔍" title="Ticket not found">{err}</Empty></>;
  if (!t) return <Spinner />;
  const closed = t.status === "closed";
  return (
    <>
      <button className="link" onClick={onBack}>‹ All tickets</button>
      <div className="desk-head">
        <div><h1 className="adm-h1" style={{ margin: 0 }}>#{t.number} · {t.topic}</h1>
          <div className="small muted">{t.role === "partner" ? `Partner${t.business ? `: ${t.business}` : ""}` : "Customer"} · opened {ago(t.createdAt)} · 📍 {areaText(t.area)}</div></div>
        <span className={"desk-badge " + (closed ? "done" : t.overdue ? "late" : t.status)}>{closed ? RESOLVED[t.resolvedBy] || "Closed" : t.status === "answered" ? "Waiting for customer" : t.overdue ? `Overdue · ${t.waitingDays} business days` : "Waiting for us"}</span>
      </div>
      <div className="panel small desk-who">
        <b>{t.user?.name || "No name"}</b>
        {t.user?.phone && <> · <a className="link" href={telLink(t.user.phone)}>📞 {prettyPhone(t.user.phone)}</a></>}
        {t.user?.email && <> · {t.user.email}</>}
      </div>
      <Bubbles messages={t.messages} staff />
      {!closed && <form className="form" style={{ paddingTop: 0 }} onSubmit={async (e) => { e.preventDefault(); if (await act("reply", () => api.deskReply(id, msg, photos), "Reply sent")) { setMsg(""); setPhotos([]); } }}>
        <div className="fld"><label htmlFor="desk-reply">Reply to the {t.role}</label><textarea id="desk-reply" rows="3" maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="They'll see it in Help & support in the app" /></div>
        <PhotoAdd photos={photos} setPhotos={setPhotos} />
        <div className="gap" style={{ flexWrap: "wrap" }}>
          <button className={"btn main" + (busy === "reply" ? " is-busy" : "")} disabled={!!busy || !msg.trim()}>{busy === "reply" ? "Sending…" : "Send reply"}</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => setCallNote("")}>📞 Resolved on call…</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => act("resolve", () => api.deskResolve(id, { note: msg.trim() }), "Marked resolved").then((ok) => ok && setMsg(""))}>Mark resolved</button>
          {!t.escalated && <button type="button" className="btn ghost" disabled={!!busy} onClick={() => act("esc", () => api.deskEscalate(id), "Flagged for the admin team")}>⚑ Needs admin</button>}
        </div>
      </form>}
      {callNote !== null && <div className="panel">
        <b>Resolved on a call</b>
        <p className="muted small">Write what was agreed on the call. The {t.role} sees this note and the ticket closes.</p>
        <textarea rows="2" style={{ width: "100%" }} maxLength={300} value={callNote} onChange={(e) => setCallNote(e.target.value)} placeholder="e.g. Called 27 Nov 11 AM, shop agreed to honour the price" />
        <div className="gap" style={{ marginTop: 8 }}>
          <button className={"btn main" + (busy === "call" ? " is-busy" : "")} disabled={!!busy || callNote.trim().length < 3} onClick={async () => { if (await act("call", () => api.deskResolve(id, { call: true, note: callNote.trim() }), "Resolved on call")) setCallNote(null); }}>{busy === "call" ? "Saving…" : "Save and close ticket"}</button>
          <button className="btn ghost" onClick={() => setCallNote(null)}>Cancel</button>
        </div>
      </div>}
      {closed && <div className="panel small">✅ {RESOLVED[t.resolvedBy] || "Closed"} {ago(t.resolvedAt)}{t.resolvedNote ? ` — ${t.resolvedNote}` : ""}. If the {t.role} writes again, the ticket reopens here.</div>}
      {err && <div className="error">{err}</div>}
    </>
  );
}

function Callbacks({ toast }) {
  const [status, setStatus] = useState("new");
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () => api.deskCallbacks(status).then(setList).catch((e) => { toast(errText(e)); setList([]); });
  useEffect(() => { setList(null); load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = async (id) => { setBusy(id); try { await api.deskCallbackDone(id); toast("Marked as called"); await load(); } catch (e) { toast(errText(e)); } setBusy(""); };
  return (
    <>
      <h1 className="adm-h1">Call backs</h1>
      <div className="chips">{[["new", "To call"], ["done", "Called"]].map(([id, l]) => <button key={id} className={"chip" + (status === id ? " on" : "")} onClick={() => setStatus(id)}>{l}</button>)}</div>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="✅" title="Nothing here">{status === "new" ? "No one is waiting for a call." : "No calls yet."}</Empty> : list.map((c) => (
        <div key={c.id} className="menu-item" style={{ alignItems: "flex-start" }}>
          <span style={{ flex: 1, textAlign: "left" }}>
            <b>{c.role === "partner" ? (c.user?.business || c.user?.name || "Partner") : (c.user?.name || "Customer")}</b> <span className="muted small">· {c.role}{c.user?.area ? ` · ${c.user.area}` : ""}</span>
            <span className="small" style={{ display: "block" }}>{c.topic} · {c.bestTime}{c.note ? ` · "${c.note}"` : ""}</span>
            <span className="muted small" style={{ display: "block" }}>{c.user?.phone ? prettyPhone(c.user.phone) : "no number"} · asked {ago(c.createdAt)}</span>
          </span>
          {status === "new" && <span className="gap" style={{ flexDirection: "column", gap: 6 }}>
            {c.user?.phone && <a className="btn main" style={{ padding: "7px 12px", fontSize: 13 }} href={telLink(c.user.phone)}>Call</a>}
            <button className={"btn ghost" + (busy === c.id ? " is-busy" : "")} style={{ padding: "7px 12px", fontSize: 13 }} disabled={!!busy} onClick={() => done(c.id)}>Mark done</button>
          </span>}
        </div>))}
    </>
  );
}

// Super admins: add area in-charges (state, optionally narrowed to cities and/or pincodes) and see their workload
function Incharges({ toast }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ email: "", states: [], cities: "", pincodes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = () => api.deskIncharges().then(setList).catch((e) => setErr(errText(e)));
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api.adminSetRole(form.email.trim(), "support", form.states, form.cities.split(",").map((x) => x.trim()).filter(Boolean), form.pincodes.split(/[\s,]+/).filter(Boolean));
      toast("In-charge saved. They log in at support.lastpick.in with this e-mail."); setForm({ email: "", states: [], cities: "", pincodes: "" }); await load();
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };
  const remove = async (p) => {
    if (!window.confirm(`Remove ${p.name || p.email} from the support team?`)) return;
    try { await api.adminSetRole(p.email, "user", []); toast("Removed"); await load(); } catch (x) { toast(errText(x)); }
  };
  const edit = (p) => setForm({ email: p.email, states: p.states, cities: p.cities.join(", "), pincodes: p.pincodes.join(", ") });
  return (
    <>
      <h1 className="adm-h1">Area in-charges</h1>
      <p className="muted small">An in-charge can only open the Support Desk, and only sees tickets and call backs from their area. They can't open the admin panel.</p>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="🧑‍💼" title="No in-charges yet">Add the first one below.</Empty> :
        <div className="desk-list">{list.map((p) => (
          <div key={p.id} className="desk-row" style={{ cursor: "default" }}>
            <span style={{ flex: 1, minWidth: 0 }}><span className="desk-title"><b>{p.name || p.email}</b> <span className="muted small">· {p.role === "moderator" ? "area agent" : "in-charge"}</span></span>
              <span className="small muted" style={{ display: "block" }}>{[p.states.join(", "), p.cities.join(", "), p.pincodes.join(", ")].filter(Boolean).join(" · ")}</span>
              <span className="small muted">{p.email}{p.phone ? ` · ${prettyPhone(p.phone)}` : ""}</span></span>
            <span className="small" style={{ textAlign: "right" }}><b>{p.open}</b> open{p.overdue ? <b style={{ color: "var(--bad, #c0392b)", display: "block" }}>{p.overdue} overdue</b> : null}
              <span className="muted" style={{ display: "block" }}>{p.avgReplyDays == null ? "no replies yet" : p.avgReplyDays < 1 ? "replies within a day" : `first reply ~${p.avgReplyDays} days`}</span></span>
            {p.role === "support" && <span className="gap" style={{ flexDirection: "column", gap: 4 }}><button className="link small" onClick={() => edit(p)}>Edit</button><button className="link small" onClick={() => remove(p)}>Remove</button></span>}
          </div>))}</div>}
      <form className="panel form" onSubmit={save}>
        <b>{list?.some((p) => p.email === form.email) ? "Edit in-charge" : "Add an in-charge"}</b>
        <p className="muted small">The person first signs up in the LastPick customer or partner app with this e-mail. Saving signs them out once so the new access applies.</p>
        <div className="fld"><label htmlFor="ic-email">E-mail of their LastPick account</label><input id="ic-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="fld"><label>States</label><div className="chips" style={{ padding: 0 }}>{INDIAN_STATES.map((s) => <button type="button" key={s} className={"chip" + (form.states.includes(s) ? " on" : "")} onClick={() => setForm({ ...form, states: form.states.includes(s) ? form.states.filter((x) => x !== s) : [...form.states, s] })}>{s}</button>)}</div></div>
        <div className="fld"><label htmlFor="ic-cities">Only these cities (optional, comma separated)</label><input id="ic-cities" value={form.cities} onChange={(e) => setForm({ ...form, cities: e.target.value })} placeholder="e.g. Hyderabad, Nandyal" /></div>
        <div className="fld"><label htmlFor="ic-pins">Only these pincodes (optional)</label><input id="ic-pins" value={form.pincodes} onChange={(e) => setForm({ ...form, pincodes: e.target.value })} placeholder="e.g. 500090, 518112" /></div>
        {err && <div className="error">{err}</div>}
        <button className={"btn main" + (busy ? " is-busy" : "")} disabled={busy || !form.email || !form.states.length}>{busy ? "Saving…" : "Save in-charge"}</button>
      </form>
    </>
  );
}
