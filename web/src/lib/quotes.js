// Short, simple, moral quotes. Our own lines (not famous quotes), so they can be shown anywhere.
// They rotate automatically every 30 minutes: the scrolling strip and the quote on every post change
// together, with no manual work. Each post gets its own quote (by post id), so two posts side by side differ.

export const QUOTE_SLOT_MS = 30 * 60 * 1000;

const GENERAL = [
  "Kindness costs nothing. Good deals cost less.",
  "Buy local. Grow together.",
  "Small shops build big hearts.",
  "Save money. Spend it on people you love.",
  "Waste nothing. Value everything.",
  "Every rupee spent nearby feeds a family.",
  "Honest prices, happy neighbours.",
  "Good things happen to those who show up.",
  "A fair deal is a friendship.",
  "Share the joy, not just the bill.",
  "Be thankful for today. It ends at midnight.",
  "Support the hands that serve you.",
  "Your neighbour's shop is your city's heart.",
  "Spend wisely. Live fully.",
  "Today is a gift. So is this deal.",
  "Respect every shopkeeper. They open early for you.",
  "Little savings make big smiles.",
  "Choose kindness, every single time.",
  "Fresh today, gone tomorrow. Like every moment.",
  "Treat every customer like family.",
  "The best things are shared.",
  "Grateful hearts find the best deals.",
  "Trust is the best price tag.",
  "Live simply. Save smartly.",
  "Help a shop today. Help a city forever.",
  "Do good, and good finds you.",
  "Value people more than things.",
  "One good deed a day is enough.",
  "Waste less food. Feed more joy.",
  "Small steps, big change.",
];
const BY_CATEGORY = {
  food: [
    "Good food tastes better shared.",
    "Never waste food. Someone baked it with love.",
    "Fresh food, fair price, full heart.",
    "Eat well. Waste nothing.",
    "A shared meal is a happy meal.",
    "Respect the cook. Finish your plate.",
  ],
  stay: [
    "Rest well tonight. Tomorrow needs you.",
    "Every guest is a blessing.",
    "A good night's rest is the best deal.",
    "Travel light. Sleep well.",
  ],
  travel: [
    "Every journey starts with one seat.",
    "Go far. Stay kind.",
    "Travel together, arrive happier.",
    "The road is better with good company.",
  ],
  beauty: [
    "Look good, feel good, do good.",
    "Kindness is the best makeover.",
    "Self-care is not selfish.",
    "Confidence is your best style.",
  ],
  grocery: [
    "Fresh from today, for your family tonight.",
    "Good food starts at your local shop.",
    "Buy what you need. Share what you can.",
  ],
  jobs: [
    "Honest work is never small.",
    "Every job well done is a prayer.",
    "Work hard. Stay humble.",
    "Today's helper is tomorrow's owner.",
  ],
};
// partner-facing lines (business app)
export const PARTNER_QUOTES = [
  "Serve with a smile. Customers remember.",
  "Every customer counts. Every day counts.",
  "Honest prices build loyal customers.",
  "Small shop. Big heart.",
  "Open your doors. Open your heart.",
  "Quality today, customers for life.",
  "Your shop, seen by the whole neighbourhood.",
  "Waste nothing. Share today's best.",
  "Great service is the best advertisement.",
  "Kindness brings customers back.",
  "Work with pride. Sell with honesty.",
  "A happy customer is your best review.",
];

const slotNow = (now = Date.now()) => Math.floor(now / QUOTE_SLOT_MS);
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// The quote for one post: its category's lines first, then general ones. Changes every 30 minutes.
export function quoteForOffer(offer, now = Date.now()) {
  const pool = [...(BY_CATEGORY[offer?.category] || []), ...GENERAL];
  return pool[(hash(offer?.id || offer?.title || "") + slotNow(now)) % pool.length];
}

// The lines for the scrolling strip: a fresh set every 30 minutes.
export function stripQuotes(partner = false, count = 8, now = Date.now()) {
  const pool = partner ? PARTNER_QUOTES : GENERAL;
  const start = (slotNow(now) * 5) % pool.length;
  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
}

// ms until the next change, so screens can refresh exactly on the half hour
export const msToNextSlot = (now = Date.now()) => QUOTE_SLOT_MS - (now % QUOTE_SLOT_MS) + 500;
