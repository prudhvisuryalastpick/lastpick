// Create the test accounts (login and registration come later).
//   SEED_PASSWORD='a-long-password' node scripts/seed.js           test accounts only
//   SEED_PASSWORD='a-long-password' node scripts/seed.js --demo    plus a verified sample business with offers
// Accounts: admin@test.lastpick.in, moderator@test.lastpick.in (Karnataka), owner@test.lastpick.in, customer@test.lastpick.in
// Running it again resets their passwords and roles (the deploy does this each time); nothing else is touched.
import { hashPassword } from "../src/auth.js";
import { closePools, migrate, q } from "../src/db.js";
import { CONSENT_VERSION } from "../src/util.js";

const password = process.env.SEED_PASSWORD || "";
if (password.length < 10) {
  console.error("Set SEED_PASSWORD (10+ characters) to the password the test accounts should use.");
  process.exit(1);
}
await migrate();
const hash = await hashPassword(password);
const consent = { version: CONSENT_VERSION, at: new Date().toISOString() };
const accounts = [
  { email: "admin@test.lastpick.in", name: "Test Admin", phone: "+919999900001", role: "admin", regions: [] },
  { email: "moderator@test.lastpick.in", name: "Test Moderator", phone: "+919999900002", role: "moderator", regions: ["Karnataka"] },
  { email: "owner@test.lastpick.in", name: "Test Owner", phone: "+919999900003", role: "user", regions: [] },
  { email: "customer@test.lastpick.in", name: "Test Customer", phone: "+919999900004", role: "user", regions: [] },
];
const ids = {};
for (const a of accounts) {
  const { rows } = await q(
    `INSERT INTO users (email, password_hash, name, phone, role, regions, consent, partner_consent, trial_ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, now() + interval '30 days')
     ON CONFLICT (lower(email)) WHERE email IS NOT NULL
     DO UPDATE SET password_hash = $2, role = $5, regions = $6
     RETURNING id`, [a.email, hash, a.name, a.phone, a.role, a.regions, consent]);
  ids[a.email] = rows[0].id;
  console.log(`${a.role.padEnd(9)} ${a.email}`);
}

if (process.argv.includes("--demo")) {
  const owner = ids["owner@test.lastpick.in"];
  await q(`INSERT INTO businesses (id, name, category, categories, about, address, area, city, state, city_key, pincode, lat, lng, status, trial_ends_at, reviewed_at)
           VALUES ($1, 'Test Bakery & Stays', 'food', '{food,stay}', 'Fresh bakes every evening.', '12, 4th Cross', 'Indiranagar', 'Bengaluru', 'Karnataka', 'bengaluru', '560038', 12.9719, 77.6412, 'verified', now() + interval '30 days', now())
           ON CONFLICT (id) DO UPDATE SET status = 'verified'`, [owner]);
  await q(`INSERT INTO business_contacts (business_id, phone, whatsapp) VALUES ($1, '+919999900003', true) ON CONFLICT (business_id) DO NOTHING`, [owner]);
  const { rows } = await q("SELECT count(*)::int AS n FROM offers WHERE owner_id = $1", [owner]);
  if (!rows[0].n) {
    const offers = [
      ["Closing-time cakes, 50% off", "food", "🍰", 600, 300, "8 cakes", 6],
      ["Deluxe room tonight", "stay", "🛏️", 3500, 1999, "2 rooms", 20],
      ["Fresh bread basket", "food", "🥖", 250, 120, "15 baskets", 4],
    ];
    for (const [title, category, emoji, orig, price, qty, hours] of offers) {
      await q(`INSERT INTO offers (owner_id, title, description, category, emoji, orig_price, price, quantity, ends_at)
               VALUES ($1, $2, 'Sample offer for testing.', $3, $4, $5, $6, $7, now() + make_interval(hours => $8))`, [owner, title, category, emoji, orig, price, qty, hours]);
    }
  }
  console.log("Sample business 'Test Bakery & Stays' (Bengaluru) with 3 offers is ready.");
}
await closePools();
