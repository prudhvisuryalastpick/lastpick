// Per-request context. On Cloudflare Workers every request gets its own database connection
// (connections can't be shared between requests there); on the Node server this stays empty.
import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage();
export const currentRequest = () => requestContext.getStore() || null;
