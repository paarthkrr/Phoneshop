import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";

import QuoteCalculator from "./instant-quote-calculator.jsx";
import Storefront from "./storefront.jsx";
import DailyDashboard from "./daily-dashboard.jsx";
import AdminPricingConsole from "./admin-pricing-console.jsx";
import StaffInspectionConsole from "./staff-inspection-console.jsx";
import POSInventory from "./pos-inventory.jsx";
import RepairTickets from "./repair-tickets.jsx";
import TillReconciliation from "./till-reconciliation.jsx";
import CRMDashboard from "./crm-dashboard.jsx";

/* =================================================================
   APP SHELL
   This is the piece DEPLOYMENT.md always described as needed but
   never actually built: real navigation connecting all 9 tools into
   one product instead of 9 separate files a developer has to wire
   up themselves. Two zones — customer-facing (public) and staff
   (internal) — with distinct navigation for each, since a customer
   should never see a link to the till or the repair bench.

   This does NOT include login-gating the /staff/* routes — that's
   storage-shim.js's mountLoginGate(), wrapped around this whole App
   at your entry point (see DEPLOYMENT.md). Routing and authentication
   are separate concerns; this file only solves routing.
================================================================= */

const ink = "#F7F4EC", panel = "#FFFFFF", paper = "#201C18", muted = "#6B6560",
  brass = "#BE3F29", brassDim = "rgba(190,63,41,0.10)", line = "#201C18";

const CUSTOMER_LINKS = [
  { to: "/", label: "Sell your phone" },
  { to: "/shop", label: "Shop refurbished" },
];

const STAFF_LINKS = [
  { to: "/staff", label: "Today" },
  { to: "/staff/inspect", label: "Inspection" },
  { to: "/staff/pos", label: "Register" },
  { to: "/staff/repairs", label: "Repair Bench" },
  { to: "/staff/till", label: "Till" },
  { to: "/staff/crm", label: "Customers & Reports" },
  { to: "/staff/admin", label: "Pricing Console" },
];

function Nav() {
  const location = useLocation();
  const isStaff = location.pathname.startsWith("/staff");
  const links = isStaff ? STAFF_LINKS : CUSTOMER_LINKS;

  return (
    <div style={{ borderBottom: `3px solid ${line}`, background: panel }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontFamily: "'Archivo', system-ui, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <Link to={isStaff ? "/staff" : "/"} style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, color: paper, textDecoration: "none", letterSpacing: "-0.01em" }}>
            CORNER<span style={{ color: brass }}>SHOP</span>{isStaff && <span style={{ fontSize: 11, color: muted, fontFamily: "'Archivo', sans-serif", marginLeft: 8, fontWeight: 400 }}>STAFF</span>}
          </Link>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {links.map((l) => {
              const active = location.pathname === l.to;
              return (
                <Link key={l.to} to={l.to}
                  style={{
                    padding: "7px 13px", fontSize: 13.5, fontWeight: active ? 700 : 500, textDecoration: "none",
                    color: active ? brass : paper, borderBottom: active ? `2px solid ${brass}` : "2px solid transparent",
                  }}>
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
        {!isStaff ? (
          <Link to="/staff" style={{ fontSize: 12.5, color: muted, textDecoration: "underline" }}>Staff login →</Link>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {window.shopAuth && window.shopAuth.currentUser() && (
              <span style={{ fontSize: 12.5, color: muted }}>
                {window.shopAuth.currentUser().username}
                {" · "}
                <a href="#" onClick={(e) => { e.preventDefault(); window.shopAuth.logout(window.SHOP_API_BASE_URL); window.location.reload(); }} style={{ color: muted, textDecoration: "underline" }}>log out</a>
              </span>
            )}
            <Link to="/" style={{ fontSize: 12.5, color: muted, textDecoration: "underline" }}>← Exit to public site</Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* Gates ONLY the staff routes — this is the actual fix for a real design
   flaw: wrapping the whole <App/> in mountLoginGate (as an earlier draft
   of the deployment guide suggested) would have forced customers to log
   in just to get a trade-in quote, since mountLoginGate replaces its
   entire container. This gate lives INSIDE the router instead, so
   customer routes are never touched by it.

   When no real backend is connected at all (window.shopAuth doesn't
   exist — the normal case previewing inside Claude.ai), staff routes
   are left open, matching how every other feature in this system
   degrades gracefully with no backend rather than blocking. */
function StaffGate({ children }) {
  const [status, setStatus] = useState("checking"); // checking | needs-login | ok
  const [mode, setMode] = useState("login"); // login | register
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!window.shopAuth) { setStatus("ok"); return; } // no real backend — don't block
    try {
      setStatus(window.shopAuth.currentUser() ? "ok" : "needs-login");
    } catch (e) {
      console.error("Auth check failed, treating as logged out:", e);
      setStatus("needs-login");
    }
  }, []);

  async function handleLogin() {
    setError("");
    try {
      await window.shopAuth.login(window.SHOP_API_BASE_URL, username, password);
      // Re-point window.storage at the newly-authenticated session — without
      // this, staff would be "logged in" per currentUser() but every
      // storage call would still go out with no token, hitting the same
      // 401s an anonymous visitor gets on staff-only data.
      window.shopAuth.installStorageForEveryone(window.SHOP_API_BASE_URL);
      setStatus("ok");
    } catch (e) {
      setError(e.message);
    }
  }

  // This was the actual missing piece — the backend and storage-shim both
  // supported registering an account, but nothing in the app ever called
  // it. Without this, there was no way to create the very first staff
  // account through the website at all, no matter how correctly the
  // backend was configured.
  async function handleRegister() {
    setError(""); setSuccess("");
    try {
      await window.shopAuth.register(window.SHOP_API_BASE_URL, username, password, undefined, undefined, bootstrapToken || undefined);
      setSuccess("Account created — you can sign in now.");
      setMode("login");
      setPassword("");
    } catch (e) {
      setError(e.message);
    }
  }

  if (status === "checking") return null;
  if (status === "ok") return children;

  return (
    <div style={{ maxWidth: 320, margin: "70px auto", padding: 20, fontFamily: "'Archivo', sans-serif" }}>
      <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, marginBottom: 16, color: paper }}>
        {mode === "login" ? "Staff sign in" : "Create the first staff account"}
      </div>
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username"
        style={{ width: "100%", padding: 10, marginBottom: 8, border: `2px solid ${line}`, fontSize: 14, boxSizing: "border-box" }} />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" type="password"
        style={{ width: "100%", padding: 10, marginBottom: 8, border: `2px solid ${line}`, boxSizing: "border-box", fontSize: 14 }} />
      {mode === "register" && (
        <input value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} placeholder="Bootstrap token (if one was set)"
          style={{ width: "100%", padding: 10, marginBottom: 8, border: `2px solid ${line}`, boxSizing: "border-box", fontSize: 14 }} />
      )}
      {error && <div style={{ color: "#8B2E2E", fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {success && <div style={{ color: "#3F6B34", fontSize: 13, marginBottom: 8 }}>{success}</div>}
      <button onClick={mode === "login" ? handleLogin : handleRegister}
        style={{ width: "100%", padding: 11, background: brass, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
      <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess(""); }}
        style={{ width: "100%", padding: 9, background: "transparent", border: "none", color: paper, textDecoration: "underline", cursor: "pointer", fontSize: 12.5 }}>
        {mode === "login" ? "First time here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

export default function App() {
  const [storageReady, setStorageReady] = useState(false);

  // Installed once, for EVERY visitor — customer or staff, logged in or
  // not. This is the actual fix that makes the public routes work on a
  // real deployment: without this call, window.storage never exists at
  // all for an anonymous customer, no matter what the backend allows.
  // Login (via StaffGate, below) is a separate, additional layer only
  // the /staff/* routes need.
  useEffect(() => {
    // Wrapped defensively — if anything here throws (a browser blocking
    // storage access, a network hiccup), the app must still render
    // rather than stay permanently blank. A missing window.storage is
    // recoverable (tools just show their own "not connected" state);
    // a page that never renders at all is not.
    try {
      if (window.shopAuth && window.SHOP_API_BASE_URL) {
        window.shopAuth.installStorageForEveryone(window.SHOP_API_BASE_URL);
      }
    } catch (e) {
      console.error("Storage setup failed, continuing without it:", e);
    }
    setStorageReady(true);
  }, []);

  if (!storageReady) return null;

  return (
    <BrowserRouter>
      <div style={{ background: ink, minHeight: "100vh" }}>
        <Nav />
        <Routes>
          <Route path="/" element={<QuoteCalculator />} />
          <Route path="/shop" element={<Storefront />} />
          <Route path="/staff" element={<StaffGate><DailyDashboard /></StaffGate>} />
          <Route path="/staff/admin" element={<StaffGate><AdminPricingConsole /></StaffGate>} />
          <Route path="/staff/inspect" element={<StaffGate><StaffInspectionConsole /></StaffGate>} />
          <Route path="/staff/pos" element={<StaffGate><POSInventory /></StaffGate>} />
          <Route path="/staff/repairs" element={<StaffGate><RepairTickets /></StaffGate>} />
          <Route path="/staff/till" element={<StaffGate><TillReconciliation /></StaffGate>} />
          <Route path="/staff/crm" element={<StaffGate><CRMDashboard /></StaffGate>} />
          <Route path="*" element={
            <div style={{ padding: 60, textAlign: "center", fontFamily: "'Archivo', sans-serif", color: paper }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, marginBottom: 8 }}>Page not found</div>
              <Link to="/" style={{ color: brass }}>Back to the homepage</Link>
            </div>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
