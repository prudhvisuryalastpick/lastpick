// Admin switches stored in app_settings. Not cached in memory: the customer, partner and admin servers are
// separate processes, and a switch must take effect everywhere at once (it's one tiny primary-key read).
import { one, q } from "./db.js";

export async function getSetting(key, fallback = null) {
  const row = await one("SELECT value FROM app_settings WHERE key = $1", [key]);
  return row ? row.value : fallback;
}
export async function setSetting(key, value, by) {
  await q(`INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`, [key, JSON.stringify(value), by]);
}

// ---- Combos: one offer that bundles services. Off until an admin switches it on. ----
export const COMBO_ITEMS = ["stay", "food", "pickup", "ironing"];
export const COMBO_24x7 = ["stay", "pickup"]; // a combo with a hotel room or pickup & drop runs 24×7 like hotels and travel
export const combosOn = async () => (await getSetting("combos", false)) === true;
