// Rentals: homes and workspaces. Owners post a listing for 15 or 30 days with up to 5 photos and a 1-minute
// video (sent straight to R2); customers browse Homes | Workspaces near them and call or WhatsApp the owner.
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/index.js";
import { Empty, NeedLogin, Spinner } from "../components.jsx";
import { IS_NATIVE, RENTALS, rentUnit } from "../lib/config.js";
import { errText, rupee } from "../lib/format.js";
import { Icon } from "../lib/icons.jsx";
import { navigate, useApp } from "../state.jsx";

const day = (t) => (t ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "");
const daysLeft = (t) => Math.max(0, Math.ceil((t - Date.now()) / 86400000));
const furnishLabel = (v) => RENTALS.furnishing.find(([k]) => k === v)?.[1];
const tenantLabel = (v) => RENTALS.tenant.find(([k]) => k === v)?.[1];
const priceText = (l) => `${rupee(l.rent)}${l.kind === "home" ? "/mo" : rentUnit(l.type)}`;
const sizeText = (l) => (l.size ? (/desk|library|cabin/i.test(l.type) ? `${l.size} seats` : `${l.size.toLocaleString("en-IN")} sq ft`) : "");

// ------------------------------------------------------------------ owner: My listings
export function OwnerRentals() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const { toast } = useApp();
  const load = () => api.myRentals().then(setList, (e) => setErr(errText(e)));
  useEffect(() => { load(); }, []);
  const act = async (fn, msg) => { try { await fn(); toast(msg); load(); } catch (e) { toast(errText(e)); } };
  return (
    <>
      <div className="page-h"><h1 className="title">My listings</h1><div className="muted">Homes and workspaces for rent</div></div>
      <div className="pad"><a className="btn main" href="#/owner/rentals/new">+ Post for rent</a></div>
      {err && <div className="pad"><div className="error">{err}</div></div>}
      {list == null ? <Spinner /> : !list.length
        ? <Empty icon="🏠" title="No listings yet">Post a home or workspace for 15 or 30 days. Up to 5 photos and a short video.</Empty>
        : <div className="pad rlist">{list.map((l) => (
          <div key={l.id} className="rcard own">
            <a className="rphoto" href={`#/owner/rentals/${l.id}`} style={l.cover ? { backgroundImage: `url("${l.cover}")` } : undefined} aria-label={`Edit ${l.type}`}>
              <span className={"rbadge " + l.status}>{statusText(l)}</span></a>
            <div className="rbody">
              <div className="row"><b>{l.type}{l.area ? ` · ${l.area}` : ""}</b><b className="rprice">{priceText(l)}</b></div>
              <div className="muted small">{l.views} views · {l.calls} calls{l.endsAt && l.status === "live" ? ` · till ${day(l.endsAt)}, 11:59 PM` : ""}</div>
              <div className="gap" style={{ marginTop: 8, flexWrap: "wrap" }}>
                {l.status === "live" && <button type="button" className="btn dark sm" onClick={() => act(() => api.closeRental(l.id), l.kind === "work" ? "Marked leased out" : "Marked rented out")}>{l.kind === "work" ? "Leased out" : "Rented out"}</button>}
                {l.status === "closed" && !l.mediaDeleted && l.endsAt > Date.now() && <button type="button" className="btn ghost sm" onClick={() => act(() => api.reopenRental(l.id), "Listing is live again")}>Reopen</button>}
                {(l.status === "draft" || l.status === "live" || (l.status !== "removed" && !l.mediaDeleted)) && <a className="btn ghost sm" href={`#/owner/rentals/${l.id}`}>{l.status === "draft" ? "Finish & post" : l.status === "live" ? "Edit / Renew" : "Renew"}</a>}
              </div>
              {l.status === "closed" && !l.mediaDeleted && <div className="muted small" style={{ marginTop: 6 }}>Hidden from customers. Photos and video are deleted 7 days after {day(l.closedAt)}; you can reopen it until then.</div>}
            </div>
          </div>))}</div>}
    </>
  );
}
function statusText(l) {
  if (l.status === "live") return `Live · ${daysLeft(l.endsAt)} days left`;
  if (l.status === "draft") return "Draft";
  if (l.status === "closed") return l.closedReason === "leased" ? "Leased out" : l.closedReason === "removed" ? "Removed" : "Rented out";
  if (l.status === "expired") return "Ended";
  return "Removed";
}

// ------------------------------------------------------------------ owner: post or edit a listing
export function RentalForm({ id }) {
  const { toast } = useApp();
  const [l, setL] = useState(id ? null : { kind: "home", type: "2BHK", furnishing: "semi", tenant: "family", amenities: [], photos: [], video: null });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [up, setUp] = useState(""); // upload status text
  const [days, setDays] = useState(30);
  useEffect(() => { if (id) api.myRental(id).then((x) => setL({ ...x, photos: x.photos || [], video: x.video || null }), (e) => setErr(errText(e))); }, [id]);
  if (!l) return err ? <div className="pad"><div className="error">{err}</div></div> : <Spinner />;
  const home = l.kind === "home";
  const set = (k, v) => setL((x) => ({ ...x, [k]: v }));
  const types = RENTALS.types[l.kind], amen = RENTALS.amenities[l.kind];
  const seats = /desk|library|cabin/i.test(l.type || "");
  const dayPassOk = /desk|library/i.test(l.type || "");
  const body = () => ({ kind: l.kind, type: l.type, furnishing: l.furnishing, tenant: l.tenant, rent: Number(l.rent), deposit: Number(l.deposit) || null, size: Number(l.size) || null,
    dayPass: Number(l.dayPass) || null, minLease: l.minLease || "", availableFrom: l.availableFrom || "", hours: l.hours || "", about: l.about || "", amenities: l.amenities });
  // saves the details (creates the listing the first time) and returns its id
  const save = async () => {
    if (!(Number(l.rent) > 0)) throw new Error("Enter the rent");
    const r = l.id ? await api.updateRental(l.id, body()) : await api.createRental(body());
    setL((x) => ({ ...x, ...r, photos: r.photos || x.photos, video: r.video ?? x.video }));
    if (!l.id) navigate(`/owner/rentals/${r.id}`, { replace: true });
    return r.id;
  };
  const addFiles = async (files, kind) => {
    const list = [...(files || [])];
    if (!list.length) return;
    setErr("");
    try {
      const lid = l.id || (await save());
      const room = kind === "photo" ? RENTALS.maxPhotos - l.photos.length : 1;
      const todo = list.slice(0, Math.max(0, room));
      if (!todo.length) throw new Error(kind === "photo" ? "Up to 5 photos. Remove one first." : "One video per listing.");
      for (let i = 0; i < todo.length; i++) {
        const label = kind === "photo" ? `Uploading photo ${i + 1} of ${todo.length}` : "Uploading video";
        setUp(`${label}…`);
        const m = await api.addRentalMedia(lid, todo[i], kind, (p) => setUp(`${label}… ${p}%`));
        setL((x) => ({ ...x, photos: m.photos, video: m.video }));
      }
    } catch (e) { setErr(errText(e)); }
    setUp("");
  };
  const removeMedia = async (mid) => { try { const m = await api.removeRentalMedia(l.id, mid); setL((x) => ({ ...x, photos: m.photos, video: m.video })); } catch (e) { setErr(errText(e)); } };
  const saveOnly = async () => { setSaving(true); setErr(""); try { await save(); toast("Saved"); } catch (e) { setErr(errText(e)); } setSaving(false); };
  const post = async () => {
    setSaving(true); setErr("");
    try {
      const lid = await save();
      if (!l.photos.length) throw new Error("Add at least one photo.");
      await api.publishRental(lid, days);
      toast("Your listing is live");
      navigate("/owner/rentals");
    } catch (e) { setErr(errText(e)); }
    setSaving(false);
  };
  const live = l.status === "live";
  const pack = RENTALS.packs.find((p) => p.days === days);
  const busy = saving || !!up;
  return (
    <>
      <div className="page-h"><h1 className="title">{l.id ? (live ? "Edit listing" : "Finish your listing") : "Post for rent"}</h1></div>
      <div className="form">
        {!l.id && <div className="seg2" role="tablist">{[["home", "Homes"], ["work", "Workspaces"]].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={l.kind === k} className={l.kind === k ? "on" : ""} onClick={() => setL((x) => ({ ...x, kind: k, type: RENTALS.types[k][k === "home" ? 2 : 1], amenities: [] }))}>{t}</button>))}</div>}
        <div className="fld"><label>Type</label><div className="chips wrap">{types.map((t) => (
          <button key={t} type="button" className={"chip " + (l.type === t ? "on" : "")} aria-pressed={l.type === t} onClick={() => set("type", t)}>{t}</button>))}</div></div>
        {home && <>
          <div className="fld"><label>Furnishing</label><div className="seg3">{RENTALS.furnishing.map(([k, t]) => (
            <button key={k} type="button" className={l.furnishing === k ? "on" : ""} aria-pressed={l.furnishing === k} onClick={() => set("furnishing", k)}>{t}</button>))}</div></div>
          <div className="fld"><label>Rent to</label><div className="seg3">{RENTALS.tenant.map(([k, t]) => (
            <button key={k} type="button" className={l.tenant === k ? "on" : ""} aria-pressed={l.tenant === k} onClick={() => set("tenant", k)}>{t}</button>))}</div></div>
        </>}
        <div className="grid2">
          <div className="fld"><label>{home ? "Rent ₹ / month" : `Rent ₹ ${rentUnit(l.type)}`}</label><input inputMode="numeric" value={l.rent || ""} onChange={(e) => set("rent", e.target.value.replace(/\D/g, ""))} placeholder="14000" /></div>
          <div className="fld"><label>{seats ? "Seats" : "Size (sq ft)"}</label><input inputMode="numeric" value={l.size || ""} onChange={(e) => set("size", e.target.value.replace(/\D/g, ""))} placeholder={seats ? "40" : "1100"} /></div>
          <div className="fld"><label>Deposit ₹</label><input inputMode="numeric" value={l.deposit || ""} onChange={(e) => set("deposit", e.target.value.replace(/\D/g, ""))} placeholder="50000" /></div>
          {home ? <div className="fld"><label>Available from</label><input maxLength={40} value={l.availableFrom || ""} onChange={(e) => set("availableFrom", e.target.value)} placeholder="1 Dec" /></div>
            : dayPassOk ? <div className="fld"><label>Day pass ₹</label><input inputMode="numeric" value={l.dayPass || ""} onChange={(e) => set("dayPass", e.target.value.replace(/\D/g, ""))} placeholder="199" /></div>
              : <div className="fld"><label>Minimum lease</label><input maxLength={40} value={l.minLease || ""} onChange={(e) => set("minLease", e.target.value)} placeholder="11 months" /></div>}
        </div>
        {!home && <div className="fld"><label>Opening hours <span className="muted">(optional)</span></label><input maxLength={60} value={l.hours || ""} onChange={(e) => set("hours", e.target.value)} placeholder="8 AM – 10 PM" /></div>}
        <div className="fld"><label>Amenities</label><div className="chips wrap">{amen.map((a) => { const on = l.amenities.includes(a); return (
          <button key={a} type="button" className={"chip " + (on ? "on" : "")} aria-pressed={on} onClick={() => set("amenities", on ? l.amenities.filter((x) => x !== a) : [...l.amenities, a])}>{a}</button>); })}</div></div>
        <div className="fld"><label>About <span className="muted">(optional)</span></label><textarea rows={3} maxLength={1000} value={l.about || ""} onChange={(e) => set("about", e.target.value)} placeholder={home ? "East facing, 2nd floor, near the bus stop" : "Fast Wi-Fi, quiet, near the metro"} /></div>

        <div className="fld"><label>Photos <span className="muted">({l.photos.length} of {RENTALS.maxPhotos})</span></label>
          <div className="rphotos">
            {l.photos.map((p, k) => (
              <div key={p.id} className="rthumb" style={{ backgroundImage: `url("${p.url}")` }}>{k === 0 && <span>Cover</span>}
                <button type="button" aria-label="Remove photo" disabled={busy} onClick={() => removeMedia(p.id)}>×</button></div>))}
            {l.photos.length < RENTALS.maxPhotos && <label className={"rthumb add" + (busy ? " is-busy" : "")}>+
              <input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={busy} onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} /></label>}
          </div>
          <span className="hint">Up to 5 photos. Each is shrunk to under 1 MB on your phone before upload.</span></div>
        <div className="fld"><label>Video <span className="muted">(optional · up to 1 minute, 20 MB)</span></label>
          {l.video
            ? <div className="rvideo"><video src={l.video.url} controls preload="metadata" /><button type="button" className="btn ghost sm" disabled={busy} onClick={() => removeMedia(l.video.id)}>Remove video</button></div>
            : <label className={"btn ghost" + (busy ? " is-busy" : "")} style={{ cursor: "pointer" }}>Add a walk-through video
              <input type="file" accept="video/*" style={{ display: "none" }} disabled={busy} onChange={(e) => { addFiles(e.target.files, "video"); e.target.value = ""; }} /></label>}
          <span className="hint">Video too large? Record in 720p in your camera settings, or <a href="#/help/compress">see how to compress it</a>.</span></div>
        {up && <div className="upbar" role="status"><span className="spin" aria-hidden="true" /> {up}</div>}
        {err && <div className="error">{err}</div>}

        {live
          ? <div className="card"><b>Live till {day(l.endsAt)}, 11:59 PM</b><div className="muted small">Renew below to add more days after that.</div></div>
          : null}
        <div className="fld"><label>{live ? "Renew for" : "Show this listing for"}</label>
          <div className="grid2">{RENTALS.packs.map((p) => (
            <button key={p.days} type="button" className={"packbtn " + (days === p.days ? "on" : "")} aria-pressed={days === p.days} onClick={() => setDays(p.days)}><b>{p.days} days</b><span>{rupee(p.price)}</span></button>))}</div>
          <span className="hint">Counted from today (Day 1); ends at 11:59 PM on the last day. {IS_NATIVE ? "Pay once, securely with Google Play." : "Pay once, securely with Razorpay."}</span></div>
        <div className="gap">
          {l.id && <button type="button" className="btn ghost" disabled={busy} onClick={saveOnly}>{saving ? "Saving…" : "Save"}</button>}
          <button type="button" className="btn main" disabled={busy} onClick={post}>{saving ? "Posting…" : live ? `Renew · ${rupee(pack.price)}` : `Post listing · ${rupee(pack.price)}`}</button>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ customers: Rentals near me
export function RentalsPage() {
  const { location, place } = useApp();
  const [kind, setKind] = useState("home");
  const [type, setType] = useState("");
  const [max, setMax] = useState(0);
  const [amen, setAmen] = useState([]);
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const lat = location?.lat, lng = location?.lng;
  useEffect(() => {
    if (lat == null) return;
    setList(null); setErr("");
    api.rentalsNear(lat, lng, kind).then(setList, (e) => setErr(errText(e)));
  }, [lat, lng, kind]);
  const shown = useMemo(() => (list || []).filter((l) => (!type || l.type === type) && (!max || l.rent <= max) && amen.every((a) => l.amenities.includes(a))), [list, type, max, amen]);
  const budgets = kind === "home" ? [[0, "Any budget"], [8000, "Up to ₹8k"], [15000, "Up to ₹15k"], [25000, "Up to ₹25k"], [50000, "Up to ₹50k"]]
    : [[0, "Any budget"], [1000, "Up to ₹1k"], [5000, "Up to ₹5k"], [25000, "Up to ₹25k"], [100000, "Up to ₹1 lakh"]];
  return (
    <>
      <div className="page-h"><h1 className="title">Rentals near you</h1><div className="muted">{place?.region ? `Within 30 km of ${place.region}` : "Within 30 km"}</div></div>
      <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="seg2" role="tablist">{[["home", "Homes"], ["work", "Workspaces"]].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); setType(""); setMax(0); setAmen([]); }}>{t}</button>))}</div>
        <div className="chips wrap">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" className="chipsel"><option value="">Type: Any</option>{RENTALS.types[kind].map((t) => <option key={t}>{t}</option>)}</select>
          <select value={max} onChange={(e) => setMax(Number(e.target.value))} aria-label="Budget" className="chipsel">{budgets.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          {(kind === "home" ? ["Parking", "Power backup"] : ["Wi-Fi", "AC"]).map((a) => { const on = amen.includes(a); return (
            <button key={a} type="button" className={"chip small " + (on ? "on" : "")} aria-pressed={on} onClick={() => setAmen(on ? amen.filter((x) => x !== a) : [...amen, a])}>{a}</button>); })}
        </div>
      </div>
      {lat == null ? <Empty icon="📍" title="Turn on location">Rentals are shown near you. Allow location to see them.</Empty>
        : err ? <div className="pad"><div className="error">{err}</div></div>
          : list == null ? <Spinner />
            : !shown.length ? <Empty icon="🏠" title={list.length ? "Nothing matches these filters" : `No ${kind === "home" ? "homes" : "workspaces"} listed near you yet`}>{list.length ? "Try a higher budget or fewer filters." : "New listings appear here as owners post them."}</Empty>
              : <div className="pad rlist">{shown.map((l) => <RentalCard key={l.id} l={l} />)}</div>}
    </>
  );
}

function RentalCard({ l }) {
  const badge = l.kind === "home" ? tenantLabel(l.tenant) : l.dayPass ? `Day pass ${rupee(l.dayPass)}` : l.minLease ? `Min. ${l.minLease}` : "";
  return (
    <a className="rcard" href={`#/rental/${l.id}`}>
      <div className="rphoto" style={l.cover ? { backgroundImage: `url("${l.cover}")` } : undefined}>
        {badge && <span className="rbadge">{badge}</span>}
        <span className="rbadge light">{l.photoCount || 0} photos{l.hasVideo ? " · video" : ""}</span>
      </div>
      <div className="rbody">
        <div className="row"><b>{l.type}{l.kind === "home" && l.furnishing ? `, ${furnishLabel(l.furnishing).toLowerCase()}` : ""}</b><b className="rprice">{priceText(l)}</b></div>
        <div className="muted small">{[l.area, l.km != null ? `${l.km} km` : "", sizeText(l), l.deposit ? `Deposit ${rupee(l.deposit)}` : ""].filter(Boolean).join(" · ")}</div>
        {l.amenities.length > 0 && <div className="muted small">{l.amenities.join(" · ")}</div>}
      </div>
    </a>
  );
}

// ------------------------------------------------------------------ customers: one listing
export function RentalDetail({ id }) {
  const [l, setL] = useState(null);
  const [err, setErr] = useState("");
  const [i, setI] = useState(0);
  useEffect(() => { api.rental(id).then(setL, (e) => setErr(errText(e))); }, [id]);
  if (err) return <Empty icon="🏠" title="This listing has ended" action={<a className="btn main" href="#/rentals">See other rentals</a>}>{err}</Empty>;
  if (!l) return <Spinner />;
  const photos = l.photos || [];
  return (
    <>
      <div className="rgallery">
        {photos.length ? <img src={photos[i]?.url} alt={`${l.type} photo ${i + 1}`} /> : <div className="rgallery-empty"><Icon d="venue" size={48} /></div>}
        {photos.length > 1 && <div className="rdots">{photos.map((p, k) => <button key={p.id} type="button" aria-label={`Photo ${k + 1}`} className={k === i ? "on" : ""} onClick={() => setI(k)} />)}</div>}
      </div>
      <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row"><h1 className="title" style={{ margin: 0 }}>{l.type}</h1><b className="rprice" style={{ fontSize: 20 }}>{priceText(l)}</b></div>
        <div className="muted">{[l.area, l.city, l.pincode].filter(Boolean).join(", ")}</div>
        <div className="rfacts">
          {l.kind === "home" && l.furnishing && <span>{furnishLabel(l.furnishing)}</span>}
          {l.kind === "home" && l.tenant && <span>For {tenantLabel(l.tenant).toLowerCase()}</span>}
          {sizeText(l) && <span>{sizeText(l)}</span>}
          {l.deposit ? <span>Deposit {rupee(l.deposit)}</span> : null}
          {l.dayPass ? <span>Day pass {rupee(l.dayPass)}</span> : null}
          {l.minLease && <span>Min. lease {l.minLease}</span>}
          {l.availableFrom && <span>From {l.availableFrom}</span>}
          {l.hours && <span>{l.hours}</span>}
        </div>
        {l.amenities.length > 0 && <div className="chips wrap">{l.amenities.map((a) => <span key={a} className="chip small">{a}</span>)}</div>}
        {l.about && <p style={{ margin: 0, lineHeight: 1.5 }}>{l.about}</p>}
        {l.video && <video className="rvid" src={l.video.url} controls preload="metadata" />}
        <NeedLogin why="Log in to contact the owner"><ContactOwner l={l} /></NeedLogin>
        <div className="muted small">Listed by {l.owner}. LastPick doesn't take any brokerage; deal directly with the owner. Visit the place before paying anything.</div>
      </div>
    </>
  );
}

function ContactOwner({ l }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");
  const get = async () => { try { setC(await api.rentalContact(l.id)); } catch (e) { setErr(errText(e)); } };
  if (err) return <div className="error">{err}</div>;
  if (!c) return <button type="button" className="btn main" onClick={get}>Show owner's number</button>;
  if (!c.phone) return <div className="muted">The owner hasn't added a number.</div>;
  const msg = encodeURIComponent(`Hi, I saw your ${l.type} on LastPick. Is it still available?`);
  return (
    <div className="grid2">
      <a className="btn dark" href={`tel:${c.phone}`}>Call owner</a>
      {c.whatsapp && <a className="btn ghost" href={`https://wa.me/91${String(c.phone).replace(/\D/g, "").slice(-10)}?text=${msg}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
    </div>
  );
}
