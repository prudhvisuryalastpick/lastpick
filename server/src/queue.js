// Background job queue and scheduled tasks, both kept in PostgreSQL (no extra AWS service to pay for).
// - enqueue(type, payload): a job runs within seconds on any server, with retries and exponential backoff.
// - Jobs are claimed with FOR UPDATE SKIP LOCKED, so several servers can work the queue without doing a job twice.
// - Scheduled tasks are claimed in schedule_runs, so each run happens once even with three servers running.
import { INSTANCE_ID } from "./config.js";
import { one, q } from "./db.js";
import { log } from "./log.js";

const handlers = new Map();
export const onJob = (type, fn) => handlers.set(type, fn);

export async function enqueue(type, payload = {}, { delaySec = 0, maxAttempts = 5, client } = {}) {
  await (client || { query: q }).query(
    "INSERT INTO jobs (type, payload, run_at, max_attempts) VALUES ($1, $2, now() + make_interval(secs => $3), $4)",
    [type, payload, delaySec, maxAttempts],
  );
}

export async function runOne() {
  const job = await one(
    `UPDATE jobs SET locked_at = now(), locked_by = $1, attempts = attempts + 1
     WHERE id = (SELECT id FROM jobs WHERE done_at IS NULL AND run_at <= now()
                 AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes')
                 ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id, type, payload, attempts, max_attempts`,
    [INSTANCE_ID],
  );
  if (!job) return false;
  const fn = handlers.get(job.type);
  try {
    if (!fn) throw new Error(`no handler for ${job.type}`);
    await fn(job.payload);
    await q("UPDATE jobs SET done_at = now(), locked_at = NULL, last_error = NULL WHERE id = $1", [job.id]);
  } catch (e) {
    const dead = job.attempts >= job.max_attempts;
    const backoff = Math.min(3600, 30 * 2 ** (job.attempts - 1));
    await q(
      `UPDATE jobs SET locked_at = NULL, last_error = $2, done_at = CASE WHEN $3 THEN now() ELSE NULL END,
       run_at = now() + make_interval(secs => $4) WHERE id = $1`,
      [job.id, String(e.message).slice(0, 1000), dead, backoff],
    );
    log[dead ? "error" : "warn"](dead ? "job failed for good" : "job failed, will retry", { job: job.type, id: job.id, attempt: job.attempts, error: e.message });
  }
  return true;
}

// ---- scheduled tasks ----
const schedules = [];
// every: run every N ms. dailyIST: "HH:MM" India time.
export const schedule = (name, when, fn) => schedules.push({ name, ...when, fn });

function dueSince(s, now = Date.now()) {
  if (s.every) return new Date(now - s.every + 1000);
  const [h, m] = s.dailyIST.split(":").map(Number);
  const IST = 5.5 * 3600000;
  const dayStart = Math.floor((now + IST) / 86400000) * 86400000 - IST;
  const slot = dayStart + (h * 60 + m) * 60000;
  return now >= slot ? new Date(slot) : null; // claim if not run since today's slot
}
export async function runSchedules() {
  for (const s of schedules) {
    const since = dueSince(s);
    if (!since) continue;
    const claimed = await one(
      `INSERT INTO schedule_runs (name, last_at) VALUES ($1, now())
       ON CONFLICT (name) DO UPDATE SET last_at = now() WHERE schedule_runs.last_at < $2 RETURNING name`,
      [s.name, since],
    );
    if (!claimed) continue;
    const t = Date.now();
    try { const r = await s.fn(); log.info("scheduled task done", { task: s.name, ms: Date.now() - t, ...(r || {}) }); }
    catch (e) { log.error("scheduled task failed", { task: s.name, error: e.message }); }
  }
}

let stopping = false;
export function startWorker() {
  (async function jobsLoop() {
    while (!stopping) {
      let worked = false;
      try { worked = await runOne(); } catch (e) { log.error("queue error", { error: e.message }); }
      if (!worked) await new Promise((r) => setTimeout(r, 2000));
    }
  })();
  const tick = () => runSchedules().catch((e) => log.error("scheduler error", { error: e.message }));
  setTimeout(tick, 5000).unref();
  setInterval(tick, 60000).unref();
}
export const stopWorker = () => { stopping = true; };
