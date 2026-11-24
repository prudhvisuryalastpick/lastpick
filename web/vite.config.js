import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logoSvg } from "./src/lib/brand-svg.js";

// The partner build (VITE_APP_VARIANT=owner) ships its own install identity in the HTML itself, so phones never
// pick up the customer's teal icon or name: partner manifest, brown icon, "LP Partner" title and favicon.
const owner = process.env.VITE_APP_VARIANT === "owner";
function partnerIdentity() {
  let outDir = "dist";
  return {
    name: "lp-partner-identity",
    configResolved(c) { outDir = c.build.outDir; },
    transformIndexHtml(html) {
      if (!owner) return html;
      return html
        .replace('href="/manifest.webmanifest"', 'href="/manifest-partner.webmanifest"')
        .replace('href="/apple-touch-customer.png"', 'href="/apple-touch-partner.png"')
        .replace('content="LastPick" />', 'content="LP Partner" />')
        .replace('<meta name="theme-color" content="#06373A" />', '<meta name="theme-color" content="#3B1606" />')
        .replace("<title>LastPick</title>", "<title>LastPick Partner</title>");
    },
    closeBundle() {
      if (!owner) return;
      // anything still asking for the default names gets the partner versions too
      const d = (f) => join(outDir, f);
      if (existsSync(d("manifest-partner.webmanifest"))) copyFileSync(d("manifest-partner.webmanifest"), d("manifest.webmanifest"));
      writeFileSync(d("favicon.svg"), logoSvg("partner"));
    },
  };
}

// `npm run dev` serves the app on :5173 and forwards /api to a local server (see README, "Run locally").
export default defineConfig({
  plugins: [react(), partnerIdentity()],
  server: { port: 5173, host: true, proxy: { "/api": process.env.API_PROXY || "http://localhost:8080" } },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
