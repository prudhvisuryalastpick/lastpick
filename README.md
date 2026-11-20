# LastPick on AWS

Businesses post offers on anything they need to move before it becomes a loss (empty rooms, a free hall date, unsold seats, closing-time food, clearance stock). Customers nearby see them, view the owner's number and call or WhatsApp them, or share their own number. LastPick only connects people.

This repo runs LastPick on **AWS (Mumbai, ap-south-1)** as **three separate containers on ECS Fargate**:

| Service (container) | Web app | What it does |
|---|---|---|
| **customer** | LastPick | Offers near me / by pincode / by city, map, offer pages, view number, share my number, contacts, reviews, reports |
| **partner** | LastPick Business | Business profile, post offers (3 a day, photos), end offers, leads, reviews and replies, history |
| **admin** | LastPick Admin | Overview, verify / reject / suspend businesses, reports, complaints, users, plans, free-launch switch, moderators by state |

Each service runs, scales, deploys and logs on its own. All three share **one PostgreSQL database** (Amazon RDS), so an offer a partner posts appears for customers straight away.

```
           ┌ CloudFront customer ┐                         ┌ customer containers (1–4) ┐
  users ───┼ CloudFront partner  ┼─ VPC origin ─ private ───┼ partner containers  (1–3) ┼── RDS PostgreSQL
           └ CloudFront admin    ┘   (AWS network)  load    └ admin container     (1)   ┘   (private, encrypted,
                                                   balancer                                   backed up)
```

## What's inside

| Part | Tech | Where |
|---|---|---|
| Web apps (3 builds from one codebase) | React 18 + Vite | `web/` |
| API (one codebase, `SERVICE=customer\|partner\|admin`) | Node.js 22, only one package (`pg`) | `server/` |
| Database schema | PostgreSQL 16 migrations | `server/migrations/` |
| Container image (server + the three web apps, ARM) | Docker | `Dockerfile` |
| AWS infrastructure, in its own VPC | Terraform | [lastpick-terraform](https://github.com/prudhvisuryalastpick/lastpick-terraform) (with the tech-stack diagram) |
| Tests, build and deploy on every push; weekly rebuild | GitHub Actions | `.github/workflows/deploy.yml` |
| AI agents: CI/CD and deployment | Claude Code | `.claude/agents/` (infra agent: in lastpick-terraform) |

## Product rules built in

- **One device at a time:** logging in on a new device logs out the old one, and the old device says why.
- **Consent checked on the server:** customers can't view numbers, share theirs or review without accepting the current notice. That notice includes "LastPick is only a platform". Partners can't post without accepting the business terms.
- **Working hours (India time):**
  - 6 AM to 11 PM: everything is open.
  - After 11 PM: only jobs and travel (bus seats, trips) are listed and contactable. Other posts are hidden until 6 AM.
  - Partners can still post at night; it goes live at 6 AM.
  - Change the hours with `OPEN_HOUR` / `CLOSE_HOUR`.
- **Trusted partners only:** a business can post only after the LastPick team verifies it. Verified partners can post anything that brings business, in any category (deals, health camps, admissions, trips, movie tickets for empty seats, things to sell, jobs).
- **Local only:** job openings (including part-time and daily work) and things locals are selling show only within 10 km or the same pincode, never city-wide.
- **Admissions season:** school and college admission discounts get their own section on the customer home from January to the end of June. They can run up to 120 days.
- **Dashboards:**
  - Customers see how much they saved and how many local businesses they supported.
  - Partners see the business generated through LastPick, how customers reached them, and their best offers.
  - Admins see platform totals.
- **Support:** customers and partners chat with the LastPick team in the app (Help & support); admins and moderators answer in Admin → Support chats. Formal complaints keep their own ticket system.
- **Rules:** a plain-language "How LastPick works & rules" page plus the full Terms. They say LastPick is only a platform, takes no responsibility for the deal, and acts on providers through reviews and reports.

## How each requirement is covered

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

## Monthly cost (approximate, Mumbai, on-demand, ₹ at $1 = ₹94.85)

| Item | USD | ₹ |
|---|---|---|
| 3 Fargate containers, 0.25 vCPU + 0.5 GB each, ARM, 24×7 | 22.72 | 2,155 |
| 3 public IPv4 addresses (outgoing calls without a $35 NAT gateway) | 10.95 | 1,039 |
| Load balancer (internal), low traffic | ~19 | ~1,800 |
| RDS PostgreSQL db.t4g.micro + 20 GB (main) | ~18 | ~1,720 |
| Read replica, same size (`db_read_replica`, can be switched off) | ~18 | ~1,720 |
| Secrets Manager (4), logs, ECR, alarms, backups; CloudFront within its free tier | ~4.6 | ~440 |
| **Total** | **≈ 93.5** | **≈ 8,860 + 18% GST ≈ 10,460** |

Without the read replica: ≈ $75 ≈ ₹7,150 + GST ≈ ₹8,430. Each extra auto-scaled copy on Spot adds about $3 for the time it runs. The budget alert (`monthly_budget_usd`, default $100) e-mails before the bill runs away. Check with the [AWS Pricing Calculator](https://calculator.aws/); new accounts get free-tier credits at first.

## Set up AWS (one time, about 25 minutes)

1. **Create the infrastructure** with [lastpick-terraform](https://github.com/prudhvisuryalastpick/lastpick-terraform) (steps in its README, run from AWS CloudShell in Mumbai). Use `protect_data = false` for a test setup you'll delete afterwards.
2. **Confirm the alarm and budget e-mails** AWS sends you.
3. **This repo → Settings → Secrets and variables → Actions → Variables**: `AWS_DEPLOY_ROLE_ARN` = `terraform output -raw deploy_role_arn`.
4. **Actions → Deploy to AWS → Run workflow**, ticking *test accounts* (and *demo* for sample offers). After that, every push to `main` deploys automatically.
5. **Test accounts**: Secrets Manager → `lastpick/test-accounts` → *Retrieve secret value* gives the password for
   `admin@test.lastpick.in`, `moderator@test.lastpick.in` (Karnataka), `owner@test.lastpick.in` and `customer@test.lastpick.in`.
6. **Done testing?** `terraform destroy` in lastpick-terraform removes everything (see its README).

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
