import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api/index.js";
import { DEFAULT_LOCATION, MAJOR_CITIES, cityKey } from "./lib/config.js";
import { distanceKm } from "./lib/format.js";
import { DEFAULT_RADIUS_KM } from "./lib/geo.js";
import { addressFromLocation } from "./lib/address.js";

// ---------------- tiny hash router ----------------
const readHash = () => {
  const h = (typeof window !== "undefined" && window.location.hash.slice(1)) || "/";
  const [path, qs] = h.split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(qs || "")) };
};
export function navigate(to, { replace = false } = {}) {
  const same = window.location.hash.slice(1) === to;
  if (replace) window.location.replace("#" + to);
  else window.location.hash = to;
  // going to the page you're already on: no hashchange fires, so re-render it anyway
  if (same) window.dispatchEvent(new HashChangeEvent("hashchange"));
}
const routeListeners = new Set();
export const onRouteChange = (cb) => { routeListeners.add(cb); return () => routeListeners.delete(cb); };
export function useRoute() {
  const [r, setR] = useState(readHash);
  useEffect(() => {
    const on = () => { routeListeners.forEach((cb) => cb()); setR({ ...readHash(), at: Date.now() }); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    return () => { window.removeEventListener("hashchange", on); window.removeEventListener("popstate", on); };
  }, []);
  return r;
}
// match("/offer/:id", "/offer/abc") -> { id: "abc" } | null
export function match(pattern, path) {
  const a = pattern.split("/"), b = path.split("/");
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

// ---------------- clock ----------------
export function useNow(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

// ---------------- app state ----------------
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const readMode = () => { try { return localStorage.getItem("lastpick-mode") || "customer"; } catch { return "customer"; } };
const readCity = () => { try { return JSON.parse(localStorage.getItem("lastpick-city") || "null"); } catch { return null; } };
export const nearestCity = (pos, cities = MAJOR_CITIES) => {
  let best = null, bestKm = Infinity;
  cities.filter((c) => c.lat != null).forEach((c) => { const km = distanceKm(pos, c); if (km < bestKm) { best = c; bestKm = km; } });
  return best ? { key: c2k(best), name: best.name, state: best.state, lat: best.lat, lng: best.lng } : null;
};
const c2k = (c) => c.key || cityKey(c.name);

const AREA = { mode: "near", radius: DEFAULT_RADIUS_KM };

export function AppProvider({ children }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null, subs: { customer: null, owner: null }, business: null });
  const [mode, setModeState] = useState(readMode);
  const [toastMsg, setToastMsg] = useState("");
  const [location, setLocation] = useState({ ...DEFAULT_LOCATION, exact: false });
  const stored = readCity();
  const [city, setCityState] = useState(stored || { key: cityKey(DEFAULT_LOCATION.label), name: DEFAULT_LOCATION.label, state: "Karnataka", lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng, auto: true });
  const setCity = (c) => { setCityState(c); try { localStorage.setItem("lastpick-city", JSON.stringify(c)); } catch { /* ignore */ } };
  // Where the customer is looking: ALWAYS their live location, within 30 km. No manual pincode or city:
  // a typed pincode can be wrong (someone in 500090 typing 518501 sees the wrong town's offers).
  const area = AREA;
  const setArea = () => {};
  useEffect(() => { try { localStorage.removeItem("lastpick-area"); } catch { /* ignore */ } }, []); // old saved pincode/city choices
  const [place, setPlace] = useState(null); // { area, city, pincode } for the live location, shown on Home
  const [locationStatus, setLocationStatus] = useState("asking"); // asking | granted | denied | unavailable
  const [config, setConfig] = useState({ freeMode: false });
  // app settings (free launch mode, maintenance…)
  useEffect(() => {
    // Settings are checked when the app opens, every 3 minutes while it is on screen, and whenever it comes back
    // on screen. Nothing runs in the background. If the connection is lost it checks again after 8, 15, 30, then
    // every 60 seconds, and stops as soon as it is back.
    const EVERY = 180000, BACKOFF = [8000, 15000, 30000, 60000];
    let stop = false, down = false, busy = false, retry = null, fails = 0, last = 0;
    const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
    const load = (fresh) => {
      if (busy || stop) return; busy = true;
      api.getConfig(fresh).then((c) => {
        if (stop) return;
        last = Date.now();
        down = !!c?.unreachable;
        // keep the last good settings while the connection is down
        setConfig((prev) => (c?.unreachable ? { ...prev, unreachable: true, ok: !!prev.ok } : { ...c, ok: true }));
        clearTimeout(retry);
        if (down) { retry = setTimeout(() => { if (visible()) load(true); }, BACKOFF[Math.min(fails, BACKOFF.length - 1)]); fails += 1; }
        else fails = 0;
      }).catch(() => {}).finally(() => { busy = false; });
    };
    load(false);
    // a cheap 20-second tick (no network) that loads only once 3 minutes have passed since the last check
    const t = setInterval(() => { if (visible() && !down && last && Date.now() - last >= EVERY) load(true); }, 20000);
    const onShow = () => { if (visible() && (down || Date.now() - last > 30000)) load(true); };
    const again = () => { fails = 0; load(true); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("online", again);
    window.addEventListener("lastpick-recheck", again);
    return () => { stop = true; clearInterval(t); clearTimeout(retry); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("online", again); window.removeEventListener("lastpick-recheck", again); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const session = await api.getSession();
      if (!session) { setState({ loading: false, session: null, profile: null, subs: { customer: null, owner: null }, business: null }); return; }
      // the profile is required; plans and business are optional, so a problem there never blocks logging in
      const [profile, subs, business] = await Promise.all([
        api.getProfile(),
        api.mySubscriptions().catch((e) => { console.warn("plans", e); return { customer: null, owner: null }; }),
        api.myBusiness().catch((e) => { console.warn("business", e); return null; }),
      ]);
      setState({ loading: false, session, profile, subs, business });
    } catch (e) {
      console.error(e);
      // logged in but the profile couldn't load (e.g. offline): keep the session so the app doesn't bounce back to Log in
      const session = await api.getSession().catch(() => null);
      setState((s) => ({ ...s, loading: false, session, profile: session ? (s.profile || { id: session.user.id, loadError: true, name: "", phone: "", email: session.user.email || "", role: "user", regions: [] }) : null }));
    }
  }, []);

  useEffect(() => { refresh(); return api.onAuthChange(refresh); }, [refresh]);

  const loggedIn = !!state.session;
  // Idle timeout: after 15 minutes without any tap, typing or scrolling, log out automatically (also when the app is
  // reopened after more than 15 minutes). The last activity time is shared by all tabs of the app.
  useEffect(() => {
    if (!loggedIn) return undefined;
    const KEY = "lastpick-last-active";
    const IDLE_MS = 15 * 60 * 1000;
    const mark = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } };
    const last = () => { try { return Number(localStorage.getItem(KEY)) || Date.now(); } catch { return Date.now(); } };
    const check = async () => {
      if (Date.now() - last() < IDLE_MS) return;
      try { localStorage.setItem("lastpick-logout-reason", "You were logged out after 15 minutes without activity. Please log in again."); localStorage.removeItem(KEY); } catch { /* ignore */ }
      await api.signOut();
      navigate("/login", { replace: true });
    };
    check();          // reopened after a long break
    mark();
    let lastMark = 0;
    const onActivity = () => { const n = Date.now(); if (n - lastMark > 15000) { lastMark = n; mark(); } };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const onShow = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onShow);
    const i = setInterval(check, 180000); // every 3 minutes, and at once when the app comes back on screen
    return () => { clearInterval(i); events.forEach((e) => window.removeEventListener(e, onActivity)); document.removeEventListener("visibilitychange", onShow); };
  }, [loggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // One device at a time: every 3 minutes, and whenever the app comes back to the screen, check the login is still
  // valid. If it was ended (logged in on another device), log out here and show why on the login screen.
  useEffect(() => {
    if (!loggedIn) return undefined;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      const ok = await api.checkSession();
      busy = false;
      if (!ok) navigate("/login", { replace: true });
    };
    const i = setInterval(check, 180000); // every 3 minutes, and at once when the app comes back on screen
    const onShow = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", check);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", check); };
  }, [loggedIn]);

  // Live location: asked when the app opens, kept up to date while it's open (watchPosition), and asked again
  // whenever the app comes back to the screen. Offers are always for within 30 km of here.
  const [locTry, setLocTry] = useState(0);
  const retryLocation = useCallback(() => { setLocationStatus((s) => (s === "granted" ? s : "asking")); setLocTry((n) => n + 1); }, []);
  useEffect(() => {
    // In the Play Store apps use the phone's own GPS (Capacitor Geolocation plugin): the web view's location can keep
    // handing back one old stored position. In a browser use navigator.geolocation. Always ask for a fresh fix.
    const nativeGeo = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.Geolocation : null;
    if (!nativeGeo && (typeof navigator === "undefined" || !navigator.geolocation)) { setLocationStatus("unavailable"); return undefined; }
    let got = false;
    const ok = (p) => {
      got = true;
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      // ignore tiny GPS jitter (under ~300 m) so the list doesn't reload all the time
      setLocation((old) => (old.exact && distanceKm(old, pos) < 0.3 ? old : { ...pos, label: "Your location", exact: true }));
      setLocationStatus("granted");
      setCityState((c) => (c?.auto ? { ...(nearestCity(pos) || c), auto: true } : c));
    };
    const fail = (e) => {
      if (got) return;
      const denied = e?.code === 1 || /denied|permission/i.test(String(e?.message || ""));
      setLocationStatus(denied ? "denied" : "unavailable");
    };
    const opts = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 };
    if (nativeGeo) {
      let id = null, alive = true;
      (async () => {
        try {
          const perm = await nativeGeo.checkPermissions().catch(() => null);
          if (perm && perm.location !== "granted" && perm.coarseLocation !== "granted") {
            const asked = await nativeGeo.requestPermissions().catch(() => null);
            if (asked && asked.location !== "granted" && asked.coarseLocation !== "granted") { fail({ code: 1 }); return; }
          }
          if (!alive) return;
          ok(await nativeGeo.getCurrentPosition(opts));
        } catch (e) { fail(e); }
        if (!alive) return;
        try { id = await nativeGeo.watchPosition(opts, (p, err) => (p ? ok(p) : fail(err))); } catch { /* the first fix is enough */ }
        if (!alive && id) nativeGeo.clearWatch({ id });
      })();
      return () => { alive = false; if (id) nativeGeo.clearWatch({ id }); };
    }
    navigator.geolocation.getCurrentPosition(ok, fail, opts);
    const watch = navigator.geolocation.watchPosition(ok, fail, opts);
    return () => navigator.geolocation.clearWatch(watch);
  }, [locTry]);
  // back on screen (e.g. after turning location on in settings): try again
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") retryLocation(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [retryLocation]);
  // pincode and town of the live location (OpenStreetMap), for the chip on Home: "Nandyal - 518501".
  // Tries again after 5 s if the lookup fails; keeps the last answer meanwhile.
  useEffect(() => {
    if (!location.exact) return undefined;
    let alive = true, t = null;
    const look = (left) => addressFromLocation(location.lat, location.lng)
      .then((a) => { if (alive && a && !a.outsideIndia) setPlace({ area: a.area, city: a.city, region: a.region, pincode: a.pincode }); })
      .catch(() => { if (alive && left > 0) t = setTimeout(() => look(left - 1), 5000); });
    look(2);
    return () => { alive = false; clearTimeout(t); };
  }, [location.exact, location.lat, location.lng]);

  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToastMsg(""), 2600); return () => clearTimeout(t); }, [toastMsg]);

  const setMode = (m) => { setModeState(m); try { localStorage.setItem("lastpick-mode", m); } catch { /* ignore */ } };

  const value = {
    ...state, refresh, mode, setMode, location, locationStatus, retryLocation, place, city, setCity, area, setArea, toast: setToastMsg,
    // There is no free version: access needs an active plan (an admin can still add extra days by hand via trialEndsAt).
    config, setConfig, freeMode: !!config?.freeMode,
    // customers use LastPick free (the server's CUSTOMER_PASS setting brings the pass back; until the config loads, free)
    customersFree: config?.customersFree !== false,
    trial: { customer: state.profile?.trialEndsAt || null, owner: state.business?.trialEndsAt || null },
    // free launch mode (admin switch): everyone has the Customer Pass, verified businesses have Business Pro
    isCustomer: !!state.session && (config?.customersFree !== false || !!config?.freeMode || !!state.subs.customer?.active || (state.profile?.trialEndsAt || 0) > Date.now()),
    isOwner: !!state.session && ((!!config?.freeMode && state.business?.status === "verified") || !!state.subs.owner?.active || state.business?.status === "pending" || (state.business?.trialEndsAt || 0) > Date.now()),
    isAdmin: state.profile?.role === "admin", // super admin: all of India
    isStaff: ["admin", "moderator"].includes(state.profile?.role), // admin or city/state moderator
    isDesk: ["admin", "moderator", "support"].includes(state.profile?.role), // can use the Support Desk
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
