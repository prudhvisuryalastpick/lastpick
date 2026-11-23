import { Logo } from "../lib/brand.jsx";
import { useEffect, useRef, useState } from "react";
import { AdminRevenue } from "./revenue.jsx";
import { api, isLive } from "../api/index.js";
import { TICKET_DAYS, TicketHint, BackButton, Empty, NeedLogin, PlanCard, Sheet, Spinner, useLive } from "../components.jsx";
import { APP_NAME, INDIAN_STATES, IS_ADMIN_APP, IS_CUSTOMER_APP, IS_NATIVE, IS_OWNER_APP, PLANS, SUPPORT_EMAIL, planLabel, savePct, categoryOf } from "../lib/config.js";
import { ago, day, daysLeft, errText, prettyPhone, rupee, validPhone } from "../lib/format.js";
import { navigate, useApp } from "../state.jsx";
import { AdminSupport } from "./impact.jsx";

// ------------------------------------------------------------------ Plans & pricing
// No free version. One Razorpay payment = 30 days (no auto-renewal: pay again to add 30 more days).
// Admins can still turn plans on by hand in Admin → Plans (e.g. after a UPI transfer).
export function Subscribe({ plan }) { return <Plans plan={plan} />; }
export function Plans({ plan: initial }) {
  const { session, subs, profile, business, trial, refresh, config, toast } = useApp();
  const [plan, setPlan] = useState(PLANS[initial] ? initial : IS_OWNER_APP ? "owner" : "customer");
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const p = PLANS[plan], s = subs?.[plan], opt = p.options.find((o) => o.months === months) || p.options[0];
  const trialEnd = trial?.[plan];
  const left = daysLeft(trialEnd);
  const payOn = !isLive || !!config?.payments; // Razorpay keys saved on the server
  const canPay = !IS_NATIVE && months === 1 && !!session && left === 0 && payOn && (plan !== "owner" || business?.status === "verified");
  const pay = async () => {
    if (plan === "customer" && !validPhone(profile?.phone)) { setErr("Add your phone number in Account first, so businesses can reach you."); return; }
    setBusy(true); setErr("");
    try { await api.subscribe(plan, profile); await refresh(); toast?.(`Payment received. ${p.name} is active for 30 more days.`); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  let status = null;
  if (session) {
    if (s?.active) status = ["ok", "✅", `${p.name} is active`, `Till ${day(s.currentPeriodEnd)}`];
    else if (left > 0) status = ["ok", "🎁", `Extra days from ${APP_NAME}: ${left} day${left > 1 ? "s" : ""} left`, `Until ${day(trialEnd)}. After that ${rupee(p.price)} for 30 days, or less on a longer plan.`];
    else if (plan === "owner" && !business) status = ["no", "🏪", "Register your business first", "Business Pro is for business partners we have verified."];
    else if (plan === "owner" && business.status !== "verified") status = ["no", "⏳", "Waiting for verification", "You can buy Business Pro once we verify your business."];
    else status = ["no", "⚠️", `${p.name} is not active`, `Pick a plan to ${plan === "owner" ? "post offers" : "see businesses' numbers"}. There is no free version.`];
  }
  return (
    <>
      <div style={{ position: "relative", height: 62 }}><BackButton /></div>
      <div className="page-h" style={{ paddingTop: 0 }}><h1 className="title">Plans</h1>
        <div className="muted">Pay once, get 30 days. No auto-renewal: pay again when you want more days.</div></div>
      {!IS_OWNER_APP && !IS_CUSTOMER_APP && <div className="tabs">
        <button className={plan === "customer" ? "on" : ""} onClick={() => setPlan("customer")}>For customers</button>
        <button className={plan === "owner" ? "on" : ""} onClick={() => setPlan("owner")}>For businesses</button>
      </div>}
      {status && <div className={"status " + status[0]}><span style={{ fontSize: 24 }}>{status[1]}</span><div><b>{status[2]}</b><div className="muted small">{status[3]}</div></div></div>}
      <PlanCard plan={plan} />
      <div className="label-up" style={{ paddingBottom: 12 }}>Choose a plan{plan === "owner" ? " (verified businesses)" : ""}</div>
      <div className="planopts">
        {p.options.map((o) => {
          const save = savePct(plan, o);
          return (
            <button key={o.months} className={"planopt " + (o.months === months ? "on" : "")} aria-pressed={o.months === months} onClick={() => setMonths(o.months)}>
              {save > 0 && <span className="save">Save {save}%</span>}
              <div className="m">{planLabel(o.months)}</div>
              <div className="p">{rupee(o.price)}</div>
              <div className="pm">{o.months > 1 ? `${rupee(Math.round(o.price / o.months))}/month` : "for 30 days"}</div>
            </button>
          );
        })}
      </div>
      <div className="pad">
        {!isLive && <div className="banner warn" style={{ margin: "0 0 12px" }}>Demo mode: no real payment is taken.</div>}
        {err && <div className="error" style={{ marginBottom: 12 }}>{err} {err.includes("phone") && <a className="link" href="#/account">Open Account</a>}<TicketHint /></div>}
        {canPay
          ? <button className="btn main" disabled={busy} onClick={pay}>{busy ? "Opening payment…" : `${s?.active ? "Add 30 days" : "Pay"} ${rupee(opt.price)}`}</button>
          : <div className="box small"><b>{planLabel(opt.months)}: {rupee(opt.price)}.</b> {left > 0
            ? "You already have access. You can buy a plan when your extra days end."
            : IS_NATIVE ? "Plans can't be bought inside the app yet." : plan === "owner" && business?.status !== "verified" ? "You can pay once we verify your business." : `Online payment is coming soon. Until then, write to ${SUPPORT_EMAIL} and we turn your plan on after you pay.`}</div>}
        <div className="note">{plan === "owner"
          ? "Business Pro is for business partners we have verified: up to 3 offers a day in your own category."
          : "Customer Pass: see businesses' numbers and contact them."} {APP_NAME} only connects customers and businesses; offers are paid to the business directly. <a className="link" href="#/refund">Refund policy</a></div>
      </div>
    </>
  );
}

export { Login } from "./auth.jsx";

// ------------------------------------------------------------------ Legal & help
export function Help() {
  return (
    <>
      <div style={{ position: "relative", height: 62 }}><BackButton /></div>
      <div className="legal">
        <h1 className="title">Help & support</h1>
        <h2>How does {APP_NAME} work?</h2>
        <p>Owners post offers on things they need to move fast. Customers browse for free; with the Customer Pass they can see the owner's number, call or WhatsApp them, or share their own number so the owner calls back.</p>
        <h2>The owner didn't honour the offer</h2>
        <p>Open the offer and tap "Report this offer". Our team reviews every report and can remove offers or suspend businesses.</p>
        <h2>Renewing or stopping a plan</h2>
        <p>Plans never renew by themselves. Each payment gives 30 days; to continue, pay again from Account → your plan → Renew. To stop, simply don't pay again.</p>
        <h2>Rate a business</h2>
        <p>After you contact a business through {APP_NAME}, open its offer (or My contacts) and tap "Rate". Only real contacts can review, so ratings stay honest.</p>
        <h2>Your data</h2>
        <p>Account → Privacy & your data: download everything we hold about you, or delete your account.</p>
        <h2>Contact us</h2>
        <p>Email <a className="link" href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>. For any problem (payments, your account, an offer or a business), <a className="link" href="#/grievance">raise a ticket</a>: we resolve tickets in {TICKET_DAYS}.</p>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Refund & contact (needed for payment-gateway KYC)
export function Refund() {
  return (
    <>
      <div style={{ position: "relative", height: 62 }}><BackButton /></div>
      <div className="legal">
        <h1 className="title">Refund & cancellation policy</h1>
        <p className="muted">Template text: have a lawyer review it before launch.</p>
        <h2>Subscriptions</h2>
        <p>There is no free version. The Customer Pass costs {rupee(PLANS.customer.price)} for 30 days and Business Pro (for verified business partners) {rupee(PLANS.owner.price)} for 30 days. You pay once through Razorpay (UPI, card or netbanking) and get 30 days. You are never charged without choosing a plan and confirming the payment.</p>
        <h2>No auto-renewal</h2>
        <p>Plans do not renew automatically and no mandate is set up. When your 30 days end, the plan stops unless you pay again. Paying again before the end adds 30 days to your current end date.</p>
        <h2>Refunds</h2>
        <p>Fees already paid are not refunded for unused time. If you were charged by mistake (for example a duplicate charge, or money taken for a payment that failed), contact us within 7 days and we will refund the full amount to the original payment method within 7 working days.</p>
        <h2>Offers and deals</h2>
        <p>{APP_NAME} does not sell, collect payment for, or deliver any offer listed in the app. Payments for offers are made directly to the business, so refunds for offers must be requested from that business.</p>
        <h2>Contact</h2>
        <p>Email <a className="link" href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a> with your registered email and payment details.</p>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Admin & moderators
export function Admin() {
  return <NeedLogin why="Log in as admin"><AdminInner /></NeedLogin>;
}
function AdminInner() {
  const { isStaff, isAdmin, profile, toast } = useApp();
  const [tab, setTab] = useState("overview");
  if (!isStaff) return <Empty icon="⛔" title="Admins only">Your account doesn't have admin access.</Empty>;
  const tabs = isAdmin
    ? [["overview", "Overview"], ["businesses", "Businesses"], ["reports", "Reports"], ["support", "Support chats"], ["complaints", "Complaints"], ["users", "Users"], ["revenue", "Revenue"]]
    : [["overview", "Overview"], ["businesses", "Businesses"], ["reports", "Reports"], ["support", "Support chats"]];
  return (
    <>
      <div className="page-h">
        <div className="gap" style={{ alignItems: "center" }}><Logo size={42} /><h1 className="title">{isAdmin ? "LastPick Admin" : "LastPick Moderator"}</h1></div>
        <div className="muted">{isAdmin ? "All of India" : `Your area: ${[(profile?.regions || []).join(", "), (profile?.areaCities || []).join(", "), (profile?.areaPincodes || []).join(", ")].filter(Boolean).join(" · ") || "none assigned yet"}`}</div>
        {IS_ADMIN_APP && <div className="muted small" style={{ marginTop: 6 }}>{profile?.email} · <button className="link" onClick={async () => { await api.signOut(); navigate("/login"); }}>Log out</button></div>}
      </div>
      <div className="chips" style={{ paddingTop: 4 }}>{tabs.map(([id, l]) => <button key={id} className={"chip " + (tab === id ? "on" : "")} onClick={() => setTab(id)}>{l}</button>)}</div>
      {tab === "overview" && <AdminOverview toast={toast} go={setTab} />}
      {tab === "businesses" && <AdminBusinesses toast={toast} />}
      {tab === "reports" && <AdminReports toast={toast} />}
      {tab === "support" && <AdminSupport toast={toast} />}
      {tab === "complaints" && isAdmin && <AdminComplaints toast={toast} />}
      {tab === "users" && isAdmin && <AdminUsers toast={toast} />}
      {tab === "revenue" && isAdmin && <AdminRevenue toast={toast} />}
    </>
  );
}

function PaymentsNote() {
  return (
    <div className="status no">
      <span style={{ fontSize: 24 }}>💳</span>
      <div className="grow"><b>No free version</b>
        <div className="muted small">Customers need the Customer Pass and partners need Business Pro. They pay online with Razorpay (30 days per payment). You can still turn plans on here after a payment received outside the app.</div></div>
    </div>
  );
}

function SingleDeviceSwitch({ toast }) {
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.adminSettings().then((x) => setOn(x.singleDevice !== false)).catch(() => setOn(true)); }, []);
  const flip = async (v) => {
    setBusy(true);
    try { const r = await api.setAdminSettings({ singleDevice: v }); setOn(r.singleDevice); toast(r.singleDevice ? "Customers can be logged in on one device at a time" : "Customers can now stay logged in on several devices"); } catch (e) { toast(errText(e)); }
    setBusy(false);
  };
  return (
    <div className="panel switchrow" style={{ margin: "4px 16px 12px" }}>
      <div><b>Customers: one device at a time</b> {on ? <span className="pill p-ok">On</span> : <span className="pill p-mute">Off</span>}
        <div className="muted small">When on, logging in on a new device logs the customer out of the old one. When off, customers can stay logged in on several devices. Partner and admin logins are always one device.</div></div>
      {on == null ? <span className="muted small">…</span> : <button type="button" aria-label="One device at a time on or off" aria-pressed={on} className={"sw " + (on ? "on" : "")} disabled={busy} onClick={() => flip(!on)} />}
    </div>
  );
}

function AdminOverview({ toast, go }) {
  const { isAdmin } = useApp();
  const [data, setData] = useState(null);
  const [stateFilter, setStateFilter] = useState("");
  useLive((first) => api.adminStats().then(setData).catch((e) => { if (first) { toast(errText(e)); setData({ totals: {}, cities: [] }); } }));
  if (!data) return <Spinner />;
  const t = data.totals;
  const mrr = (t.customers || 0) * PLANS.customer.price + (t.owners || 0) * PLANS.owner.price;
  const cities = data.cities.filter((c) => !stateFilter || c.state === stateFilter);
  const states = [...new Set(data.cities.map((c) => c.state).filter(Boolean))].sort();
  const Kpi = ({ n, l, onClick }) => <div className="kpi" onClick={onClick} style={onClick ? { cursor: "pointer" } : null}><div className="n">{n ?? "…"}</div><div className="l">{l}</div></div>;
  return (
    <>
      {isAdmin && <PaymentsNote />}
      {isAdmin && <SingleDeviceSwitch toast={toast} />}
      {<div className="plan" style={{ padding: 16, marginTop: 4 }}>
        <div style={{ opacity: .75, fontSize: 13 }}>Monthly recurring revenue (active plans)</div>
        <div className="amt" style={{ fontSize: 32 }}>{rupee(mrr)}</div>
        <div style={{ opacity: .75, fontSize: 12.5 }}>{t.customers} Customer Pass × {rupee(PLANS.customer.price)} + {t.owners} Business Pro × {rupee(PLANS.owner.price)}</div>
      </div>}
      {data.impact && <div className="plan" style={{ padding: 16, margin: "4px 16px 12px" }}>
        <div style={{ opacity: .8, fontSize: 13 }}>Business generated for local partners (last 12 months, estimated)</div>
        <div className="amt" style={{ fontSize: 32 }}>{rupee(data.impact.value)}</div>
        <div style={{ opacity: .85, fontSize: 12.5 }}>Customers saved {rupee(data.impact.saved)} · {data.impact.customers} customers · {data.impact.businesses} businesses · {rupee(data.impact.value30)} in the last 30 days</div>
      </div>}
      <div className="kpis">
        <Kpi n={t.users} l="Registered users" onClick={() => go("users")} />
        {data.openSupport != null && <Kpi n={data.openSupport} l="Support chats waiting" onClick={() => go("support")} />}
        <Kpi n={t.liveOffers} l="Live offers" />
        <Kpi n={t.verified} l="Verified businesses" onClick={() => go("businesses")} />
        <Kpi n={t.pending} l="Waiting for verification" onClick={() => go("businesses")} />
        <Kpi n={t.openReports} l="Open reports" onClick={() => go("reports")} />
        <Kpi n={t.leads30} l="Numbers shared (30 days)" />
        <Kpi n={t.suspended} l="Suspended businesses" />
        <Kpi n={t.archived} l="Archived offers" />
        <Kpi n={t.reviews} l="Published reviews" />
        {isAdmin && <Kpi n={t.openGrievances} l="Open complaints" onClick={() => go("complaints")} />}
      </div>
      <div className="sect"><h3>By city</h3>
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} aria-label="Filter by state"><option value="">All states</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      {cities.length === 0 ? <div className="muted pad" style={{ paddingTop: 0 }}>No cities yet. Cities appear when businesses there post offers.</div> : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table className="admin">
            <thead><tr style={{ background: "#f6f7fb", textAlign: "left" }}><th style={{ padding: 10 }}>City</th><th>State</th><th style={{ textAlign: "right" }}>Live offers</th><th style={{ textAlign: "right", paddingRight: 10 }}>Verified businesses</th></tr></thead>
            <tbody>{cities.map((c) => <tr key={c.key} style={{ borderTop: "1px solid var(--line)" }}><td style={{ padding: 10, fontWeight: 600 }}>{c.name}</td><td className="muted">{c.state}</td><td style={{ textAlign: "right" }}>{c.liveOffers}</td><td style={{ textAlign: "right", paddingRight: 10 }}>{c.verifiedBusinesses ?? "-"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Super-admin plan controls on a business: unlock Business Pro (after payment), give extra days, or end both.
function BizPlanControls({ b, toast, onDone }) {
  const [months, setMonths] = useState(1);
  const [days, setDays] = useState(15);
  const [busy, setBusy] = useState(false);
  const active = !!b.planUntil && b.planUntil > Date.now();
  const run = async (action, extra, msg) => {
    setBusy(true);
    try { await api.adminBusinessPlan(b.id, action, extra); toast(msg); onDone(); } catch (e) { toast(errText(e)); }
    setBusy(false);
  };
  const extra = b.trialEndsAt && b.trialEndsAt > Date.now();
  const daysLeft = active ? Math.ceil((b.planUntil - Date.now()) / 86400000) : 0;
  return (
    <div className={"bc-plan" + (active ? " on" : "")}>
      <div className="bc-plan-top">
        <div>
          <div className="bc-plan-title">{active ? `${PLANS.owner.name} · active` : b.status === "verified" ? "No active plan" : "Not verified yet"}</div>
          <div className="muted small">{active ? `Till ${day(b.planUntil)} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : b.status === "verified" ? "This partner can't post until a plan is unlocked" : "Verify the business first"}{extra ? ` · extra days till ${day(b.trialEndsAt)}` : ""}</div>
        </div>
        {active ? <span className="pill p-ok">✓ Active</span> : <span className="pill p-mute">Inactive</span>}
      </div>
      <div className="bc-plan-controls">
        <div className="bc-ctl">
          <select aria-label="Plan length" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {PLANS.owner.options.map((o) => <option key={o.months} value={o.months}>{planLabel(o.months)} · {rupee(o.price)}</option>)}</select>
          <button className={"btn sm " + (active ? "ghost" : "main")} disabled={busy} onClick={() => run("unlock", { months }, active ? `Plan extended by ${planLabel(months)}` : `${PLANS.owner.name} unlocked for ${planLabel(months)}`)}>{active ? "Extend" : "Unlock plan"}</button>
        </div>
        <div className="bc-ctl">
          <select aria-label="Extra days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 15, 30, 60].map((d) => <option key={d} value={d}>+{d} days</option>)}</select>
          <button className="btn ghost sm" disabled={busy} onClick={() => run("extendTrial", { days }, `Added ${days} extra days`)}>Give days</button>
        </div>
        {(active || extra) && <button className="btn ghost sm bc-danger" disabled={busy} onClick={() => run("end", {}, "Plan ended")}>End plan</button>}
      </div>
    </div>
  );
}

function AdminBusinesses({ toast }) {
  const { isAdmin } = useApp();
  const [list, setList] = useState(null);
  const [status, setStatus] = useState("pending");
  const [state, setState] = useState("");
  const [note, setNote] = useState("");
  const load = (first = false) => { if (first) setList(null); api.adminBusinesses({ status: status === "all" ? null : status, state: state || null }).then(setList).catch((e) => { if (first) { toast(errText(e)); setList([]); } }); };
  useLive(load, [status, state]);
  const act = async (b, st) => {
    try { await api.setBusinessStatus(b.id, st, st === "verified" ? "" : note.trim()); toast(`${b.name}: ${st}`); setNote(""); load(); } catch (e) { toast(errText(e)); }
  };
  return (
    <>
      <div className="chips" style={{ paddingTop: 0 }}>{["pending", "verified", "rejected", "suspended", "all"].map((s) => <button key={s} className={"chip " + (status === s ? "on" : "")} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <div className="form" style={{ paddingBottom: 8 }}>
        <div className="fld"><select value={state} onChange={(e) => setState(e.target.value)} aria-label="State"><option value="">All states</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="fld"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to owner when rejecting or suspending" /></div>
      </div>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="✅" title="Nothing here" /> : list.map((b) => (
        <div className="bizcard" key={b.id}>
          <div className="bc-head">
            <div className="bc-avatar">{(b.name || "?")[0]}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="bc-name">{b.name}</div>
              <div className="bc-cat">{(b.categories || [b.category]).map((c) => categoryOf(c)?.label || c).join(", ")}{b.rating?.count ? ` · ★ ${b.rating.avg} (${b.rating.count})` : ""}</div>
            </div>
            <span className={"pill " + (b.status === "verified" ? "p-ok" : b.status === "pending" ? "p-warn" : "p-bad")} style={{ textTransform: "capitalize" }}>{b.status}</span>
          </div>
          <div className="bc-grid">
            <div><span>Address</span><b>{[b.address, b.area, b.city, b.state || "state missing"].filter(Boolean).join(", ")}{b.pincode ? ` · ${b.pincode}` : ""}</b></div>
            <div><span>Phone</span><b>{b.phone ? <Reveal masked={b.phone} load={() => api.revealBusiness(b.id)} render={(c) => <>{prettyPhone(c.phone)} <a className="link" href={"tel:" + c.phone}>Call</a></>} /> : "No number"}</b></div>
            <div><span>Map location</span><b>{b.lat != null ? "Set" : "Missing"}</b></div>
            <div><span>Joined</span><b>{b.createdAt ? ago(b.createdAt) : "-"}</b></div>
          </div>
          {(b.flags?.length > 0 || b.statusNote) && <div className="bc-flags">
            {(b.flags || []).map((f) => <span key={f} className="bc-flag">{f}</span>)}
            {b.statusNote && <span className="muted small">Note: {b.statusNote}</span>}
          </div>}
          <div className="bc-actions">
            {b.status !== "verified" && <button className="btn main sm" onClick={() => act(b, "verified")}>Verify</button>}
            {["pending", "verified", "suspended"].includes(b.status) && <button className="btn ghost sm" onClick={() => act(b, "rejected")}>Reject</button>}
            {b.status === "verified" && <button className="btn ghost sm bc-danger" onClick={() => act(b, "suspended")}>Suspend</button>}
          </div>
          {isAdmin && <BizPlanControls b={b} toast={toast} onDone={load} />}
        </div>
      ))}
    </>
  );
}

function AdminReports({ toast }) {
  const [list, setList] = useState(null);
  const load = (first = false) => api.adminReports().then(setList).catch((e) => { if (first) { toast(errText(e)); setList([]); } });
  useLive(load);
  const resolve = async (r, status, removeOffer) => {
    try { await api.resolveReport(r.id, status, removeOffer); toast(removeOffer ? "Offer removed" : "Report " + status); load(); } catch (e) { toast(errText(e)); }
  };
  return !list ? <Spinner /> : list.length === 0 ? <Empty icon="🎉" title="No open reports" /> : list.map((r) => (
    <div className="panel" key={r.id}>
      <div className="row"><b>{r.type === "review" ? "Review: " : ""}{r.reason}</b><span className="muted small">{r.createdAt ? ago(r.createdAt) : ""}</span></div>
      <div className="muted small">{[r.city, r.state].filter(Boolean).join(", ")}</div>
      {r.details && <div className="muted small" style={{ marginTop: 4 }}>{r.details}</div>}
      {r.type === "review" ? (
        <div className="box small" style={{ marginTop: 8 }}>{r.review ? <>⭐ {r.review.rating} by {r.review.name} on <b>{r.review.businessName}</b>: "{r.review.text || "(no text)"}" · {r.review.status}</> : "Review already deleted"}</div>
      ) : (
        <div className="box small" style={{ marginTop: 8 }}>{r.offer ? <><a className="link" href={"#/offer/" + r.offer.id}>{r.offer.title}</a> · {r.offer.business?.name} · {r.offer.status}</> : "Offer already archived"}</div>
      )}
      <div className="gap" style={{ marginTop: 10, flexWrap: "wrap" }}>
        {r.offer && r.offer.status !== "removed" && <button className="btn danger sm" onClick={() => resolve(r, "actioned", true)}>Remove offer</button>}
        {r.review && r.review.status !== "hidden" && <button className="btn danger sm" onClick={() => resolve(r, "actioned", true)}>Hide review</button>}
        <button className="btn ghost sm" onClick={() => resolve(r, "dismissed", false)}>Dismiss</button>
      </div>
    </div>
  ));
}

// Complaint tickets: acknowledge within 24 hours, resolve within 15 days (IT Rules 2021).
function AdminComplaints({ toast }) {
  const [status, setStatus] = useState("open");
  const [list, setList] = useState(null);
  const [reply, setReply] = useState({});
  const load = (first = false) => { if (first) setList(null); api.adminGrievances(status).then(setList).catch((e) => { if (first) { toast(errText(e)); setList([]); } }); };
  useLive(load, [status]);
  const update = async (g, st) => {
    try { await api.adminUpdateGrievance(g.ticket, st, reply[g.ticket] || g.reply || ""); toast(`Ticket ${g.ticket}: ${st}`); load(); } catch (e) { toast(errText(e)); }
  };
  const due = (g) => { const created = typeof g.createdAt === "string" ? Date.parse(g.createdAt) : g.createdAt; return created ? created + 15 * 86400000 : null; };
  return (
    <>
      <div className="chips" style={{ paddingTop: 0 }}>{["open", "acknowledged", "resolved", "rejected"].map((s) => <button key={s} className={"chip " + (status === s ? "on" : "")} onClick={() => setStatus(s)}>{s}</button>)}</div>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="📭" title="No complaints here" /> : list.map((g) => (
        <div className="panel" key={g.ticket}>
          <div className="row"><b>{g.subject}</b><span className="muted small">{g.ticket}</span></div>
          <div className="muted small">{g.type} · {g.email}{due(g) ? " · resolve by " + day(due(g)) : ""}</div>
          <div className="small" style={{ marginTop: 6, whiteSpace: "pre-line" }}>{g.details}</div>
          {["open", "acknowledged"].includes(g.status) ? <>
            <div className="fld" style={{ marginTop: 8 }}><textarea rows="2" placeholder="Reply to the user (they see this in Complaints)" value={reply[g.ticket] ?? g.reply ?? ""} onChange={(e) => setReply({ ...reply, [g.ticket]: e.target.value })} /></div>
            <div className="gap" style={{ marginTop: 8, flexWrap: "wrap" }}>
              {g.status === "open" && <button className="btn ghost sm" onClick={() => update(g, "acknowledged")}>Acknowledge</button>}
              <button className="btn main sm" onClick={() => update(g, "resolved")}>Resolve</button>
              <button className="btn ghost sm" onClick={() => update(g, "rejected")}>Close without action</button>
            </div>
          </> : g.reply && <div className="box small" style={{ marginTop: 8 }}>Reply: {g.reply}</div>}
        </div>
      ))}
    </>
  );
}

// Customers and partners in two separate tables, each with search and a CSV download.
function AdminUsers({ toast }) {
  const [kind, setKind] = useState("customers");
  return (
    <>
      <div className="tabs" role="tablist" style={{ margin: "4px 16px 10px" }}>
        <button role="tab" aria-selected={kind === "customers"} className={kind === "customers" ? "on" : ""} onClick={() => setKind("customers")}>Customers</button>
        <button role="tab" aria-selected={kind === "partners"} className={kind === "partners" ? "on" : ""} onClick={() => setKind("partners")}>Partners</button>
      </div>
      <UserTable key={kind} kind={kind} toast={toast} />
    </>
  );
}

const csvCell = (v) => { const t = v == null ? "" : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const dt = (t) => (t ? new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const planText = (s) => (!s ? "none" : s.active ? `active till ${day(s.until)}` : s.status);

function UserTable({ kind, toast }) {
  const partners = kind === "partners";
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const qRef = useRef(""); qRef.current = q;
  const search = (term, first = true) => { if (first) setList(null); api.adminUsers(kind, term).then(setList).catch((e) => { if (first) { toast(errText(e)); setList([]); } }); };
  useLive((first) => search(qRef.current.trim(), first), [kind]);
  const download = async () => {
    setBusy(true);
    try {
      const rows = await api.adminExportUsers(kind);
      const head = partners
        ? ["Name", "E-mail", "Mobile", "Business", "Category", "Area", "City", "State", "Pincode", "Verification", "Business Pro", "Joined", "Last login", "Last device", "Partner terms version", "Partner terms accepted at"]
        : ["Name", "E-mail", "Mobile", "Customer Pass", "Joined", "Last login", "Last device", "Terms version", "Terms accepted at"];
      const lines = rows.map((u) => (partners
        ? [u.name, u.email, u.phone, u.business?.name, categoryOf(u.business?.category)?.label || u.business?.category, u.business?.area, u.business?.city, u.business?.state, u.business?.pincode, u.business?.status, planText(u.owner), dt(u.createdAt), dt(u.lastLoginAt), u.lastLoginDevice, u.partnerConsentVersion, dt(u.partnerConsentAt)]
        : [u.name, u.email, u.phone, planText(u.customer), dt(u.createdAt), dt(u.lastLoginAt), u.lastLoginDevice, u.consentVersion, dt(u.consentAt)]).map(csvCell).join(","));
      // a byte-order mark so Excel opens the file as UTF-8 (₹ and Indian names show correctly)
      const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `lastpick-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`Downloaded ${rows.length} ${kind}`);
    } catch (e) { toast(errText(e)); }
    setBusy(false);
  };
  const pill = (s) => (!s ? <span className="pill p-mute">none</span> : s.active ? <span className="pill p-ok">till {day(s.until)}</span> : <span className="pill p-bad">{s.status}</span>);
  return (
    <>
      <form className="form" style={{ paddingBottom: 8 }} onSubmit={(e) => { e.preventDefault(); search(q.trim()); }}>
        <div className="gap" style={{ flexWrap: "wrap" }}>
          <input style={{ flex: 1, minWidth: 200, border: "1px solid var(--line)", borderRadius: 12, padding: "11px 12px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={partners ? "Name, business, e-mail or phone" : "Name, e-mail or phone"} aria-label={`Search ${kind}`} />
          <button className="btn dark sm">Search</button>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={download}>{busy ? "Preparing…" : "⬇ Download CSV"}</button>
        </div>
        <div className="muted small">Newest first. Phone numbers and e-mails are hidden here; tapping Show and downloading the CSV (which has full details) are recorded in the audit log.</div>
      </form>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="🔍" title={`No ${kind} found`} /> : (
        <div className="tablewrap">
          <table className="admin users">
            <thead><tr>
              <th>Name</th><th>Contact</th>
              {partners ? <><th>Business</th><th>Location</th><th>Status</th><th>Business Pro</th></> : <th>Customer Pass</th>}
              <th>Joined</th><th>Last login</th><th>Terms accepted</th>
            </tr></thead>
            <tbody>{list.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name || "(no name)"}</b></td>
                <td className="small">{u.phone || u.email
                  ? <Reveal masked={`${u.email || "no e-mail"} · ${u.phone || "no phone"}`} load={() => api.revealUser(u.id)} render={(c) => <span>{c.email || "no e-mail"} · {c.phone ? prettyPhone(c.phone) : "no phone"}</span>} />
                  : "none"}
                  <div className="muted small">{u.phone && u.phoneVerified ? "✓ mobile verified" : ""}</div></td>
                {partners ? <>
                  <td>{u.business?.name}<div className="muted small">{categoryOf(u.business?.category)?.label || u.business?.category}</div></td>
                  <td className="small">{[u.business?.area, u.business?.city].filter(Boolean).join(", ")}<div className="muted">{u.business?.state} {u.business?.pincode}</div></td>
                  <td><span className={"pill " + (u.business?.status === "verified" ? "p-ok" : u.business?.status === "pending" ? "p-new" : "p-bad")}>{u.business?.status}</span></td>
                  <td>{pill(u.owner)}</td>
                </> : <td><CustomerPass u={u} toast={toast} onDone={() => search(qRef.current.trim(), false)} /></td>}
                <td className="small">{day(u.createdAt)}</td>
                <td className="small">{u.lastLoginAt ? dt(u.lastLoginAt) : "never"}<div className="muted">{u.lastLoginDevice}</div></td>
                <td className="small"><ConsentCell u={u} partners={partners} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Terms acceptance: version and date, plus the full record (exact text accepted, time, device, network address)
// that can be downloaded and shown if there is ever a dispute.
// partner KYC: the owner's profile photo (opening it is logged)
function KycPhoto({ u }) {
  const [photo, setPhoto] = useState(undefined);
  if (!u.business?.hasPhoto) return <div className="muted">No KYC photo</div>;
  return (
    <>
      <div><button className="link small" onClick={() => api.adminUserPhoto(u.id).then((p) => setPhoto(p || null)).catch(() => setPhoto(null))}>KYC photo</button></div>
      {photo !== undefined && <Sheet onClose={() => setPhoto(undefined)}>
        <h2 style={{ marginTop: 0 }}>{u.name || "Partner"}: KYC photo</h2>
        {photo ? <img src={photo} alt={`Profile photo of ${u.name || "partner"}`} style={{ width: "100%", maxWidth: 360, borderRadius: 16 }} /> : <p className="muted">No photo.</p>}
      </Sheet>}
    </>
  );
}

function ConsentCell({ u, partners }) {
  const [open, setOpen] = useState(false);
  const v = partners ? u.partnerConsentVersion : u.consentVersion;
  const at = partners ? u.partnerConsentAt : u.consentAt;
  return (
    <>
      {v ? <span>v{v}<div className="muted">{dt(at)}</div></span> : <span className="pill p-bad">not accepted</span>}
      <div><button className="link small" onClick={() => setOpen(true)}>Record</button></div>
      {open && <ConsentRecord id={u.id} onClose={() => setOpen(false)} />}
      {partners && <KycPhoto u={u} />}
    </>
  );
}

function ConsentRecord({ id, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.adminConsents(id).then(setData).catch((e) => setErr(errText(e))); }, [id]);
  const download = (c) => {
    const u = data.user;
    const text = [
      `${APP_NAME}: record of acceptance`,
      "",
      `Name:            ${u.name || ""}`,
      `E-mail:          ${u.email}`,
      `Mobile:          ${u.phone}`,
      `Account ID:      ${u.id}`,
      `Accepted as:     ${c.kind === "partner" ? "Partner (business)" : "Customer"}`,
      `Terms version:   ${c.version}`,
      `Accepted at:     ${dt(c.at)} (India time) · ${new Date(c.at).toISOString()} (UTC)`,
      `Read in full:    ${c.readFull ? "Yes (scrolled to the end before agreeing)" : "Not recorded (older acceptance)"}`,
      `Device:          ${c.device}`,
      `Network address: ${c.ip || "not recorded"}`,
      `Text fingerprint (SHA-256): ${c.hash || "not recorded"}`,
      "",
      "=============== Exact text accepted ===============",
      "",
      c.text || "(The exact text was not stored for this older acceptance.)",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `lastpick-consent-${(u.email || u.id).replace(/[^a-z0-9]+/gi, "-")}-${c.version}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <Sheet onClose={onClose}>
      <h2 style={{ margin: "0 0 4px" }}>Terms acceptance record</h2>
      {err ? <div className="error">{err}</div> : !data ? <Spinner /> : (
        <>
          <div className="muted small" style={{ marginBottom: 10 }}>{data.user.name} · {data.user.email} · viewing this is recorded in the audit log</div>
          {data.consents.length === 0 ? <div className="panel small">No acceptance recorded yet.</div> : data.consents.map((c, i) => (
            <div className="panel" key={i} style={{ margin: "0 0 10px" }}>
              <div className="row"><b>{c.kind === "partner" ? "Partner terms" : "Customer terms"} · v{c.version}</b>{c.readFull ? <span className="pill p-ok">read in full</span> : <span className="pill p-mute">older</span>}</div>
              <div className="muted small">{dt(c.at)} · {c.device}{c.ip ? ` · ${c.ip}` : ""}</div>
              {c.hash && <div className="muted small" style={{ wordBreak: "break-all" }}>Fingerprint: {c.hash}</div>}
              <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => download(c)}>⬇ Download record</button>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

// Customer Pass: shows the plan and lets an admin activate or extend it by one month (payment collected outside the app).
function CustomerPass({ u, toast, onDone }) {
  const [busy, setBusy] = useState(false);
  const s = u.customer;
  const active = !!s?.active;
  const go = async (months) => {
    setBusy(true);
    try { await api.adminSetPlanFor(u.id, "customer", months); toast(months ? (active ? "Customer Pass extended by 1 month" : "Customer Pass activated for 1 month") : "Customer Pass ended"); onDone(); }
    catch (e) { toast(errText(e)); }
    setBusy(false);
  };
  return (
    <div className="gap" style={{ alignItems: "center", flexWrap: "wrap" }}>
      {active ? <span className="pill p-ok">till {day(s.until)}</span> : <span className="pill p-mute">{s?.status || "none"}</span>}
      <button className="btn ghost sm" disabled={busy} onClick={() => go(1)}>{active ? "Extend" : "Activate"} · {rupee(PLANS.customer.price)}</button>
      {active && <button className="link small" disabled={busy} onClick={() => go(0)}>End</button>}
    </div>
  );
}

// Masked personal data with a "Show" button. Showing it is logged (who looked at whose details, and when).
function Reveal({ masked, load, render }) {
  const [full, setFull] = useState(null);
  const [busy, setBusy] = useState(false);
  if (full) return render ? render(full) : <span>{full}</span>;
  return <span>{masked} <button className="link small" disabled={busy} onClick={async () => { setBusy(true); try { setFull(await load()); } catch { setBusy(false); } }}>{busy ? "…" : "Show"}</button></span>;
}

