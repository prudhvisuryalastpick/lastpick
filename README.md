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
**Cost:** $0 while testing (Supabase Free + Cloudflare Free); Supabase Pro $25/month at launch. Alternatives kept in the repo: Cloudflare Workers API (`wrangler.workers.toml`, manual workflow) and AWS (`Dockerfile`, lastpick-terraform).

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
| Web apps on Cloudflare (static) | Wrangler | `wrangler.toml`, `wrangler.redirect.toml` |
| Tests (Node server, Supabase code in Node and Deno), deploy on every push | GitHub Actions | `.github/workflows/supabase.yml` |
| Fallback: container image and AWS infrastructure | Docker, Terraform | `Dockerfile`, `.github/workflows/deploy.yml` (manual), [lastpick-terraform](https://github.com/prudhvisuryalastpick/lastpick-terraform) |
| AI agents: CI/CD and deployment | Claude Code | `.claude/agents/` (infra agent: in lastpick-terraform) |

## Planned (after we have good partners)

- **Combos across partners:** today a combo is posted by one partner. Later: one booking that joins several partners (e.g. a cab partner's pickup + a hotel's room).

## Product rules built in

- **One device at a time:** logging in on a new device logs out the old one, and the old device says why.
- **Consent checked on the server:** customers can't view numbers, share theirs or review without accepting the current notice. That notice includes "LastPick is only a platform". Partners can't post without accepting the business terms.
- **Working hours (India time):**
  - Hotels and travel (and combos with a room or pickup & drop) are 24×7: they can post at any time, and an offer runs for up to 24 hours.
  - Everyone else can post from 4 AM to 10:30 PM, so a post at 10 PM can run till 11 PM at most. Their offers are shown 4 AM to 11 PM, end by 11 PM and are removed at 12 midnight.
  - Customers are told this on the home screen.
  - Change the hours with `OPEN_HOUR` / `CLOSE_HOUR` (shown hours) and `POST_FROM_HOUR` / `POST_TILL_HOUR` (posting).
- **One category per partner:** a partner picks one category and posts offers only in it, plus job openings at their shop (shown within 10 km or the same pincode). 3 posts a day.
- **Trusted partners only:** a business can post only after the LastPick team verifies it and an admin activates its plan.
- **Names only:** partners see the names of interested customers, never their numbers. Customers see the shop's number as text (no call or WhatsApp buttons).
- **Offer times:** customers see "Offer ends in 4 hours" with the time, the normal price struck off, the offer price and the % off.
- **Views and reviews:** partners see how many customers saw each offer, and read and reply to reviews. There is no Boost button in the partner app (featuring an offer is admin-only, under Admin → Revenue).
- **Pincode first:** the business profile fills state, city and the area list from the pincode (India Post data, every state), and "Use my location" fills the whole address (OpenStreetMap).
- **No dashboards** for customers or partners; admins see platform totals.
- **Combos (admin switch):** one offer bundling a hotel room, food, pickup & drop and ironing. Off by default; Admin → Overview → Combos switches it on for partners (to post) and customers (Combos tile) at once.
- **Automatic discount:** the % off is worked out from the prices; any "40% off" in the title is corrected automatically (app and server).
- **Categories:** Food, Hotels, Travel, Salon, Makeup, Fashion, Home appliances, Shops, Other, plus Hiring (job openings). Old categories are moved by migration 010.
- **Plans (only two, monthly):** Customer Pass ₹99, Business Pro ₹499. The admin activates them until payments are added.
- **No photos:** partners don't upload photos; every offer shows its category icon. Keeps the app fast and the data bill low.
- **Light and cacheable:** replies are compressed; public offer lists are fetched without the login and with the location rounded to about 1 km, so Cloudflare serves the same copy to everyone nearby for 60 s.
- **Quotes:** one short moral quote at a time in the top bar (changes every 7 seconds; a new set every 30 minutes) and one on every offer.
- **Support:** customers and partners chat with the LastPick team in the app (Help & support); admins and moderators answer in Admin → Support chats. Formal complaints keep their own ticket system.
- **Rules:** a plain-language "How LastPick works & rules" page plus the full Terms. They say LastPick is only a platform, takes no responsibility for the deal, and acts on providers through reviews and reports.

## How each requirement is covered (AWS fallback setup; on Cloudflare, HTTPS, scaling and patching are handled by Cloudflare)

| Need | How |
|---|---|
| **Encryption** | HTTPS for users (CloudFront). CloudFront reaches the load balancer through a **VPC origin** over AWS's private network; the load balancer and database have no public address. Database connections use TLS and the server checks the RDS certificate. Data at rest is encrypted (RDS, ECR images, logs). Secrets live in AWS Secrets Manager and are injected into the containers by ECS, never in code, images or GitHub. Passwords are hashed with scrypt. |
| **Rate limiting** | Per IP, on every request (in memory in each container, stops floods). Per user, in the database, shared by all containers: 60 numbers viewed/hour, 30 shared/hour, 30 offers/day (plus 3 posts/day per business), 10 reviews/day, 5 complaints/day, login 10 failed tries per 15 min. Uploads max 600 KB. Optional later: AWS WAF on CloudFront (about $6+/month). |
| **Queuing** | Background job queue in PostgreSQL with retries and backoff (`jobs` table, `FOR UPDATE SKIP LOCKED`), so any number of containers can share the work. Scheduled tasks (hourly plan expiry, photo cleanup, nightly archive at 02:30 IST) run once even with many containers. No extra AWS service to pay for. |
| **Caching** | CloudFront caches app files for a year and public feeds for 30–60 s at the edge. Each container caches feeds and the city list in memory, and identical requests share one database query. Redis is left out on purpose: about $15+/month even when idle. |
| **Scaling** | **Automatic:** customer grows from 1 to 4 containers and partner from 1 to 3 when CPU stays above 60%, and shrinks back when quiet. Extra copies run on Fargate Spot (about 70% cheaper). Bigger containers or limits: change `services` in `terraform.tfvars`. The database grows its disk by itself up to 100 GB. |
| **Reliability** | The load balancer checks every container every 15 s (`/healthz`, which includes the database) and ECS replaces any that fail. **Zero-downtime deploys:** new containers start next to the old ones and take traffic only when healthy; a bad version is **rolled back automatically**. Containers spread over 2 availability zones. The first copy of each service and admin always run on regular (non-Spot) Fargate. Database failover: `db_multi_az = true` (doubles the database cost). E-mail alarms: service down, errors, CPU/memory, database. |
| **Read replica** | A live read-only copy of the database. Feeds, offer pages, reviews, dashboards and admin stats read from it, so heavy reading never slows down posting, logins or contacts. If it's unavailable the app reads from the main database automatically. |
| **Backup** | RDS: daily automatic backups with **point-in-time restore** for 7 days, plus a weekly AWS Backup snapshot kept 5 weeks. A final snapshot is taken if the database is ever deleted (deletion protection is also on). Containers keep no data; the last 20 images stay in ECR. |
| **Patching** | No servers to patch: AWS patches the Fargate hosts. The image is **rebuilt every Monday 02:00 IST** from the newest Node.js/Alpine base and redeployed, and ECR scans every image for known vulnerabilities. RDS minor versions update automatically in a Sunday-night window. |

Also: no SSH and no servers to log in to, the containers accept traffic only from the load balancer, the load balancer only from CloudFront with a secret header (checked again by the app), containers run as a non-root user, the admin panel only lets admins and moderators log in (optionally only from your IPs: `admin_allowed_ips`), and there's an audit log (1 year) of number views, shares, offers, reviews, admin actions, exports and deletions.

## AWS fallback

The AWS version (three ECS Fargate services + RDS, about ₹8,500/month) still works: create it with lastpick-terraform, then run **Actions → Deploy to AWS** by hand. See lastpick-terraform's README.

## AI agents (Claude Code)

| Agent | Where | Does |
|---|---|---|
| `cicd` | `.claude/agents/cicd.md` | Keeps the pipeline green: runs tests, reads failed GitHub Actions runs, fixes the workflow or code, explains the cause |
| `deploy` | `.claude/agents/deploy.md` | Deploys and checks the app: starts the workflow, watches the ECS rollout, checks `/healthz` and logs, seeds test accounts, rolls back |
| `infra` | lastpick-terraform `.claude/agents/infra.md` | Creates, checks, changes and destroys the AWS infrastructure with Terraform |

### Optional repository variables

`CUSTOMER_URL`, `PARTNER_URL` (once you have a domain), and the legal details shown in the app before launch: `LEGAL_NAME`, `LEGAL_ADDRESS`, `GRIEVANCE_OFFICER`, `GRIEVANCE_EMAIL`, `GRIEVANCE_PHONE`.

## Day to day

- **Logs**: CloudWatch → Log groups → `/lastpick/customer`, `/lastpick/partner`, `/lastpick/admin` (kept 30 days).
- **Status of the containers**: ECS → Clusters → `lastpick` → Services (running count, deployments, events).
- **Roll back by hand**: ECS → service → *Update* → *Force new deployment* after re-tagging an older image as `latest` in ECR, or re-run an older successful GitHub Actions deploy.
- **Restore the database to a point in time**: RDS → `lastpick` → *Actions* → *Restore to point in time* (creates a new database; then point the containers at it, ask for help).
- **Make someone an admin or moderator**: Admin panel → Team.
- **Free launch mode** (default: no payments, everyone has access): Admin → Overview.

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

1. **Android apps (APK)**: build the customer and partner apps with Capacitor, pointed at their servers (`VITE_API_URL`).
2. **Play Store** bundles (AAB), signing, Data safety form.
3. **Login and registration**: one-time codes by SMS and e-mail (the screens exist; the server side is switched off, `VITE_OTP_LOGIN`). Until then, only test accounts can log in (`SIGNUP=closed`).
4. **Payments** (Razorpay / Google Play Billing). Until then admins switch plans on by hand.
5. **Domain**: after you buy one, point `lastpick.in` / `business.` / `admin.` at the three CloudFront distributions (free ACM certificates), and turn on HTTPS between CloudFront and the load balancer (ACM certificate).

## Privacy and legal (India)

The rules from the earlier version carry over: notice + consent with version tracking, share-my-number confirmation, location used on the phone only, data export and account deletion (DPDP Act 2023), complaint tickets (IT Rules 2021), reviews only from customers who contacted the business (IS 19000:2022), and retention limits (activity logs 1 year). Have a lawyer review the Terms and Privacy notice before launch.
