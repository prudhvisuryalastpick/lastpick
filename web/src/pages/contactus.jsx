// Contact LastPick: one screen with every way to reach the team.
// Partners see "Request a call back" first (easiest for busy shop owners); customers see "Send us a message" first.
import { useEffect, useState } from "react";
import { api } from "../api/index.js";
import { Sheet } from "../components.jsx";
import { APP_NAME, IS_OWNER_APP, SUPPORT_EMAIL, SUPPORT_HOURS } from "../lib/config.js";
import { ago, errText, prettyPhone } from "../lib/format.js";
import { Icon } from "../lib/icons.jsx";
import { navigate, useApp } from "../state.jsx";
import { PageHead } from "./impact.jsx";

const TOPICS = IS_OWNER_APP ? ["Plans and payments", "Business verification", "Posting offers", "Something else"] : ["An offer or shop", "Plans and payments", "My account", "Something else"];
const TIMES = ["Morning", "Afternoon", "Evening"];

// The "Need help?" card on the home pages
export function ContactCard({ style }) {
  return (
    <a className="contactcard" href="#/get-help" style={style}>
      <span className="ccic"><Icon d="headset" size={22} stroke={2} /></span>
      <span style={{ flex: 1, minWidth: 0 }}><b>Need help? {IS_OWNER_APP ? "Talk to" : "Contact"} {APP_NAME}</b><small>{IS_OWNER_APP ? "Call back · Message · E-mail" : "Message · E-mail · Call back"}</small></span>
      <span className="chev" aria-hidden="true">›</span>
    </a>
  );
}

export function ContactUs() {
  const { session, profile, toast } = useApp();
  const [mine, setMine] = useState(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (session) api.myCallback().then(setMine).catch(() => setMine(null)); else setMine(null); }, [session]);
  const callOpt = (
    <button key="call" className="copt" onClick={() => (session ? setOpen(true) : navigate("/login?next=%2Fget-help"))}>
      <span className="ccic" style={{ background: "#E1F5EE", color: "#085041" }}><Icon d="callback" size={21} stroke={2} /></span>
      <span><b>Request a call back</b><small>We call you within 1 working day</small></span>
    </button>
  );
  const msgOpt = (
    <a key="msg" className="copt" href="#/support">
      <span className="ccic" style={{ background: "#EEEDFE", color: "#3C3489" }}><Icon d="chat" size={21} stroke={2} /></span>
      <span><b>Send us a message</b><small>Get a ticket number · replies here in the app</small></span>
    </a>
  );
  const mailOpt = (
    <a key="mail" className="copt" href={`mailto:${SUPPORT_EMAIL}`}>
      <span className="ccic" style={{ background: "#E6F1FB", color: "#0C447C" }}><Icon d="mail" size={21} stroke={2} /></span>
      <span><b>E-mail</b><small>{SUPPORT_EMAIL}</small></span>
    </a>
  );
  return (
    <>
      <PageHead title={`Contact ${APP_NAME}`} sub={`${SUPPORT_HOURS} · resolved in 1–5 working days`} />
      <div className="pad" style={{ display: "grid", gap: 10, paddingTop: 4 }}>
        {mine && (
          <div className="cbwait">
            <Icon d="callback" size={20} stroke={2} />
            <span><b>We'll call you{profile?.phone ? ` on ${prettyPhone(profile.phone)}` : ""}</b><small>{mine.topic} · {mine.bestTime} · asked {ago(mine.createdAt)}</small></span>
          </div>
        )}
        {IS_OWNER_APP ? [callOpt, msgOpt, mailOpt] : [msgOpt, mailOpt, callOpt]}
        <p className="muted small" style={{ margin: "4px 2px 0" }}>For formal complaints, use <a className="link" href="#/grievance">Complaints</a>.</p>
      </div>
      {open && <CallbackSheet onClose={() => setOpen(false)} onDone={(c) => { setMine(c); setOpen(false); toast?.("Done. We'll call you soon."); }} />}
    </>
  );
}

function CallbackSheet({ onClose, onDone }) {
  const { profile } = useApp();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [bestTime, setBestTime] = useState(TIMES[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    setBusy(true); setErr("");
    try {
      await api.requestCallback({ topic, bestTime, note, role: IS_OWNER_APP ? "partner" : "customer" });
      onDone({ topic, bestTime, createdAt: Date.now() });
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="title" style={{ fontSize: 19 }}>We'll call you</h2>
      <div className="cbl">Number</div>
      <div className="cbnum">{profile?.phone ? `${prettyPhone(profile.phone)} (your registered number)` : <>No number yet. <a className="link" href="#/account">Add it in Account</a></>}</div>
      <div className="cbl">What is it about?</div>
      <div className="chips" style={{ padding: 0 }}>{TOPICS.map((t) => <button key={t} className={"chip " + (topic === t ? "on" : "")} onClick={() => setTopic(t)}>{t}</button>)}</div>
      <div className="cbl">Best time to call</div>
      <div className="chips" style={{ padding: 0 }}>{TIMES.map((t) => <button key={t} className={"chip " + (bestTime === t ? "on" : "")} onClick={() => setBestTime(t)}>{t}</button>)}</div>
      <div className="fld" style={{ marginTop: 10 }}><label htmlFor="cb-note">Anything to add? (optional)</label>
      <textarea id="cb-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="btn dark" style={{ width: "100%", marginTop: 12 }} disabled={busy || !profile?.phone} onClick={send}>{busy ? "Sending…" : "Request call back"}</button>
      <p className="muted small center" style={{ margin: "8px 0 0" }}>{SUPPORT_HOURS}</p>
    </Sheet>
  );
}
