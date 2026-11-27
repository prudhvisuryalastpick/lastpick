// Deploy step: upload the Home category photos (assets/categories/<id>-<n>.webp, 160 px, a few KB each) to
// Cloudflare R2 at categories/<id>-<n>.webp. Safe to run on every deploy (same files, same keys).
import fs from "node:fs";
import path from "node:path";
import { R2_ON, putObject } from "../src/storage.js";

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../assets/categories");
if (!R2_ON) { console.log("R2 keys not set: category photos not uploaded"); process.exit(0); }
const files = fs.readdirSync(dir).filter((f) => /^[a-z]+-[1-5]\.webp$/.test(f));
let n = 0;
for (const f of files) { await putObject(`categories/${f}`, fs.readFileSync(path.join(dir, f)), "image/webp"); n++; }
console.log(`category photos uploaded to R2: ${n}`);
