// Privacy, consent, terms, complaints and account deletion.
// Written to follow India's DPDP Act 2023 + DPDP Rules 2025 (notice, consent, rights, retention, grievance),
// the IT (Intermediary Guidelines) Rules 2021, the Consumer Protection (E-Commerce) Rules 2020 and Google Play's
// account-deletion policy. Template text: have a lawyer review it before launch.
import { useEffect, useState } from "react";
import { api } from "../api/index.js";
import { BackButton, NeedLogin, Sheet, Spinner } from "../components.jsx";
import { APP_NAME, CONSENT_VERSION, GRIEVANCE_TYPES, LEGAL, PLANS, RETENTION, SUPPORT_EMAIL, WEBSITE_URL } from "../lib/config.js";
import { day, errText, rupee } from "../lib/format.js";
import { navigate, useApp } from "../state.jsx";

const Back = () => <div style={{ position: "relative", height: 62 }}><BackButton /></div>;
const months = (d) => `${Math.round(d / 30)} months`;
const operator = LEGAL.operator || `${APP_NAME} (operator name to be added)`;

// What we collect and why: shown at sign-up, in the consent gate and in the full notice.
export const NOTICE_ITEMS = [
  { data: "Name, mobile number and e-mail", why: "To create your account and log you in. Businesses never get your number; they see only your name if you tap \"I'm interested\"." },
  { data: "Business details: name, address, pincode, map location, contact number (business accounts)", why: "To show your offers to customers nearby. Your business contact number is shown to logged-in customers." },
  { data: "Your location", why: "Used on your phone only, to find offers near you. We don't store it on our servers." },
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

// Unticked boxes; both must be ticked to continue (free, specific, informed consent).
export function ConsentBoxes({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <>
      <label className="toggle" style={{ cursor: "pointer", justifyContent: "flex-start", alignItems: "flex-start" }}>
        <input type="checkbox" aria-label="I am 18 or older" checked={!!value.adult} onChange={(e) => set("adult", e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
        <span className="small">I am 18 years or older.</span>
      </label>
      <label className="toggle" style={{ cursor: "pointer", justifyContent: "flex-start", alignItems: "flex-start" }}>
        <input type="checkbox" aria-label="I understand LastPick is only a platform" checked={!!value.platform} onChange={(e) => set("platform", e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
        <span className="small">I understand {APP_NAME} only connects me with businesses and people. The deal, payment and service are between us, and {APP_NAME} is not responsible for them. <a className="link" href="#/rules">How it works & rules</a></span>
      </label>
      <label className="toggle" style={{ cursor: "pointer", justifyContent: "flex-start", alignItems: "flex-start" }}>
        <input type="checkbox" aria-label="I agree to the privacy notice" checked={!!value.agree} onChange={(e) => set("agree", e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
        <span className="small">I have read the <a className="link" href="#/privacy">privacy notice</a> and <a className="link" href="#/terms">terms</a>, and I agree to {APP_NAME} using my details for the purposes listed. I can withdraw this anytime by deleting my account.</span>
      </label>
    </>
  );
}
export const consentPayload = (c) => ({ adult: !!c.adult, items: CONSENT_ITEMS });

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
      <h1 className="title">Your privacy on {APP_NAME}</h1>
      <p className="muted">Before you continue, please read what we collect and why. This is version {CONSENT_VERSION} of our notice.</p>
      <NoticeList />
      <div className="form" style={{ padding: 0 }}>
        <ConsentBoxes value={c} onChange={setC} />
        <button className="btn main" disabled={busy || !c.adult || !c.agree || !c.platform} onClick={accept}>{busy ? "Saving…" : "Agree and continue"}</button>
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
        <p><b>Service providers</b> who process data for us: Amazon Web Services (servers, database and backups, stored in AWS's Mumbai region, ap-south-1) and, once paid plans start, our payment gateway, which handles card and UPI details. We never see or store them. We share data with government agencies only when Indian law requires it.</p>
        <h2>How long we keep it</h2>
        <table className="admin small" style={{ width: "100%" }}>
          <tbody>
            {[
              ["Your account and profile", "Until you delete your account"],
              ["Live offers and their photos", "Full photo deleted when the offer ends; offer moved to history after " + R.endedOfferVisibleDays + " days"],
              ["Offer history (for businesses)", months(R.archiveDays)],
              ["Number-exchange records (contacts, leads)", months(R.leadsDays) + " (the law asks us to keep these logs for 1 year)"],
              ["Reviews", "Until you or the business deletes the account, or we remove the review"],
              ["Audit and security logs", months(R.auditDays)],
              ["Complaint tickets", `Until ${months(R.closedGrievanceDays)} after they're closed`],
            ].map(([a, b]) => <tr key={a} style={{ borderTop: "1px solid var(--line)" }}><td style={{ padding: "6px 8px 6px 0" }}><b>{a}</b></td><td className="muted">{b}</td></tr>)}
          </tbody>
        </table>
        <h2>How we protect it</h2>
        <p>All data is encrypted in transit (HTTPS/TLS) and at rest (AWS encryption). Phone numbers are never public: the database only hands them out through checked server code, with limits per user to stop scraping. Admin actions are logged. If a data breach affects you, we will tell you and the Data Protection Board of India as the law requires.</p>
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
        <h1 className="title">Terms of use & disclaimer</h1>
        <p className="muted">Version {CONSENT_VERSION}. Template text: have a lawyer review it before launch.</p>
        <div className="banner warn" style={{ margin: "0 0 12px" }}>⚠️<span>{APP_NAME} is only a platform that connects customers with businesses and people. We are not a party to any deal and take no responsibility for it. We act on providers based on reviews and reports. <a className="link" href="#/rules">Short version</a></span></div>
        <h2>1. What {APP_NAME} is</h2>
        <p>{APP_NAME} is an online platform (an intermediary under the IT Act, 2000) run by {operator}. Verified local businesses and people ("providers") post same-day offers and discounts (food, hotels, travel, salons, laundry, shops, clinics, schools and other everyday local businesses); customers nearby see them and contact the provider directly. {APP_NAME} does not sell, book, deliver, employ, treat, admit, transport, collect payment for, or guarantee anything posted.</p>
        <h2>2. The deal is between customer and provider. We take no responsibility for it</h2>
        <p>Any agreement, payment, delivery, service, treatment, admission, journey or job happens directly between the customer and the provider. {APP_NAME} is not a party to it. To the extent the law allows, {APP_NAME} is not responsible for the quality, safety, legality, accuracy or availability of anything posted, for the conduct of any user, or for any loss, injury or dispute arising from a deal. Check the provider before you pay or travel. This doesn't limit any right you have under Indian consumer law.</p>
        <h2>3. Who can use {APP_NAME}</h2>
        <p>You must be 18 or older and in India. Give true details and keep your login safe. One account per person; one business profile per account. For security, an account can be logged in on <b>one device at a time</b>: logging in on a new device logs out the previous one.</p>
        <h2>4. Rules for providers (business partners)</h2>
        <ul>
          <li>Post only genuine offers you can honour. The "normal price" must be the real price you usually charge; the offer price is the final price, with no hidden charges.</li>
          <li>Only verified businesses with an active Business Pro plan can post, up to 3 posts a day. You may post only in the category you registered (a bakery posts only bakery offers). Offers must be real discounts and are valid for that day only: they end by 11 PM and are removed at 12 midnight, and businesses can post them between 4 AM and 10:30 PM (India time). Only hotels and travel are available 24×7: they can post at any time, and their offers can run for up to 24 hours. The discount shown is worked out from the normal and offer prices. Not allowed: movie tickets, hall bookings and selling personal items.</li>
          <li>Any business may post a job opening for workers at its own shop, with the real pay. It is shown only to customers nearby (about 10 km, or the same pincode) and ends the same day. No agencies, fees from job seekers or jobs at other places.</li>
          <li>Paid features (boosted offers, sponsored banners) only make a post more visible. They don't mean {APP_NAME} checked, recommends or guarantees it.</li>
          <li>Hold the licences your work needs and follow the law: e.g. FSSAI for food; recognition or affiliation for schools and colleges, with fees and discounts stated truthfully; valid permits for bus and travel operators; labour laws (including minimum wages) for job openings.</li>
          <li>Not allowed: alcohol, tobacco, drugs, prescription medicines, weapons, explosives, gambling or lottery, adult content, wildlife, counterfeit or stolen goods, financial schemes, or anything illegal or unsafe.</li>
          <li>Use a customer's number only to reply about the request they shared it for. No spam, marketing lists or resale.</li>
          <li>Don't post, buy or arrange fake reviews, and don't offer rewards for reviews.</li>
        </ul>
        <h2>5. Rules for customers</h2>
        <p>Check an offer and the provider before paying or travelling. Never pay an advance to someone you haven't verified. Use providers' numbers only to ask about their posts. Reviews must be your own honest experience.</p>
        <h2>6. Reviews, reports and action on providers</h2>
        <p>Only customers who contacted a provider through {APP_NAME} can review it, and reviews are marked "Contacted via {APP_NAME}". Providers can reply but can't remove reviews. When a provider fails to honour a post, misleads customers, behaves badly or breaks these rules, customers can report it. We review reports, reviews and ratings and may warn the provider, hide or remove its posts, suspend or permanently remove it. We remove reviews that are fake, abusive, off-topic or contain personal information.</p>
        <h2>7. Plans and payments</h2>
        <p>There is no free version. The Customer Pass is {rupee(PLANS.customer.price)}/month and Business Pro (for verified business partners) is {rupee(PLANS.owner.price)}/month, with lower prices per month on 3, 6 and 12-month plans. See <a className="link" href="#/plans">Plans</a>. You're never charged without choosing a plan and confirming the payment, and you can cancel anytime. See the <a className="link" href="#/refund">refund policy</a>.</p>
        <h2>8. Verification, reports and removal</h2>
        <p>Verification is not a guarantee. Anyone can report an offer or review. We may remove content or suspend accounts that break these terms or the law, and we act on valid orders from courts and government agencies.</p>
        <h2>9. Complaints and law</h2>
        <p>Raise a ticket at <a className="link" href="#/grievance">Complaints</a> or e-mail our Grievance Officer at {LEGAL.grievanceEmail}. These terms follow the laws of India.</p>
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
