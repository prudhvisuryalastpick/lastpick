# LastPick on Supabase + Cloudflare

Local businesses post same-day offers; customers nearby see them and tap "I'm interested" (the partner sees only their name). LastPick only connects people.

| Part | Where | Address |
|---|---|---|
| Customer web app | Cloudflare (free, static files) | https://customer.lastpick.in |
| Partner web app | Cloudflare (free) | https://partner.lastpick.in |
| Admin panel | Cloudflare (free) | https://admin.lastpick.in |
| API: 3 functions `customer`, `partner`, `admin` (same code as `server/src`) | Supabase Edge Functions | `https://<project>.supabase.co/functions/v1/<name>` |
| Database (PostgreSQL) + background jobs (pg_cron every 5 min) | Supabase, its own LastPick project, Mumbai | - |
| Android apps (customer, partner): release APK + Play Store bundle | GitHub Actions (Capacitor) | Actions → Build Android APKs → Artifacts |

Supabase's open data API is locked: every table has row-level security and no grants for its public roles, so only the LastPick functions reach the data.
**Cost:** $0 while testing (Supabase Free + Cloudflare Free); Supabase Pro $25/month at launch. Alternative kept in the repo: the same API on Cloudflare Workers (`wrangler.workers.toml`, manual workflow).

## Set up (one time, owner)

1. **Cloudflare:** add `lastpick.in` (Free) and change the nameservers at GoDaddy to Cloudflare's two. Create an API token from the **"Edit Cloudflare Workers"** template (zone lastpick.in).
2. **Supabase:** create a **new project just for LastPick**, region **Mumbai**. Copy: the **Session pooler** connection string (Connect button, with your database password), the **Project ID** (Project Settings → General), and an **access token** (Account → Access Tokens).
3. **GitHub → this repo → Settings → Secrets and variables → Actions**, add: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SEED_PASSWORD`.
4. **Actions → Deploy (Supabase + Cloudflare pages) → Run workflow**, tick *test accounts*. After that every push to `main` deploys.

Test accounts (password = `SEED_PASSWORD`): `admin@test.lastpick.in`, `moderator@test.lastpick.in`, `owner@test.lastpick.in`, `customer@test.lastpick.in`.

## What's inside

| Part | Tech | Where |
|---|---|---|
| Web apps (3 builds from one codebase) | React 18 + Vite | `web/` |
| API (one codebase, `SERVICE=customer\|partner\|admin`) | Node.js 22, only one package (`pg`) | `server/` |
| Database schema | PostgreSQL 16 migrations | `server/migrations/` |
| API on Supabase Edge Functions | Deno | `supabase/functions/*`, `server/src/edge.js` |
| Web apps on Cloudflare (static) | Wrangler | `wrangler.toml`, `wrangler.home.toml` (home page `web/landing/`) |
| Tests (Node server, Supabase code in Node and Deno), deploy on every push | GitHub Actions | `.github/workflows/supabase.yml` |
| AI agents: CI/CD and deployment | Claude Code | `.claude/agents/` |

## Planned (after we have good partners)


## Product rules built in

- **Help and tickets:** Help & support shows topics with instant answers first; only if those don't help does the person raise a ticket (numbered #LP-10001…, up to 3 photos, each shrunk to ~250 KB and kept in Cloudflare R2). We promise a reply within 1–5 business days (Mon–Fri). No e-mails are sent about tickets: replies show in Help. A ticket closes when the customer taps "My problem is solved", when the team marks it "Resolved on a call" (a note is required and the customer sees it) or resolved, or by itself 3 days after a team reply with no answer; writing again reopens it.
- **Support Desk (support.lastpick.in):** tickets and call backs are answered there, not in the admin panel. Super admins see all of India and create area in-charges there: separate desk-only accounts with a login e-mail and a password the super admin sets (and can reset), for states optionally narrowed to cities and/or pincodes. These accounts can't log in to the customer or partner apps, and app e-mails can't be reused for them. In-charges see only their area's tickets and call backs and can't open the admin panel. Tickets waiting 4+ business days are flagged overdue; in-charges can flag a ticket "Needs admin".
- **Rentals (homes and workspaces):** owners registered as Rentals post a listing (1RK to villas and PG; office space, coworking desks, cabins, study halls, shops, godowns, event halls) for 15 days ₹249 or 30 days ₹499, paid per listing on the website (free in free launch mode). Up to 5 photos (shrunk under 1 MB on the phone) and one video (up to 1 minute, 20 MB), uploaded straight to Cloudflare R2. Day 1 is today; it ends at 11:59 PM on the last day. "Rented out" / "Leased out" hides it at once; photos and video are deleted 7 days later (it can be reopened until then); a small record stays. Customers see Homes | Workspaces within 30 km and call or WhatsApp the owner after logging in.
- **Category locked:** a partner's category can't be changed after registration; only a super admin can change it (with a logged reason), and the partner's live offers end.
- **Shop photo:** partners upload a photo of the shop (not a selfie) for KYC; stored in R2, seen only by the partner and admins.
- **Home category photos:** each category tile fades through 5 photos (160 px WebP from R2); admins replace them in Settings.

- **Offers are item lists:** every partner adds items (name, actual price, offer price) with Add item / remove, up to 10 per offer, and picks the end time from the dropdown. No description, no photo. The best item sets the offer's price and "Up to X% off"; customers see every item with its old price, offer price and % off.
- **Today only, 3 posts a day:** nothing carries over to the next day; partners post again every day (up to 3). "Post again" in My offers → History copies a past offer into today's form.
- **Storage kept small:** at midnight a finished offer becomes a one-line record (date, shop, category, offer name, items "Kaju katli 400>200; Samosa 60>40", views, leads), kept 1 year for partners and admin reports, then deleted. Customer History (who contacted which shop) is kept 30 days. Both apps and the privacy page say so.
- **Admin → Pincodes:** partner registrations per pincode (partners, verified, joined today), filter by category; moderators see only their areas. Customers don't give a pincode, so only their total is shown.

- **E-mails (Brevo):** sign-up code, welcome, "registration received", business approved / rejected / paused (with the reason), payment receipt when a plan is activated or extended, plan ended, free period extended. Replies go to support@lastpick.in.
- **Customers always see offers within 30 km of their live location (GPS).** No manual pincode or city: the app asks for location, keeps it updated while open, and asks the user to turn location on if it is off. The header shows the area and pincode found from the location.
- **Login (customer and partner apps):** e-mail **or** mobile number + password. Sign-up: name, e-mail, mobile, password + confirm password; the app asks "Is this your correct mobile number?" before sending a 6-digit **e-mail code** (10-minute expiry, 30-second resend). The mobile number is saved (format and fake-number checks, one account per number). **Mobile check is switched off for now (Nov 2026, e-mail only):** the workflow sets `WA_VERIFY=off`, so sign-up asks only the e-mail code and the number is saved, not checked. The WhatsApp check is kept in the code: when switched back on, sign-up also sends a 6-digit **WhatsApp code** (template `lastpick_otp`) to the mobile number and the account is created only when both codes are right (`phone_verified_at` is recorded; 30-second gap, 4 an hour per number, shared daily cap `WA_DAILY_CAP`). Without it the number is saved but not checked. If Meta refuses the WhatsApp message (template missing or not approved, account not allowed yet) sign-up is never blocked: that sign-up continues with the e-mail code only (number saved, not marked verified) and the error is logged. E-mail goes through **Brevo** only (`BREVO_API_KEY` + `MAIL_FROM`). One device at a time stays on. **Admin app:** e-mail + password (staff only). **WhatsApp login** (mobile + WhatsApp code) is built and kept, used only when the GitHub variable `WA_LOGIN` = `on`.
- **KYC (everyone):** the Account page shows a KYC card: e-mail verified, mobile number ("✓ Added" while the mobile check is off; when it's on: mobile verified, with "Verify mobile number" by WhatsApp code if it couldn't be checked at sign-up; changing the number resets it), and for partners the photo and business check. Before any WhatsApp code the person ticks "I agree to get my verification codes and account messages from LastPick on WhatsApp" (`whatsapp_optin_at` stored). Admins see "mobile verified" in the users tables.
- **Partner KYC:** partners must add a profile photo of the owner at sign-up (stored small, seen only by the partner and admins, every admin view logged). Until an admin verifies the business the partner home shows "KYC in progress" and posting stays locked.
- **Old offers wiped at once:** ended offers leave the live table on the next 5-minute run (summary kept in the partner's History).
- **Partner Agreement per category (lib/terms.js PARTNER_RULES):** general partner commitments + rules for that kind of business (food, hotels, salon, makeup, gym, farm fresh, fashion, appliances, local ads, other) + the full Terms; shown on the business registration screen, must be read to the end; the exact text (with the category) is stored.
- **Instagram icon:** on the home page footer, login screen and Account page; "coming soon" until the links are set (SOCIAL in web/src/lib/config.js, and the href in web/landing/index.html).
- **Maintenance mode:** Admin → Overview → Maintenance switches it on now or schedules a From–Until window (India time) for the customer and/or partner app, with an optional message. While active those apps show a full-screen maintenance page ("Back by …") and the API refuses changes from them (503); the admin app is never paused. It ends by itself at "Until". A warning banner shows up to 24 hours before a scheduled window. If the server can't be reached (e.g. during a deploy) the apps show a "We'll be right back" page with Try again. Code: server/src/maintenance.js, web/src/pages/maintenance.jsx.
- **Partner home before login:** partner.lastpick.in shows the same sticker hero as the customer home in partner colours (Log in and Create account top right, live counts, "Who it's for" tiles that open sign-up with that business type, how it works, Business Pro packs); partners land on it directly (no separate opening screen). No bottom bar until logged in.
- **Home banners change by themselves:** the big banner on both homes moves to a new line every 3.5 seconds (customer: 9 lines, one per kind of deal, button opens that category; partner: 10 lines, one per business type plus 3 for everyone, "Create free account" starts sign-up with that business type). Each visitor gets a new random order. Lines live in web/src/pages/hero.jsx (customer) and web/src/pages/partnerhome.jsx (partner).
- **About page:** MSME (Udyam) details, then "To my family, with love" (fixed order chosen by the founder, couples together, "My special ones" in one line), "Thank you, always" (cards scroll right to left, new random order each visit), a thank-you to everyone else, his quote and a "Directed by God" credit. Initials only, no photos. Wording lives in web/src/pages/about.jsx.
- **Contact LastPick (#/get-help):** one screen with Request a call back, Send us a message (support ticket) and E-mail; reached from a "Need help?" card on both home pages, Account → Help, and the ? help panel. Partners see Call back first, customers Message first. A call back uses the phone saved on the account, one open request per person (3 a day at most), e-mails support@lastpick.in, and shows in Admin → Support → Call backs (Call / Mark done). Hours shown are SUPPORT_HOURS in web/src/lib/config.js.
- **Install app:** open to everyone, no subscription needed: the round Install button at the top right of both homes and the Account menu item, plus an invite after payment; Android uses the browser install prompt, iPhone shows the Safari "Add to Home Screen" steps. The partner site installs as "LastPick Partner" with its own icon (manifest-partner.webmanifest). Home counts show the exact number (no "+") and count up from 1 when the page opens.
- **Idle logout:** after 15 minutes without activity the app logs out (also when reopened after a longer break).
- **Offers close at 11 PM automatically:** a job every 5 minutes ends offers whose time is up, and after 11 PM closes everything except hotels and local ads, even if the partner forgets.
- **Terms and Conditions (lib/terms.js):** one document for customers and partners. The Agree box unlocks only after scrolling to the end. Each acceptance stores the exact text (SHA-256 fingerprint), version, time, device and network address; Admin → Users → Terms → Record shows and downloads it. Changing the Terms: bump CONSENT_VERSION in web/src/lib/config.js and server/src/util.js.
- **Admin panel:** a side menu (Overview, Partners, Areas, Reports, Support, Complaints, Customers, Banners and boosts, Settings) and one filter bar shared by Overview, Partners and Areas: **State → City → Pincode** (each list narrows to the one before), **Category** and a search for shop, owner or phone. Overview: Partners, Business Pro active, Ending in 3 days, Waiting for KYC, Live offers, Registered customers (all India, customers give no pincode), then a table by pincode. Partners: one table with status chips (All, Waiting for KYC, Verified, Suspended, Rejected, Plan ending soon); **Manage** opens verify / reject / suspend with a note and, for super admins, Business Pro packs paid outside the app (5 / 15 / 30 days), free days (1–365) or End plan. Settings: four square on/off boxes: Maintenance (with Customer app / Partner app buttons and a schedule), **Customer plan (Customer Pass)**, Free launch mode, One device at a time.
- **Admin users:** Customers and Partners in separate tables, each with search and a CSV download (logged).
- **One device at a time:** logging in on a new device logs out the old one, and the old device says why. Admins can switch this off for customers (Admin → Overview); partner and admin logins always stay one device.
- **Consent checked on the server:** customers can't view numbers, share theirs or review without accepting the current notice. That notice includes "LastPick is only a platform". Partners can't post without accepting the business terms.
- **Working hours (India time):**
  - Hotels and local ads are 24×7: they can post at any time, and an offer runs for up to 24 hours.
  - Everyone else picks a clock time on the hour for the offer to end (e.g. Till 9 PM, Till 10 PM, Till 11 PM), at least 30 minutes away. Customers see a live "Offer ends in 2h 05m 09s" timer.
  - Everyone else can post from 4 AM to 10:30 PM, so a post at 10 PM can run till 11 PM at most. Their offers are shown 4 AM to 11 PM, end by 11 PM and are removed at 12 midnight.
  - Customers are told this on the home screen.
  - Change the hours with `OPEN_HOUR` / `CLOSE_HOUR` (shown hours) and `POST_FROM_HOUR` / `POST_TILL_HOUR` (posting).
- **One category per partner:** a partner picks one category and posts offers only in it. 3 posts a day. **No job openings / hiring** (removed Nov 2026: partners can't post them and customers never see them).
- **Trusted partners only:** a business can post only after the LastPick team verifies it and an admin activates its plan.
- **Names only:** partners see the names of interested customers, never their numbers. Customers see the shop's number as text (no call or WhatsApp buttons).
- **Offer times:** customers see "Offer ends in 4 hours" with the time, the normal price struck off, the offer price and the % off.
- **Views and reviews:** partners see how many customers saw each offer, and read and reply to reviews. There is no Boost button in the partner app (featuring an offer is admin-only, under Admin → Revenue).
- **Shop location from GPS:** the partner taps "Detect my shop location" at the shop (done automatically for a new business). It saves the map point and fills pincode, state, city and address (OpenStreetMap), then the area list from the pincode (India Post). The pincode and state can't be typed.
- **No dashboards** for customers or partners; admins see platform totals.
- **No combos:** removed (migration 011 closes old combo offers and drops the column).
- **Automatic discount:** the % off is worked out from the prices; any "40% off" in the title is corrected automatically (app and server).
- **Categories:** Food, Hotels, Salon, Makeup, Gym, Farm fresh, Fashion, Home appliances, Local ads, Other. Travel, Logistics and Shops were removed (migration 020 moves their partners and offers to Other). Only Hotels and Local ads run 24×7.
- **Customers are free:** no pass and nothing to pay; logged-in customers see the owner's number with a **Call** button (no WhatsApp). The Customer Pass is switched off; Admin → Settings → Customer plan turns it on (app_settings `customer_pass`; the server setting `CUSTOMER_PASS=on` is only the starting value; the apps read `customersFree` from `/api/config`). History tags each business **Live · ends 11 PM / Ends in 20 min / Offer ended · 8:00 PM** and hides the number once the offer ends.
- **Plans (only two, one sold now):** Customer Pass **₹29 / 5 days, ₹59 / 15 days, ₹99 / 30 days** (switched off, see above); Business Pro (verified businesses only) **₹119 / 5 days, ₹299 / 15 days or ₹499 / 30 days**, (`PAY_PACKS` in revenue.js, `packs` in web config). **The day of payment is Day 1** and a plan runs till 11:59 PM (India time) on its last day: 5 days bought on 25 Nov = 25–29 Nov. **One pack at a time:** while a plan runs, its pack shows Active, the other two Inactive, and the only purchase is **Top up** with the same pack, added after the current last day (subscriptions `period_start`, `pack_days`). Partners see one **plan bar** (Business Pro · 5 days · 3 days left · Day 3 of 5 · till 29 Nov, 11:59 PM) on Home and Plans. **Paid online with Razorpay, no auto-renewal.** The server makes the Razorpay order, checks Razorpay's signature (or asks Razorpay if the app lost the reply) and counts each order once (`payments` table, `plan_sales` source `gateway`); a receipt e-mail goes out. Keys: GitHub secrets `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. Admins can still turn plans on by hand after an outside payment. Boosts stay manual (admin confirms).
- **No photos:** partners don't upload photos; every offer shows its category icon. Keeps the app fast and the data bill low.
- **Light and cacheable:** replies are compressed; public offer lists are fetched without the login and with the location rounded to about 1 km, so Cloudflare serves the same copy to everyone nearby for 60 s.
- **Quotes:** one short moral quote at a time in the top bar (changes every 7 seconds; a new set every 30 minutes) and one on every offer.
- **Support:** customers and partners chat with the LastPick team in the app (Help & support); admins and moderators answer in Admin → Support chats. Formal complaints keep their own ticket system.
- **Rules:** a plain-language "How LastPick works & rules" page plus the full Terms. They say LastPick is only a platform, takes no responsibility for the deal, and acts on providers through reviews and reports.

- **My items and quantity:** partners keep a list of item **names** (My items, no prices; up to 50; add once, remove any time; every posted name joins it). When posting they tap names from My items and type only that day's actual price, offer price and an optional **quantity** with a unit for their category (plates, rooms, bags, slots…). Adding an item offers the category's choice (Food: Full/Half, Hotels: AC/Non-AC, Salon: Men/Women/Kids, Fashion: size, Home appliances: New/Open box). Customers see "10 plates left" under the item.
- **Posting rules pop-up:** before every post the partner reads the rules (nothing that breaks Indian law, harms public order or is false or misleading; offers removed, partnership suspended or cancelled, reported for legal action) plus one line for their category, scrolls to the end and taps "I understand, post my offer"; the acceptance is recorded with the offer (`POSTING_RULES` in web/src/lib/terms.js).

## How each requirement is covered

| Need | How |
|---|---|
| **Encryption** | HTTPS everywhere (Cloudflare for the sites, Supabase for the API). Database storage is encrypted at Supabase. Passwords are hashed with scrypt. Secrets live in GitHub Actions secrets and Supabase function secrets, never in code. |
| **Data API locked** | Supabase's open data API can't read any table: row-level security on every table and no grants for its public roles. Only the LastPick functions reach the data. |
| **Rate limiting** | Per IP on every request, plus per user in the database: 60 numbers viewed/hour, 30 shared/hour, 3 posts/day per business, 10 reviews/day, 5 complaints/day, login 10 failed tries per 15 min. |
| **Queuing** | Background job queue in PostgreSQL with retries (`jobs` table); pg_cron runs scheduled tasks every 5 minutes (plan expiry, nightly archive at 02:30 IST). |
| **Scaling** | Supabase starts more copies of a function when busy; Cloudflare serves the web apps from its global network. Bigger database: Supabase compute size. |
| **Backup** | Supabase Pro: daily backups. Free plan: none (use Pro at launch). |
| **E-mail** | Sign-up codes through Brevo (300 a day free) once `BREVO_API_KEY` and `MAIL_FROM` are set. |

Also: the admin panel only lets admins and moderators log in, and there's an audit log (1 year) of number views, offers, reviews, admin actions, exports and deletions.

## AI agents (Claude Code)

| Agent | Where | Does |
|---|---|---|
| `cicd` | `.claude/agents/cicd.md` | Keeps the pipeline green: runs tests, reads failed GitHub Actions runs, fixes the workflow or code, explains the cause |
| `deploy` | `.claude/agents/deploy.md` | Deploys and checks the app: starts the workflow, checks `/healthz` and logs, seeds test accounts, rolls back |

### Optional repository variables

`CUSTOMER_URL`, `PARTNER_URL` (once you have a domain), and the legal details shown in the app before launch: `LEGAL_NAME`, `LEGAL_ADDRESS`, `GRIEVANCE_OFFICER`, `GRIEVANCE_EMAIL`, `GRIEVANCE_PHONE`.

## Day to day

- **Logs**: Supabase → Edge Functions → customer / partner / admin → Logs.
- **Roll back**: re-run an older successful "Deploy (Supabase + Cloudflare pages)" run, or revert the change and push.
- **Database**: Supabase → Table editor / SQL editor (Pro plan: restore from a daily backup).
- **Make someone an admin or moderator**: Admin panel → Team.

## Run locally

```bash
docker compose up                   # PostgreSQL + the three servers (:8081 customer, :8082 partner, :8083 admin) with demo data
cd web && npm install
API_PROXY=http://localhost:8081 VITE_APP_VARIANT=customer npm run dev   # customer app at http://localhost:5173
API_PROXY=http://localhost:8082 VITE_APP_VARIANT=owner npm run dev      # partner app
API_PROXY=http://localhost:8083 VITE_APP_VARIANT=admin npm run dev      # admin panel
```

Local test accounts use the password `LocalTest1234`. Server tests: `cd server && DATABASE_URL=postgres://postgres:postgres@localhost:5432/lastpick_test npm test` (the test database is wiped).

## Not done yet (planned order)

1. **Android apps**: release APK + Play Store bundle are built by GitHub Actions; they use the live API once Supabase is connected.
2. **Play Store**: permanent signing key, store listing, Data safety form.
3. **Login and registration**: one-time codes by SMS and e-mail (the screens exist; the server side is switched off, `VITE_OTP_LOGIN`). Until then, only test accounts can log in (`SIGNUP=closed`).
4. **Payments in the Android app** (Google Play Billing). The web apps pay with Razorpay.
5. **Domain**: lastpick.in on Cloudflare; the deploy creates customer./partner./admin. automatically.

## Privacy and legal (India)

The rules from the earlier version carry over: notice + consent with version tracking, share-my-number confirmation, location used on the phone only, data export and account deletion (DPDP Act 2023), complaint tickets (IT Rules 2021), reviews only from customers who contacted the business (IS 19000:2022), and retention limits (activity logs 1 year). Have a lawyer review the Terms and Privacy notice before launch.
