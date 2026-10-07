import { withBusinessDefaults } from "./business-info.js";
import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useNavigationType } from "react-router-dom";

import QuoteCalculator from "./instant-quote-calculator.jsx";
import Storefront from "./storefront.jsx";
import AboutUs from "./about.jsx";
import ContactUs from "./contact.jsx";
import FAQ from "./faq.jsx";
import Help from "./help.jsx";
import ChatWidget from "./chat-widget.jsx";
import Repairs from "./repairs.jsx";
import Parts from "./parts.jsx";
import Blog from "./blog.jsx";
import Home from "./home.jsx";
import { metaFor } from "./seo-meta.js";
import Tutorials from "./tutorials.jsx";
import SellBrand from "./sell-brand.jsx";
import { PrivacyPolicy, Terms } from "./legal.jsx";
import SiteFooter from "./site-footer.jsx";
import { NAV_CSS, DesktopMenu, MobileDrawer, MobileBackdrop } from "./site-nav.jsx";

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

const ink = "#FFFFFF", panel = "#FFFFFF", paper = "#111827", muted = "#5B6472",
  brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", line = "#E2E6EC";

// The staff area lives at /portal. It used to be /staff, but Render's CDN
// kept a broken saved copy of /staff that can't be cleared from code, so
// the area moved to an address the CDN had never seen. /staff still works
// as an alias for whenever that saved copy expires.
const STAFF_BASES = ["/portal", "/staff"];
// "/portal/index.html" and "/portal/" both mean "/portal". The index.html
// form matters: it's an exact file the host always serves, so it works
// even when the host's handling of non-file addresses is broken.
export function normPath(p) {
  const n = p.replace(/\/index\.html$/, "").replace(/(.)\/$/, "$1");
  return n || "/";
}

// Staff screens load on demand, so customers never download them. If a screen's
// file has gone because a new version was deployed while the page was open,
// reload once to pick up the new version.
function staffScreen(load) {
  return React.lazy(() => load().then((m) => {
    try { sessionStorage.removeItem("mv_chunk_reload"); } catch (e) {}
    return m;
  }, (err) => {
    let reloaded = true;
    try { reloaded = sessionStorage.getItem("mv_chunk_reload") === "1"; sessionStorage.setItem("mv_chunk_reload", "1"); } catch (e) {}
    if (!reloaded) { window.location.reload(); return new Promise(() => {}); }
    throw err;
  }));
}
const Team = staffScreen(() => import("./team.jsx"));
const Products = staffScreen(() => import("./products.jsx"));
const DailyDashboard = staffScreen(() => import("./daily-dashboard.jsx"));
const AdminPricingConsole = staffScreen(() => import("./admin-pricing-console.jsx"));
const StaffInspectionConsole = staffScreen(() => import("./staff-inspection-console.jsx"));
const POSInventory = staffScreen(() => import("./pos-inventory.jsx"));
const RepairTickets = staffScreen(() => import("./repair-tickets.jsx"));
const TillReconciliation = staffScreen(() => import("./till-reconciliation.jsx"));
const CRMDashboard = staffScreen(() => import("./crm-dashboard.jsx"));

function isStaffPath(p) {
  return STAFF_BASES.some((b) => p === b || p.startsWith(b + "/"));
}

const CUSTOMER_LINKS = [
  { to: "/quote", label: "Get a Quote" },
  { to: "/shop", label: "Shop refurbished" },
  { to: "/repairs", label: "Repairs" },
  { to: "/accessories", label: "Accessories" },
];

const STAFF_LINKS = [
  { to: "/portal", label: "Today" },
  { to: "/portal/inspect", label: "Inspection" },
  { to: "/portal/pos", label: "Register" },
  { to: "/portal/repairs", label: "Repair Bench" },
  { to: "/portal/till", label: "Till" },
  { to: "/portal/crm", label: "Customers & Reports" },
  { to: "/portal/pricing", label: "Pricing Console" },
  { to: "/portal/products", label: "Products" },
  { to: "/portal/team", label: "Team" },
];

// Top strip. Wide screens show every message on one line; phones show one
// message at a time (rotating), so the strip never takes more than one line.
const ANNOUNCEMENTS = ["🏠 Home collection across Sydney", "💵 Get paid in cash", "✓ 49-point check", "⚡ Free express shipping over $100", "✓ 1-year warranty on phones"];
function AnnouncementBar() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % ANNOUNCEMENTS.length), 4000); return () => clearInterval(t); }, []);
  const terms = <a href="/terms" target="_blank" rel="noopener" style={{ color: "inherit", textDecoration: "underline" }}>Conditions apply</a>;
  return (
    <div className="cs-announce" style={{ background: "#111827", color: "#FFFFFF", fontSize: 12.5, textAlign: "center", padding: "7px 12px", lineHeight: 1.5, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <span className="cs-announce-full">{ANNOUNCEMENTS.join("  ·  ")}  ·  {terms}</span>
      <span className="cs-announce-one" aria-live="off" style={{ whiteSpace: "nowrap" }}>{ANNOUNCEMENTS[i]}  ·  {terms}</span>
    </div>
  );
}

function Nav() {
  const location = useLocation();
  const isStaff = isStaffPath(normPath(location.pathname));
  const links = isStaff ? STAFF_LINKS : CUSTOMER_LINKS;
  const [menuOpen, setMenuOpen] = useState(false);
  // Close the mobile menu whenever the page changes, so tapping a link
  // doesn't leave the menu hanging open over the new page.
  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);
  // While the mobile menu is open: stop the page behind it scrolling, and let Escape close it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);
  useEffect(() => { document.body.classList.toggle("cs-staff-mode", isStaff); }, [isStaff]);

  return (
    <>
    <nav style={{ borderBottom: `1px solid ${line}`, background: panel, position: "sticky", top: 0, zIndex: 50 }} aria-label="Main navigation">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');

        /* ---- Global interaction system — loaded once via Nav, applies site-wide ---- */
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        /* ---- Mobile menu: desktop links collapse into a menu button under 720px ---- */
        .cs-menu-btn { display: none; background: none; border: 1px solid #E2E6EC; border-radius: 3px; padding: 5px 10px; font-size: 18px; line-height: 1; cursor: pointer; color: #111827; }
        .cs-mobile-menu { display: none; }
        @media (max-width: 720px) {
          .cs-nav-links, .cs-nav-aside { display: none !important; }
          .cs-menu-btn { display: inline-block; }
          .cs-mobile-menu.open { display: flex; }
        }

        @keyframes cs-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cs-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cs-spin { to { transform: rotate(360deg); } }

        .cs-page-enter { animation: cs-fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; overflow-x: clip; }
        /* App-like page changes: forward slides in from the right, Back from the left. */
        @keyframes cs-slide-fwd { from { opacity: 0; transform: translateX(70px) scale(0.985); } to { opacity: 1; transform: none; } }
        @keyframes cs-slide-back { from { opacity: 0; transform: translateX(-70px) scale(0.985); } to { opacity: 1; transform: none; } }
        .cs-page-enter.cs-slide-fwd { animation: cs-slide-fwd 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .cs-page-enter.cs-slide-back { animation: cs-slide-back 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        /* Sections below the fold rise in gently as you scroll. */
        .mv-reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.55s ease, transform 0.55s cubic-bezier(0.16, 1, 0.3, 1); }
        .mv-reveal.mv-in { opacity: 1; transform: none; }
        /* Tactile press on buttons, and a little bump when the cart changes. */
        .cs-btn:active { transform: scale(0.97); }
        @keyframes cs-bump { 0% { transform: scale(1); } 40% { transform: scale(1.05); } 100% { transform: scale(1); } }
        .cs-bump { animation: cs-bump 0.35s ease; }
        /* Grids of cards cascade in one after another. */
        .mv-stagger > * { animation: cs-fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .mv-stagger > *:nth-child(2) { animation-delay: 0.045s; }
        .mv-stagger > *:nth-child(3) { animation-delay: 0.090s; }
        .mv-stagger > *:nth-child(4) { animation-delay: 0.135s; }
        .mv-stagger > *:nth-child(5) { animation-delay: 0.180s; }
        .mv-stagger > *:nth-child(6) { animation-delay: 0.225s; }
        .mv-stagger > *:nth-child(7) { animation-delay: 0.270s; }
        .mv-stagger > *:nth-child(8) { animation-delay: 0.315s; }
        .mv-stagger > *:nth-child(9) { animation-delay: 0.360s; }
        .mv-stagger > *:nth-child(10) { animation-delay: 0.405s; }
        .mv-stagger > *:nth-child(11) { animation-delay: 0.450s; }
        .mv-stagger > *:nth-child(12) { animation-delay: 0.495s; }
        .mv-stagger > *:nth-child(n+13) { animation-delay: 0.5s; }
        .cs-fade { animation: cs-fade-in 0.3s ease both; }

        .cs-btn { transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, opacity 0.15s ease; }
        .cs-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(32, 28, 24, 0.18); }
        .cs-btn:active { transform: translateY(0); box-shadow: 0 1px 4px rgba(32, 28, 24, 0.15); }

        .cs-card { transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          border-radius: 14px !important; border-color: rgba(32,28,24,0.14) !important;
          box-shadow: 0 1px 2px rgba(32,28,24,0.04), 0 6px 18px rgba(32,28,24,0.05); }
        .cs-card:hover { border-color: rgba(33,80,200,0.45) !important; }
        .cs-btn { border-radius: 10px !important; }
        body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        /* Form controls don't inherit the page font by default — they fall back to the
           phone's system font, which made forms look mismatched. Inherit everywhere. */
        button, input, select, textarea, optgroup { font-family: inherit; }
        /* Staff tools were written with small (11-13px) text; scale the whole staff
           area up proportionally so it's comfortable to read on a phone or tablet. */
        .cs-staff-mode main { zoom: 1.06; }
        @media (max-width: 720px) { .cs-staff-mode main { zoom: 1.12; } }
        ::selection { background: rgba(33,80,200,0.18); }
        .cs-mobile-cta { display: none; }
        @media (max-width: 720px) {
          .cs-mobile-cta { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; gap: 10px;
            padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)); background: rgba(255,255,255,0.94);
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-top: 1px solid rgba(32,28,24,0.12);
            box-shadow: 0 -6px 20px rgba(32,28,24,0.08); }
          .has-mobile-cta { padding-bottom: 76px; }
        }
        .cs-card:hover { transform: translateY(-3px); box-shadow: 0 8px 22px rgba(32, 28, 24, 0.12); }

        .cs-nav-link { position: relative; transition: color 0.15s ease; }
        .cs-nav-link::after {
          content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 2px;
          background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform 0.2s ease;
        }
        .cs-nav-link:hover::after, .cs-nav-link.active::after { transform: scaleX(1); }

        .cs-tile { transition: transform 0.15s ease, background-color 0.15s ease; }
        .cs-tile:hover { transform: scale(1.03); }
        .cs-tile:active { transform: scale(0.98); }

        .cs-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: cs-spin 0.6s linear infinite; }

        input, textarea, select { transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 3px rgba(33, 80, 200, 0.22); }

        @media (prefers-reduced-motion: reduce) {
          .cs-fade, .cs-btn, .cs-card, .cs-nav-link, .cs-tile, .cs-spinner, .cs-bump { animation: none !important; transition: none !important; }
          /* Reduce Motion: no sliding, but pages still fade in so the site doesn't feel static. */
          .cs-page-enter, .cs-page-enter.cs-slide-fwd, .cs-page-enter.cs-slide-back { animation: cs-fade-in 0.35s ease both !important; }
          .mv-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
          .mv-stagger > * { animation: cs-fade-in 0.4s ease both !important; }
        }
        /* Touch screens: give small text links a finger-sized tap area (about 44px tall). */
        @media (pointer: coarse) {
          footer a { display: inline-block; padding: 9px 0; }
          .cs-announce a { display: inline-block; padding: 6px 0; }
        }
        .cs-announce-one { display: none; }
        @media (max-width: 900px) { .cs-announce-full { display: none; } .cs-announce-one { display: inline; } }
        ${NAV_CSS}
      `}</style>
      {!isStaff && <AnnouncementBar />}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontFamily: "'Archivo', system-ui, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <Link to={isStaff ? "/portal/index.html" : "/"} style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, color: paper, textDecoration: "none", letterSpacing: "-0.01em" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9, textTransform: "none" }}><img src="/logo-icon.svg" alt="" width="34" height="34" style={{ display: "block" }} /><span style={{ fontSize: 19, letterSpacing: "0.01em", lineHeight: 1 }}>MOBILE <span style={{ color: brass }}>RECELLR</span></span></span>{isStaff && <span style={{ fontSize: 12, color: muted, fontFamily: "'Archivo', sans-serif", marginLeft: 8, fontWeight: 400 }}>STAFF</span>}
          </Link>
          <div className="cs-nav-links" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {!isStaff && <DesktopMenu pathname={normPath(location.pathname)} />}
            {isStaff && links.map((l) => {
              const active = normPath(location.pathname) === l.to;
              return (
                <Link key={l.to} to={l.to} className={`cs-nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}
                  style={{
                    padding: "7px 13px", fontSize: 13.5, fontWeight: active ? 700 : 500, textDecoration: "none",
                    color: active ? brass : paper,
                  }}>
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
        {!isStaff ? (
          <div className="cs-nav-aside" style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Link to="/quote" className="mm-quote-btn desk">Get a Quote</Link>
          </div>
        ) : (
          <div className="cs-nav-aside" style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
        {isStaff ? (
          <button className="cs-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="cs-mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"}>
            {menuOpen ? "✕" : "☰"}
          </button>
        ) : (
          <button className={`cs-burger${menuOpen ? " open" : ""}`} onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="cs-mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"}>
            <span /><span /><span />
          </button>
        )}
      </div>
      {!isStaff && <MobileDrawer open={menuOpen} />}
      {isStaff && <div id="cs-mobile-menu" className={`cs-mobile-menu${menuOpen ? " open" : ""}`}
        style={{ flexDirection: "column", borderTop: `1px solid ${line}`, padding: "8px 16px 14px", fontFamily: "'Archivo', system-ui, sans-serif" }}>
        {links.map((l) => {
          const active = normPath(location.pathname) === l.to;
          return (
            <Link key={l.to} to={l.to} aria-current={active ? "page" : undefined}
              style={{ padding: "12px 4px", fontSize: 16, fontWeight: active ? 700 : 500, color: active ? brass : paper, textDecoration: "none", borderBottom: "1px solid #F4F6F9" }}>
              {l.label}
            </Link>
          );
        })}
        {isStaff && (
          <>
            {window.shopAuth && window.shopAuth.currentUser() && (
              <a href="#" onClick={(e) => { e.preventDefault(); window.shopAuth.logout(window.SHOP_API_BASE_URL); window.location.reload(); }}
                style={{ padding: "12px 4px", fontSize: 14, color: muted }}>Log out ({window.shopAuth.currentUser().username})</a>
            )}
            <Link to="/" style={{ padding: "12px 4px", fontSize: 14, color: muted }}>← Exit to public site</Link>
          </>
        )}
      </div>}
    </nav>
    {!isStaff && <MobileBackdrop open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </>
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
      await window.shopAuth.login(window.SHOP_API_BASE_URL, username.trim(), password);
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
  // Forgotten admin password: one-time recovery code set by the owner on the host.
  async function handleRecover() {
    setError(""); setSuccess("");
    if (password.length < 8) return setError("New password must be at least 8 characters.");
    try {
      const res = await fetch(`${window.SHOP_API_BASE_URL}/auth/recover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), code: bootstrapToken.trim(), newPassword: password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Recovery failed");
      setSuccess("Password reset — sign in with your new password."); setMode("login"); setPassword(""); setBootstrapToken("");
    } catch (e) { setError(e.message); }
  }

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
        {mode === "login" ? "Staff sign in" : mode === "recover" ? "Reset admin password" : "Create the first staff account"}
      </div>
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={{ width: "100%", padding: 10, marginBottom: 8, border: `1px solid ${line}`, fontSize: 14, boxSizing: "border-box" }} />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "recover" ? "New password (8+ characters)" : "Password (8+ characters)"} type="password"
        style={{ width: "100%", padding: 10, marginBottom: 8, border: `1px solid ${line}`, boxSizing: "border-box", fontSize: 14 }} />
      {(mode === "register" || mode === "recover") && (
        <input value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} placeholder={mode === "recover" ? "Backup recovery code" : "Bootstrap token (if one was set)"}
          style={{ width: "100%", padding: 10, marginBottom: 8, border: `1px solid ${line}`, boxSizing: "border-box", fontSize: 14 }} />
      )}
      {error && <div style={{ color: "#8B2E2E", fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {success && <div style={{ color: "#3F6B34", fontSize: 13, marginBottom: 8 }}>{success}</div>}
      <button onClick={mode === "login" ? handleLogin : mode === "recover" ? handleRecover : handleRegister}
        style={{ width: "100%", padding: 11, background: brass, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
        {mode === "login" ? "Sign in" : mode === "recover" ? "Reset password" : "Create account"}
      </button>
      <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess(""); }}
        style={{ width: "100%", padding: 9, background: "transparent", border: "none", color: paper, textDecoration: "underline", cursor: "pointer", fontSize: 12.5 }}>
        {mode === "login" ? "First time here? Create an account" : "Already have an account? Sign in"}
      </button>
      {mode === "login" && <button onClick={() => { setMode("recover"); setError(""); setSuccess(""); }}
        style={{ width: "100%", padding: 6, background: "transparent", border: "none", color: brass, textDecoration: "underline", cursor: "pointer", fontSize: 12.5 }}>
        Forgot password?
      </button>}
      {mode === "recover" && <div style={{ fontSize: 12, color: "#5B6472", lineHeight: 1.5 }}>Use the backup code you saved from the Team page (usernames aren't case-sensitive). No code? Ask an admin to reset your password from the Team page.</div>}
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
    // Wake the backend the moment someone arrives. On a free host it sleeps
    // when idle and takes 30-50s to start; pinging now means it's usually
    // awake by the time the visitor submits anything.
    if (window.SHOP_API_BASE_URL) {
      try { fetch(`${window.SHOP_API_BASE_URL}/health`, { cache: "no-store" }).catch(() => {}); } catch (e) {}
    }
    setStorageReady(true);
  }, []);

  if (!storageReady) return null;

  return (
    <BrowserRouter>
      <div style={{ background: ink, minHeight: "100vh" }}>
        <Nav />
        <LinkInterceptor />
        <PageMeta />
        <ScrollReveal />
        <SiteSchema />
        <AnimatedRoutes />
      </div>
    </BrowserRouter>
  );
}

// Thumb-zone action bar for phones: the primary action stays reachable at
// the bottom of the screen while scrolling (research: sticky bottom CTAs
// lift mobile conversion). Hidden where the page already has its own sticky
// action (the quote page) and on staff pages.
function MobileCTA() {
  const location = useLocation();
  const path = normPath(location.pathname);
  const hidden = isStaffPath(path) || path === "/quote" || path === "/sell" || path === "/accessories" || path === "/parts";
  const [phone, setPhone] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        if (!window.storage) return;
        const r = await window.storage.get("pricing-config", true);
        setPhone(withBusinessDefaults(r ? JSON.parse(r.value).businessSettings : null).phone);
      } catch (e) { /* no config yet */ }
    })();
  }, []);
  useEffect(() => {
    document.body.classList.toggle("has-mobile-cta", !hidden);
    return () => document.body.classList.remove("has-mobile-cta");
  }, [hidden]);
  if (hidden) return null;
  const btn = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none", fontFamily: "'Archivo', system-ui, sans-serif" };
  return (
    <div className="cs-mobile-cta" role="navigation" aria-label="Quick actions">
      <a href="/quote" style={{ ...btn, background: brass, color: "#fff", flex: phone ? 1.4 : 1 }}>Get a quote</a>
      {phone
        ? <a href={`tel:${phone.replace(/\s/g, "")}`} style={{ ...btn, border: `1.5px solid ${line}`, color: paper }}>📞 Call us</a>
        : <a href="/repairs" style={{ ...btn, border: `1.5px solid ${line}`, color: paper }}>Book a repair</a>}
    </div>
  );
}

// Every internal link switches pages INSIDE the app instead of asking the
// host for a new page. The host's dashboard rewrite rule returns an empty
// page for any address except "/", so a normal link to /quote went blank;
// in-app navigation never hits the host, so it always works. Covers every
// plain <a href="/..."> on the site (buttons, cards, chips, footer), current
// and future. External links, tel:/mailto:, new-tab links, same-page #anchors
// and modifier-clicks are left to the browser as normal.
// Each page gets its own browser-tab/Google title, description, and
// canonical link (previously every page shared the homepage's title).

// Adds the shop's real address and phone to Google's structured data once
// they're entered in Business settings (never placeholders).
function SiteSchema() {
  useEffect(() => {
    (async () => {
      try {
        if (!window.storage) return;
        const r = await window.storage.get("pricing-config", true);
        const b = withBusinessDefaults(r ? JSON.parse(r.value).businessSettings : null);
        if (!b.address && !b.phone) return;
        const data = { "@context": "https://schema.org", "@type": "ElectronicsStore", name: b.shopName || "Mobile Recellr", url: window.location.origin,
          ...(b.address ? { address: b.address } : {}), ...(b.phone ? { telephone: b.phone } : {}), ...(b.email ? { email: b.email } : {}) };
        let el = document.getElementById("mv-localbusiness");
        if (!el) { el = document.createElement("script"); el.type = "application/ld+json"; el.id = "mv-localbusiness"; document.head.appendChild(el); }
        el.textContent = JSON.stringify(data);
      } catch (e) { /* settings not available */ }
    })();
  }, []);
  return null;
}

function PageMeta() {
  const location = useLocation();
  useEffect(() => {
    const path = normPath(location.pathname);
    const staff = isStaffPath(path);
    const meta = metaFor(path);
    const title = meta && meta.title, desc = meta && meta.desc;
    if (staff) document.title = "Staff — Mobile Recellr";
    else if (title) document.title = title;
    if (desc) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
      m.setAttribute("content", desc);
    }
    let c = document.querySelector('link[rel="canonical"]');
    if (!c) { c = document.createElement("link"); c.setAttribute("rel", "canonical"); document.head.appendChild(c); }
    c.setAttribute("href", window.location.origin + (path === "/parts" ? "/accessories" : path));
    let r = document.querySelector('meta[name="robots"]');
    if (staff) { if (!r) { r = document.createElement("meta"); r.setAttribute("name", "robots"); document.head.appendChild(r); } r.setAttribute("content", "noindex"); }
    else if (r) r.remove();
  }, [location.pathname]);
  return null;
}

function LinkInterceptor() {
  const navigate = useNavigate();
  useEffect(() => {
    function onClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url;
      try { url = new URL(a.getAttribute("href"), window.location.href); } catch (err) { return; }
      if (url.origin !== window.location.origin) return;
      if (/\.(?!html$)[a-z0-9]+$/i.test(url.pathname)) return; // real files (images, pdf, xml...)
      if (url.pathname === window.location.pathname && url.hash) return; // same-page anchor
      e.preventDefault();
      navigate(url.pathname + url.search + url.hash);
      window.scrollTo(0, 0);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);
  return null;
}

// Reveal cards below the fold as they scroll into view. Cards already on
// screen are never hidden (no flash), and nothing happens without
// IntersectionObserver or when the visitor prefers reduced motion.
function ScrollReveal() {
  const location = useLocation();
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new window.IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("mv-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -40px 0px" });
    const scan = () => document.querySelectorAll("main .cs-card:not(.mv-reveal)").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add("mv-reveal"); io.observe(el); }
    });
    const t1 = setTimeout(scan, 60), t2 = setTimeout(scan, 700); // again after data loads
    return () => { clearTimeout(t1); clearTimeout(t2); io.disconnect(); };
  }, [location.pathname]);
  return null;
}

let firstPage = true;
function AnimatedRoutes() {
  const location = useLocation();
  const navType = useNavigationType();
  const slide = firstPage ? "" : navType === "POP" ? " cs-slide-back" : " cs-slide-fwd";
  useEffect(() => { firstPage = false; }, []);
  // New page (any link, incl. the menu) starts at the top; Back keeps the browser's spot.
  useEffect(() => { if (navType !== "POP") window.scrollTo(0, 0); }, [location.pathname]);
  const isStaff = isStaffPath(normPath(location.pathname));
  return (
    <main key={location.pathname} className={"cs-page-enter" + slide}>
      <React.Suspense fallback={<div style={{ padding: "60px 16px", textAlign: "center", color: "#5B6472", fontFamily: "'Archivo', system-ui, sans-serif" }}>Loading…</div>}>
      <Routes location={{ ...location, pathname: normPath(location.pathname) }}>
        <Route path="/" element={<Home />} />
        <Route path="/quote" element={<QuoteCalculator />} />
        <Route path="/sell" element={<QuoteCalculator />} />
        <Route path="/sell/:brand" element={<SellBrand />} />
        <Route path="/shop" element={<Storefront />} />
        <Route path="/repairs" element={<Repairs />} />
        <Route path="/parts" element={<Parts />} />
        <Route path="/accessories" element={<Parts />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/tutorials" element={<Tutorials />} />
        <Route path="/blog/:slug" element={<Blog />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/help" element={<Help />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/portal" element={<StaffGate><DailyDashboard /></StaffGate>} />
        <Route path="/portal/pricing" element={<StaffGate><AdminPricingConsole /></StaffGate>} />
        <Route path="/portal/inspect" element={<StaffGate><StaffInspectionConsole /></StaffGate>} />
        <Route path="/portal/pos" element={<StaffGate><POSInventory /></StaffGate>} />
        <Route path="/portal/repairs" element={<StaffGate><RepairTickets /></StaffGate>} />
        <Route path="/portal/till" element={<StaffGate><TillReconciliation /></StaffGate>} />
        <Route path="/portal/crm" element={<StaffGate><CRMDashboard /></StaffGate>} />
        <Route path="/portal/team" element={<StaffGate><Team /></StaffGate>} />
        <Route path="/portal/products" element={<StaffGate><Products /></StaffGate>} />
        {/* Legacy /staff addresses — same pages */}
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
      </React.Suspense>
      {!isStaff && <SiteFooter />}
      {!isStaff && <ChatWidget />}
      <MobileCTA />
    </main>
  );
}
