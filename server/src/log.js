// JSON logs, one line each. On EC2 the CloudWatch agent ships them from journald to CloudWatch Logs.
import { LOG_LEVEL, SERVICE } from "./config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[LOG_LEVEL] ?? 20;
function write(level, message, data) {
  if (LEVELS[level] < min) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, service: SERVICE, message, ...data });
  // console.* (not process.stdout) so the lines also reach Supabase's function logs
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
export const log = {
  debug: (m, d) => write("debug", m, d),
  info: (m, d) => write("info", m, d),
  warn: (m, d) => write("warn", m, d),
  error: (m, d) => write("error", m, d),
};
