import { useEffect, useState } from "react";
import { api, isLive } from "./api/index.js";
import { Empty, QuoteStrip, Spinner } from "./components.jsx";
import { Account, Contacts, Home, MapPage, OfferPage, CategoryPage } from "./pages/customer.jsx";
import { BusinessPage, OwnerDashboard, OwnerGate, OwnerLeads, OwnerOffers, PostOffer } from "./pages/owner.jsx";
import { Admin, Help, Login, Plans, Refund, Subscribe } from "./pages/account.jsx";
import { CompleteProfile, Welcome, welcomed } from "./pages/auth.jsx";
import { About } from "./pages/about.jsx";
import { HelpButton } from "./pages/help.jsx";
import { ConsentGate, Contact, DeleteAccountInfo, Grievance, Privacy, PrivacyCenter, Terms } from "./pages/privacy.jsx";
import { OwnerReviews } from "./pages/reviews.jsx";
import { BusinessInsights, Rules, Savings, Support, SupportThread } from "./pages/impact.jsx";
import { APP_NAME, CONSENT_VERSION } from "./lib/config.js";
import { match, navigate, useApp, useRoute } from "./state.jsx";
import { IS_ADMIN_APP, IS_OWNER_APP } from "./lib/config.js";
import { Icon as LineIcon } from "./lib/icons.jsx";

const I = {
  offers: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  contacts: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  account: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  post: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8",
  leads: "M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  myoffers: "M4 4h16v16H4zM4 10h16M10 4v16",
  about: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01",
};
const Icon = ({ d }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
// customer bottom bar: Home, Map, History (businesses contacted), Account, About
const CUSTOMER_NAV = [["/", "home", "Home"], ["/map", "map", "Map"], ["/contacts", "phone", "History"], ["/account", "user", "Account"], ["/about", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01", "About"]];
const OWNER_NAV = [["/owner", I.home, "Home"], ["/owner/post", I.post, "Post"], ["/owner/leads", I.leads, "Leads"], ["/owner/offers", I.myoffers, "Offers"], ["/account", I.account, "Account"], ["/about", I.about, "About"]];
// pages anyone can open without accepting the privacy notice first
const OPEN_PAGES = ["/about", "/privacy", "/terms", "/contact", "/help", "/refund", "/grievance", "/delete-account", "/account/privacy", "/login", "/plans", "/rules", "/support"];

function Page({ path, query }) {
  let m;
  // the admin server serves only the admin panel, its login and the legal pages
  if (IS_ADMIN_APP && !["/", "/admin", "/login", "/privacy", "/terms", "/contact", "/help", "/rules"].includes(path) && !match("/offer/:id", path)) return <Empty icon="🔒" title="Admin panel" action={<a className="btn main" href="#/">Go to admin</a>}>This site is only for the LastPick team.</Empty>;
  if (path === "/") return IS_ADMIN_APP ? <Admin /> : IS_OWNER_APP ? <OwnerGate><OwnerDashboard /></OwnerGate> : <Home />;
  if (path === "/map") return <MapPage />;
  if ((m = match("/offer/:id", path))) return <OfferPage id={m.id} />;
  if ((m = match("/c/:id", path))) return <CategoryPage id={m.id} />;
  if (path === "/contacts") return <Contacts />;
  if (path === "/account") return <Account />;
  if ((m = match("/subscribe/:plan", path))) return <Subscribe plan={m.plan} />;
  if (path === "/plans") return <Plans plan={query.plan} />;
  if (path === "/welcome") return <Welcome />;
  if (path === "/login") return <Login next={query.next} start={query.start} />;
  if (path === "/owner") return <OwnerGate><OwnerDashboard /></OwnerGate>;
  if (path === "/owner/post") return <OwnerGate><PostOffer /></OwnerGate>;
  if (path === "/owner/leads") return <OwnerGate><OwnerLeads /></OwnerGate>;
  if (path === "/owner/offers") return <OwnerGate allowWithoutPlan><OwnerOffers /></OwnerGate>;
  if (path === "/owner/business") return <BusinessPage />;
  if (path === "/owner/reviews") return <OwnerGate allowWithoutPlan><OwnerReviews /></OwnerGate>;
  if (path === "/account/privacy") return <PrivacyCenter />;
  if (path === "/delete-account") return <DeleteAccountInfo />;
  if (path === "/grievance") return <Grievance />;
  if (path === "/admin") return <Admin />;
  if (path === "/savings") return <Savings />;
  if (path === "/owner/insights") return <OwnerGate allowWithoutPlan><BusinessInsights /></OwnerGate>;
  if (path === "/support") return <Support />;
  if ((m = match("/support/:id", path))) return <SupportThread id={m.id} />;
  if (path === "/rules") return <Rules />;
  if (path === "/terms") return <Terms />;
  if (path === "/privacy") return <Privacy />;
  if (path === "/help") return <Help />;
  if (path === "/refund") return <Refund />;
  if (path === "/contact") return <Contact />;
  if (path === "/about") return <About />;
  return <Empty icon="🧭" title="Page not found" action={<a className="btn main" href="#/">Go to offers</a>}>The link may be broken.</Empty>;
}

function NewLeadsDot() {
  const { isOwner, business } = useApp();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!isOwner || !business) return;
    const load = () => api.ownerLeads().then((l) => setN(l.filter((x) => x.status === "new").length)).catch(() => {});
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, [isOwner, business]);
  return n > 0 ? <span className="dot">{n}</span> : null;
}

function LoadError() {
  const { refresh } = useApp();
  return <Empty icon="📶" title="Couldn't load your account" action={<div className="gap" style={{ justifyContent: "center" }}><button className="btn main sm" onClick={refresh}>Try again</button>
    <button className="btn ghost sm" onClick={async () => { await api.signOut(); navigate("/login"); }}>Log out</button></div>}>Check your internet connection and try again.</Empty>;
}

export default function App() {
  const { path, query, at } = useRoute();
  const { loading, mode, setMode, session, profile } = useApp();
  const needsProfile = !!session && !!profile?.needsProfile && !OPEN_PAGES.filter((p) => p !== "/login").includes(path);
  const needsConsent = !IS_ADMIN_APP && !!session && !!profile && !profile.needsProfile && !profile.loadError && profile.consentVersion !== CONSENT_VERSION && !OPEN_PAGES.includes(path);
  // first visit, not logged in: the opening animation (customer app on "/", partner app on its home)
  const firstVisit = !loading && !session && !IS_ADMIN_APP && (IS_OWNER_APP ? ["/", "/owner"].includes(path) : path === "/") && !welcomed();
  const ownerArea = path.startsWith("/owner");

  // the Business app always opens on the owner dashboard
  useEffect(() => { if (IS_OWNER_APP && ["/", "/map", "/contacts"].includes(path)) navigate("/owner", { replace: true }); }, [path]);
  // partner app, not logged in (after the opening animation): straight to the login page, not a "log in" placeholder
  useEffect(() => {
    if (IS_OWNER_APP && !loading && !session && welcomed() && (path === "/" || path.startsWith("/owner"))) navigate("/login", { replace: true });
  }, [path, loading, session]);

  // keep the bottom bar in sync with where the user is
  useEffect(() => {
    if (IS_OWNER_APP || IS_ADMIN_APP) return;
    if (ownerArea && mode !== "owner") setMode("owner");
    if (["/", "/map", "/contacts"].includes(path) && mode !== "customer") setMode("customer");
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  const biz = IS_OWNER_APP || ownerArea || (mode === "owner" && ["/account", "/plans"].includes(path));
  const nav = biz ? OWNER_NAV : CUSTOMER_NAV;
  const fullScreen = path === "/login" || path === "/welcome" || firstVisit || needsProfile;
  const showNav = !fullScreen && !IS_ADMIN_APP;

  return (
    <div className={"shell" + (biz ? " biz" : "") + (IS_ADMIN_APP ? " admin" : "")}>
      {!isLive && <div className="demo-bar">Demo mode · data stays in this browser · no real payments</div>}
      {!IS_ADMIN_APP && biz && !fullScreen && !loading && <QuoteStrip partner />}
      <main className={"main" + (!biz && !IS_ADMIN_APP ? " custmain" : "")} style={fullScreen ? { paddingBottom: 0 } : null}>{loading ? <Spinner /> : profile?.loadError && !OPEN_PAGES.includes(path) ? <LoadError /> : firstVisit ? <Welcome /> : needsProfile ? <CompleteProfile /> : needsConsent ? <ConsentGate /> : <Page key={path + (at || "") + ":" + (session?.user?.id || "guest")} path={path} query={query} />}</main>
      {!IS_ADMIN_APP && !loading && !fullScreen && <LocationPrompt partner={biz} />}
      {showNav && !needsConsent && !loading && <HelpButton partner={biz} />}
      {showNav && !needsConsent && !biz && (
        <nav className="nav cust" aria-label="Main">
          {CUSTOMER_NAV.map(([to, icon, label]) => <a key={to} href={"#" + to} className={path === to ? "on" : ""} aria-current={path === to ? "page" : undefined}><LineIcon d={icon} size={22} />{label}</a>)}
        </nav>
      )}
      {showNav && !needsConsent && biz && (
        <nav className="nav six" aria-label="Main">
          {nav.map(([to, icon, label]) => (
            <a key={to} href={"#" + to} className={path === to ? "on" : ""} aria-current={path === to ? "page" : undefined}>
              <Icon d={icon} />{label}
              {to === "/owner/leads" && <NewLeadsDot />}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

// Location is off or blocked: a popup explaining that LastPick works on location, with a button to turn it on.
// "Not now" hides it for this visit; it comes back next time the app opens.
function LocationPrompt({ partner }) {
  const { locationStatus, retryLocation } = useApp();
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem("lastpick-loc-later") === "1"; } catch { return false; } });
  if (hidden || locationStatus === "granted" || locationStatus === "asking") return null;
  const later = () => { try { sessionStorage.setItem("lastpick-loc-later", "1"); } catch { /* ignore */ } setHidden(true); };
  const denied = locationStatus === "denied";
  return (
    <div className="locprompt" role="dialog" aria-modal="true" aria-labelledby="locp-title">
      <div className="locprompt-card">
        <div className="locprompt-ic" aria-hidden="true">📍</div>
        <h2 id="locp-title">Turn on your location</h2>
        <p>{APP_NAME} works based on your location. {partner
          ? "We use it to place your shop on the map and show your offers to customers within 30 km."
          : "We use it to show you offers from businesses within 30 km of where you are."} Without it, the app can't show {partner ? "your shop to customers" : "offers near you"}.</p>
        {denied && <div className="locprompt-help">Location is blocked for {APP_NAME}.<br /><b>Phone app:</b> Settings → Apps → {APP_NAME} → Permissions → Location → Allow.<br /><b>Browser:</b> tap the lock icon next to the address → Location → Allow.</div>}
        {!denied && <div className="locprompt-help">Turn on Location (GPS) on your phone, then tap the button below.</div>}
        <button className="btn main" onClick={retryLocation}>Turn on location</button>
        <button className="link" style={{ marginTop: 10 }} onClick={later}>Not now</button>
        <div className="muted small" style={{ marginTop: 10 }}>Your location stays on your phone and is never saved.</div>
      </div>
    </div>
  );
}

