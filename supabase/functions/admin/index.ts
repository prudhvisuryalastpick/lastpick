// LastPick admin API on Supabase Edge Functions. The server code (server/src) is copied next to this file at deploy time.
// Supabase doesn't allow changing environment variables, so the fixed settings are handed over in globalThis.__LP_ENV.
import process from "node:process";

(globalThis as any).process ??= process;
(globalThis as any).__LP_ENV = { SERVICE: "admin", SIGNUP: "closed", NODE_ENV: "production" };

const { createEdgeHandler } = await import("./server/src/edge.js");
const handle = createEdgeHandler({ dbUrl: Deno.env.get("SUPABASE_DB_URL")! });
const waitUntil = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil?.(p) ?? p;

Deno.serve((req: Request) => handle(req, waitUntil));
