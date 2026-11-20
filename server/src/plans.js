// Plans. There is no free version: customers need a Customer Pass to see businesses' numbers, and businesses need
// Business Pro to post. Until the payment gateway is added, an admin activates plans after a payment (Admin → Plans).
// (The old "free launch mode" is switched off for good; freeMode() is kept so callers stay simple.)
import { one } from "./db.js";

export async function freeMode() { return false; }
export async function setFreeMode() { /* no free version */ }

export const subActive = (s) => !!s && ["active", "cancelled"].includes(s.status) && s.current_period_end && new Date(s.current_period_end) > new Date();

// SQL: is this business's Business Pro (free month or paid plan) active? $free is the freeMode flag.
export const OWNER_ACTIVE_SQL = (b, free) => `(${free} OR ${b}.trial_ends_at > now() OR EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.user_id = ${b}.id AND s.plan = 'owner'
  AND s.status IN ('active', 'cancelled') AND s.current_period_end > now()))`;

// Is this user's plan active? (trial_ends_at is only set when an admin gives someone extra days by hand.)
export async function planActive(uid, plan) {
  const r = plan === "customer"
    ? await one(`SELECT (u.trial_ends_at > now()) AS trial, s.status, s.current_period_end FROM users u
                 LEFT JOIN subscriptions s ON s.user_id = u.id AND s.plan = 'customer' WHERE u.id = $1`, [uid])
    : await one(`SELECT (b.status = 'verified' AND b.trial_ends_at > now()) AS trial, s.status, s.current_period_end FROM businesses b
                 LEFT JOIN subscriptions s ON s.user_id = b.id AND s.plan = 'owner' WHERE b.id = $1`, [uid]);
  return !!r && (r.trial || subActive(r));
}
