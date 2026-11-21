// Writes Cloudflare's _headers file into each built web app: the same security headers and page policy as the
// Node server, and "keep for a year" for the hashed files in /assets/.
import fs from "node:fs";
import path from "node:path";
import { CSP, SECURITY_HEADERS } from "../../src/http.js";

const all = { ...SECURITY_HEADERS, "Content-Security-Policy": CSP };
const text = ["/*", ...Object.entries(all).map(([k, v]) => `  ${k}: ${v}`), "/assets/*", "  Cache-Control: public, max-age=31536000, immutable", ""].join("\n");
for (const dir of process.argv.slice(2)) {
  fs.writeFileSync(path.join(dir, "_headers"), text);
  console.log("wrote", path.join(dir, "_headers"));
}
