import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` serves the app on :5173 and forwards /api to a local server (see README, "Run locally").
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, proxy: { "/api": process.env.API_PROXY || "http://localhost:8080" } },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
