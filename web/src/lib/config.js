// ---- Change these to rebrand or reprice the app ----
export const APP_NAME = "LastPick";
export const SUPPORT_EMAIL = import.meta.env?.VITE_SUPPORT_EMAIL || "support@lastpick.in";
// Optional support phone / WhatsApp (shown in Help & support when set at build time).
export const SUPPORT_PHONE = import.meta.env?.VITE_SUPPORT_PHONE || "";
export const SUPPORT_WHATSAPP = import.meta.env?.VITE_SUPPORT_WHATSAPP || "";
export const SUPPORT_HOURS = "9 AM – 9 PM, all days";
// Public addresses of the three sites (set at build time; CloudFront addresses until the domain is bought).
export const WEBSITE_URL = import.meta.env?.VITE_CUSTOMER_URL || "https://lastpick.in";
export const PARTNER_URL = import.meta.env?.VITE_PARTNER_URL || WEBSITE_URL;

// Which app this build is: "customer" (customer server), "owner" (partner server), "admin" (admin server) or "web" (everything, local dev).
export const APP_VARIANT = import.meta.env?.VITE_APP_VARIANT || "web";
export const IS_OWNER_APP = APP_VARIANT === "owner";
export const IS_CUSTOMER_APP = APP_VARIANT === "customer";
export const IS_ADMIN_APP = APP_VARIANT === "admin";
// One-time-code login (SMS / e-mail) comes later. Until then: e-mail + password (test accounts).
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
};
// Bump when the privacy notice or terms change: everyone is asked to accept again. Keep in sync with functions/index.js.
export const CONSENT_VERSION = "2026-11-20";
// A business picks a main category plus up to 2 more, and can post only in those.
export const MAX_CATEGORIES = 3;
// Each business can post this many offers per day (India time). Keep in sync with functions/index.js.
export const POSTS_PER_DAY = 3;
export const GRIEVANCE_TYPES = ["Offer or business", "My account or data (privacy)", "A review", "Payments or plans", "Something else"];
export const REVIEW_REPORT_REASONS = ["Fake or paid review", "Abusive or hateful", "Personal information", "Not about this business", "Something else"];

// Plans. Everyone gets a free month first: customers from sign-up, businesses from the day they're verified.
// After that: Customer Pass from ₹149/month, Business Pro (for verified business partners) from ₹499/month.
// Longer plans cost less per month. Payments are not live yet; nobody is charged until they are switched on.
export const TRIAL_DAYS = 30;
export const PLANS = {
  customer: {
    id: "customer", name: "Customer Pass", price: 149,
    options: [{ months: 1, price: 149 }, { months: 3, price: 399 }, { months: 6, price: 749 }, { months: 12, price: 1399 }],
    perks: ["See every business's phone number", "Call or WhatsApp businesses directly", "Share your number in one tap", "Keep a list of businesses you contacted"],
  },
  owner: {
    id: "owner", name: "Business Pro", price: 499,
    options: [{ months: 1, price: 499 }, { months: 3, price: 1349 }, { months: 6, price: 2499 }, { months: 12, price: 4499 }],
    perks: ["Post unlimited offers", "Get customers' numbers when they're interested", "Shown to customers within 30 km", "Views, leads and reviews for every offer"],
  },
};
export const planLabel = (m) => (m === 12 ? "1 year" : `${m} month${m > 1 ? "s" : ""}`);
export const savePct = (plan, o) => Math.round((1 - o.price / (PLANS[plan].price * o.months)) * 100);

// Default map centre when the user doesn't share location.
export const DEFAULT_LOCATION = { lat: 12.9716, lng: 77.5946, label: "Bengaluru" };

// Any kind of offer can be posted; "other" covers everything not listed.
export const CATEGORIES = [
  { id: "food", label: "Food & bakery", icon: "🍰" },
  { id: "grocery", label: "Grocery", icon: "🥬" },
  { id: "stay", label: "Hotels & stays", icon: "🛏️" },
  { id: "venue", label: "Halls & venues", icon: "💒" },
  { id: "travel", label: "Bus & travel", icon: "🚌" },
  { id: "rental", label: "Rentals", icon: "🚗" },
  { id: "sports", label: "Sports & fitness", icon: "⚽" },
  { id: "beauty", label: "Salon & spa", icon: "💇" },
  { id: "health", label: "Doctors & health camps", icon: "🩺" },
  { id: "admissions", label: "School & college admissions", icon: "🎓" },
  { id: "trips", label: "Trips & ride share", icon: "🧳" },
  { id: "sell", label: "Locals selling", icon: "🏷️" },
  { id: "jobs", label: "Jobs & part-time work", icon: "🧰" },
  { id: "retail", label: "Shopping", icon: "🛍️" },
  { id: "electronics", label: "Electronics", icon: "📱" },
  { id: "events", label: "Movies & events", icon: "🎬" },
  { id: "services", label: "Services", icon: "🛠️" },
  { id: "education", label: "Classes", icon: "📚" },
  { id: "other", label: "Anything else", icon: "📦" },
];
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

export const TINTS = {
  food: "#fff1e6", grocery: "#ecf8e6", stay: "#e9f0ff", venue: "#fdeaf3", travel: "#e8f7f1", rental: "#eaf4ff",
  sports: "#eef8e3", beauty: "#f4ecff", health: "#e6f6f8", retail: "#fff7dc", electronics: "#eef0f6",
  events: "#ffe9e9", services: "#f1efe8", education: "#e9edff", other: "#f2f2f6",
  admissions: "#e8f0fb", trips: "#fdeaf0", sell: "#f2ecff", jobs: "#eaf6ee",
};

export const EMOJIS = ["🍰", "🥐", "🍱", "🥬", "🛏️", "💒", "🚌", "🚗", "⚽", "💇", "🩺", "👕", "📱", "🎬", "🛠️", "📚", "📦", "🎁"];

export const DURATIONS = [1, 2, 3, 6, 12, 24, 48, 72, 168, 336, 720]; // hours, max 30 days
// Admission campaigns run longer (up to 120 days), e.g. "early-bird admissions till 31 May".
export const ADMISSION_DURATIONS = [168, 336, 720, 1440, 2160, 2880];
// Admissions season: school & college admission offers get a top spot on the customer home screen
// from January to the end of June (months 1-6). Change here to move the season.
export const ADMISSION_SEASON = { from: 1, to: 6 };
export const inAdmissionSeason = (d = new Date()) => d.getMonth() + 1 >= ADMISSION_SEASON.from && d.getMonth() + 1 <= ADMISSION_SEASON.to;

export const REPORT_REASONS = [
  "Fake or misleading offer",
  "Owner did not honour the offer",
  "Wrong or fake phone number",
  "Illegal or unsafe item",
  "Asked for advance payment / scam",
  "Something else",
];

// Quick-start templates for owners. Anything can be posted; these just save typing.
export const TEMPLATES = [
  { label: "Closing-time food", category: "food", emoji: "🍰", title: "Fresh stock before closing", origPrice: 500, price: 250, quantity: "Limited stock", hours: 3 },
  { label: "Tonight's rooms", category: "stay", emoji: "🛏️", title: "Rooms available for tonight", origPrice: 3000, price: 1799, quantity: "3 rooms", hours: 6 },
  { label: "Free hall date", category: "venue", emoji: "💒", title: "Function hall free on this date", origPrice: 150000, price: 90000, quantity: "1 date", hours: 72 },
  { label: "Empty seats", category: "travel", emoji: "🚌", title: "Seats left on tonight's bus", origPrice: 1200, price: 700, quantity: "5 seats", hours: 3 },
  { label: "Empty slot", category: "sports", emoji: "⚽", title: "Slot available today", origPrice: 1500, price: 900, quantity: "1 slot", hours: 3 },
  { label: "Idle vehicle", category: "rental", emoji: "🚗", title: "Self-drive car free this weekend", origPrice: 5000, price: 2999, quantity: "1 car", hours: 24 },
  { label: "Clearance stock", category: "retail", emoji: "🛍️", title: "Clearance sale, limited stock", origPrice: 1000, price: 499, quantity: "20 pieces", hours: 48 },
  { label: "Empty movie seats", category: "events", emoji: "🎬", title: "Empty seats for tonight's show: tickets at low price", origPrice: 200, price: 80, quantity: "50 seats", hours: 4 },
  { label: "Admissions open", category: "admissions", emoji: "🎓", title: "Early-bird admissions: 20% off first-year fees", origPrice: 50000, price: 40000, quantity: "Seats for 2027-28", hours: 1440 },
  { label: "Free health camp", category: "health", emoji: "🩺", title: "Free eye check-up camp this Sunday", origPrice: 500, price: 0, quantity: "60 slots", hours: 72 },
  { label: "Trip with free seats", category: "trips", emoji: "🧳", title: "Driving to Mysuru tomorrow 6 AM, 2 seats free", origPrice: 800, price: 350, quantity: "2 seats", hours: 24 },
  { label: "Shop job opening", category: "jobs", emoji: "🧰", title: "Shop helper needed, full time", origPrice: 15000, price: 15000, quantity: "2 openings · ₹15,000/month", hours: 336 },
  { label: "Part-time / daily work", category: "jobs", emoji: "🧰", title: "Loaders (coolies) needed tomorrow 7 AM, ₹700/day", origPrice: 700, price: 700, quantity: "5 people · ₹700/day", hours: 24 },
  { label: "Selling my item", category: "sell", emoji: "🏷️", title: "Used cycle in good condition", origPrice: 4000, price: 1500, quantity: "1 piece", hours: 168 },
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
export const RETENTION = { endedOfferVisibleDays: 7, archiveDays: 365, leadsDays: 365, contactsDays: 365, reportsDays: 365, auditDays: 365, closedGrievanceDays: 730 };
