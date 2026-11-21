# lastpick

LastPick application: Node.js 22 API (`server/`, one codebase run as customer / partner / admin), React + Vite web apps (`web/`). Runs on **Supabase** (API as Edge Functions `supabase/functions/*` → `server/src/edge.js`, PostgreSQL, pg_cron) with the web apps on **Cloudflare** (static, `wrangler.toml`); deploy `.github/workflows/supabase.yml`. Its own Supabase project, separate from any other app. Alternatives kept: Cloudflare Workers API (`wrangler.workers.toml`) and AWS (`Dockerfile`, lastpick-terraform).

- Agents: `cicd` (pipeline, tests, Dockerfile) and `deploy` (deploy, health, logs, rollback) in `.claude/agents/`.
- Tests: `cd server && DATABASE_URL=postgres://postgres:postgres@localhost:5432/lastpick_test npm test` (wipes that database); `LP_TEST_TARGET=edge` (or `deno`) runs them through the Supabase function code, `worker` through the Workers code.
- Product rules are listed in README.md ("Product rules built in"); keep the Terms (web/src/pages/privacy.jsx) and rules page in sync when they change.
- Never commit secrets. Plain-language explanations for the owner.
