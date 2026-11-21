// Background jobs on Supabase: pg_cron calls the customer function's /cron address every 5 minutes.
// Needs DATABASE_URL, SUPABASE_PROJECT_ID and CRON_SECRET (the same value set as a function secret).
import process from "node:process";
import { closePools, q } from "../../src/db.js";

const ref = process.env.SUPABASE_PROJECT_ID, secret = process.env.CRON_SECRET || "";
if (!ref || !/^[a-f0-9]{32,}$/.test(secret)) { console.error("Set SUPABASE_PROJECT_ID and CRON_SECRET (hex)"); process.exit(1); }
const url = `https://${ref}.supabase.co/functions/v1/customer/cron`;
await q("CREATE EXTENSION IF NOT EXISTS pg_cron");
await q("CREATE EXTENSION IF NOT EXISTS pg_net");
await q("SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lastpick-jobs'");
await q(`SELECT cron.schedule('lastpick-jobs', '*/5 * * * *', $cmd$
  SELECT net.http_post(url := '${url}', headers := jsonb_build_object('x-cron-secret', '${secret}', 'Content-Type', 'application/json'), body := '{}'::jsonb)
$cmd$)`);
console.log("background jobs scheduled every 5 minutes");
await closePools();
