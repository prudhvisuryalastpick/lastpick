# LastPick on Supabase + Cloudflare

Local businesses post same-day offers and job openings; customers nearby see them and tap "I'm interested" (the partner sees only their name). LastPick only connects people.

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

- **E-mails (when Brevo is set up):** sign-up code, welcome, "registration received", business approved / rejected / paused (with the reason), payment receipt when a plan is activated or extended, plan ended, free period extended. Replies go to support@lastpick.in.
- **Login:** e-mail + password. Sign-up checks the e-mail with a 6-digit code; **forgot password** e-mails a 6-digit code, then a new password logs out every other device. The same account works in the customer and partner apps.
- **Customers always see offers within 30 km of their live location (GPS).** No manual pincode or city: the app asks for location, keeps it updated while open, and asks the user to turn location on if it is off. The header shows the area and pincode found from the location.
- **Mobile check at sign-up:** with the SMS_SENDER secret set, sign-up sends a 6-digit code by SMS (Brevo) as well as the e-mail code; each code shows a 10-minute expiry countdown and a 30-second resend wait.
- **Logistics (24×7):** spare space in trucks/vans at a low price; posts any time like hotels and travel.
- **Old offers wiped at once:** ended offers leave the live table on the next 5-minute run (summary kept in the partner's History).
- **Partner Agreement per category (lib/terms.js PARTNER_RULES):** general partner commitments + rules for that kind of business (food, hotels, travel, logistics, salon, makeup, fashion, appliances, shops, other) + the full Terms; shown on the business registration screen, must be read to the end; the exact text (with the category) is stored.
- **Instagram / YouTube icons:** on the home page footer, login screen and Account page; "coming soon" until the links are set (SOCIAL in web/src/lib/config.js, and the two hrefs in web/landing/index.html).
- **Idle logout:** after 15 minutes without activity the app logs out (also when reopened after a longer break).
- **Offers close at 11 PM automatically:** a job every 5 minutes ends offers whose time is up, and after 11 PM closes everything except hotels and travel, even if the partner forgets.
- **Terms and Conditions (lib/terms.js):** one document for customers and partners. The Agree box unlocks only after scrolling to the end. Each acceptance stores the exact text (SHA-256 fingerprint), version, time, device and network address; Admin → Users → Terms → Record shows and downloads it. Changing the Terms: bump CONSENT_VERSION in web/src/lib/config.js and server/src/util.js.
- **Admin users:** Customers and Partners in separate tables, each with search and a CSV download (logged). No Plans or Team tabs: Business Pro is set from Businesses, the Customer Pass from the Customers table.
- **One device at a time:** logging in on a new device logs out the old one, and the old device says why. Admins can switch this off for customers (Admin → Overview); partner and admin logins always stay one device.
- **Consent checked on the server:** customers can't view numbers, share theirs or review without accepting the current notice. That notice includes "LastPick is only a platform". Partners can't post without accepting the business terms.
- **Working hours (India time):**
  - Hotels and travel are 24×7: they can post at any time, and an offer runs for up to 24 hours.
  - Everyone else can post from 4 AM to 10:30 PM, so a post at 10 PM can run till 11 PM at most. Their offers are shown 4 AM to 11 PM, end by 11 PM and are removed at 12 midnight.
  - Customers are told this on the home screen.
  - Change the hours with `OPEN_HOUR` / `CLOSE_HOUR` (shown hours) and `POST_FROM_HOUR` / `POST_TILL_HOUR` (posting).
- **One category per partner:** a partner picks one category and posts offers only in it, plus job openings at their shop (shown within 10 km or the same pincode). 3 posts a day.
- **Trusted partners only:** a business can post only after the LastPick team verifies it and an admin activates its plan.
- **Names only:** partners see the names of interested customers, never their numbers. Customers see the shop's number as text (no call or WhatsApp buttons).
- **Offer times:** customers see "Offer ends in 4 hours" with the time, the normal price struck off, the offer price and the % off.
- **Views and reviews:** partners see how many customers saw each offer, and read and reply to reviews. There is no Boost button in the partner app (featuring an offer is admin-only, under Admin → Revenue).
- **Shop location from GPS:** the partner taps "Detect my shop location" at the shop (done automatically for a new business). It saves the map point and fills pincode, state, city and address (OpenStreetMap), then the area list from the pincode (India Post). The pincode and state can't be typed.
- **No dashboards** for customers or partners; admins see platform totals.
- **No combos:** removed (migration 011 closes old combo offers and drops the column).
- **Automatic discount:** the % off is worked out from the prices; any "40% off" in the title is corrected automatically (app and server).
- **Categories:** Food, Hotels, Travel, Salon, Makeup, Fashion, Home appliances, Shops, Other, plus Hiring (job openings). Old categories are moved by migration 010.
- **Plans (only two, monthly):** Customer Pass ₹99, Business Pro ₹499. The admin activates them until payments are added.
- **No photos:** partners don't upload photos; every offer shows its category icon. Keeps the app fast and the data bill low.
- **Light and cacheable:** replies are compressed; public offer lists are fetched without the login and with the location rounded to about 1 km, so Cloudflare serves the same copy to everyone nearby for 60 s.
- **Quotes:** one short moral quote at a time in the top bar (changes every 7 seconds; a new set every 30 minutes) and one on every offer.
- **Support:** customers and partners chat with the LastPick team in the app (Help & support); admins and moderators answer in Admin → Support chats. Formal complaints keep their own ticket system.
- **Rules:** a plain-language "How LastPick works & rules" page plus the full Terms. They say LastPick is only a platform, takes no responsibility for the deal, and acts on providers through reviews and reports.

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
4. **Payments** (Razorpay / Google Play Billing). Until then admins switch plans on by hand.
5. **Domain**: lastpick.in on Cloudflare; the deploy creates customer./partner./admin. automatically.

## Privacy and legal (India)

The rules from the earlier version carry over: notice + consent with version tracking, share-my-number confirmation, location used on the phone only, data export and account deletion (DPDP Act 2023), complaint tickets (IT Rules 2021), reviews only from customers who contacted the business (IS 19000:2022), and retention limits (activity logs 1 year). Have a lawyer review the Terms and Privacy notice before launch.
