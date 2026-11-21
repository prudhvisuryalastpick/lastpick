# One device at a time (single-session login)

This is how LastPick keeps an account logged in on only one device. Logging in on a new device ends the old login, and the old device logs out with a clear message. It works with any Node server, any Postgres database (including Supabase) and any web or Capacitor app.

## How it works

1. Every account has a **session number** (`token_version`) in the database.
2. **Each login adds 1** to that number and puts the new number inside the login token.
3. **Every logged-in request** compares the number in the token with the number in the database. If they differ, a newer login exists elsewhere, so the request is refused with `401` and the code `signed_in_elsewhere`.
4. **The app checks** when it opens, every 30 seconds, and whenever the tab or app comes back to the screen. If the check gets `signed_in_elsewhere`, the app logs out and shows the reason.

You don't need a sessions table, Redis or websockets: one integer per user is enough.

---

## 1. Database

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0;
-- optional, to show "last login on Android phone" in the account page
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_device text;
```

## 2. Server: tokens (Node, no extra packages)

Works on Node, Deno and Supabase Edge Functions. Two details matter there:
- Import `Buffer` from `node:buffer`, because Supabase Edge has no global `Buffer`.
- Build base64url by hand, because Supabase Edge doesn't support the `"base64url"` encoding name.

```js
// auth.js
import crypto from "node:crypto";
import { Buffer } from "node:buffer";

const SECRET = process.env.JWT_SECRET;          // 32+ random characters, e.g. `openssl rand -hex 32`
const TOKEN_DAYS = 30;

const toB64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const sign = (data) => {
  if (!SECRET || SECRET.length < 32) throw new Error("JWT_SECRET is not set");
  return toB64u(crypto.createHmac("sha256", SECRET).update(data).digest());
};

// tv = the session number at the moment of login
export function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const head = toB64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toB64u(JSON.stringify({ sub: user.id, tv: user.token_version, iat: now, exp: now + TOKEN_DAYS * 86400 }));
  return `${head}.${body}.${sign(`${head}.${body}`)}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const want = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(fromB64u(parts[1]).toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

// Call on every request. Returns { user } or { reason }.
// `db.one(sql, params)` = run a query and return the first row (use your own DB helper).
export async function userFromRequest(req, db) {
  const h = req.headers.get?.("authorization") || req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return {};
  const p = verifyToken(h.slice(7));
  if (!p) return { reason: "expired" };
  const u = await db.one("SELECT id, email, name, role, token_version FROM users WHERE id = $1", [p.sub]);
  if (!u) return { reason: "expired" };
  if (u.token_version !== p.tv) return { reason: "signed_in_elsewhere" };   // a newer login exists
  return { user: u };
}

export const LOGOUT_REASONS = {
  signed_in_elsewhere: "You were logged out because your account was logged in on another device. Only one device can be logged in at a time.",
  expired: "Your login has expired. Please log in again.",
};
```

## 3. Server: start a session on every login

Use the same function for password login, one-time-code login and sign-up. The `+ 1` is what ends the other device's login.

```js
// Call after the password / code has been checked.
export async function startSession(db, user, userAgent = "") {
  const device = /android/i.test(userAgent) ? "Android phone" : /iphone|ipad/i.test(userAgent) ? "iPhone" : "Computer";
  const fresh = await db.one(
    `UPDATE users SET token_version = token_version + 1, last_login_at = now(), last_login_device = $2
     WHERE id = $1 RETURNING id, token_version`, [user.id, device]);
  return issueToken(fresh);            // send this token to the app
}

// "Log out on every device" button (optional)
export async function logoutEverywhere(db, userId) {
  await db.one("UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING id", [userId]);
}
```

On a new account, insert the user with `token_version = 0`, then call `startSession` (or issue a token with `tv: 0`).

## 4. Server: refuse old logins

In your request handler, before the route runs:

```js
const { user, reason } = await userFromRequest(request, db);
// routes that need a login:
if (!user) {
  return Response.json(
    { error: LOGOUT_REASONS[reason] || "Please log in", code: reason || "unauthenticated" },
    { status: 401 });
}
```

Give the app a light endpoint to check with, for example `GET /api/me`, which returns the profile and needs a login.

## 5. App: send the token, notice when it's ended

```js
// api.js
const KEY = "app-token";
let token = localStorage.getItem(KEY);
const listeners = new Set();
export const onAuthChange = (cb) => (listeners.add(cb), () => listeners.delete(cb));
function setToken(t) {
  token = t;
  if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY);
  listeners.forEach((cb) => cb());
}

export async function call(method, path, body) {
  const res = await fetch(API_URL + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    // remember why, so the login screen can show it
    if (data?.code === "signed_in_elsewhere" || data?.code === "expired") localStorage.setItem("logout-reason", data.error);
    setToken(null);                    // log out on this device
  }
  if (!res.ok) { const e = new Error(data?.error || "Something went wrong"); e.status = res.status; throw e; }
  return data;
}

export async function login(email, password) {
  const r = await call("POST", "/api/auth/login", { email, password });
  setToken(r.token);
}

// false = this login was ended (newer login on another device) and the app is now logged out
export async function checkSession() {
  if (!token) return true;
  try { await call("GET", "/api/me"); return true; } catch (e) { return e.status !== 401; }
}
```

## 6. App: check on load, every 30 seconds, and when it comes back

React version. Put it once at the top of the app, for example in your auth provider:

```jsx
import { useEffect } from "react";
import { checkSession } from "./api";

export function useSingleDevice(loggedIn, goToLogin) {
  useEffect(() => {
    if (!loggedIn) return undefined;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      const ok = await checkSession();
      busy = false;
      if (!ok) goToLogin();             // e.g. navigate("/login")
    };
    check();                                            // on load
    const timer = setInterval(check, 30000);            // every 30 seconds
    const onShow = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onShow);   // tab / app comes back (also fires in Capacitor)
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", check);
    };
  }, [loggedIn]);
}
```

Plain JavaScript, without React:

```js
function startSingleDeviceCheck(goToLogin) {
  const check = async () => { if (document.visibilityState !== "hidden" && !(await checkSession())) goToLogin(); };
  check();
  setInterval(check, 30000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
  window.addEventListener("focus", check);
}
```

## 7. Login screen: show why they were logged out

```jsx
const [reason] = useState(() => {
  const r = localStorage.getItem("logout-reason");
  localStorage.removeItem("logout-reason");
  return r || "";
});
// ...
{reason && <div className="banner warn">{reason}</div>}
```

---

## Optional: let customers use several devices

LastPick has an admin switch for this. Store a setting such as `single_device = true | false`. At login, add `+ 1` only when the setting is on, and always add it for partner and admin accounts:

```js
const oneDevice = service !== "customer" || (await getSetting("single_device", true)) !== false;
await db.one(`UPDATE users SET token_version = token_version + $2 ... WHERE id = $1 ...`, [user.id, oneDevice ? 1 : 0]);
```

## Testing it

1. Log in on device A. `GET /api/me` returns 200.
2. Log in with the same account on device B. B gets a token with the new number.
3. On device A, `GET /api/me` now returns `401` with code `signed_in_elsewhere`. Within 30 seconds, or on clicking back into the tab, A shows the login screen with the message.
4. Device B keeps working.
