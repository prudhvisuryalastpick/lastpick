// Free launch mode, free months and plans.
// config 'app' { freeMode: true } (the default) means nobody needs a plan: payments are on hold.
import { one, q } from "./db.js";

let cfg = { at: 0, freeMode: true };
export async function freeMode() {
  if (Date.now() - cfg.at < 30000) return cfg.freeMode;
  const r = await one("SELECT value FROM config WHERE key = 'app'");
  cfg = { at: Date.now(), freeMode: !r || r.value.freeMode !== false };
  return cfg.freeMode;
}
export async function setFreeMode(free) {
  await q(
    `INSERT INTO config (key, value) VALUES ('app', $1) ON CONFLICT (key) DO UPDATE SET value = config.value || $1, updated_at = now()`,
    [{ freeMode: free }],
  );
  cfg = { at: Date.now(), freeMode: free };
}

export const subActive = (s) => !!s && ["active", "cancelled"].includes(s.status) && s.current_period_end && new Date(s.current_period_end) > new Date();

// SQL: is this business's Business Pro (free month or paid plan) active? $free is the freeMode flag.
export const OWNER_ACTIVE_SQL = (b, free) => `(${free} OR ${b}.trial_ends_at > now() OR EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.user_id = ${b}.id AND s.plan = 'owner'
  AND s.status IN ('active', 'cancelled') AND s.current_period_end > now()))`;

// Customers: free month from sign-up. Businesses: free month from the day they are verified.
export async function planActive(uid, plan) {
  if (await freeMode()) return true;
  const r = plan === "customer"
    ? await one(`SELECT (u.trial_ends_at > now()) AS trial, s.status, s.current_period_end FROM users u
                 LEFT JOIN subscriptions s ON s.user_id = u.id AND s.plan = 'customer' WHERE u.id = $1`, [uid])
    : await one(`SELECT (b.status = 'verified' AND b.trial_ends_at > now()) AS trial, s.status, s.current_period_end FROM businesses b
                 LEFT JOIN subscriptions s ON s.user_id = b.id AND s.plan = 'owner' WHERE b.id = $1`, [uid]);
  return !!r && (r.trial || subActive(r));
}
