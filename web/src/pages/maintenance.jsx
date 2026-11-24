// Maintenance: the full-screen page while LastPick is paused (set by an admin), the same page when the server
// can't be reached (during a deploy), and the warning banner shown up to 24 hours before a scheduled window.
import { useState } from "react";
import { APP_NAME, IS_OWNER_APP, SUPPORT_EMAIL } from "../lib/config.js";
import { Icon } from "../lib/icons.jsx";

const timeText = (ms) => new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).toUpperCase();
const dayText = (ms) => {
  const d = new Date(ms), now = new Date();
  const same = (a, b) => a.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === b.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  if (same(d, now)) return "today";
  if (same(d, new Date(now.getTime() + 86400000))) return "tomorrow";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
};

export function MaintenancePage({ m, down = false }) {
  const title = down ? "We'll be right back" : IS_OWNER_APP ? `We're upgrading ${APP_NAME} Partner` : `We're making ${APP_NAME} even better`;
  const text = down
    ? `${APP_NAME} is updating for a moment. Please try again in a minute.`
    : m?.message || (IS_OWNER_APP ? "Posting and leads are paused for a short time. Your offers, leads and plan days are safe." : "Quick maintenance in progress. Deals will be back soon. Thank you for your patience.");
  return (
    <div className={"maint" + (IS_OWNER_APP ? " partner" : "")} role="status">
      <div className="maint-ic" aria-hidden="true"><Icon d="wrench" size={42} stroke={1.8} /></div>
      <h1>{title}</h1>
      <p>{text}</p>
      {!down && m?.until && <span className="maint-back">Back by {timeText(m.until)}{dayText(m.until) !== "today" ? `, ${dayText(m.until)}` : ""}</span>}
      {down && <button type="button" className="maint-back" onClick={() => window.location.reload()}>Try again</button>}
      <small>Questions? {SUPPORT_EMAIL}</small>
    </div>
  );
}

export function MaintenanceBanner({ m }) {
  const key = "lp-maint-seen-" + m.from;
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(key) === "1"; } catch { return false; } });
  if (hidden) return null;
  const until = m.until ? `–${timeText(m.until)}` : "";
  return (
    <div className="maint-ban" role="note">
      <Icon d="clock" size={17} stroke={2.2} />
      <span>Scheduled maintenance <b>{dayText(m.from)} {timeText(m.from)}{until}</b>. {APP_NAME} will be paused for a short time.</span>
      <button type="button" aria-label="Hide" onClick={() => { setHidden(true); try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ } }}><Icon d="M6 6l12 12M18 6L6 18" size={14} stroke={2.4} /></button>
    </div>
  );
}
