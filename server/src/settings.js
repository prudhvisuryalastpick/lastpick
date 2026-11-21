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


// ---- One device at a time for customers. On unless an admin switches it off. ----
// (Partner and admin logins are always one device at a time.)
export const singleDeviceOn = async () => (await getSetting("single_device", true)) !== false;
