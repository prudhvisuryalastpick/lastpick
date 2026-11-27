// LastPick admin panel: a side menu, one filter bar (state → city → pincode, category, search) shared by Overview,
// Partners and Areas, simple tables, and the app switches as square boxes in Settings.
import { Logo } from "../lib/brand.jsx";
import { useEffect, useState } from "react";
import { api } from "../api/index.js";
import { Empty, NeedLogin, Sheet, Spinner, useLive } from "../components.jsx";
import { CATEGORIES, IS_ADMIN_APP, PLANS, categoryOf } from "../lib/config.js";
import { ago, day, errText, prettyPhone, rupee } from "../lib/format.js";
import { navigate, useApp } from "../state.jsx";
import { AdminComplaints, AdminReports, AdminUsers, Reveal } from "./account.jsx";
import { AdminSupport } from "./impact.jsx";
import { AdminRevenue } from "./revenue.jsx";

const NOFILTER = { state: "", city: "", pincode: "", category: "", q: "" };

export function Admin() {
  return <NeedLogin why="Log in as admin"><AdminPanel /></NeedLogin>;
}

function AdminPanel() {
  const { isStaff, isAdmin, profile, toast } = useApp();
  const [tab, setTab] = useState("overview");
  const [f, setF] = useState(NOFILTER);
  const [pendingCount, setPendingCount] = useState(null);
  useLive(() => api.adminStats().then((d) => setPendingCount(d.totals?.pending ?? null)).catch(() => {}));
  if (!isStaff) return <Empty icon="⛔" title="Admins only">Your account doesn't have admin access.</Empty>;
  const tabs = [
    ["overview", "Overview"], ["partners", "Partners", pendingCount || ""], ["areas", "Areas"],
    ["reports", "Reports"], ["support", "Support"],
    ...(isAdmin ? [["complaints", "Complaints"], ["customers", "Customers"], ["banners", "Banners and boosts"], ["settings", "Settings"]] : []),
  ];
  const filtered = ["overview", "partners", "areas"].includes(tab);
  const pickPincode = (pin) => { setF((x) => ({ ...x, pincode: pin })); setTab("partners"); };
  return (
    <div className="adm">
      <nav className="adm-nav" aria-label="Admin sections">
        <div className="adm-brand"><Logo size={34} /><div><b>LastPick Admin</b>
          <div className="small">{isAdmin ? "All of India" : `Your area: ${[(profile?.regions || []).join(", "), (profile?.areaCities || []).join(", "), (profile?.areaPincodes || []).join(", ")].filter(Boolean).join(" · ") || "none yet"}`}</div></div></div>
        {tabs.map(([id, label, badge]) => (
          <button key={id} type="button" className={"adm-tab" + (tab === id ? " on" : "")} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
            <span>{label}</span>{badge ? <span className="adm-badge">{badge}</span> : null}</button>))}
        {IS_ADMIN_APP && <div className="adm-me small">{profile?.email}<br /><button type="button" className="link" onClick={async () => { await api.signOut(); navigate("/login"); }}>Log out</button></div>}
      </nav>
      <main className="adm-main">
        <h1 className="adm-h1">{tabs.find((t) => t[0] === tab)?.[1]}</h1>
        {filtered && <FilterBar f={f} setF={setF} />}
        {tab === "overview" && <Overview f={f} toast={toast} pickPincode={pickPincode} />}
        {tab === "partners" && <Partners f={f} toast={toast} isAdmin={isAdmin} />}
        {tab === "areas" && <Areas f={f} toast={toast} pickPincode={pickPincode} />}
        {tab === "reports" && <AdminReports toast={toast} />}
        {tab === "support" && <AdminSupport toast={toast} />}
        {tab === "complaints" && isAdmin && <AdminComplaints toast={toast} />}
        {tab === "customers" && isAdmin && <AdminUsers toast={toast} />}
        {tab === "banners" && isAdmin && <AdminRevenue toast={toast} />}
        {tab === "settings" && isAdmin && <Settings toast={toast} />}
      </main>
    </div>
  );
}

// State → city → pincode (each list narrows to the one before), category and search.
function FilterBar({ f, setF }) {
  const [areas, setAreas] = useState({ states: [], cities: [], pincodes: [] });
  useEffect(() => { api.adminAreas().then(setAreas).catch(() => {}); }, []);
  const cities = areas.cities.filter((c) => !f.state || c.state === f.state).map((c) => c.city);
  const pins = areas.pincodes.filter((p) => (!f.state || p.state === f.state) && (!f.city || p.city === f.city));
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  return (
    <section className="adm-filters" aria-label="Filters">
      <label>State<select value={f.state} onChange={(e) => set({ state: e.target.value, city: "", pincode: "" })}>
        <option value="">All states</option>{areas.states.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>City<select value={f.city} onChange={(e) => set({ city: e.target.value, pincode: "" })}>
        <option value="">All cities</option>{[...new Set(cities)].sort().map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Pincode<select value={f.pincode} onChange={(e) => set({ pincode: e.target.value })}>
        <option value="">All pincodes</option>{pins.map((p) => <option key={p.pincode} value={p.pincode}>{p.pincode}{p.area ? ` · ${p.area}` : ""}</option>)}</select></label>
      <label>Category<select value={f.category} onChange={(e) => set({ category: e.target.value })}>
        <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="wide">Search<input type="search" value={f.q} placeholder="Shop, owner or phone" onChange={(e) => set({ q: e.target.value })} /></label>
      <button type="button" className="btn ghost sm" onClick={() => setF(NOFILTER)}>Clear</button>
    </section>
  );
}

const areaOnly = (f) => ({ state: f.state, city: f.city, pincode: f.pincode, category: f.category });

function Overview({ f, toast, pickPincode }) {
  const [data, setData] = useState(null);
  const key = JSON.stringify(areaOnly(f));
  useLive((first) => api.adminStats(areaOnly(f)).then(setData).catch((e) => { if (first) { toast(errText(e)); setData({ totals: {} }); } }), [key]);
  if (!data) return <Spinner />;
  const t = data.totals;
  const kpis = [
    [t.partners, "Partners"], [t.owners, "Business Pro active"], [t.ownersEnding, "Ending in 3 days"],
    [t.pending, "Waiting for KYC"], [t.liveOffers, "Live offers"],
    [t.customersRegistered, "Registered customers (all India)"],
  ];
  return (
    <>
      <div className="adm-kpis">{kpis.map(([n, l]) => <div className="adm-kpi" key={l}><div className="n">{n ?? "–"}</div><div className="l">{l}</div></div>)}</div>
      <h2 className="adm-h2">Partners and Business Pro by pincode</h2>
      <AreaTable f={f} toast={toast} pickPincode={pickPincode} />
    </>
  );
}

function Areas({ f, toast, pickPincode }) {
  return <AreaTable f={f} toast={toast} pickPincode={pickPincode} />;
}

function AreaTable({ f, toast, pickPincode }) {
  const [data, setData] = useState(null);
  const key = JSON.stringify(areaOnly(f));
  useEffect(() => { setData(null); api.adminPincodes({ state: f.state, city: f.city, category: f.category }).then(setData).catch((e) => { toast(errText(e)); setData({ pincodes: [] }); }); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <Spinner />;
  const rows = (data.pincodes || []).filter((x) => !f.pincode || x.pincode === f.pincode);
  if (!rows.length) return <Empty icon="📍" title="No partners here">No partner matches these filters yet.</Empty>;
  const sum = (k) => rows.reduce((t, x) => t + (x[k] || 0), 0);
  return (
    <div className="adm-table"><table>
      <thead><tr><th>Pincode</th><th>Area · city</th><th>State</th><th>Partners</th><th>Verified</th><th>Waiting</th><th>Business Pro active</th><th>Ending in 3 days</th><th>Live offers</th></tr></thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.pincode}>
            <td><button type="button" className="link" onClick={() => pickPincode(x.pincode)}><b>{x.pincode}</b></button></td>
            <td>{[x.area, x.city].filter(Boolean).join(", ")}</td><td>{x.state}</td>
            <td>{x.partners}</td><td>{x.verified}</td><td>{x.pending ?? "–"}</td><td><b>{x.subs ?? "–"}</b></td><td>{x.ending ?? "–"}</td><td>{x.live ?? "–"}</td>
          </tr>))}
        <tr className="tot"><td>Total</td><td /><td /><td>{sum("partners")}</td><td>{sum("verified")}</td><td>{sum("pending")}</td><td>{sum("subs")}</td><td>{sum("ending")}</td><td>{sum("live")}</td></tr>
      </tbody>
    </table></div>
  );
}

const STATUS_CHIPS = [["all", "All"], ["pending", "Waiting for KYC"], ["verified", "Verified"], ["suspended", "Suspended"], ["rejected", "Rejected"], ["expiring", "Plan ending soon"]];
const planText = (b) => {
  const now = Date.now();
  if (b.planUntil && b.planUntil > now) { const d = Math.ceil((b.planUntil - now) / 86400000); return [b.plan === "expiring" ? "warn" : "ok", d <= 3 ? `Ends in ${d} day${d === 1 ? "" : "s"}` : `Active · ${d} days`]; }
  if (b.trialEndsAt && b.trialEndsAt > now) return ["ok", `Free days till ${day(b.trialEndsAt)}`];
  return ["mute", "No plan"];
};

function Partners({ f, toast, isAdmin }) {
  const [list, setList] = useState(null);
  const [chip, setChip] = useState("all");
  const [sel, setSel] = useState(null);
  const key = JSON.stringify(f);
  const load = (first = false) => { if (first) setList(null); api.adminBusinesses({ ...areaOnly(f), q: f.q }).then(setList).catch((e) => { if (first) { toast(errText(e)); setList([]); } }); };
  useLive(load, [key]);
  if (!list) return <Spinner />;
  const match = (b, c) => c === "all" || b.status === c || (c === "expiring" && b.plan === "expiring");
  const rows = list.filter((b) => match(b, chip));
  const verify = async (b) => { try { await api.setBusinessStatus(b.id, "verified", ""); toast(`${b.name} verified`); load(); } catch (e) { toast(errText(e)); } };
  return (
    <>
      <div className="adm-chips">{STATUS_CHIPS.map(([c, l]) => (
        <button key={c} type="button" className={"chip small " + (chip === c ? "on" : "")} aria-pressed={chip === c} onClick={() => setChip(c)}>{l} <b>{list.filter((b) => match(b, c)).length}</b></button>))}</div>
      {rows.length === 0 ? <Empty icon="✅" title="No partners match these filters" /> : (
        <div className="adm-table"><table>
          <thead><tr><th>Shop</th><th>Owner · phone</th><th>Category</th><th>Area</th><th>Status</th><th>Business Pro</th><th>Offers</th><th>Actions</th></tr></thead>
          <tbody>{rows.map((b) => { const [tone, ptxt] = planText(b); return (
            <tr key={b.id}>
              <td><b>{b.name}</b><div className="muted small">Joined {b.createdAt ? ago(b.createdAt) : "–"}</div></td>
              <td>{b.ownerName || "–"}<div className="muted small">{b.phone || "No number"}</div></td>
              <td>{(b.categories || [b.category]).map((c) => categoryOf(c)?.label || c).join(", ")}</td>
              <td>{[b.city, b.state].filter(Boolean).join(", ") || "–"}<div className="muted small">{[b.pincode, b.area].filter(Boolean).join(" · ")}</div></td>
              <td><span className={"pill " + (b.status === "verified" ? "p-ok" : b.status === "pending" ? "p-warn" : "p-bad")}>{b.status === "pending" ? "Waiting" : b.status}</span></td>
              <td><span className={"pill p-" + tone}>{ptxt}</span></td>
              <td>{b.liveOffers ?? 0} live · {b.pastOffers ?? 0} past</td>
              <td><div className="gap">
                {b.status === "pending" && <button type="button" className="btn main sm" onClick={() => verify(b)}>Verify</button>}
                <button type="button" className="btn ghost sm" onClick={() => setSel(b)}>{isAdmin ? "Manage" : "Open"}</button></div></td>
            </tr>); })}</tbody>
        </table></div>)}
      <div className="muted small" style={{ marginTop: 8 }}>Showing {rows.length} of {list.length} partners</div>
      {sel && <ManagePartner b={sel} isAdmin={isAdmin} toast={toast} onClose={() => setSel(null)} onDone={() => { setSel(null); load(); }} />}
    </>
  );
}

// One partner: status (verify / reject / suspend, with a note) and, for super admins, Business Pro days.
function ManagePartner({ b, isAdmin, toast, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [free, setFree] = useState(7);
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [why, setWhy] = useState("");
  const run = async (fn, msg) => { setBusy(true); try { await fn(); toast(msg); onDone(); } catch (e) { toast(errText(e)); setBusy(false); } };
  const status = (st) => run(() => api.setBusinessStatus(b.id, st, st === "verified" ? "" : note.trim()), `${b.name}: ${st}`);
  const plan = (action, extra, msg) => run(() => api.adminBusinessPlan(b.id, action, extra), msg);
  const [, ptxt] = planText(b);
  return (
    <Sheet onClose={onClose}>
      <h2 style={{ margin: "0 0 2px" }}>{b.name}</h2>
      <div className="muted small">{[b.address, b.area, b.city, b.state, b.pincode].filter(Boolean).join(", ")}</div>
      <div className="adm-sheetrow"><span>Phone</span><b>{b.phone ? <Reveal masked={b.phone} load={() => api.revealBusiness(b.id)} render={(c) => <>{prettyPhone(c.phone)} <a className="link" href={"tel:" + c.phone}>Call</a></>} /> : "No number"}</b></div>
      {b.flags?.length > 0 && <div className="adm-sheetrow"><span>Flags</span><b>{b.flags.join(" · ")}</b></div>}
      <div className="fld" style={{ marginTop: 10 }}><label>Note to the owner (when rejecting or suspending)</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="gap" style={{ flexWrap: "wrap" }}>
        {b.status !== "verified" && <button type="button" className="btn main sm" disabled={busy} onClick={() => status("verified")}>Verify</button>}
        {["pending", "verified", "suspended"].includes(b.status) && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => status("rejected")}>Reject</button>}
        {b.status === "verified" && <button type="button" className="btn ghost sm bc-danger" disabled={busy} onClick={() => status("suspended")}>Suspend</button>}
      </div>
      {isAdmin && <>
        <h3 style={{ margin: "16px 0 4px" }}>Business Pro · {ptxt}</h3>
        <div className="muted small">Payment received (UPI or cash). Days are added after the current last day; the partner gets a receipt e-mail.</div>
        <div className="adm-packs">{PLANS.owner.packs.map((p) => (
          <button key={p.days} type="button" className="btn ghost" disabled={busy} onClick={() => plan("pack", { days: p.days }, `${p.days} days added`)}>{p.days} days · {rupee(p.price)}</button>))}</div>
        <div className="gap" style={{ marginTop: 10, alignItems: "center" }}>
          <input type="number" min="1" max="365" value={free} onChange={(e) => setFree(Number(e.target.value))} aria-label="Free days" style={{ width: 90 }} />
          <button type="button" className="btn ghost sm" disabled={busy || !(free >= 1 && free <= 365)} onClick={() => plan("extendTrial", { days: free }, `${free} free days given`)}>Give free days</button>
          <button type="button" className="btn ghost sm bc-danger" disabled={busy} onClick={() => plan("end", {}, "Plan ended")}>End plan</button>
        </div>
      </>}
      {isAdmin && <>
        <h3 style={{ margin: "16px 0 4px" }}>Change category · now {categoryOf(b.category)?.label}</h3>
        <div className="muted small">Partners can't change their own category. Their live offers end; the reason is kept in the log.</div>
        <div className="gap" style={{ marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="New category" style={{ maxWidth: 200 }}>
            <option value="">New category…</option>
            {CATEGORIES.filter((c) => c.id !== b.category).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason, e.g. ticket #LP-10241" aria-label="Reason" style={{ flex: 1, minWidth: 160 }} />
          <button type="button" className="btn dark sm" disabled={busy || !newCat || why.trim().length < 3}
            onClick={() => run(async () => { const r = await api.adminChangeCategory(b.id, newCat, why.trim()); if (r.endedOffers) toast(`${r.endedOffers} live offer(s) ended`); }, `Category changed to ${categoryOf(newCat)?.label}`)}>Change category</button>
        </div>
      </>}
      <button type="button" className="btn ghost" style={{ marginTop: 14, width: "100%" }} onClick={onClose}>Close</button>
    </Sheet>
  );
}

// ---------- Settings: the app switches as square boxes ----------
const toLocal = (ms) => { if (!ms) return ""; const d = new Date(ms + 5.5 * 3600000); return d.toISOString().slice(0, 16); }; // India time
const fromLocal = (v) => (v ? new Date(v + ":00+05:30").getTime() : null);

function Settings({ toast }) {
  const { refresh } = useApp();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sched, setSched] = useState(false);
  useEffect(() => { api.adminSettings().then(setS).catch((e) => { toast(errText(e)); setS({}); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <Spinner />;
  const m = s.maintenance || { on: false, from: null, until: null, apps: ["customer", "partner"], message: "" };
  const save = async (patch, msg) => {
    setBusy(true);
    try { const r = await api.setAdminSettings(patch); setS(r); toast(msg); refresh?.(); } catch (e) { toast(errText(e)); }
    setBusy(false);
  };
  const now = Date.now();
  const windowRunning = !!m.from && m.from <= now && (!m.until || m.until > now);
  const maintOn = m.on || windowRunning;
  const apps = m.apps || [];
  const appNames = [apps.includes("customer") && "Customer app", apps.includes("partner") && "Partner app"].filter(Boolean).join(" + ") || "no app picked";
  const setApps = (a) => {
    const next = apps.includes(a) ? apps.filter((x) => x !== a) : [...apps, a];
    save({ maintenance: { ...m, apps: next } }, `Maintenance applies to: ${[next.includes("customer") && "Customer app", next.includes("partner") && "Partner app"].filter(Boolean).join(" + ") || "no app"}`);
  };
  const boxes = [
    { key: "maint", title: "Maintenance", on: maintOn, status: maintOn ? `ON · ${appNames} paused` : m.from ? `Scheduled · ${toLocal(m.from).replace("T", " ")}` : "OFF · apps working",
      text: "Shows a \"We'll be right back\" page in the apps picked below. The admin panel keeps working.",
      flip: () => (maintOn ? save({ maintenance: { endNow: true } }, "Maintenance is off") : save({ maintenance: { ...m, on: true } }, `Maintenance is on: ${appNames} paused`)), danger: true },
    { key: "pass", title: "Customer plan (Customer Pass)", on: !!s.customerPass, status: s.customerPass ? "ON · customers pay to see numbers" : "OFF · customers are free",
      text: `When ON, customers need a pass (${PLANS.customer.packs.map((p) => `${rupee(p.price)} / ${p.days} days`).join(", ")}) to see shop numbers.`,
      flip: () => save({ customerPass: !s.customerPass }, s.customerPass ? "Customer Pass is off: customers are free" : "Customer Pass is on") },
    { key: "free", title: "Free launch mode", on: !!s.freeMode, status: s.freeMode ? "ON · partners post free" : "OFF · partners need Business Pro",
      text: "When ON, every verified partner can post without paying. Turn it OFF when Business Pro payments start.",
      flip: () => save({ freeMode: !s.freeMode }, s.freeMode ? "Free launch mode is off" : "Free launch mode is on") },
    { key: "device", title: "One device at a time", on: s.singleDevice !== false, status: s.singleDevice !== false ? "ON · one login per customer" : "OFF · several devices allowed",
      text: "Logging in on a new phone logs the customer out of the old one. Partners always stay one device.",
      flip: () => save({ singleDevice: s.singleDevice === false }, s.singleDevice === false ? "One device at a time is on" : "Customers can use several devices") },
  ];
  return (
    <>
      <div className="adm-boxes">{boxes.map((b) => (
        <div key={b.key} className={"adm-box" + (b.on ? " on" : "")}>
          <div className="adm-boxtop"><b>{b.title}</b>
            <button type="button" role="switch" aria-checked={b.on} aria-label={b.title} className={"sw " + (b.on ? "on" : "")} disabled={busy} onClick={b.flip} /></div>
          <span className={"pill " + (b.on ? (b.danger ? "p-bad" : "p-ok") : "p-mute")}>{b.status}</span>
          <div className="muted small grow">{b.text}</div>
          {b.key === "maint" && <>
            <div className="gap" style={{ flexWrap: "wrap" }}>{[["customer", "Customer app"], ["partner", "Partner app"]].map(([a, l]) => (
              <button key={a} type="button" className={"chip small " + (apps.includes(a) ? "on" : "")} aria-pressed={apps.includes(a)} disabled={busy} onClick={() => setApps(a)}>{l}</button>))}</div>
            <button type="button" className="link small" style={{ textAlign: "left" }} onClick={() => setSched(!sched)}>{sched ? "Hide schedule" : "Schedule a window instead"}</button>
          </>}
        </div>))}</div>
      {sched && <MaintenanceSchedule m={m} busy={busy} save={save} />}
      <CategoryPhotos toast={toast} />
    </>
  );
}

// Home category photos: 5 per category, from R2. Tap one to replace it (shrunk to 160 px on this device first).
const PHOTO_CATS = ["food", "stay", "beauty", "makeup", "gym", "farm", "fashion", "appliances", "rentals", "ads", "other"];
function CategoryPhotos({ toast }) {
  const { config } = useApp();
  const [cat, setCat] = useState("food");
  const [busy, setBusy] = useState(0);
  const photos = config?.categoryPhotos?.[cat] || [];
  const replace = async (slot, file) => {
    if (!file) return;
    setBusy(slot);
    try { await api.adminCategoryPhoto(cat, slot, await api.categoryPhotoFrom(file)); toast(`Photo ${slot} replaced`); window.dispatchEvent(new Event("lastpick-recheck")); }
    catch (e) { toast(errText(e)); }
    setBusy(0);
  };
  return (
    <div className="adm-card" style={{ marginTop: 16 }}>
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}><b>Category photos on Home</b>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" style={{ maxWidth: 220 }}>
          {PHOTO_CATS.map((id) => <option key={id} value={id}>{id === "rentals" ? "Rentals" : categoryOf(id)?.label}</option>)}</select></div>
      <div className="muted small" style={{ margin: "6px 0 10px" }}>Each tile on Home fades through these 5 photos. Tap one to replace it. Photos are shrunk to 160 px (a few KB) and stored in R2.</div>
      {!photos.length ? <div className="muted">Photo storage isn't set up yet.</div>
        : <div className="gap" style={{ flexWrap: "wrap" }}>{photos.map((src, k) => (
          <label key={k} className={"catphoto" + (busy === k + 1 ? " is-busy" : "")} title={`Replace photo ${k + 1}`}>
            <img src={src} alt={`Photo ${k + 1}`} width="96" height="96" />
            <span>{busy === k + 1 ? "Uploading…" : `Replace ${k + 1}`}</span>
            <input type="file" accept="image/*" style={{ display: "none" }} disabled={!!busy} onChange={(e) => replace(k + 1, e.target.files?.[0])} />
          </label>))}</div>}
    </div>
  );
}

function MaintenanceSchedule({ m, busy, save }) {
  const [v, setV] = useState({ from: m.from, until: m.until, message: m.message || "" });
  return (
    <div className="panel" style={{ marginTop: 14, maxWidth: 760 }}>
      <b>Schedule maintenance (India time)</b>
      <div className="adm-filters" style={{ border: 0, padding: "8px 0 0", margin: 0 }}>
        <label>From<input type="datetime-local" value={toLocal(v.from)} onChange={(e) => setV({ ...v, from: fromLocal(e.target.value) })} /></label>
        <label>Until<input type="datetime-local" value={toLocal(v.until)} onChange={(e) => setV({ ...v, until: fromLocal(e.target.value) })} /></label>
        <label className="wide">Message (optional)<input maxLength={300} value={v.message} placeholder="Quick maintenance. Deals will be back soon." onChange={(e) => setV({ ...v, message: e.target.value })} /></label>
      </div>
      <div className="gap" style={{ marginTop: 10 }}>
        <button type="button" className="btn dark sm" disabled={busy} onClick={() => save({ maintenance: { ...m, ...v } }, "Maintenance scheduled")}>Save schedule</button>
        {(m.from || m.until) && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => save({ maintenance: { ...m, from: null, until: null } }, "Schedule cleared")}>Clear schedule</button>}
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>Customers see a warning banner up to 24 hours before. It ends by itself at "Until".</div>
    </div>
  );
}
