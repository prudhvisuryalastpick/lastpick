export const rupee = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

export function timeLeft(ms) {
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export const day = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return Math.floor(s / 86400) + " d ago";
}

export const discount = (o) => (o.origPrice > o.price ? Math.round((1 - o.price / o.origPrice) * 100) : 0);
// Job posts were removed (LastPick is only offers and discounts).
export const isJob = (o) => o?.category === "jobs";

export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const kmText = (km) => (km == null ? "" : km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km");

export const digits = (p) => String(p || "").replace(/\D/g, "");
export const telLink = (p) => "tel:" + (indianPhone(p) || "+" + digits(p));
export const waLink = (p, text) => `https://wa.me/${(indianPhone(p) || digits(p)).replace("+", "")}?text=${encodeURIComponent(text)}`;
// Indian numbers only. Mobile: 10 digits starting 6-9 (optional +91 / 0 prefix). Landline: 0 + STD code + number (11 digits).
export function indianPhone(p) {
  let d = digits(p);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0") && /^[6-9]/.test(d[1])) d = d.slice(1);
  if (/^[6-9]\d{9}$/.test(d)) return "+91" + d;
  if (/^0[1-9]\d{9}$/.test(d)) return "+91" + d.slice(1);
  return null;
}
export const validPhone = (p) => indianPhone(p) !== null;
export const prettyPhone = (p) => { const n = indianPhone(p); return n ? `+91 ${n.slice(3, 8)} ${n.slice(8)}` : String(p || ""); };

export const errText = (e) => (e && (e.message || e.error_description || e.error)) || String(e);

// whole days left until a time (0 when it has passed)
export const daysLeft = (t) => (t ? Math.max(0, Math.ceil((t - Date.now()) / 86400000)) : 0);
