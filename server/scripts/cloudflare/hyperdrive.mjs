// Makes sure the Cloudflare Hyperdrive connection to the PostgreSQL database exists (query caching off, so every
// read is fresh), then writes its id into wrangler.toml. Needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DATABASE_URL.
import fs from "node:fs";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, DATABASE_URL: dbUrl } = process.env;
if (!token || !account || !dbUrl) { console.error("Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and DATABASE_URL"); process.exit(1); }
const NAME = "lastpick-db";
const api = async (method, p, body) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/hyperdrive/configs${p}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!j.success) throw new Error(`Hyperdrive ${method} failed: ${JSON.stringify(j.errors)}`);
  return j.result;
};
const u = new URL(dbUrl);
const config = {
  name: NAME,
  origin: { scheme: "postgres", host: u.hostname, port: Number(u.port || 5432), database: u.pathname.slice(1) || "postgres",
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) },
  caching: { disabled: true },
};
const existing = (await api("GET", "")).find((c) => c.name === NAME);
const result = existing ? await api("PUT", `/${existing.id}`, config) : await api("POST", "", config);
console.log(existing ? "Hyperdrive updated" : "Hyperdrive created", result.id);
const file = new URL("../../../wrangler.toml", import.meta.url);
fs.writeFileSync(file, fs.readFileSync(file, "utf8").replaceAll("HYPERDRIVE_ID", result.id));
