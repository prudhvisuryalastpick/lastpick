import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AppProvider } from "./state.jsx";
import "./styles.css";
import { api } from "./api/index.js";
import { APP_VARIANT } from "./lib/config.js";

// Crash reporting: uncaught errors go to the server log (CloudWatch) (at most 5 per session, no personal data).
let sent = 0;
const report = (message, stack) => {
  if (sent++ >= 5) return;
  api.logClientError?.({ message: String(message || "unknown").slice(0, 500), stack: String(stack || "").slice(0, 3000), url: location.hash.split("?")[0], app: APP_VARIANT, version: "1" });
};
window.addEventListener("error", (e) => report(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => report(e.reason?.message || e.reason, e.reason?.stack));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
