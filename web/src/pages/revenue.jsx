// Ways LastPick earns as a platform, besides Customer Pass and Business Pro:
//   BoostSheet       partner app: feature one offer at the top of customers' home screens for 6/12/24 hours
//   SponsoredBanner  customer app: the paid banner the LastPick team sold for this city
//   AdminRevenue     admin panel: this month's revenue, boosts waiting for payment, banners
import { useEffect, useState } from "react";
import { api } from "../api/index.js";
import { Empty, Sheet, Spinner } from "../components.jsx";
import { APP_NAME, BOOST_PRICES, PAY_UPI } from "../lib/config.js";
import { Icon } from "../lib/icons.jsx";
import { ago, day, errText, rupee, timeLeft } from "../lib/format.js";
import { useApp } from "../state.jsx";

// ------------------------------------------------------------------ partner: boost an offer
export function BoostSheet({ offer, onClose, onDone }) {
  const { toast } = useApp();
  const [hours, setHours] = useState(12);
  const [busy, setBusy] = useState(false);
  const price = BOOST_PRICES[hours];
  const go = async () => {
    setBusy(true);
    try {
      const b = await api.boostOffer(offer.id, hours);
      toast(b.status === "active" ? "Boosted! Your offer is featured now" : "Boost requested. It starts when we confirm your payment.");
      onDone?.(); onClose();
    } catch (e) { toast(errText(e)); setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="title" style={{ fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}><Icon d="rocket" size={22} stroke={2} />Boost this offer</h2>
      <p className="muted" style={{ marginTop: 6 }}>"{offer.title}" is shown at the top of customers' home screens near you, with a <b>Featured</b> label. The boost ends when the offer ends.</p>
      <div className="planopts" style={{ padding: 0, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 12 }}>
        {Object.entries(BOOST_PRICES).map(([h, p]) => (
          <button key={h} className={"planopt" + (hours === Number(h) ? " on" : "")} onClick={() => setHours(Number(h))}>
            <div className="m">{h} hours</div>
            <div className="p">{rupee(p)}</div>
            <div className="pm">about {rupee(Math.round(p / Number(h)))}/hour</div>
          </button>
        ))}
      </div>
      {<div className="box small" style={{ marginTop: 12 }}>Pay <b>{rupee(price)}</b> {PAY_UPI ? <>by UPI to <b>{PAY_UPI}</b></> : `to ${APP_NAME}`} with your business name in the note. We switch the boost on as soon as we confirm the payment.</div>}
      <button className="btn main" style={{ marginTop: 14 }} disabled={busy} onClick={go}>
        <Icon d="rocket" size={18} stroke={2.2} />{busy ? "Sending…" : `Request boost · ${rupee(price)}`}
      </button>
      <div className="note">A boost only makes your offer more visible. It must still be a genuine offer you will honour.</div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ customer: sponsored banner
export function SponsoredBanner() {
  const { city } = useApp();
  const [list, setList] = useState([]);
  useEffect(() => { api.banners(city?.key).then(setList).catch(() => setList([])); }, [city?.key]);
  if (!list.length) return null;
  const b = list[0];
  const inner = (
    <>
      <span className="spi"><Icon d="megaphone" size={22} stroke={2} /></span>
      <span className="spt"><span className="sp-tag">Sponsored · {b.advertiser}</span><b>{b.title}</b>{b.subtitle && <span>{b.subtitle}</span>}</span>
      {b.offerId && <Icon d="chevRight" size={20} stroke={2} />}
    </>
  );
  return b.offerId ? <a className="sponsor" href={"#/offer/" + b.offerId}>{inner}</a> : <div className="sponsor">{inner}</div>;
}

// ------------------------------------------------------------------ admin: revenue
export function AdminRevenue({ toast }) {
  const [rev, setRev] = useState(null);
  const [pending, setPending] = useState(null);
  const [live, setLive] = useState([]);
  const [banners, setBanners] = useState([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ title: "", subtitle: "", advertiser: "", city: "", days: 7, price: 1500, offerId: "" });
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api.revenue(), api.adminBoosts("pending"), api.adminBoosts("active"), api.adminBanners()])
    .then(([r, p, l, b]) => { setRev(r); setPending(p); setLive(l.filter((x) => x.live)); setBanners(b); })
    .catch((e) => setErr(errText(e)));
  useEffect(() => { load(); }, []);
  const decide = async (b, action) => {
    try { await api.decideBoost(b.id, action, action === "approve" ? "Payment confirmed" : "Not paid"); toast(action === "approve" ? "Boost is live" : "Boost rejected"); load(); }
    catch (e) { toast(errText(e)); }
  };
  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.createBanner({ ...form, days: Number(form.days), price: Number(form.price), offerId: form.offerId.trim() || null }); toast("Banner is live"); setForm({ ...form, title: "", subtitle: "", advertiser: "", offerId: "" }); load(); }
    catch (x) { toast(errText(x)); }
    setBusy(false);
  };
  const stop = async (b) => { try { await api.stopBanner(b.id); toast("Banner stopped"); load(); } catch (e) { toast(errText(e)); } };
  if (err) return <Empty icon="⛔" title="Couldn't load revenue">{err}</Empty>;
  if (!rev) return <Spinner />;
  const s = rev.subscriptions;
  return (
    <>
      <div className="plan" style={{ margin: "8px 16px 12px", padding: 18 }}>
        <div style={{ opacity: .8, fontSize: 13 }}>Revenue this month</div>
        <div className="amt" style={{ fontSize: 36 }}>{rupee(rev.totalThisMonth)}</div>
        <div style={{ opacity: .85, fontSize: 12.5 }}>Plan sales {rupee(s.customerPass.soldThisMonth + s.businessPro.soldThisMonth)} · boosts {rupee(rev.boosts.paid)} · banners {rupee(rev.banners.sold)}</div>
        <div style={{ opacity: .85, fontSize: 12.5, marginTop: 4 }}>Monthly recurring from active plans: <b>{rupee(s.mrr)}</b>/month</div>
      </div>
      <div className="kpis" style={{ marginTop: 12 }}>
        <div className="kpi"><div className="n">{rupee(s.customerPass.soldThisMonth)}</div><div className="l">Customer Pass: {s.customerPass.soldCount} sold this month · {s.customerPass.active} active · {rupee(s.customerPass.mrr)}/month</div></div>
        <div className="kpi"><div className="n">{rupee(s.businessPro.soldThisMonth)}</div><div className="l">Business Pro: {s.businessPro.soldCount} sold this month · {s.businessPro.active} active · {rupee(s.businessPro.mrr)}/month</div></div>
        <div className="kpi"><div className="n">{rupee(rev.boosts.paid)}</div><div className="l">{rev.boosts.paidCount} paid boosts · {rev.boosts.live} live now</div></div>
        <div className="kpi"><div className="n">{rupee(rev.banners.sold)}</div><div className="l">{rev.banners.soldCount} banners sold · {rev.banners.live} live now</div></div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}><b>Active paid plans by length</b>
        <table className="admin" style={{ marginTop: 8 }}><thead><tr><th style={{ textAlign: "left" }}>Plan</th>{[1, 3, 6, 12].map((m) => <th key={m}>{m} mo</th>)}</tr></thead>
          <tbody>{[["Customer Pass", "customerPass", "customer"], ["Business Pro", "businessPro", "owner"]].map(([label, k, p]) => (
            <tr key={k}><td>{label}</td>{[1, 3, 6, 12].map((m) => <td key={m} style={{ textAlign: "center" }}>{s[k].byMonths[m]}<div className="muted small">{rupee(s.prices[p][m])}</div></td>)}</tr>))}</tbody></table>
        <div className="muted small" style={{ marginTop: 6 }}>Sales are recorded when you activate a plan (Plans tab, or a business's plan) after the customer pays. Monthly recurring = each active plan's price ÷ its months.</div>
      </div>
      <div className="sect"><h3>Boosts waiting for payment</h3><span className="muted small">{Object.entries(rev.boosts.prices).map(([h, p]) => `${h} h ${rupee(p)}`).join(" · ")}</span></div>
      {!pending ? <Spinner /> : pending.length === 0 ? <div className="panel small muted">Nothing waiting. When a partner requests a boost, confirm their payment (e.g. UPI) here to switch it on.</div>
        : pending.map((b) => (
          <div className="item" key={b.id}>
            <span className="ic" style={{ background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center" }}><Icon d="rocket" size={22} stroke={2} /></span>
            <div className="grow"><b className="ellipsis" style={{ display: "block", fontSize: 14 }}>{b.businessName} · {rupee(b.price)}</b>
              <div className="muted small ellipsis">{b.offerTitle}</div><div className="muted small">{b.hours} hours · asked {ago(b.createdAt)}</div></div>
            <button className="btn main sm" onClick={() => decide(b, "approve")}>Paid ✓</button>
            <button className="btn ghost sm" onClick={() => decide(b, "reject")}>Reject</button>
          </div>
        ))}
      {live.length > 0 && <><div className="sect"><h3>Live boosts</h3></div>
        {live.map((b) => <div className="item" key={b.id}><div className="grow"><b style={{ fontSize: 14 }}>{b.businessName}</b><div className="muted small ellipsis">{b.offerTitle}</div></div>
          <span className="pill p-ok">{b.paidBy === "launch_free" ? "Free" : rupee(b.price)} · {timeLeft(b.endsAt - Date.now())} left</span></div>)}</>}

      <div className="sect"><h3>Sponsored banners</h3></div>
      {banners.length === 0 ? <div className="panel small muted">No banners yet. Sell the home-screen banner in a city to a business or brand.</div>
        : banners.map((b) => (
          <div className="item" key={b.id}>
            <div className="grow"><b className="ellipsis" style={{ display: "block", fontSize: 14 }}>{b.title}</b>
              <div className="muted small">{b.advertiser} · {b.cityKey || "all cities"} · {rupee(b.price)} · till {day(b.endsAt)}</div></div>
            {b.live ? <button className="btn ghost sm" onClick={() => stop(b)}>Stop</button> : <span className="pill p-mute">Ended</span>}
          </div>
        ))}
      <form className="form panel" style={{ margin: "4px 16px 12px", padding: 14 }} onSubmit={create}>
        <b>New banner</b>
        <div className="fld"><label>Title</label><input maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Grand opening: 30% off all week" /></div>
        <div className="fld"><label>Line below (optional)</label><input maxLength={140} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></div>
        <div className="two">
          <div className="fld"><label>Advertiser</label><input maxLength={80} value={form.advertiser} onChange={(e) => setForm({ ...form, advertiser: e.target.value })} placeholder="Business name" /></div>
          <div className="fld"><label>City (empty = all)</label><input maxLength={60} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Bengaluru" /></div>
        </div>
        <div className="two">
          <div className="fld"><label>Days</label><input type="number" min="1" max="90" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></div>
          <div className="fld"><label>Price ₹ (what they pay)</label><input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        </div>
        <div className="fld"><label>Open this offer when tapped (offer id, optional)</label><input value={form.offerId} onChange={(e) => setForm({ ...form, offerId: e.target.value })} /></div>
        <button className="btn main" disabled={busy}>{busy ? "Saving…" : "Put banner live"}</button>
      </form>
      <div className="note pad" style={{ paddingTop: 0 }}>Everything here comes from records: plan sales, paid boosts and sold banners. Once the payment gateway is live, its payments are added automatically.</div>
    </>
  );
}
