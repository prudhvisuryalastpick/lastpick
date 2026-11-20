// Uses the LastPick API (AWS). Set VITE_DEMO=1 to run entirely in the browser with sample data instead.
import { api as demo } from "./demo.js";
import { api as live } from "./rest.js";

export const isLive = import.meta.env?.VITE_DEMO !== "1";
export const api = isLive ? live : demo;
export { DEMO_ACCOUNTS } from "./demo.js";
