// Welcome, sign-in with a one-time code (mobile SMS or e-mail), password login for older accounts,
// and the one-time "complete your profile" step with consent for new accounts.
import { Brand } from "../lib/brand.jsx";
import { useEffect, useRef, useState } from "react";
import { api, isLive } from "../api/index.js";
import { DEMO_ACCOUNTS } from "../api/index.js";
import { Sheet, SocialLinks, Spinner } from "../components.jsx";
import { CATEGORIES, APP_NAME, IS_ADMIN_APP, IS_OWNER_APP, OTP_LOGIN, PLANS } from "../lib/config.js";
import { errText, indianPhone, mobileProblem, prettyPhone, rupee, typePhone, validPhone } from "../lib/format.js";
import { navigate, useApp } from "../state.jsx";
import { ConsentBoxes, NOTICE_ITEMS, consentPayload } from "./privacy.jsx";
import { Icon, catStyle } from "../lib/icons.jsx";

export const markWelcomed = () => { try { localStorage.setItem("lastpick-welcomed", "1"); } catch { /* ignore */ } };
// partner sign-up: the business type chosen on the form, used to fill in the business details next
export const BIZ_TYPE_KEY = "lastpick-signup-biztype";
export const welcomed = () => { try { return localStorage.getItem("lastpick-welcomed") === "1"; } catch { return true; } };

// Opening animation for the customer app: radar rings, deal cards floating in, the categories locals post in.
const CFLOAT = [
  { cat: "stay", t: "Room for tonight", s: "Ends in 5 h · 3.4 km", o: "-47%", style: { left: 0, top: 10 } },
  { cat: "food", t: "Cakes at closing", s: "1.2 km · 7 left", o: "-50%", style: { right: 0, top: 36, animationDelay: ".8s" } },
  { cat: "beauty", t: "Salon slots today", s: "4 – 8 PM · 0.8 km", o: "-50%", style: { left: 0, bottom: 0, animationDelay: "1.6s" } },
  { cat: "travel", t: "Bus seats tonight", s: "Leaves 10:45 PM", o: "-43%", style: { right: 0, bottom: -14, animationDelay: ".4s" } },
];
const TRAIL = ["food", "stay", "travel", "beauty", "makeup", "fashion", "appliances", "shops"];

export function Welcome() {
  const { customersFree } = useApp();
  const go = (to) => { markWelcomed(); navigate(to, { replace: true }); };
  if (IS_OWNER_APP) return <OwnerWelcome go={go} />;
  return (
    <div className="welcome cwel">
      <Brand light style={{ animation: "fadeUp .5s ease both" }} />
      <div className="radar" aria-hidden="true">
        <span className="ring" /><span className="ring r2" /><span className="core"><Icon d="place" size={40} stroke={1.8} /></span>
        {CFLOAT.map((f) => {
          const st = catStyle(f.cat);
          return <div key={f.t} className="floatcard" style={f.style}><span className="fi" style={{ background: st.tint, color: st.ink }}><Icon d={st.icon} size={20} stroke={2} /></span><i>{f.o}</i><b>{f.t}</b><span>{f.s}</span></div>;
        })}
      </div>
      <div style={{ marginTop: "auto", animation: "fadeUp .6s ease .2s both" }}>
        <span className="giftpill"><Icon d="clock" size={14} stroke={2.2} />Every deal is for today only</span>
        <h1>Deals from local businesses, near you.</h1>
        <p className="lead2">Same-day discounts from local food places, hotels, travel, salons, laundries, shops and more. Every offer ends within 24 hours. Call the owner directly; every rupee stays local.</p>
        <div className="cattrail">{TRAIL.map((c, i) => <span key={c} style={{ animationDelay: `${0.5 + i * 0.08}s` }}><Icon d={catStyle(c).icon} size={14} stroke={2.2} />{catStyle(c).short}</span>)}</div>
        <p className="fine">{customersFree ? "Free for customers. No pass, nothing to pay." : `${PLANS.customer.name}: ${rupee(PLANS.customer.price)} for 30 days, or less on longer plans.`}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20, animation: "fadeUp .6s ease .35s both" }}>
        <button className="btn main" onClick={() => go("/login")}>Get started</button>
        <button className="btn line" onClick={() => go("/")}>Look around first</button>
      </div>
    </div>
  );
}

// Partner app opening animation: the same style as the customer app's, in the partner colours, with what a partner gets.
const PFLOAT = [
  { icon: "user", tint: "#FFEAD5", ink: "#9A3412", t: "3 customers interested", s: "Cakes at closing · today", o: "New", style: { left: 0, top: 10 } },
  { icon: "stay", tint: "#E0F2FE", ink: "#075985", t: "Room filled tonight", s: "Posted at 6 PM", o: "Sold", style: { right: 0, top: 36, animationDelay: ".8s" } },
  { icon: "eye", tint: "#EDE9FE", ink: "#5B21B6", t: "146 views today", s: "Customers within 30 km", o: "+38", style: { left: 0, bottom: 0, animationDelay: "1.6s" } },
  { icon: "shield", tint: "#DCFCE7", ink: "#166534", t: "Verified partner", s: "Checked by LastPick", o: "✔", style: { right: 0, bottom: -14, animationDelay: ".4s" } },
];
function OwnerWelcome({ go }) {
  return (
    <div className="welcome cwel pwel">
      <Brand light style={{ animation: "fadeUp .5s ease both" }} />
      <div className="radar" aria-hidden="true">
        <span className="ring" /><span className="ring r2" /><span className="core"><Icon d="store" size={40} stroke={1.8} /></span>
        {PFLOAT.map((f) => <div key={f.t} className="floatcard" style={f.style}><span className="fi" style={{ background: f.tint, color: f.ink }}><Icon d={f.icon} size={20} stroke={2} /></span><i>{f.o}</i><b>{f.t}</b><span>{f.s}</span></div>)}
      </div>
      <div style={{ marginTop: "auto", animation: "fadeUp .6s ease .2s both" }}>
        <span className="giftpill"><Icon d="shield" size={14} stroke={2.2} />Verified local partners only</span>
        <h1>Fill today's empty slots, today.</h1>
        <p className="lead2">Post what's left today: rooms, tables, seats, salon chairs, closing-time stock. Customers within 30 km see it and call you directly. No commission on your sales.</p>
        <div className="cattrail">{TRAIL.map((c, i) => <span key={c} style={{ animationDelay: `${0.5 + i * 0.08}s` }}><Icon d={catStyle(c).icon} size={14} stroke={2.2} />{catStyle(c).short}</span>)}</div>
        <p className="fine">{PLANS.owner.name}: from {rupee(PLANS.owner.packs[0].price)} for {PLANS.owner.packs[0].days} days.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20, animation: "fadeUp .6s ease .35s both" }}>
        <button className="btn main" onClick={() => go("/login?start=signup")}>Register your business</button>
        <button className="btn line" onClick={() => go("/login")}>I have an account · Log in</button>
      </div>
    </div>
  );
}
// ------------------------------------------------------------------ Sign in
export function Login({ next = "/", start }) {
  const { session, profile, toast, refresh, config, customersFree } = useApp();
  // Log in: e-mail or mobile + password; sign up with an e-mail code (Amazon SES).
  // WhatsApp login (mobile + WhatsApp code) is kept and used only when the server switches it on.
  const WA = !IS_ADMIN_APP && !!config?.whatsappLogin;
  const [step, setStep] = useState(start === "signup" && !IS_ADMIN_APP ? "signup" : WA || OTP_LOGIN ? "enter" : "password"); // enter | code | password | reset | signup
  useEffect(() => { if (WA && step === "password") setStep("enter"); }, [WA]); // eslint-disable-line react-hooks/exhaustive-deps
  const [method, setMethod] = useState("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [wait, setWait] = useState(0);
  const [sentTo, setSentTo] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetSentAt, setResetSentAt] = useState(0); // forgot password: code e-mailed, now enter code + new password
  const codeRef = useRef();
  // why the user was logged out (e.g. logged in on another device): shown once
  const [reason] = useState(() => { try { const r = localStorage.getItem("lastpick-logout-reason"); localStorage.removeItem("lastpick-logout-reason"); return r || ""; } catch { return ""; } });
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { if (step === "code") setTimeout(() => codeRef.current?.focus(), 50); }, [step]);

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [consent, setConsent] = useState({ adult: false, agree: false });
  const [bizType, setBizType] = useState(() => { try { return localStorage.getItem(BIZ_TYPE_KEY) || ""; } catch { return ""; } });
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  // the e-mail code at sign-up has a 10-minute expiry and a 30-second resend wait
  const [emailSentAt, setEmailSentAt] = useState(0);
  // mobile check at sign-up with a code on WhatsApp (or SMS): only when the server says it's switched on
  const [phoneSkipped, setPhoneSkipped] = useState(false); // server couldn't send the WhatsApp code: e-mail code only
  const phoneWanted = !!config?.phoneCodes; // mobile must be checked too (WhatsApp/SMS code)
  const phoneOn = phoneWanted && !phoneSkipped;
  const viaWa = config?.phoneChannel === "whatsapp";
  const phoneWord = viaWa ? "WhatsApp" : "SMS";
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSentAt, setPhoneSentAt] = useState(0);
  const [password2, setPassword2] = useState("");
  const [waOk, setWaOk] = useState(false); // agreed to get codes and account messages on WhatsApp
  // "Is this your correct mobile number?" asked once before the code is sent
  const [askMobile, setAskMobile] = useState(false);
  const mobileOk = useRef("");
  // partner app: the owner's profile photo is required (KYC)
  const [photo, setPhoto] = useState("");
  const pickPhoto = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return setErr("Please choose a photo");
    try { setPhoto(await api.profilePhotoFrom(file)); setErr(""); } catch { setErr("Couldn't read that photo. Try another one."); }
  };
  if (session && profile && !profile.needsProfile) { setTimeout(() => navigate(next || "/", { replace: true }), 0); return <Spinner />; }

  const target = method === "phone" ? prettyPhone(indianPhone(phone) || phone) : email.trim();
  const send = async (e) => {
    e?.preventDefault(); setErr("");
    if (method === "phone" && !validPhone(phone)) return setErr("Please enter a valid Indian mobile number");
    if (method === "email" && !/^\S+@\S+\.\S+$/.test(email)) return setErr("Please enter a valid e-mail address");
    setBusy(true);
    try {
      const r = method === "phone" ? await api.sendPhoneOtp(phone) : await api.sendEmailOtp(email.trim());
      setSentTo(r?.to || ""); setCode(""); setStep("code"); setWait(30);
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };
  const verify = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true); setErr("");
    try {
      const r = method === "phone" ? await api.verifyPhoneOtp(phone, c) : await api.verifyEmailOtp(email.trim(), c);
      await refresh();
      markWelcomed();
      toast(r.isNew ? "Verified. Just a few details and you're in." : "Welcome back!");
    } catch (x) { setErr(errText(x)); setCode(""); }
    setBusy(false);
  };
  const passwordLogin = async (e) => {
    e.preventDefault(); setErr("");
    // e-mail OR 10-digit Indian mobile number
    const id = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(id) && !validPhone(id)) return setErr("Enter your e-mail or 10-digit mobile number");
    setBusy(true);
    try {
      if (step === "reset" && !resetSent) {
        // forgot password, step 1: a 6-digit code to the e-mail (for a mobile number: to the e-mail on that account)
        const r = await api.sendResetCode(id); setResetSent(true); setResetSentAt(Date.now()); setCode(""); setPassword("");
        setSentTo(r?.to || id);
        toast(`We sent a 6-digit code to ${r?.to || id}`);
      } else if (step === "reset") {
        // step 2: code + new password -> password changed, other devices logged out, logged in here
        if (!/^\d{6}$/.test(code.trim())) { setBusy(false); return setErr("Enter the 6-digit code from the e-mail"); }
        if (password.length < 8) { setBusy(false); return setErr("New password must be at least 8 characters"); }
        await api.resetPassword(id, code.trim(), password);
        markWelcomed(); setResetSent(false); toast("Password changed. You're logged in.");
      } else { await api.signIn(id, password); markWelcomed(); toast("Welcome back!"); }
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };
  const signUp = async (e) => {
    e?.preventDefault(); setErr(""); let skippedNow = false;
    if (name.trim().length < 2) return setErr("Enter your name");
    if (mobileProblem(mobile)) return setErr(mobileProblem(mobile));
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("Enter a valid e-mail");
    if (password.length < 8) return setErr("Password must be at least 8 characters");
    if (password2 !== password) return setErr("Passwords don't match. Type the same password in both boxes.");
    if (IS_OWNER_APP && !photo) return setErr("Please add your profile photo");
    if (phoneWanted && viaWa && !waOk) return setErr("Please tick the WhatsApp box to get your code on WhatsApp");
    if (IS_OWNER_APP && !bizType) return setErr("Choose your business type");
    if (!consent.adult || !consent.agree || !consent.platform) return setErr("Please tick all the boxes to continue");
    try { if (IS_OWNER_APP) localStorage.setItem(BIZ_TYPE_KEY, bizType); } catch { /* ignore */ }
    if (!codeSent && mobileOk.current !== mobile.replace(/\D/g, "")) { setAskMobile(true); return; }
    setBusy(true);
    try {
      if (!codeSent) {
        // step 1: a 6-digit code to the e-mail (if e-mail codes aren't switched on, the account is created straight away).
        // A mobile number already registered is refused before any code is sent.
        const sent = await api.sendEmailOtp(email).then(() => true).catch((x) => { if (/switched on/i.test(errText(x))) return false; throw x; });
        if (sent) setEmailSentAt(Date.now());
        // and an SMS code to the mobile (when switched on)
        if (phoneOn) {
          try { const r = await api.sendSmsOtp(mobile, waOk); if (r?.skipped) { setPhoneSkipped(true); skippedNow = true; } else setPhoneSentAt(Date.now()); }
          catch (x) { setBusy(false); return setErr(errText(x)); }
        }
        if (sent || phoneOn) {
          setCodeSent(true);
          toast(sent && phoneOn && !skippedNow ? `We sent a code to your e-mail and a ${phoneWord} code to your mobile` : sent ? `We sent a 6-digit code to ${email.trim()}` : `We sent a ${phoneWord} code to your mobile`);
          setBusy(false); return;
        }
      } else {
        if (emailSentAt && !/^\d{6}$/.test(otp.trim())) { setBusy(false); return setErr("Enter the 6-digit code from the e-mail"); }
        if (phoneOn && !/^\d{6}$/.test(phoneCode.trim())) { setBusy(false); return setErr(`Enter the 6-digit code from ${viaWa ? "WhatsApp" : "the SMS"}`); }
      }
      await api.signUp({ email, password, name: name.trim(), phone: mobile, consent: consentPayload(consent), otp: otp.trim(), phoneOtp: phoneOn ? phoneCode.trim() : undefined, photo: IS_OWNER_APP ? photo : undefined, waOptIn: phoneWanted && viaWa ? waOk : undefined });
      markWelcomed(); toast(IS_OWNER_APP ? "Account created. Now register your business." : "Account created. Welcome!");
      await refresh();
      if (IS_OWNER_APP) navigate("/owner/business");
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };
  const demoLogin = async (a) => { setBusy(true); try { await api.signIn(a.email, a.password); markWelcomed(); } catch (x) { setErr(errText(x)); } setBusy(false); };

  return (
    <div className="auth">
      <div id="otp-captcha" />
      <div className="row">
        <button className="back" style={{ position: "static" }} aria-label="Back" onClick={() => (step === "enter" || !(OTP_LOGIN || WA) ? navigate(IS_OWNER_APP || IS_ADMIN_APP ? "/login" : "/") : setStep("enter"))}>‹</button>
        {!IS_ADMIN_APP && <span className="gap" style={{ gap: 8, alignItems: "center" }}>
          <SocialLinks className="pill-icons" />
          <span className="trialpill">{IS_OWNER_APP ? "🛡️ Verified partners only" : "⏱️ Deals for today only"}</span>
        </span>}
      </div>
      <Brand style={{ marginTop: 16 }} />

      {step === "enter" && <>
        <h1>{IS_OWNER_APP ? "LastPick Partner" : `Welcome to ${APP_NAME}`}</h1>
        <p className="lead">{IS_OWNER_APP ? "Turn empty rooms, halls, seats, slots and leftover stock into sales. Log in or sign up with your mobile number." : "Log in or create an account with your mobile number. We send a 6-digit code on WhatsApp. No password to remember."}</p>
        {!WA && <div className="tabs" role="tablist" aria-label="Sign in with" style={{ margin: "24px 0 0" }}>
          <button role="tab" aria-selected={method === "phone"} className={method === "phone" ? "on" : ""} onClick={() => { setMethod("phone"); setErr(""); }}>Mobile number</button>
          <button role="tab" aria-selected={method === "email"} className={method === "email" ? "on" : ""} onClick={() => { setMethod("email"); setErr(""); }}>E-mail</button>
        </div>}
        <form onSubmit={send} style={{ marginTop: 18, animation: "fadeUp .35s ease both" }} key={method}>
          {method === "phone" ? <>
            <label htmlFor="otp-phone" className="small" style={{ fontWeight: 600, color: "var(--muted)" }}>Mobile number</label>
            <div className="bigfield"><b style={{ fontSize: 17 }}>+91</b><span style={{ width: 1, height: 26, background: "var(--line)" }} />
              <input id="otp-phone" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={typePhone(phone)} onChange={(e) => setPhone(typePhone(e.target.value))} placeholder="98765 43210" /></div>
            <div className="note">{WA ? "We'll send a 6-digit code to this number on WhatsApp. New here? Your account is created when you enter the code." : "We'll e-mail a 6-digit code to the address on your account."}</div>
          </> : <>
            <label htmlFor="otp-email" className="small" style={{ fontWeight: 600, color: "var(--muted)" }}>E-mail address</label>
            <div className="bigfield"><span aria-hidden="true">✉️</span>
              <input id="otp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
            <div className="note">We'll e-mail you a 6-digit code.</div>
          </>}
          {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
          <button className="btn main" style={{ marginTop: 18 }} disabled={busy}>{busy ? "Sending…" : "Send code →"}</button>
        </form>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
          <div className="trust"><span className="ti" style={{ background: "var(--ok-soft)" }}>🛡️</span><div><b style={{ fontSize: 14 }}>Your number stays private</b><div className="muted small">A business sees it only when you tap "Share my number".</div></div></div>
          <div className="trust"><span className="ti" style={{ background: "var(--brand-soft)" }}>💳</span><div><b style={{ fontSize: 14 }}>{IS_OWNER_APP ? `${PLANS.owner.tagline} · just ${PLANS.owner.perPost}` : customersFree ? "Free for customers" : `${PLANS.customer.tagline} · just ${PLANS.customer.perDay}`}</b><div className="muted small">{IS_OWNER_APP ? "After we verify your business. Post up to 3 offers a day in your own category." : customersFree ? "No pass and nothing to pay. Just log in and call." : "Nothing is charged without asking you."}</div></div></div>
        </div>
        {!WA && <button className="link small" style={{ marginTop: 22, alignSelf: "center" }} onClick={() => { setStep("password"); setErr(""); }}>Have a password? Log in with e-mail and password</button>}
        {!isLive && <div style={{ marginTop: 18 }}>
          <div className="label-up" style={{ padding: "0 0 8px" }}>Demo accounts (demo mode only)</div>
          {DEMO_ACCOUNTS.map((a) => <button key={a.email} className="btn ghost" style={{ marginBottom: 8, justifyContent: "space-between" }} disabled={busy} onClick={() => demoLogin(a)}><span>{a.label}</span><span className="muted small">{a.email}</span></button>)}
        </div>}
      </>}

      {step === "code" && <>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: WA ? "#25D366" : "var(--deep)", display: "grid", placeItems: "center", fontSize: 30, marginTop: 24 }}>{method === "phone" ? "💬" : "✉️"}</div>
        <h1>Enter the code</h1>
        <p className="lead">{WA ? <>Sent on <b style={{ color: "var(--ink)" }}>WhatsApp</b> to <b style={{ color: "var(--ink)" }}>{target}</b>. Open WhatsApp and tap "Copy code", or type it below.</> : method === "phone" ? <>For <b style={{ color: "var(--ink)" }}>{target}</b>, we e-mailed the code to <b style={{ color: "var(--ink)" }}>{sentTo || "the e-mail on your account"}</b>. Check spam if you don't see it.</> : <>Sent by e-mail to <b style={{ color: "var(--ink)" }}>{target}</b>. Check spam if you don't see it.</>} <button className="link" onClick={() => setStep("enter")}>Change</button></p>
        {!isLive && <div className="banner ok" style={{ margin: "14px 0 0" }}>Demo mode: the code is 123456</div>}
        <div className="otpboxes">
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden="true" className={i < code.length ? "f" : i === code.length ? "c" : ""}>{code[i] || ""}</span>)}
          <input ref={codeRef} aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) verify(v); }} />
        </div>
        <div className="row" style={{ marginTop: 14, fontSize: 13.5 }}>
          {wait > 0 ? <span className="muted">Resend in <b style={{ color: "var(--ink)" }}>0:{String(wait).padStart(2, "0")}</b></span>
            : <button className="link" onClick={send}>Resend code</button>}
          {!WA && <button className="link" style={{ color: "var(--muted)" }} onClick={() => { setMethod(method === "phone" ? "email" : "phone"); setStep("enter"); setErr(""); }}>Use {method === "phone" ? "e-mail" : "mobile"} instead</button>}
        </div>
        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
        <div className="box small" style={{ marginTop: 20 }}>🔒 Never share this code. {APP_NAME} and businesses will never ask for it.{WA ? " The code expires in 10 minutes." : ""}</div>
        <button className="btn main" style={{ marginTop: "auto" }} disabled={busy || code.length !== 6} onClick={() => verify()}>{busy ? "Checking…" : "Verify and continue"}</button>
      </>}

      {reason && <div className="banner warn" role="status" style={{ margin: "16px 0 0" }}>🔒<span>{reason}</span></div>}
      {step === "signup" && <>
        {codeSent && emailSentAt > 0 ? <>
          <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 20, background: "var(--deep)", display: "grid", placeItems: "center", fontSize: 30, marginTop: 14 }}>✉️</div>
          <h1>{phoneWanted ? "Enter both codes" : "Check your e-mail"}</h1>
          <p className="lead">{phoneWanted
            ? <>We sent two codes at the same time: one to your e-mail <b style={{ color: "var(--ink)" }}>{email.trim()}</b> and one on {phoneWord} to <b style={{ color: "var(--ink)" }}>{prettyPhone(indianPhone(mobile) || mobile)}</b>.</>
            : <>We sent a 6-digit code to <b style={{ color: "var(--ink)" }}>{email.trim()}</b>. Check spam if you don't see it.</>}</p>
        </> : <>
          <h1>{IS_OWNER_APP ? "Register your business" : "Create your account"}</h1>
          <p className="lead">{IS_OWNER_APP ? "Create your partner account. Your business is checked (KYC) before offers go live." : "Sign up with your e-mail. We send a 6-digit code to check it."}</p>
        </>}
        <form className="form" style={{ padding: "20px 0 0" }} onSubmit={signUp}>
          <div style={{ display: codeSent ? "none" : "contents" }}>
          {IS_OWNER_APP && <div style={{ display: "flex", gap: 14, alignItems: "center", background: "#fff", borderRadius: 16, padding: 14, border: "1.5px dashed var(--brand-2)" }}>
            {photo ? <img src={photo} alt="Your profile photo" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
              : <div aria-hidden="true" style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--soft)", display: "grid", placeItems: "center", flex: "none", fontSize: 28 }}>📷</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <b>Profile photo (required)</b>
              <span className="muted small">A clear photo of you, the owner. Used for KYC; customers don't see it.</span>
              <label className="btn dark sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}>{photo ? "Change photo" : "Take photo / Upload"}
                <input type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={(e) => pickPhoto(e.target.files?.[0])} /></label>
            </div>
          </div>}
          {IS_OWNER_APP && <div className="fld"><label htmlFor="su-cat">Business type</label>
            <select id="su-cat" value={bizType} onChange={(e) => setBizType(e.target.value)}>
              <option value="" disabled>Choose what your business is</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
            <span className="note">You'll post offers in this category. You can change it in your business details.</span></div>}
          <div className="fld"><label htmlFor="su-name">{IS_OWNER_APP ? "Owner name" : "Your name"}</label><input id="su-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="fld"><label htmlFor="su-phone">Mobile number</label><div className="pfx"><span aria-hidden="true">+91</span><input id="su-phone" inputMode="numeric" autoComplete="tel-national" maxLength={14} placeholder="98765 43210" value={typePhone(mobile)} disabled={codeSent} onChange={(e) => { setMobile(typePhone(e.target.value)); mobileOk.current = ""; }} /></div>
            <span className="hint">{phoneOn ? `We'll send a 6-digit code to this number on ${phoneWord} to check it.` : "Saved for your account. Not checked with a code."}</span></div>
          <div className="fld"><label htmlFor="su-email">E-mail</label><input id="su-email" type="email" autoComplete="email" value={email} disabled={codeSent} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="fld"><label htmlFor="su-pass">Password (8+ characters)</label><input id="su-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="fld"><label htmlFor="su-pass2">Confirm password</label><input id="su-pass2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)}
            style={password2 ? { borderColor: password2 === password ? "var(--ok)" : "var(--bad)" } : undefined} />
            {password2 && <span className="hint" style={{ color: password2 === password ? "var(--ok)" : "var(--bad)", fontWeight: 700 }}>{password2 === password ? "✓ Passwords match" : "Passwords don't match"}</span>}</div>
          <ConsentBoxes value={consent} onChange={setConsent} />
          {phoneWanted && viaWa && <label style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff", borderRadius: 14, padding: "11px 12px", fontSize: 12.5, lineHeight: 1.45, cursor: "pointer" }}>
            <input type="checkbox" checked={waOk} onChange={(e) => setWaOk(e.target.checked)} style={{ width: 20, height: 20, flex: "none", accentColor: "var(--brand-2)" }} />
            <span>I agree to get my verification codes and account messages (approvals, receipts) from {APP_NAME} on WhatsApp at this number. I can stop them any time.</span>
          </label>}
          </div>
          {codeSent && emailSentAt > 0 && <div className="fld"><label htmlFor="su-otp">{phoneWanted ? "1. E-mail code" : "6-digit code"}</label>
            <input id="su-otp" className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="••••••" autoFocus />
            <CodeTimer sentAt={emailSentAt} hint="Didn't get it? Check spam." onResend={async () => { try { await api.sendEmailOtp(email); setOtp(""); setEmailSentAt(Date.now()); toast("New e-mail code sent"); } catch (x) { setErr(errText(x)); } }} /></div>}
          {codeSent && phoneOn && <div className="fld"><label htmlFor="su-sms">2. {viaWa ? "WhatsApp code" : "Mobile code"} (sent to {prettyPhone(indianPhone(mobile) || mobile)})</label>
            <input id="su-sms" className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            <CodeTimer sentAt={phoneSentAt} hint="Check the number is right." onResend={async () => { try { await api.sendSmsOtp(mobile, waOk); setPhoneCode(""); setPhoneSentAt(Date.now()); toast(`New ${phoneWord} code sent`); } catch (x) { setErr(errText(x)); } }} /></div>}
          {codeSent && phoneWanted && phoneSkipped && <div className="fld"><label>2. {phoneWord} code</label>
            <div className="box small" style={{ background: "#FFF7ED", color: "#7C2D12" }}>We couldn't send the {phoneWord} code just now (our {phoneWord} service is still being approved by Meta). Create your account with the e-mail code; your mobile number shows as "Not verified" and you can verify it later in Account → KYC.
              <div><button type="button" className="link small" disabled={busy} onClick={async () => { try { const r = await api.sendSmsOtp(mobile, waOk); if (!r?.skipped) { setPhoneSkipped(false); setPhoneSentAt(Date.now()); toast(`${phoneWord} code sent`); } else toast(`Still couldn't send the ${phoneWord} code`); } catch (x) { setErr(errText(x)); } }}>Try {phoneWord} again</button></div></div></div>}
          {codeSent && phoneWanted && viaWa && !waOk && <label style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff", borderRadius: 14, padding: "11px 12px", fontSize: 12.5, lineHeight: 1.45, cursor: "pointer" }}>
            <input type="checkbox" checked={waOk} onChange={(e) => setWaOk(e.target.checked)} style={{ width: 20, height: 20, flex: "none", accentColor: "var(--brand-2)" }} />
            <span>I agree to get my verification codes and account messages (approvals, receipts) from {APP_NAME} on WhatsApp at this number. I can stop them any time.</span>
          </label>}
          {codeSent && <button type="button" className="link small" style={{ alignSelf: "flex-start" }} onClick={() => { setCodeSent(false); setOtp(""); setEmailSentAt(0); setPhoneCode(""); setPhoneSentAt(0); setErr(""); }}>Change e-mail or mobile number</button>}
          {codeSent && <div className="box small">🔒 Never share this code. {APP_NAME} and businesses will never ask for it.</div>}
          {err && <div className="error">{err}</div>}
          <button className="btn main" disabled={busy}>{busy ? "Please wait…" : codeSent ? "Verify and create account" : phoneOn ? "Continue →" : "Continue →"}</button>
          <button type="button" className="link" onClick={() => { setStep("password"); setErr(""); }}>Already have an account? Log in</button>
        </form>
        {askMobile && <Sheet onClose={() => setAskMobile(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "6px 4px" }}>
            <div aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 16, background: "var(--brand-soft)", display: "grid", placeItems: "center", fontSize: 26 }}>📱</div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-h)" }}>Is this your correct mobile number?</h2>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>{prettyPhone(indianPhone(mobile) || mobile)}</div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{IS_OWNER_APP ? "LastPick uses this number to reach you about your business, and you can log in with it." : "Businesses use this number to reach you about your deals, and you can log in with it."}{phoneOn ? ` We'll send a code to it on ${phoneWord}.` : ""} Please check every digit.</p>
            <button className="btn main" onClick={() => { mobileOk.current = mobile.replace(/\D/g, ""); setAskMobile(false); signUp(); }}>Yes, it's correct</button>
            <button className="btn ghost" onClick={() => { setAskMobile(false); setTimeout(() => document.getElementById("su-phone")?.focus(), 50); }}>No, edit number</button>
          </div>
        </Sheet>}
      </>}
      {(step === "password" || step === "reset") && <>
        <h1>{step === "reset" ? "Reset password" : IS_ADMIN_APP ? "LastPick Admin" : OTP_LOGIN ? "Log in with password" : IS_OWNER_APP ? "LastPick Partner" : `Welcome to ${APP_NAME}`}</h1>
        <p className="lead">{step === "reset" ? (resetSent ? `Enter the 6-digit code we e-mailed to ${sentTo || email.trim()} and choose a new password.` : "Enter your e-mail or mobile number. We'll e-mail a 6-digit code to the address on your account.") : IS_ADMIN_APP ? "For admins and moderators only." : OTP_LOGIN ? "For accounts made with an e-mail and password." : "Log in with your e-mail or mobile number and password."}</p>
        <form className="form" style={{ padding: "20px 0 0" }} onSubmit={passwordLogin}>
          <div className="fld"><label htmlFor="pw-email">E-mail or mobile number</label><input id="pw-email" type="text" inputMode="email" autoComplete="username" placeholder="you@example.com or 98765 43210" value={email} disabled={step === "reset" && resetSent} onChange={(e) => setEmail(e.target.value)} /></div>
          {step === "password" && <div className="fld"><label htmlFor="pw-pass">Password</label><input id="pw-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
          {step === "reset" && resetSent && <>
            <div className="fld"><label htmlFor="rs-code">6-digit code</label><input id="rs-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <CodeTimer sentAt={resetSentAt} hint="Didn't get it? Check spam." onResend={async () => { try { await api.sendResetCode(email.trim()); setCode(""); setResetSentAt(Date.now()); toast("New code sent"); } catch (x) { setErr(errText(x)); } }} /></div>
            <div className="fld"><label htmlFor="rs-pass">New password (8+ characters)</label><input id="rs-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          </>}
          {err && <div className="error">{err}</div>}
          <button className="btn main" disabled={busy}>{busy ? "Please wait…" : step === "reset" ? (resetSent ? "Set new password" : "Send code") : "Log in"}</button>
          {step === "password" ? <button type="button" className="link" onClick={() => { setStep("reset"); setResetSent(false); setErr(""); }}>Forgot password?</button>
            : <button type="button" className="link" onClick={() => { setStep("password"); setResetSent(false); setErr(""); }}>Back to log in</button>}
          {OTP_LOGIN && <button type="button" className="link" style={{ color: "var(--muted)" }} onClick={() => setStep("enter")}>Use a one-time code instead</button>}
        </form>
        {step === "password" && !IS_ADMIN_APP && <div className="box small" style={{ marginTop: 16, background: "var(--brand-soft)" }}><b>One device at a time.</b> If you're logged in on another phone or browser, it will be logged out when you log in here.</div>}
        {step === "password" && !IS_ADMIN_APP && <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => { setStep("signup"); setErr(""); }}>
          {IS_OWNER_APP ? "New business? Create an account" : "New here? Create an account"}</button>}
        {!isLive && !OTP_LOGIN && <div style={{ marginTop: 18 }}>
          <div className="label-up" style={{ padding: "0 0 8px" }}>Demo accounts (one tap)</div>
          {DEMO_ACCOUNTS.filter((a) => (IS_ADMIN_APP ? /admin|moderator/i.test(a.email) : true)).map((a) => <button key={a.email} className="btn ghost" style={{ marginBottom: 8, justifyContent: "space-between" }} disabled={busy} onClick={() => demoLogin(a)}><span>{a.label}</span><span className="muted small">{a.email}</span></button>)}
        </div>}
      </>}

      <div className="center small muted" style={{ paddingTop: 24 }}>
        India only · 18+ · <a href="#/privacy">Privacy</a> · <a href="#/terms">Terms</a> · <a href="#/plans">Plans</a> · <a href="#/contact">Contact</a>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Complete profile (new one-time-code accounts)
export function CompleteProfile() {
  const { profile, refresh, toast, customersFree } = useApp();
  const viaPhone = !!profile?.phone;
  const [name, setName] = useState("");
  const [other, setOther] = useState("");
  const [consent, setConsent] = useState({ adult: false, agree: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault(); setErr("");
    if (!name.trim()) return setErr("Please enter your name");
    if (!viaPhone && mobileProblem(other)) return setErr(mobileProblem(other));
    if (!consent.adult) return setErr(`You must be 18 or older to use ${APP_NAME}`);
    if (!consent.agree) return setErr("Please read and agree to the privacy notice to continue");
    if (!consent.platform) return setErr(`Please confirm you understand ${APP_NAME} only connects you with businesses`);
    setBusy(true);
    try {
      await api.completeProfile({ name: name.trim(), phone: viaPhone ? profile.phone : other.trim(), email: viaPhone ? "" : profile.email, consent: consentPayload(consent) });
      await refresh();
      toast(`Welcome to ${APP_NAME} 🎉`);
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form className="auth" onSubmit={save}>
      {!IS_OWNER_APP && customersFree ? (
      <div className="plan" style={{ margin: "8px 0 0" }}>
        <div className="row"><span className="small" style={{ fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--hi)" }}>Your plan</span><span className="small" style={{ opacity: .75 }}>Customer</span></div>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 28, marginTop: 6 }}>Free</div>
        <div className="small" style={{ opacity: .8, marginTop: 2 }}>No pass and nothing to pay. See owners' numbers and call them.</div>
        <div style={{ height: 8, background: "rgba(255,255,255,.18)", borderRadius: 99, marginTop: 14, overflow: "hidden" }}><div style={{ height: "100%", background: "var(--hi)", borderRadius: 99, animation: "grow 1.4s ease .3s both", transformOrigin: "left" }} /></div>
      </div>
      ) : (
      <div className="plan" style={{ margin: "8px 0 0" }}>
        <div className="row"><span className="small" style={{ fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--hi)" }}>Your plan</span><span className="small" style={{ opacity: .75 }}>{IS_OWNER_APP ? PLANS.owner.name : PLANS.customer.name}</span></div>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 28, marginTop: 6 }}>{rupee(IS_OWNER_APP ? PLANS.owner.price : PLANS.customer.price)} / {PLANS.customer.period}</div>
        <div className="small" style={{ opacity: .8, marginTop: 2 }}>{IS_OWNER_APP ? `${PLANS.owner.tagline}: just ${PLANS.owner.perPost}. After we verify your business.` : `${PLANS.customer.tagline}: just ${PLANS.customer.perDay}. You pick a plan after this step.`}</div>
        <div style={{ height: 8, background: "rgba(255,255,255,.18)", borderRadius: 99, marginTop: 14, overflow: "hidden" }}><div style={{ height: "100%", background: "var(--hi)", borderRadius: 99, animation: "grow 1.4s ease .3s both", transformOrigin: "left" }} /></div>
      </div>
      )}
      <h1 style={{ fontSize: 26 }}>A few details</h1>
      <p className="lead">{viaPhone ? `Verified ${prettyPhone(profile.phone)}.` : `Verified ${profile?.email}.`} This is how businesses will know you.</p>
      <div className="form" style={{ padding: "16px 0 0" }}>
        <div className="fld"><label htmlFor="cp-name">Your name</label><input id="cp-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        {!viaPhone && <div className="fld"><label htmlFor="cp-phone">Mobile number (India)</label><div className="pfx"><span aria-hidden="true">+91</span><input id="cp-phone" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={typePhone(other)} onChange={(e) => setOther(typePhone(e.target.value))} placeholder="98765 43210" /></div>
            <span className="hint">Never shown to businesses.</span></div>}
        <details className="box small"><summary style={{ cursor: "pointer", fontWeight: 600 }}>What we collect and why</summary>
          {NOTICE_ITEMS.map((n) => <div key={n.data} style={{ paddingTop: 6 }}><b>{n.data}</b><div className="muted">{n.why}</div></div>)}</details>
        <ConsentBoxes value={consent} onChange={setConsent} />
        {err && <div className="error">{err}</div>}
        <button className="btn main" disabled={busy}>{busy ? "Saving…" : "Agree and continue"}</button>
        <button type="button" className="link small" style={{ color: "var(--muted)" }} onClick={async () => { await api.signOut(); navigate("/"); }}>Log out</button>
      </div>
    </form>
  );
}

// Under a code box: "Code expires in 9:41" and "Resend in 0:28", then a "Resend code" link.
const CODE_LIFE_S = 600, RESEND_WAIT_S = 30;
function CodeTimer({ sentAt, onResend, hint, life = CODE_LIFE_S }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const gone = Math.floor((now - sentAt) / 1000);
  const left = Math.max(0, life - gone), wait = Math.max(0, RESEND_WAIT_S - gone);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return (
    <span className="hint codetimer">
      {left > 0 ? <>Code expires in <b>{mmss(left)}</b>. </> : <b style={{ color: "var(--bad)" }}>This code has expired. </b>}
      {hint} {wait > 0 ? <span>Resend in <b>{mmss(wait)}</b></span> : <button type="button" className="link small" onClick={onResend}>Resend code</button>}
    </span>
  );
}

