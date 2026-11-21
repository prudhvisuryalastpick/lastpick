// All settings come from environment variables (on Supabase: function secrets; locally: your shell or docker-compose).
// Settings: environment variables, plus fixed values a launcher may provide (Supabase functions can't change their env).
const env = { ...process.env, ...(globalThis.__LP_ENV || {}) };
const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

export const PRODUCTION = env.NODE_ENV === "production";
// Which server this is. "all" runs every route in one process (local development only).
export const SERVICE = ["customer", "partner", "admin", "all"].includes(env.SERVICE) ? env.SERVICE : "all";
export const PORT = Number(env.PORT || 8080);
// unique per container (every container is process 1, so the host name tells them apart)
export const INSTANCE_ID = env.INSTANCE_ID || `${SERVICE}-${env.HOSTNAME || "worker"}-${process.pid || 0}`;

// Database: DATABASE_URL, or the standard PGHOST / PGUSER / PGPASSWORD / PGDATABASE variables.
export const DATABASE_URL = env.DATABASE_URL || "";
export const DB_SSL = env.DB_SSL || "off"; // off | require | verify
export const DB_CA_FILE = env.DB_CA_FILE || ""; // certificate file, only for DB_SSL=verify
export const DB_POOL_MAX = Number(env.DB_POOL_MAX || 10);
// Optional read replica: feeds, offer pages, dashboards and admin stats read from it, so they never slow down writes.
// Empty = everything uses the main database.
export const DB_READ_HOST = env.PGHOST_READ || "";

export const JWT_SECRET = env.JWT_SECRET || (PRODUCTION ? "" : "dev-only-secret-change-me");
// On Cloudflare Workers the secret is added right after the first upload, so a missing secret there blocks sign-ins
// (auth.js) instead of stopping the Worker from starting.
export const ON_WORKERS = globalThis.navigator?.userAgent === "Cloudflare-Workers";
if (PRODUCTION && JWT_SECRET.length < 32 && !ON_WORKERS) throw new Error("JWT_SECRET must be set (32+ characters) in production");
export const TOKEN_DAYS = Number(env.TOKEN_DAYS || 30);

// Built web app served by this server (web/dist-<variant>).
export const WEB_DIR = env.WEB_DIR || "";

// Background jobs and scheduled tasks. Safe to run on every server: jobs are claimed with SKIP LOCKED.
export const RUN_WORKER = env.RUN_WORKER !== "0";

// Optional: a proxy in front of the server adds this header to every request. When set, requests without it are refused.
export const ORIGIN_SECRET = env.ORIGIN_SECRET || "";
// Proxies in front of the Node server that each add one X-Forwarded-For entry.
export const PROXY_HOPS = Math.max(1, Number(env.PROXY_HOPS || 1));
// The admin server can additionally be limited to some IP addresses (comma separated). Empty = anyone may try to log in.
export const ADMIN_ALLOWED_IPS = list(env.ADMIN_ALLOWED_IPS);
// Browser origins allowed to call the API from another site (the Android apps use https://localhost).
export const ALLOWED_ORIGINS = list(env.ALLOWED_ORIGINS || "https://localhost,capacitor://localhost,http://localhost:5173");

// Sign-up through the API. "closed" (default) = test accounts only, until the real login/registration is built.
export const SIGNUP = env.SIGNUP === "open" ? "open" : "closed";
export const LOG_LEVEL = env.LOG_LEVEL || "info";
// E-mail one-time codes (Brevo). When MAIL_FROM is set, new accounts must verify their e-mail with a code.
export const MAIL_FROM = env.MAIL_FROM || "";
// Supabase: pg_cron calls the customer function's /cron address with this secret every 5 minutes (background jobs).
export const CRON_SECRET = env.CRON_SECRET || "";
export const BREVO_API_KEY = env.BREVO_API_KEY || "";
