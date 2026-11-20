// Welcome, sign-in with a one-time code (mobile SMS or e-mail), password login for older accounts,
// and the one-time "complete your profile" step with consent for new accounts.
import { useEffect, useRef, useState } from "react";
import { api, isLive } from "../api/index.js";
import { DEMO_ACCOUNTS } from "../api/index.js";
import { Spinner } from "../components.jsx";
import { APP_NAME, IS_ADMIN_APP, IS_OWNER_APP, OTP_LOGIN, PLANS } from "../lib/config.js";
import { errText, indianPhone, prettyPhone, rupee, validPhone } from "../lib/format.js";
import { navigate, useApp } from "../state.jsx";
import { ConsentBoxes, NOTICE_ITEMS, consentPayload } from "./privacy.jsx";
import { Icon, catStyle } from "../lib/icons.jsx";

export const markWelcomed = () => { try { localStorage.setItem("lastpick-welcomed", "1"); } catch { /* ignore */ } };
export const welcomed = () => { try { return localStorage.getItem("lastpick-welcomed") === "1"; } catch { return true; } };

const FLOAT = [
  { e: "🛏️", t: "Room for tonight", s: "Ends in 5 h 12 m", o: "-47%", style: { left: 0, top: 10 } },
  { e: "🎂", t: "Cakes at closing", s: "1.2 km · 7 left", o: "-50%", style: { right: 0, top: 56, animationDelay: ".8s" } },
  { e: "🚌", t: "6 bus seats left", s: "Leaves 10:45 PM", o: "-43%", style: { left: 24, bottom: 0, animationDelay: "1.6s" } },
  { e: "💇", t: IS_OWNER_APP ? "6 salon slots filled" : "Salon slots today", s: IS_OWNER_APP ? "This evening" : "4 – 8 PM", o: "-50%", style: { right: 10, bottom: 26, animationDelay: ".4s" } },
];

// Opening animation for the customer app: radar rings, deal cards floating in, the categories locals post in.
const CFLOAT = [
  { cat: "stay", t: "Room for tonight", s: "Ends in 5 h · 3.4 km", o: "-47%", style: { left: 0, top: 10 } },
  { cat: "food", t: "Cakes at closing", s: "1.2 km · 7 left", o: "-50%", style: { right: 0, top: 36, animationDelay: ".8s" } },
  { cat: "beauty", t: "Salon slots today", s: "4 – 8 PM · 0.8 km", o: "-50%", style: { left: 0, bottom: 0, animationDelay: "1.6s" } },
  { cat: "travel", t: "Bus seats tonight", s: "Leaves 10:45 PM", o: "-43%", style: { right: 0, bottom: -14, animationDelay: ".4s" } },
];
const TRAIL = ["food", "stay", "travel", "beauty", "laundry", "grocery", "photo", "other"];

export function Welcome() {
  const go = (to) => { markWelcomed(); navigate(to, { replace: true }); };
  if (IS_OWNER_APP) return <OwnerWelcome go={go} />;
  return (
    <div className="welcome cwel">
      <div className="brand" style={{ animation: "fadeUp .5s ease both" }}><span className="logo">L</span>{APP_NAME}</div>
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
        <p className="fine">{PLANS.customer.name}: {rupee(PLANS.customer.price)}/month, or less on longer plans.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20, animation: "fadeUp .6s ease .35s both" }}>
        <button className="btn main" onClick={() => go("/login")}>Get started</button>
        <button className="btn line" onClick={() => go("/")}>Look around first</button>
      </div>
    </div>
  );
}

// Business app welcome (redesign comes with the partner app)
function OwnerWelcome({ go }) {
  return (
    <div className="welcome">
      <div className="brand" style={{ animation: "fadeUp .5s ease both" }}><span className="logo">L</span>{APP_NAME}</div>
      <div className="radar" aria-hidden="true">
        <span className="ring" /><span className="ring r2" /><span className="core">📍</span>
        {FLOAT.map((f) => <div key={f.t} className="floatcard" style={f.style}><span className="e">{f.e}</span><i>{f.o}</i><b>{f.t}</b><span>{f.s}</span></div>)}
      </div>
      <div style={{ marginTop: "auto", animation: "fadeUp .6s ease .2s both" }}>
        <span className="giftpill">🛡️ Verified local partners only</span>
        <h1>Last-minute deals,<br />within 30 km.</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "#C9C7C0" }}>Empty rooms, seats, food and slots that businesses near you must fill today. Call the owner directly.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22, animation: "fadeUp .6s ease .35s both" }}>
        <button className="btn main" onClick={() => go("/login")}>Get started →</button>
        <button className="btn" style={{ background: "transparent", border: "1px solid #3A3B45", color: "#F6F3EC" }} onClick={() => go("/")}>Look around first</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Sign in
export function Login({ next = "/" }) {
  const { session, profile, toast, refresh } = useApp();
  const [step, setStep] = useState(OTP_LOGIN ? "enter" : "password"); // enter | code | password | reset
  const [method, setMethod] = useState("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [wait, setWait] = useState(0);
  const codeRef = useRef();
  // why the user was logged out (e.g. logged in on another device): shown once
  const [reason] = useState(() => { try { const r = localStorage.getItem("lastpick-logout-reason"); localStorage.removeItem("lastpick-logout-reason"); return r || ""; } catch { return ""; } });
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { if (step === "code") setTimeout(() => codeRef.current?.focus(), 50); }, [step]);

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [consent, setConsent] = useState({ adult: false, agree: false });
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  if (session && profile && !profile.needsProfile) { setTimeout(() => navigate(next || "/", { replace: true }), 0); return <Spinner />; }

  const target = method === "phone" ? prettyPhone(indianPhone(phone) || phone) : email.trim();
  const send = async (e) => {
    e?.preventDefault(); setErr("");
    if (method === "phone" && !validPhone(phone)) return setErr("Please enter a valid Indian mobile number");
    if (method === "email" && !/^\S+@\S+\.\S+$/.test(email)) return setErr("Please enter a valid e-mail address");
    setBusy(true);
    try {
      if (method === "phone") await api.sendPhoneOtp(phone); else await api.sendEmailOtp(email.trim());
      setCode(""); setStep("code"); setWait(30);
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };
  const verify = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true); setErr("");
    try {
      const r = method === "phone" ? await api.verifyPhoneOtp(c) : await api.verifyEmailOtp(email.trim(), c);
      await refresh();
      markWelcomed();
      toast(r.isNew ? "Verified. Just a few details and you're in." : "Welcome back!");
    } catch (x) { setErr(errText(x)); setCode(""); }
    setBusy(false);
  };
  const passwordLogin = async (e) => {
    e.preventDefault(); setErr("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Please enter a valid e-mail address");
    setBusy(true);
    try {
      if (step === "reset") { await api.resetPassword(email); toast("Password reset link sent to your e-mail"); setStep("password"); }
      else { await api.signIn(email, password); markWelcomed(); toast("Welcome back!"); }
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };
  const signUp = async (e) => {
    e.preventDefault(); setErr("");
    if (name.trim().length < 2) return setErr("Enter your name");
    if (!/^(\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s-]/g, ""))) return setErr("Enter a valid Indian mobile number");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("Enter a valid e-mail");
    if (password.length < 8) return setErr("Password must be at least 8 characters");
    if (!consent.adult || !consent.agree || !consent.platform) return setErr("Please tick all the boxes to continue");
    setBusy(true);
    try {
      if (!codeSent) {
        // step 1: e-mail a 6-digit code (if e-mail codes aren't switched on, the account is created straight away)
        const sent = await api.sendEmailOtp(email).then(() => true).catch((x) => { if (/switched on/i.test(errText(x))) return false; throw x; });
        if (sent) { setCodeSent(true); toast(`We sent a 6-digit code to ${email.trim()}`); setBusy(false); return; }
      } else if (!/^\d{6}$/.test(otp.trim())) { setBusy(false); return setErr("Enter the 6-digit code from the e-mail"); }
      await api.signUp({ email, password, name: name.trim(), phone: mobile, consent: consentPayload(consent), otp: otp.trim() });
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
        <button className="back" style={{ position: "static" }} aria-label="Back" onClick={() => (step === "enter" || !OTP_LOGIN ? navigate(IS_OWNER_APP || IS_ADMIN_APP ? "/login" : "/") : setStep("enter"))}>‹</button>
        {!IS_ADMIN_APP && <span className="trialpill">{IS_OWNER_APP ? "🛡️ Verified partners only" : "⏱️ Deals for today only"}</span>}
      </div>

      {step === "enter" && <>
        <h1>{IS_OWNER_APP ? "LastPick Business" : `Welcome to ${APP_NAME}`}</h1>
        <p className="lead">{IS_OWNER_APP ? "Turn empty rooms, halls, seats, slots and leftover stock into sales. Log in or sign up with a one-time code." : "Log in or create an account with a one-time code. No password to remember."}</p>
        <div className="tabs" role="tablist" aria-label="Sign in with" style={{ margin: "24px 0 0" }}>
          <button role="tab" aria-selected={method === "phone"} className={method === "phone" ? "on" : ""} onClick={() => { setMethod("phone"); setErr(""); }}>Mobile number</button>
          <button role="tab" aria-selected={method === "email"} className={method === "email" ? "on" : ""} onClick={() => { setMethod("email"); setErr(""); }}>E-mail</button>
        </div>
        <form onSubmit={send} style={{ marginTop: 18, animation: "fadeUp .35s ease both" }} key={method}>
          {method === "phone" ? <>
            <label htmlFor="otp-phone" className="small" style={{ fontWeight: 600, color: "var(--muted)" }}>Mobile number</label>
            <div className="bigfield"><b style={{ fontSize: 17 }}>+91</b><span style={{ width: 1, height: 26, background: "var(--line)" }} />
              <input id="otp-phone" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" /></div>
            <div className="note">We'll send a 6-digit code by SMS.</div>
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
          <div className="trust"><span className="ti" style={{ background: "var(--brand-soft)" }}>💳</span><div><b style={{ fontSize: 14 }}>{IS_OWNER_APP ? `${PLANS.owner.name} from ${rupee(PLANS.owner.price)}/month` : `${PLANS.customer.name} from ${rupee(PLANS.customer.price)}/month`}</b><div className="muted small">{IS_OWNER_APP ? "After we verify your business. Post up to 3 offers a day in your own category." : "Less on longer plans. Nothing is charged without asking you."}</div></div></div>
        </div>
        <button className="link small" style={{ marginTop: 22, alignSelf: "center" }} onClick={() => { setStep("password"); setErr(""); }}>Have a password? Log in with e-mail and password</button>
        {!isLive && <div style={{ marginTop: 18 }}>
          <div className="label-up" style={{ padding: "0 0 8px" }}>Demo accounts (demo mode only)</div>
          {DEMO_ACCOUNTS.map((a) => <button key={a.email} className="btn ghost" style={{ marginBottom: 8, justifyContent: "space-between" }} disabled={busy} onClick={() => demoLogin(a)}><span>{a.label}</span><span className="muted small">{a.email}</span></button>)}
        </div>}
      </>}

      {step === "code" && <>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "var(--deep)", display: "grid", placeItems: "center", fontSize: 30, marginTop: 24 }}>{method === "phone" ? "📱" : "✉️"}</div>
        <h1>Enter the code</h1>
        <p className="lead">Sent {method === "phone" ? "by SMS" : "by e-mail"} to <b style={{ color: "var(--ink)" }}>{target}</b>. <button className="link" onClick={() => setStep("enter")}>Change</button></p>
        {!isLive && <div className="banner ok" style={{ margin: "14px 0 0" }}>Demo mode: the code is 123456</div>}
        <div className="otpboxes">
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden="true" className={i < code.length ? "f" : i === code.length ? "c" : ""}>{code[i] || ""}</span>)}
          <input ref={codeRef} aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) verify(v); }} />
        </div>
        <div className="row" style={{ marginTop: 14, fontSize: 13.5 }}>
          {wait > 0 ? <span className="muted">Resend in <b style={{ color: "var(--ink)" }}>0:{String(wait).padStart(2, "0")}</b></span>
            : <button className="link" onClick={send}>Resend code</button>}
          <button className="link" style={{ color: "var(--muted)" }} onClick={() => { setMethod(method === "phone" ? "email" : "phone"); setStep("enter"); setErr(""); }}>Use {method === "phone" ? "e-mail" : "mobile"} instead</button>
        </div>
        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
        <div className="box small" style={{ marginTop: 20 }}>🔒 Never share this code. {APP_NAME} and businesses will never ask for it.</div>
        <button className="btn main" style={{ marginTop: "auto" }} disabled={busy || code.length !== 6} onClick={() => verify()}>{busy ? "Checking…" : "Verify and continue"}</button>
      </>}

      {reason && <div className="banner warn" role="status" style={{ margin: "16px 0 0" }}>🔒<span>{reason}</span></div>}
      {step === "signup" && <>
        <h1>{IS_OWNER_APP ? "Register your business" : "Create your account"}</h1>
        <p className="lead">{IS_OWNER_APP ? "Step 1: your account. Next you add your shop details; our team verifies them before you can post." : "See today's deals near you."}</p>
        <form className="form" style={{ padding: "20px 0 0" }} onSubmit={signUp}>
          <div className="fld"><label htmlFor="su-name">{IS_OWNER_APP ? "Owner name" : "Your name"}</label><input id="su-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="fld"><label htmlFor="su-phone">Mobile number</label><input id="su-phone" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <span className="hint">{IS_OWNER_APP ? "Customers contact you on your shop's number (added next)." : "Never shown to businesses."}</span></div>
          <div className="fld"><label htmlFor="su-email">E-mail</label><input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="fld"><label htmlFor="su-pass">Password (8+ characters)</label><input id="su-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <ConsentBoxes value={consent} onChange={setConsent} />
          {codeSent && <div className="fld"><label htmlFor="su-otp">6-digit code sent to {email.trim()}</label>
            <input id="su-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            <span className="hint">Didn't get it? Check spam, or <button type="button" className="link small" onClick={() => { setCodeSent(false); setOtp(""); }}>send a new code</button>.</span></div>}
          {err && <div className="error">{err}</div>}
          <button className="btn main" disabled={busy}>{busy ? "Please wait…" : codeSent ? "Verify and create account" : "Send verification code"}</button>
          <button type="button" className="link" onClick={() => { setStep("password"); setErr(""); }}>Already have an account? Log in</button>
        </form>
      </>}
      {(step === "password" || step === "reset") && <>
        <h1>{step === "reset" ? "Reset password" : IS_ADMIN_APP ? "LastPick Admin" : OTP_LOGIN ? "Log in with password" : IS_OWNER_APP ? "LastPick Business" : `Welcome to ${APP_NAME}`}</h1>
        <p className="lead">{step === "reset" ? "We'll e-mail you a link to set a new password." : IS_ADMIN_APP ? "For admins and moderators only." : OTP_LOGIN ? "For accounts made with an e-mail and password." : "Log in with your e-mail and password."}</p>
        <form className="form" style={{ padding: "20px 0 0" }} onSubmit={passwordLogin}>
          <div className="fld"><label htmlFor="pw-email">E-mail</label><input id="pw-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {step === "password" && <div className="fld"><label htmlFor="pw-pass">Password</label><input id="pw-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
          {err && <div className="error">{err}</div>}
          <button className="btn main" disabled={busy}>{busy ? "Please wait…" : step === "reset" ? "Send reset link" : "Log in"}</button>
          {step === "password" ? (OTP_LOGIN && <button type="button" className="link" onClick={() => setStep("reset")}>Forgot password?</button>)
            : <button type="button" className="link" onClick={() => setStep("password")}>Back to log in</button>}
          {OTP_LOGIN && <button type="button" className="link" style={{ color: "var(--muted)" }} onClick={() => setStep("enter")}>Use a one-time code instead</button>}
        </form>
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
  const { profile, refresh, toast } = useApp();
  const viaPhone = !!profile?.phone;
  const [name, setName] = useState("");
  const [other, setOther] = useState("");
  const [consent, setConsent] = useState({ adult: false, agree: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault(); setErr("");
    if (!name.trim()) return setErr("Please enter your name");
    if (!viaPhone && !validPhone(other)) return setErr("Please enter a valid Indian mobile number, so businesses can reach you when you ask them to");
    if (viaPhone && other.trim() && !/^\S+@\S+\.\S+$/.test(other)) return setErr("Please enter a valid e-mail address, or leave it empty");
    if (!consent.adult) return setErr(`You must be 18 or older to use ${APP_NAME}`);
    if (!consent.agree) return setErr("Please read and agree to the privacy notice to continue");
    if (!consent.platform) return setErr(`Please confirm you understand ${APP_NAME} only connects you with businesses`);
    setBusy(true);
    try {
      await api.completeProfile({ name: name.trim(), phone: viaPhone ? profile.phone : other.trim(), email: viaPhone ? other.trim() : profile.email, consent: consentPayload(consent) });
      await refresh();
      toast(`Welcome to ${APP_NAME} 🎉`);
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form className="auth" onSubmit={save}>
      <div className="plan" style={{ margin: "8px 0 0" }}>
        <div className="row"><span className="small" style={{ fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--hi)" }}>Your plan</span><span className="small" style={{ opacity: .75 }}>{IS_OWNER_APP ? PLANS.owner.name : PLANS.customer.name}</span></div>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 28, marginTop: 6 }}>{rupee(IS_OWNER_APP ? PLANS.owner.price : PLANS.customer.price)}/month</div>
        <div className="small" style={{ opacity: .8, marginTop: 2 }}>{IS_OWNER_APP ? "After we verify your business. Less on 3, 6 and 12-month plans." : "Less on 3, 6 and 12-month plans. You pick a plan after this step."}</div>
        <div style={{ height: 8, background: "rgba(255,255,255,.18)", borderRadius: 99, marginTop: 14, overflow: "hidden" }}><div style={{ height: "100%", background: "var(--hi)", borderRadius: 99, animation: "grow 1.4s ease .3s both", transformOrigin: "left" }} /></div>
      </div>
      <h1 style={{ fontSize: 26 }}>A few details</h1>
      <p className="lead">{viaPhone ? `Verified ${prettyPhone(profile.phone)}.` : `Verified ${profile?.email}.`} This is how businesses will know you.</p>
      <div className="form" style={{ padding: "16px 0 0" }}>
        <div className="fld"><label htmlFor="cp-name">Your name</label><input id="cp-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        {viaPhone
          ? <div className="fld"><label htmlFor="cp-email">E-mail (optional)</label><input id="cp-email" type="email" autoComplete="email" value={other} onChange={(e) => setOther(e.target.value)} placeholder="For receipts and account help" /></div>
          : <div className="fld"><label htmlFor="cp-phone">Mobile number (India)</label><input id="cp-phone" inputMode="tel" autoComplete="tel" value={other} onChange={(e) => setOther(e.target.value)} placeholder="+91 98765 43210" />
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
