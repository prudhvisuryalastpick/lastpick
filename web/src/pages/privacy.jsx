// Privacy, consent, terms, complaints and account deletion.
// Written to follow India's DPDP Act 2023 + DPDP Rules 2025 (notice, consent, rights, retention, grievance),
// the IT (Intermediary Guidelines) Rules 2021, the Consumer Protection (E-Commerce) Rules 2020 and Google Play's
// account-deletion policy. Template text: have a lawyer review it before launch.
import { useEffect, useRef, useState } from "react";
import { api } from "../api/index.js";
import { BackButton, NeedLogin, Sheet, Spinner } from "../components.jsx";
import { APP_NAME, CONSENT_VERSION, GRIEVANCE_TYPES, LEGAL, PLANS, RETENTION, SUPPORT_EMAIL, WEBSITE_URL } from "../lib/config.js";
import { day, errText, rupee } from "../lib/format.js";
import { TERMS_SECTIONS, TERMS_TITLE, sha256Hex, termsText } from "../lib/terms.js";
import { navigate, useApp } from "../state.jsx";

const Back = () => <div style={{ position: "relative", height: 62 }}><BackButton /></div>;
const months = (d) => `${Math.round(d / 30)} months`;
const operator = LEGAL.operator || `${APP_NAME} (operator name to be added)`;

// What we collect and why: shown at sign-up, in the consent gate and in the full notice.
export const NOTICE_ITEMS = [
  { data: "Name, mobile number and e-mail", why: "To create your account and log you in. Your e-mail is checked with an e-mailed code. Businesses never get your number; they see only your name if you tap \"I'm interested\"." },
  { data: "Business details: name, address, pincode, map location, contact number (business accounts)", why: "To show your offers to customers nearby. Your business contact number is shown to logged-in customers." },
  { data: "Your location", why: "Needed to show offers within 30 km of you. Sent only rounded to about 1 km to find offers, and to OpenStreetMap to show your area name and pincode. We don't store it." },
  { data: "Activity: offers you open or contact, numbers you share, reviews and reports", why: "For your contacts list, a business's leads, reviews, and to stop fraud and misuse." },
  { data: "Technical data: app error reports and server logs", why: "To keep the service secure and fix crashes." },
];
const CONSENT_ITEMS = ["account", "number-exchange", "business-listing", "activity-logs", "error-reports", "platform-only", "one-device-login"];

function NoticeList() {
  return (
    <div className="panel" style={{ margin: "10px 0" }}>
      {NOTICE_ITEMS.map((n) => <div key={n.data} style={{ padding: "6px 0" }}><b className="small">{n.data}</b><div className="muted small">{n.why}</div></div>)}
      <div className="muted small" style={{ paddingTop: 6 }}>We don't sell your data or show ads. Full details: <a className="link" href="#/privacy">Privacy notice</a>.</div>
    </div>
  );
}

// The full Terms and Conditions in a scrolling box. Calls onRead({ text, hash }) once the reader reaches the end.
export function TermsBox({ onRead, read, title = TERMS_TITLE, sections = TERMS_SECTIONS, getText = termsText }) {
  const ref = useRef(null);
  const [pct, setPct] = useState(0);
  const done = useRef(false);
  const check = async () => {
    const el = ref.current;
    if (!el || done.current) return;
    const max = el.scrollHeight - el.clientHeight;
    setPct(max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100)));
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      done.current = true;
      const text = getText();
      onRead({ text, hash: await sha256Hex(text) });
    }
  };
  useEffect(() => { check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="termsbox-wrap">
      <div className="termsbox-head"><b>{title}</b><span className="muted small">Version {CONSENT_VERSION}</span></div>
      <div className="termsbox" ref={ref} onScroll={check} tabIndex={0} aria-label="Terms and Conditions (scroll to read all of it)">
        <TermsBody sections={sections} />
        <p className="muted small" style={{ marginTop: 16 }}>End of the document. Our <a className="link" href="#/privacy" target="_blank" rel="noreferrer">Privacy notice</a> is part of these Terms.</p>
      </div>
      <div className={"termsbox-foot" + (read ? " ok" : "")}>{read ? "✓ You have read the whole document" : `Scroll to the end to continue · ${pct}% read`}</div>
    </div>
  );
}
function TermsBody({ sections = TERMS_SECTIONS }) {
  return sections.map(([h, parts]) => (
    <section key={h}>
      <h3>{h}</h3>
      {parts.map((p, i) => (Array.isArray(p) ? <ul key={i}>{p.map((b) => <li key={b}>{b}</li>)}</ul> : <p key={i}>{p}</p>))}
    </section>
  ));
}

// Unticked boxes; all must be ticked to continue (free, specific, informed consent). The agreement box unlocks only
// after the whole Terms document has been scrolled through.
export function ConsentBoxes({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <>
      <TermsBox read={!!value.read} onRead={(doc) => onChange({ ...value, read: true, doc })} />
      <label className="toggle" style={{ cursor: "pointer", justifyContent: "flex-start", alignItems: "flex-start" }}>
        <input type="checkbox" aria-label="I am 18 or older" checked={!!value.adult} onChange={(e) => set("adult", e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
        <span className="small">I am 18 years or older.</span>
      </label>
      <label className="toggle" style={{ cursor: "pointer", justifyContent: "flex-start", alignItems: "flex-start" }}>
        <input type="checkbox" aria-label="I understand LastPick is only a platform" checked={!!value.platform} onChange={(e) => set("platform", e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
        <span className="small">I understand {APP_NAME} only connects me with businesses and people. The deal, payment and service are between us, and {APP_NAME} is not responsible for them. <a className="link" href="#/rules">How it works & rules</a></span>
      </label>
      <label className="toggle" style={{ cursor: "pointer", justifyContent: "flex-start", alignItems: "flex-start" }}>
        <input type="checkbox" aria-label="I agree to the Terms and Conditions" disabled={!value.read} checked={!!value.agree && !!value.read} onChange={(e) => set("agree", e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
        <span className="small">{value.read ? "" : "(Read the whole document above first.) "}I have read the entire {APP_NAME} Terms and Conditions above and the <a className="link" href="#/privacy">Privacy notice</a>, and I agree to them. I can withdraw by deleting my account.</span>
      </label>
    </>
  );
}
export const consentPayload = (c) => ({ adult: !!c.adult, items: CONSENT_ITEMS, readFull: !!c.read, docText: c.doc?.text, docHash: c.doc?.hash });

// Shown to anyone logged in who hasn't accepted the current notice (new accounts, older accounts, after a notice change).
export function ConsentGate() {
  const { refresh, toast } = useApp();
  const [c, setC] = useState({ adult: false, agree: false, platform: false });
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try { await api.recordConsent("user", consentPayload(c)); await refresh(); toast("Thanks. You can change this anytime in Account → Privacy."); }
    catch (e) { toast(errText(e)); setBusy(false); }
  };
  return (
    <div className="pad" style={{ paddingTop: 30 }}>
      <h1 className="title">Terms and privacy</h1>
      <p className="muted">Before you continue, please read the {APP_NAME} Terms and Conditions (version {CONSENT_VERSION}) to the end, and what we collect and why.</p>
      <NoticeList />
      <div className="form" style={{ padding: 0 }}>
        <ConsentBoxes value={c} onChange={setC} />
        <button className="btn main" disabled={busy || !c.adult || !c.agree || !c.platform || !c.read} onClick={accept}>{busy ? "Saving…" : "Agree and continue"}</button>
        <div className="gap" style={{ justifyContent: "space-between" }}>
          <a className="link small" href="#/account/privacy">Delete my account instead</a>
          <button className="link small" onClick={async () => { await api.signOut(); navigate("/"); }}>Log out</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Privacy notice
export function Privacy() {
  const R = RETENTION;
  return (
    <>
      <Back />
      <div className="legal">
        <h1 className="title">Privacy notice</h1>
        <p className="muted">Version {CONSENT_VERSION}. Written for India's Digital Personal Data Protection Act, 2023 and Rules, 2025. Template text: have a lawyer review it before launch.</p>
        <h2>Who we are</h2>
        <p>{APP_NAME} is run by {operator}{LEGAL.address ? `, ${LEGAL.address}` : ""}. We are the "Data Fiduciary" for the personal data described here. {APP_NAME} is available in India only and is for people aged 18 or older.</p>
        <h2>What we collect, and why</h2>
        <NoticeList />
        <h2>Who can see or receive your data</h2>
        <p><b>Businesses</b> never get your number. They see only your name, and only if you tap "I'm interested" on their offer. <b>Customers</b> who are logged in can see a business's contact number. Reviews show your first name only.</p>
        <p><b>Service providers</b> who process data for us: Supabase (servers, database and backups, stored in its Mumbai region, India), Cloudflare (delivers the website and app pages securely), Brevo (sends code and account e-mails), and, once paid plans start, our payment gateway, which handles card and UPI details. We never see or store them. We share data with government agencies only when Indian law requires it.</p>
        <h2>How long we keep it</h2>
        <table className="admin small" style={{ width: "100%" }}>
          <tbody>
            {[
              ["Your account and profile", "Until you delete your account"],
              ["Live offers and their photos", "Removed from the app as soon as the offer ends (by 11 PM); a short summary stays in the partner's history"],
              ["Offer history (for businesses)", months(R.archiveDays)],
              ["Number-exchange records (contacts, leads)", months(R.leadsDays) + " (the law asks us to keep these logs for 1 year)"],
              ["Reviews", "Until you or the business deletes the account, or we remove the review"],
              ["Audit and security logs", months(R.auditDays)],
              ["Complaint tickets", `Until ${months(R.closedGrievanceDays)} after they're closed`],
            ].map(([a, b]) => <tr key={a} style={{ borderTop: "1px solid var(--line)" }}><td style={{ padding: "6px 8px 6px 0" }}><b>{a}</b></td><td className="muted">{b}</td></tr>)}
          </tbody>
        </table>
        <h2>How we protect it</h2>
        <p>All data is encrypted in transit (HTTPS/TLS) and at rest (encrypted storage at Supabase). Phone numbers are never public: the database only hands them out through checked server code, with limits per user to stop scraping. Admin actions are logged. If a data breach affects you, we will tell you and the Data Protection Board of India as the law requires.</p>
        <h2>Your rights</h2>
        <ul>
          <li><b>See your data:</b> Account → Privacy → Download my data.</li>
          <li><b>Correct it:</b> edit your details in Account or Business profile.</li>
          <li><b>Erase it and withdraw consent:</b> Account → Privacy → Delete my account, or <a className="link" href="#/delete-account">{WEBSITE_URL.replace(/^https?:\/\//, "")}/#/delete-account</a>. Withdrawing consent is as easy as giving it.</li>
          <li><b>Nominate someone</b> to use these rights if you die or can't act: e-mail our Grievance Officer.</li>
          <li><b>Complain:</b> raise a ticket at <a className="link" href="#/grievance">Complaints</a>. If you're not satisfied with our answer, you can complain to the Data Protection Board of India.</li>
        </ul>
        <h2>Grievance Officer</h2>
        <GrievanceOfficer />
      </div>
    </>
  );
}

function GrievanceOfficer() {
  return (
    <div className="box small">
      <div><b>{LEGAL.grievanceOfficer || "Grievance Officer (name to be added)"}</b></div>
      <div>E-mail: <a className="link" href={"mailto:" + LEGAL.grievanceEmail}>{LEGAL.grievanceEmail}</a>{LEGAL.grievancePhone ? ` · Phone: ${LEGAL.grievancePhone}` : ""}</div>
      {LEGAL.address && <div>Address: {LEGAL.address}</div>}
      <div className="muted">We acknowledge complaints within 24 hours and resolve them within 15 days.</div>
    </div>
  );
}

// ------------------------------------------------------------------ Terms
export function Terms() {
  return (
    <>
      <Back />
      <div className="legal">
        <h1 className="title">{TERMS_TITLE}</h1>
        <p className="muted">Version {CONSENT_VERSION}. Template text: have a lawyer review it before launch.</p>
        <div className="banner warn" style={{ margin: "0 0 12px" }}>⚠️<span>{APP_NAME} is only a platform that connects customers with businesses. We are not a party to any deal and take no responsibility for it. <a className="link" href="#/rules">Short version</a></span></div>
        <TermsBody />
        <p className="muted small">Questions about these Terms: <a className="link" href="#/contact">Contact us</a> · <a className="link" href="#/privacy">Privacy notice</a> · <a className="link" href="#/refund">Refund policy</a></p>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Contact (e-commerce rules: legal name, address, grievance officer)
export function Contact() {
  const missing = !LEGAL.operator || !LEGAL.address || !LEGAL.grievanceOfficer;
  return (
    <>
      <Back />
      <div className="legal">
        <h1 className="title">Contact us</h1>
        {missing && <div className="banner warn" style={{ margin: "0 0 12px" }}>Before launch, add your legal name, address and Grievance Officer in .env.production (VITE_LEGAL_NAME, VITE_LEGAL_ADDRESS, VITE_GRIEVANCE_OFFICER, VITE_GRIEVANCE_PHONE).</div>}
        <h2>Who runs {APP_NAME}</h2>
        <p>{operator}{LEGAL.address ? <><br />{LEGAL.address}</> : null}<br />Website: {WEBSITE_URL}</p>
        <h2>Support</h2>
        <p>E-mail <a className="link" href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>. We usually reply within 2 working days.</p>
        <h2>Complaints (Grievance Officer)</h2>
        <GrievanceOfficer />
        <p style={{ marginTop: 10 }}><a className="btn ghost sm" href="#/grievance">Raise a complaint ticket</a></p>
        <h2>Report an offer or review</h2>
        <p>Open it and tap "Report". Our team reviews every report.</p>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Complaints / grievance tickets
export function Grievance() {
  const { session } = useApp();
  return (
    <>
      <Back />
      <div className="page-h" style={{ paddingTop: 0 }}><h1 className="title">Complaints</h1>
        <div className="muted">Every complaint gets a ticket number. We acknowledge within 24 hours and resolve within 15 days.</div></div>
      <div className="pad" style={{ paddingTop: 0 }}><GrievanceOfficer /></div>
      {session ? <GrievanceForm /> : <div className="pad"><a className="btn main" href={`#/login?next=${encodeURIComponent("/grievance")}`}>Log in to raise a ticket</a>
        <div className="note">Or e-mail {LEGAL.grievanceEmail} with your registered e-mail address.</div></div>}
    </>
  );
}
function GrievanceForm() {
  const { toast } = useApp();
  const [f, setF] = useState({ type: GRIEVANCE_TYPES[0], subject: "", details: "" });
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(null);
  const load = () => api.myGrievances().then(setMine).catch(() => setMine([]));
  useEffect(() => { load(); }, []);
  const send = async () => {
    setBusy(true);
    try { const r = await api.submitGrievance(f); toast(`Ticket ${r.ticket} raised. We'll reply within 24 hours.`); setF({ ...f, subject: "", details: "" }); load(); }
    catch (e) { toast(errText(e)); }
    setBusy(false);
  };
  const label = { open: "Received", acknowledged: "Being worked on", resolved: "Resolved", rejected: "Closed" };
  return (
    <>
      <div className="form" style={{ paddingTop: 0 }}>
        <div className="fld"><label>About</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{GRIEVANCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="fld"><label>Subject</label><input maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
        <div className="fld"><label>What happened?</label><textarea rows="4" maxLength={2000} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder="Include the offer or business name, dates, and what you'd like us to do." /></div>
        <button className="btn main" disabled={busy || f.subject.trim().length < 3 || f.details.trim().length < 10} onClick={send}>{busy ? "Sending…" : "Raise ticket"}</button>
      </div>
      <div className="label-up">Your tickets</div>
      {!mine ? <Spinner /> : mine.length === 0 ? <div className="muted pad" style={{ paddingTop: 6 }}>No tickets yet.</div> : mine.map((g) => (
        <div className="panel" key={g.ticket}>
          <div className="row"><b>{g.subject}</b><span className={"pill " + (g.status === "resolved" ? "p-ok" : g.status === "rejected" ? "p-mute" : "p-warn")}>{label[g.status] || g.status}</span></div>
          <div className="muted small">Ticket {g.ticket} · {g.type}{g.createdAt ? " · " + day(g.createdAt) : ""}</div>
          {g.reply && <div className="box small" style={{ marginTop: 8 }}><b>Our reply:</b> {g.reply}</div>}
        </div>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ Privacy centre: download, delete
export function PrivacyCenter() {
  return <NeedLogin why="Log in to manage your data"><PrivacyCenterInner /></NeedLogin>;
}
function PrivacyCenterInner() {
  const { profile, business, toast } = useApp();
  const [busy, setBusy] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const download = async () => {
    setBusy("export");
    try {
      const data = await api.exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `lastpick-my-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("Your data was downloaded");
    } catch (e) { toast(errText(e)); }
    setBusy("");
  };
  const remove = async () => {
    setBusy("delete");
    try { await api.deleteMyAccount(); toast("Your account was deleted"); navigate("/", { replace: true }); }
    catch (e) { toast(errText(e)); setBusy(""); }
  };
  return (
    <>
      <Back />
      <div className="page-h" style={{ paddingTop: 0 }}><h1 className="title">Privacy & your data</h1>
        <div className="muted">{profile?.consentVersion ? `You accepted privacy notice version ${profile.consentVersion}.` : "You haven't accepted the privacy notice yet."}</div></div>
      <div>
        <a className="menu-item" href="#/privacy">🔏 Read the privacy notice<span className="chev">›</span></a>
        <a className="menu-item" href="#/account">✏️ Correct your details<span className="chev">›</span></a>
        <button className="menu-item" disabled={!!busy} onClick={download}>⬇️ {busy === "export" ? "Preparing…" : "Download my data"}<span className="chev">›</span></button>
        <a className="menu-item" href="#/grievance">🧾 Raise a complaint<span className="chev">›</span></a>
        <button className="menu-item" style={{ color: "var(--bad)" }} onClick={() => setDeleting(true)}>🗑️ Delete my account (withdraw consent)<span className="chev">›</span></button>
      </div>
      {deleting && (
        <Sheet onClose={() => setDeleting(false)}>
          <h2 className="title" style={{ fontSize: 19 }}>Delete your account?</h2>
          <p className="muted small">This can't be undone. We delete your login, profile, contacts list, shared numbers and reviews{business ? ", and your business, its offers, leads, reviews and history" : ""}.
            As Indian law requires, a minimal record of number exchanges, consents and complaints is kept for 1 year for security and legal purposes, then deleted.</p>
          <div className="fld"><label className="small">Type DELETE to confirm</label><input aria-label="Type DELETE" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
          <div className="gap" style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => setDeleting(false)}>Keep account</button>
            <button className="btn danger" disabled={typed !== "DELETE" || busy === "delete"} onClick={remove}>{busy === "delete" ? "Deleting…" : "Delete forever"}</button></div>
        </Sheet>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Public account-deletion page (link this in Play Console → Data safety)
export function DeleteAccountInfo() {
  const { session } = useApp();
  return (
    <>
      <Back />
      <div className="legal">
        <h1 className="title">Delete your {APP_NAME} account</h1>
        <p>You can delete your {APP_NAME} or {APP_NAME} Business account and its data at any time. You don't need to reinstall the app.</p>
        <h2>How</h2>
        <ol>
          <li>{session ? "You're logged in. Tap the button below." : "Log in below with the e-mail and password of the account."}</li>
          <li>Go to Privacy & your data → Delete my account, type DELETE and confirm.</li>
        </ol>
        <p>{session ? <a className="btn danger" href="#/account/privacy">Delete my account</a> : <a className="btn main" href={`#/login?next=${encodeURIComponent("/account/privacy")}`}>Log in to delete</a>}</p>
        <p className="muted small">Can't log in? E-mail {LEGAL.grievanceEmail} from your registered e-mail address with the subject "Delete my account". We'll do it within 7 days.</p>
        <h2>What is deleted</h2>
        <p>Your login, profile, phone number, contacts list, shared numbers and reviews; for businesses also the business profile, contact number, offers, photos, leads, reviews and offer history. This happens right away; copies in backups expire within 7 days.</p>
        <h2>What is kept, and for how long</h2>
        <p>A minimal audit record (which account exchanged numbers with which offer, and when), your consent records and any open complaint ticket are kept for up to 1 year for security and legal purposes, as India's DPDP Rules 2025 require, and then deleted.</p>
      </div>
    </>
  );
}
