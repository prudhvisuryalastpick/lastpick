import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AppProvider } from "./state.jsx";
import "./styles.css";
import { api } from "./api/index.js";
import { APP_VARIANT } from "./lib/config.js";
import { applyBrand } from "./lib/brand.jsx";

applyBrand();

// Crash reporting: uncaught errors go to the server log (Supabase function logs) (at most 5 per session, no personal data).
let sent = 0;
const report = (message, stack) => {
  if (sent++ >= 5) return;
  api.logClientError?.({ message: String(message || "unknown").slice(0, 500), stack: String(stack || "").slice(0, 3000), url: location.hash.split("?")[0], app: APP_VARIANT, version: "1" });
};
window.addEventListener("error", (e) => report(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => report(e.reason?.message || e.reason, e.reason?.stack));

// If a screen crashes, show a friendly message with a reload button instead of a blank page.
class CrashGuard extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { report(error?.message, (error?.stack || "") + (info?.componentStack || "")); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth: 360 }}>
          <h2 style={{ margin: "0 0 8px" }}>Something went wrong</h2>
          <p style={{ color: "#4E6366", margin: "0 0 18px" }}>Sorry, this screen didn't load. We've been told about it. Please try again.</p>
          <button type="button" className="btn main" onClick={() => { location.hash = "#/"; location.reload(); }}>Reload LastPick</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CrashGuard>
      <AppProvider>
        <App />
      </AppProvider>
    </CrashGuard>
  </React.StrictMode>,
);
