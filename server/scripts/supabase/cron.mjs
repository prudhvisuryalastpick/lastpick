// Background jobs: pg_cron calls the customer function's /cron address every 5 minutes with CRON_SECRET
// (the same value the deploy sets as a function secret). Uses the Management API (SUPABASE_ACCESS_TOKEN).
import process from "node:process";
import { sql } from "./api.mjs";

const ref = process.env.SUPABASE_PROJECT_ID, secret = process.env.CRON_SECRET || "";
if (!/^[a-f0-9]{32,}$/.test(secret)) { console.error("Set CRON_SECRET (hex)"); process.exit(1); }
const url = `https://${ref}.supabase.co/functions/v1/customer/cron`;
await sql("CREATE EXTENSION IF NOT EXISTS pg_cron");
await sql("CREATE EXTENSION IF NOT EXISTS pg_net");
await sql("SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lastpick-jobs'");
await sql(`SELECT cron.schedule('lastpick-jobs', '*/5 * * * *', $cmd$
  SELECT net.http_post(url := '${url}', headers := jsonb_build_object('x-cron-secret', '${secret}', 'Content-Type', 'application/json'), body := '{}'::jsonb)
$cmd$)`);
console.log("background jobs scheduled every 5 minutes");
