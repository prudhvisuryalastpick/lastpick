// ---- Change these to rebrand or reprice the app ----
export const APP_NAME = "LastPick";
export const SUPPORT_EMAIL = import.meta.env?.VITE_SUPPORT_EMAIL || "support@lastpick.in";
// LastPick's Instagram page. Empty = not created yet: the icons show "coming soon".
// Add the links here (or as VITE_INSTAGRAM_URL) once the page exists.
export const SOCIAL = {
  instagram: import.meta.env?.VITE_INSTAGRAM_URL || "https://www.instagram.com/lastpick_partner/",
};
// Shown in the footer of the apps and lastpick.in (lower case on purpose, as the owner asked).
// From the Udyam Registration Certificate (Ministry of MSME). Shown on the About page.
export const COMPANY = { owner: "Prudhvi Surya", enterprise: "Doormate Online", unit: "LastPick", type: "Micro enterprise · Services", udyam: "UDYAM-TS-20-0228036", registered: "17 Nov 2026", address: "Villa 9, Thiru Sankalp Villas, beside Aditya Lagoon, Nizampet, Hyderabad, Medchal-Malkajgiri, Telangana 500090" };
// Optional support phone / WhatsApp (shown in Help & support when set at build time).
export const SUPPORT_PHONE = import.meta.env?.VITE_SUPPORT_PHONE || "";
export const SUPPORT_WHATSAPP = import.meta.env?.VITE_SUPPORT_WHATSAPP || "";
export const SUPPORT_HOURS = "9 AM – 9 PM, all days";
// Public addresses of the three sites (set at build time).
// This app's own website (shown in the Terms and privacy notice): partner.lastpick.in in the partner app.
export const WEBSITE_URL = (import.meta.env?.VITE_APP_VARIANT === "owner" ? import.meta.env?.VITE_PARTNER_URL : import.meta.env?.VITE_CUSTOMER_URL) || "https://lastpick.in";
export const PARTNER_URL = import.meta.env?.VITE_PARTNER_URL || WEBSITE_URL;

// Which app this build is: "customer" (customer server), "owner" (partner server), "admin" (admin server) or "web" (everything, local dev).
export const APP_VARIANT = import.meta.env?.VITE_APP_VARIANT || "web";
export const IS_OWNER_APP = APP_VARIANT === "owner";
export const IS_CUSTOMER_APP = APP_VARIANT === "customer";
export const IS_ADMIN_APP = APP_VARIANT === "admin";
// One-time-code login (SMS / e-mail) comes later. Until then: e-mail + password (test accounts).
// The one-time-code login screen (mobile / e-mail tabs) is switched off: the login screen is e-mail + password,
// with sign-up (e-mail code) and forgot password (e-mail code). Set VITE_OTP_LOGIN=1 to bring the code screen back.
export const OTP_LOGIN = import.meta.env?.VITE_OTP_LOGIN === "1";
// true inside the Play Store apps (Capacitor). Google Play doesn't allow selling app features with an outside
// payment gateway inside the app, so payment screens are hidden there (see README "Payments and Google Play").
export const IS_NATIVE = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

// ---- Legal details shown in the app (Consumer Protection (E-Commerce) Rules 2020, IT Rules 2021, DPDP Act 2023) ----
// Fill these in .env.production before launch. As a personal (individual) publisher, use your own legal name and address.
const env = import.meta.env || {};
export const LEGAL = {
  operator: env.VITE_LEGAL_NAME || "",
  address: env.VITE_LEGAL_ADDRESS || "",
  grievanceOfficer: env.VITE_GRIEVANCE_OFFICER || "",
  grievanceEmail: env.VITE_GRIEVANCE_EMAIL || SUPPORT_EMAIL,
  grievancePhone: env.VITE_GRIEVANCE_PHONE || "",
  jurisdiction: env.VITE_LEGAL_JURISDICTION || "", // courts for disputes; default in lib/terms.js: Hyderabad, Telangana
};
// Bump when the privacy notice or terms change: everyone is asked to accept again. Keep in sync with functions/index.js.
export const CONSENT_VERSION = "2026-11-22";
// A business picks a main category plus up to 2 more, and can post only in those (plus job openings at its shop).
export const MAX_CATEGORIES = 3;
// Each business can post this many offers per day (India time). Keep in sync with functions/index.js.
export const POSTS_PER_DAY = 3;
export const GRIEVANCE_TYPES = ["Offer or business", "My account or data (privacy)", "A review", "Payments or plans", "Something else"];
export const REVIEW_REPORT_REASONS = ["Fake or paid review", "Abusive or hateful", "Personal information", "Not about this business", "Something else"];

// Plans. There is no free version: Customer Pass ₹99/month, Business Pro (verified business partners)
// from ₹499/month; longer plans cost less per month. Until the payment gateway is added, the admin turns a
// plan on in Admin → Plans after the payment is received. Keep in sync with TRIAL_DAYS on the server.
export const TRIAL_DAYS = 0;
export const PLANS = {
  customer: {
    id: "customer", name: "Customer Pass", price: 99,
    // shown everywhere the price is: "Get all offers · ₹99 for 30 days"
    tagline: "Get all offers", perDay: "₹3.3 a day", period: "30 days", // 99 / 30 = 3.3
    options: [{ months: 1, price: 99 }],
    // bought online (Razorpay): one payment = this many days; any pack, any number of times
    // (keep in sync with PAY_PACKS in server/src/routes/revenue.js)
    packs: [{ days: 5, price: 29 }, { days: 15, price: 59 }, { days: 30, price: 99 }],
    perks: ["See every business's phone number", "Call or WhatsApp businesses directly", "Share your number in one tap", "Keep a list of businesses you contacted"],
  },
  owner: {
    id: "owner", name: "Business Pro", price: 499,
    // 3 offers a day x 30 days = 90 posts; 499 / 90 = about Rs 5.5 a post
    tagline: "Post 3 offers a day", perPost: "₹5–6 per post", period: "30 days",
    options: [{ months: 1, price: 499 }],
    // partners can buy any pack, any number of times (keep in sync with PAY_PACKS in server/src/routes/revenue.js)
    packs: [{ days: 5, price: 119 }, { days: 15, price: 299 }, { days: 30, price: 499 }],
    perks: ["Post up to 3 offers a day in your category", "See the names of customers who are interested", "Shown to customers within 30 km", "Views, leads and reviews for every offer"],
  },
};
// Boosted offers: a partner pays to feature one offer at the top of customers' home screens. Rupees by hours.
// Keep in sync with BOOST_PRICES in server/src/routes/revenue.js.
export const BOOST_PRICES = { 6: 49, 12: 79, 24: 99 };
// UPI ID partners pay boosts to until the payment gateway is switched on (set at build time).
export const PAY_UPI = import.meta.env?.VITE_PAY_UPI || "";
// Pack maths shown on the Plans page. Rupees a day to 1 decimal (₹16.6); the strike-off price is the same days at
// the shortest pack's daily rate (a real comparison, not an invented "regular price"), and the saving is against it.
export const perDay = (o) => Math.round((o.price / o.days) * 10) / 10;
export const packCompare = (plan, o) => {
  const base = PLANS[plan].packs[0];
  if (o.days <= base.days) return null;
  const was = Math.round((base.price / base.days) * o.days);
  return { was, save: Math.round((1 - o.price / was) * 100) };
};
export const cheapestPerDay = (plan) => Math.min(...PLANS[plan].packs.map(perDay));
export const planLabel = (m) => (m === 12 ? "1 year" : `${m} month${m > 1 ? "s" : ""}`);
export const savePct = (plan, o) => Math.round((1 - o.price / (PLANS[plan].price * o.months)) * 100);

// Default map centre when the user doesn't share location.
export const DEFAULT_LOCATION = { lat: 12.9716, lng: 77.5946, label: "Bengaluru" };

// LastPick is built only on offers from everyday local businesses, and everything ends the same day (by midnight).
// A partner posts ONLY in its own registered category (a bakery posts only bakery offers), plus job
// openings at its own shop. No halls, movie tickets or buy-and-sell of personal items. Keep in sync with CATEGORY_IDS in server/src/routes/partner.js.
export const CATEGORIES = [
  { id: "food", label: "Food", icon: "🍰" },
  { id: "stay", label: "Hotels", icon: "🛏️" },
  { id: "travel", label: "Travel", icon: "🚌" },
  { id: "logistics", label: "Logistics", icon: "🚚" },
  { id: "beauty", label: "Salon", icon: "💇" },
  { id: "makeup", label: "Makeup", icon: "💄" },
  { id: "fashion", label: "Fashion", icon: "👗" },
  { id: "appliances", label: "Home appliances", icon: "📺" },
  { id: "shops", label: "Shops", icon: "🏪" },
  { id: "other", label: "Other", icon: "📦" },
];
// Not a business category: any shop can post a job opening for workers at its own shop. Shown only to
// customers in that local area (10 km / same pincode), like an advertisement.
export const JOB_CATEGORY = { id: "jobs", label: "Job opening at my shop", icon: "📣" };
export const normCategory = (id) => (id === "jobs" ? id : CATEGORIES.some((c) => c.id === id) ? id : "other");
export const categoryOf = (id) => (id === "jobs" ? JOB_CATEGORY : CATEGORIES.find((c) => c.id === normCategory(id)));

export const TINTS = {
  food: "#fff1e6", grocery: "#ecf8e6", stay: "#e9f0ff", travel: "#e8f7f1", sports: "#eef8e3", beauty: "#f4ecff",
  retail: "#fff7dc", electronics: "#eef0f6", services: "#f1efe8", education: "#e9edff", other: "#f2f2f6",
  admissions: "#e8f0fb", jobs: "#fff3d6",
};

export const EMOJIS = ["🍰", "🥐", "🍱", "🥬", "🛏️", "💒", "🚌", "🚗", "⚽", "💇", "🩺", "👕", "📱", "🎬", "🛠️", "📚", "📦", "🎁"];

// Everything posted is for the same day (India time). Keep in sync with server/src/util.js.
export const DURATIONS = [1, 2, 3, 4, 6, 8, 12]; // plus "till closing"; nothing runs past today
// Hotels, travel and logistics stay open 24×7 (post any time, offers up to 24 hours); everything else is shown 4 AM – 11 PM
// and ends by 11 PM. Partners can post only between 4 AM and 10:30 PM (so every offer has at least 30 minutes).
// Everything is removed at 12 midnight.
export const ALWAYS_OPEN = ["stay", "travel", "logistics"]; // 24x7: hotels, travel, logistics (spare truck/van space)
export const HOURS = { postFrom: 4, postTill: 22.5, open: 4, close: 23 };
// Hotels, travel and logistics run 24×7: post any time, up to 24 hours.
export const runs24x7 = (category) => ALWAYS_OPEN.includes(category);
// The % in a title always matches the prices: "40% off" with 400 -> 80 becomes "80% off". Same rule as the server.
export function fixTitlePercent(title, pct) {
  if (!(pct > 0)) return title;
  return title.replace(/\b\d{1,3}(\.\d+)?\s*%\s*(off|discount)?/i, (m, _d, word) => `${pct}%${word ? " " + word : ""}`);
}

export const REPORT_REASONS = [
  "Fake or misleading offer",
  "Owner did not honour the offer",
  "Wrong or fake phone number",
  "Illegal or unsafe item",
  "Asked for advance payment / scam",
  "Something else",
];

// Quick-start templates for partners. Only templates in the partner's own category are shown. Everything ends the same day.
export const TEMPLATES = [
  { label: "Closing-time food", category: "food", emoji: "🍰", title: "Fresh stock before closing, half price", origPrice: 500, price: 250, quantity: "Limited stock", hours: 3 },
  { label: "Meals offer", category: "food", emoji: "🍱", title: "Today's meals at 30% off", origPrice: 200, price: 140, quantity: "40 plates", hours: 4 },
  { label: "Tonight's rooms", category: "stay", emoji: "🛏️", title: "Rooms available for tonight", origPrice: 3000, price: 1799, quantity: "3 rooms", hours: 8 },
  { label: "Empty bus seats", category: "travel", emoji: "🚌", title: "Seats left on tonight's bus", origPrice: 1200, price: 700, quantity: "5 seats", hours: 6 },
  { label: "Salon slots today", category: "beauty", emoji: "💇", title: "Haircut slots free this evening, 40% off", origPrice: 400, price: 240, quantity: "5 slots", hours: 6 },
  { label: "Grocery clearance", category: "grocery", emoji: "🥬", title: "Fresh vegetables and fruits, 30% off till closing", origPrice: 300, price: 210, quantity: "Today's stock", hours: 5 },
  { label: "Laundry discount", category: "laundry", emoji: "🧺", title: "Laundry and ironing 30% off today", origPrice: 300, price: 210, quantity: "Today only", hours: 10 },
  { label: "Bike / car service", category: "vehicle", emoji: "🔧", title: "Bike general service at 25% off today", origPrice: 800, price: 600, quantity: "6 slots", hours: 10 },
  { label: "Gym / turf slot", category: "sports", emoji: "⚽", title: "Turf slot free tonight", origPrice: 1500, price: 900, quantity: "1 slot", hours: 6 },
  { label: "School / college offer", category: "admissions", emoji: "🎓", title: "Admission form fee waived today", origPrice: 1000, price: 0, quantity: "Today only", hours: 10 },
  { label: "Clearance sale", category: "retail", emoji: "🛍️", title: "Clearance sale, today only", origPrice: 1000, price: 499, quantity: "20 pieces", hours: 8 },
  { label: "Photo shoot slot", category: "photo", emoji: "📷", title: "Birthday / family photo shoot, 40% off if booked today", origPrice: 5000, price: 2999, quantity: "2 slots", hours: 8 },
  { label: "Decoration offer", category: "decor", emoji: "🎈", title: "Balloon & flower decoration, 35% off for bookings today", origPrice: 4000, price: 2600, quantity: "3 bookings", hours: 8 },
  { label: "Makeup / mehendi", category: "makeup", emoji: "💄", title: "Party makeup at home, 30% off this evening", origPrice: 2500, price: 1750, quantity: "2 slots", hours: 8 },
  { label: "Tailoring", category: "tailor", emoji: "🧵", title: "Blouse stitching ₹350 (normally ₹500), today's orders", origPrice: 500, price: 350, quantity: "15 orders", hours: 10 },
  { label: "Pet grooming", category: "pets", emoji: "🐾", title: "Dog bath & grooming 40% off today", origPrice: 1000, price: 600, quantity: "6 slots", hours: 9 },
  { label: "Cake orders", category: "food", emoji: "🎂", title: "Custom cakes 25% off for orders placed today", origPrice: 1200, price: 900, quantity: "10 orders", hours: 10 },
  { label: "Event seats", category: "other", emoji: "🎟️", title: "Seats left for tonight's event, 50% off", origPrice: 400, price: 200, quantity: "30 seats", hours: 6 },
];
// Job opening templates (any shop can use these). price = pay in rupees; same day only.
export const JOB_TEMPLATES = [
  { label: "Helper needed", category: "jobs", emoji: "📣", title: "Shop helper needed, 9 AM – 6 PM", origPrice: 12000, price: 12000, quantity: "Pay per month", hours: 8 },
  { label: "Delivery staff", category: "jobs", emoji: "🛵", title: "Delivery person with own bike", origPrice: 15000, price: 15000, quantity: "Pay per month", hours: 8 },
  { label: "Part-time staff", category: "jobs", emoji: "🧑‍🍳", title: "Part-time staff for weekends", origPrice: 600, price: 600, quantity: "Pay per day", hours: 8 },
];

// ---- India ----
export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
];

// Suggested cities (owners can type any city). lat/lng are used to pick the nearest city for a customer.
export const MAJOR_CITIES = [
  { name: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { name: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777 },
  { name: "Delhi", state: "Delhi", lat: 28.6139, lng: 77.209 },
  { name: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867 },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { name: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639 },
  { name: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567 },
  { name: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714 },
  { name: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
  { name: "Kochi", state: "Kerala", lat: 9.9312, lng: 76.2673 },
  { name: "Coimbatore", state: "Tamil Nadu", lat: 11.0168, lng: 76.9558 },
  { name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.6868, lng: 83.2185 },
  { name: "Vijayawada", state: "Andhra Pradesh", lat: 16.5062, lng: 80.648 },
  { name: "Chandigarh", state: "Chandigarh", lat: 30.7333, lng: 76.7794 },
  { name: "Indore", state: "Madhya Pradesh", lat: 22.7196, lng: 75.8577 },
  { name: "Nagpur", state: "Maharashtra", lat: 21.1458, lng: 79.0882 },
  { name: "Mysuru", state: "Karnataka", lat: 12.2958, lng: 76.6394 },
  { name: "Goa", state: "Goa", lat: 15.4909, lng: 73.8278 },
  { name: "Surat", state: "Gujarat", lat: 21.1702, lng: 72.8311 },
];

// "Bengaluru" -> "bengaluru"; used to group offers by city
export const cityKey = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Data retention (days). The nightly cleanup job in functions/index.js uses the same numbers.
// Logs of number exchanges are kept 1 year (DPDP Rules 2025, rule 8(3)). Keep in sync with functions/index.js.
export const RETENTION = { endedOfferVisibleDays: 0, archiveDays: 365, leadsDays: 365, contactsDays: 365, reportsDays: 365, auditDays: 365, closedGrievanceDays: 730 };
