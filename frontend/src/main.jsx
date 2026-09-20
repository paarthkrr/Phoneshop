import React from "react";
import ReactDOM from "react-dom/client";
import "./storage-shim.js"; // sets up window.shopAuth
import App from "./App.jsx";

// Point this at your deployed backend (see DEPLOYMENT.md). Read from a
// build-time environment variable so the same code works whether you're
// building locally or deploying via Render/Vercel/Netlify without editing
// this file each time. Falls back to unset (not empty string) if not
// provided, so App.jsx's "skip storage installation gracefully" path
// still applies correctly for a from-scratch local preview.
window.SHOP_API_BASE_URL = import.meta.env.VITE_SHOP_API_BASE_URL || undefined;

// React's own render-phase errors don't reliably reach window.onerror in
// every browser — this catches them specifically, so a bug in any one
// tool shows a diagnosable message instead of taking down the whole page.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Render error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 480, margin: "60px auto", padding: 20, fontFamily: "system-ui, sans-serif", color: "#201C18", background: "#F7F4EC", border: "2px solid #8B2E2E", borderRadius: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>Something went wrong loading this page</div>
          <div style={{ fontSize: 13, color: "#6B6560", marginBottom: 14 }}>Please screenshot this and send it back — it tells us exactly what to fix.</div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, background: "#fff", border: "1px solid #201C18", padding: 10, borderRadius: 3 }}>
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
// Tells index.html's early boot-error handler that React took over
// successfully — so a later, unrelated error doesn't wipe out an
// already-working page with a false "failed to load" message.
rootEl.dataset.appMounted = "true";
