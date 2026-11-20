import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api/index.js";
import { DEFAULT_LOCATION, MAJOR_CITIES, cityKey } from "./lib/config.js";
import { distanceKm } from "./lib/format.js";
import { DEFAULT_RADIUS_KM } from "./lib/geo.js";

// ---------------- tiny hash router ----------------
const readHash = () => {
  const h = (typeof window !== "undefined" && window.location.hash.slice(1)) || "/";
  const [path, qs] = h.split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(qs || "")) };
};
export function navigate(to, { replace = false } = {}) {
  if (replace) window.location.replace("#" + to);
  else window.location.hash = to;
}
export function useRoute() {
  const [r, setR] = useState(readHash);
  useEffect(() => {
    const on = () => { setR(readHash()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
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
const readArea = () => { try { return JSON.parse(localStorage.getItem("lastpick-area") || "null"); } catch { return null; } };
const readCity = () => { try { return JSON.parse(localStorage.getItem("lastpick-city") || "null"); } catch { return null; } };
export const nearestCity = (pos, cities = MAJOR_CITIES) => {
  let best = null, bestKm = Infinity;
  cities.filter((c) => c.lat != null).forEach((c) => { const km = distanceKm(pos, c); if (km < bestKm) { best = c; bestKm = km; } });
  return best ? { key: c2k(best), name: best.name, state: best.state, lat: best.lat, lng: best.lng } : null;
};
const c2k = (c) => c.key || cityKey(c.name);

export function AppProvider({ children }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null, subs: { customer: null, owner: null }, business: null });
  const [mode, setModeState] = useState(readMode);
  const [toastMsg, setToastMsg] = useState("");
  const [location, setLocation] = useState({ ...DEFAULT_LOCATION, exact: false });
  const stored = readCity();
  const [city, setCityState] = useState(stored || { key: cityKey(DEFAULT_LOCATION.label), name: DEFAULT_LOCATION.label, state: "Karnataka", lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng, auto: true });
  const setCity = (c) => { setCityState(c); try { localStorage.setItem("lastpick-city", JSON.stringify(c)); } catch { /* ignore */ } };
  // Where the customer is looking: { mode: "near", radius } | { mode: "pincode", pincode } | { mode: "city" }
  const [area, setAreaState] = useState(() => readArea() || { mode: "near", radius: DEFAULT_RADIUS_KM });
  const setArea = (a) => { setAreaState(a); try { localStorage.setItem("lastpick-area", JSON.stringify(a)); } catch { /* ignore */ } };
  const [locationStatus, setLocationStatus] = useState("asking"); // asking | granted | denied | unavailable
  const [config, setConfig] = useState({ freeMode: true });
  useEffect(() => { api.getConfig().then(setConfig).catch(() => {}); }, []);

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

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setLocationStatus("unavailable"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setLocation({ ...pos, label: "Your location", exact: true });
        setLocationStatus("granted");
        // first visit: pick the nearest big city automatically (the user can change it)
        setCityState((c) => (c?.auto ? { ...(nearestCity(pos) || c), auto: true } : c));
      },
      () => setLocationStatus("denied"), { maximumAge: 600000, timeout: 10000 },
    );
  }, []);

  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToastMsg(""), 2600); return () => clearTimeout(t); }, [toastMsg]);

  const setMode = (m) => { setModeState(m); try { localStorage.setItem("lastpick-mode", m); } catch { /* ignore */ } };

  const value = {
    ...state, refresh, mode, setMode, location, locationStatus, city, setCity, area, setArea, toast: setToastMsg,
    config, setConfig, freeMode: config.freeMode,
    // free month: customers from sign-up, businesses from verification. During free launch everyone logged in has access.
    trial: { customer: state.profile?.trialEndsAt || null, owner: state.business?.trialEndsAt || null },
    isCustomer: !!state.session && (config.freeMode || !!state.subs.customer?.active || (state.profile?.trialEndsAt || 0) > Date.now()),
    isOwner: !!state.session && (config.freeMode || !!state.subs.owner?.active || state.business?.status === "pending" || (state.business?.trialEndsAt || 0) > Date.now()),
    isAdmin: state.profile?.role === "admin", // super admin: all of India
    isStaff: ["admin", "moderator"].includes(state.profile?.role), // admin or city/state moderator
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
