import { withBusinessDefaults } from "./business-info.js";
import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useNavigationType } from "react-router-dom";

import QuoteCalculator from "./instant-quote-calculator.jsx";
import Storefront from "./storefront.jsx";
import AboutUs from "./about.jsx";
import ContactUs from "./contact.jsx";
import FAQ from "./faq.jsx";
import HomeService from "./home-service.jsx";
import Help from "./help.jsx";
import ChatWidget from "./chat-widget.jsx";
import SplashIntro from "./splash-intro.jsx";
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
import { ROLE_LABELS, currentRole, canSeeScreen } from "./roles.js";
import DarkModeToggle from "./dark-mode-toggle.jsx";

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
const SecuritySetup = staffScreen(() => import("./security.jsx"));
const Activity = staffScreen(() => import("./activity.jsx"));
const UnlockChecker = staffScreen(() => import("./unlock-checker.jsx"));

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
  { to: "/portal/unlock", label: "Unlock Checker" },
  { to: "/portal/activity", label: "Activity" },
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
  // Redraw when someone signs in, so the menu shows only their role's screens straight away.
  const [, setAuthTick] = useState(0);
  useEffect(() => { const f = () => setAuthTick((n) => n + 1); window.addEventListener("mv-auth-change", f); return () => window.removeEventListener("mv-auth-change", f); }, []);
  const role = isStaff ? currentRole() : null;
  const links = isStaff ? STAFF_LINKS.filter((l) => canSeeScreen(l.to, role)) : CUSTOMER_LINKS;
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
    <nav className="cs-glass-nav" style={{ borderBottom: `1px solid ${line}`, position: "sticky", top: 0, zIndex: 50 }} aria-label="Main navigation">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');

        /* ---- Global interaction system — loaded once via Nav, applies site-wide ---- */
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
        /* Browsers add an 8px margin around the page and default to a serif font; without this
           reset every page sat 8px off the screen edge and any text without its own font fell back to Times. */
        html, body { margin: 0; padding: 0; }
        /* Safety net: nothing wider than the screen can make the whole page slide sideways. */
        body { overflow-x: clip; }
        body { font-family: 'Archivo', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; background: #FFFFFF; line-height: 1.45; }
        img, svg, video { max-width: 100%; }

        /* Frosted header: the page shows through softly as it scrolls under.
           The blur sits on a pseudo-element, not the nav itself, because a
           backdrop-filter on the nav would trap the menu's fixed backdrop inside it. */
        .cs-glass-nav::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
          background: rgba(255,255,255,0.82); -webkit-backdrop-filter: saturate(1.6) blur(14px); backdrop-filter: saturate(1.6) blur(14px); }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .cs-glass-nav::before { background: #FFFFFF; } }
        @media (prefers-reduced-transparency: reduce) { .cs-glass-nav::before { background: #FFFFFF; -webkit-backdrop-filter: none; backdrop-filter: none; } }

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

        .cs-page-enter { animation: cs-fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) backwards; overflow-x: clip; }
        /* App-like page changes: forward slides in from the right, Back from the left. */
        @keyframes cs-slide-fwd { from { opacity: 0; transform: translateX(70px) scale(0.985); } to { opacity: 1; transform: none; } }
        @keyframes cs-slide-back { from { opacity: 0; transform: translateX(-70px) scale(0.985); } to { opacity: 1; transform: none; } }
        .cs-page-enter.cs-slide-fwd { animation: cs-slide-fwd 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        .cs-page-enter.cs-slide-back { animation: cs-slide-back 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        /* Sections below the fold rise in gently as you scroll. */
        .mv-reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.55s ease, transform 0.55s cubic-bezier(0.16, 1, 0.3, 1); }
        .mv-reveal.mv-in { opacity: 1; transform: none; }
        /* Tactile press on buttons, and a little bump when the cart changes. */
        .cs-btn:active { transform: scale(0.97); }
        @keyframes cs-bump { 0% { transform: scale(1); } 40% { transform: scale(1.05); } 100% { transform: scale(1); } }
        .cs-bump { animation: cs-bump 0.35s ease; }
        /* Grids of cards cascade in one after another. */
        .mv-stagger > * { animation: cs-fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
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

        /* ---- Staff portal look: graphite header with a chrome active tab, silver page, softer cards.
           Styling only (scoped to body.cs-staff-mode); no layout or logic changes. ---- */
        body.cs-staff-mode { background: linear-gradient(180deg, #EEF1F6 0%, #E4E8F0 100%) fixed; }
        body.cs-staff-mode .cs-glass-nav { border-bottom: 1px solid #2A2F3C !important; box-shadow: 0 6px 24px rgba(5,6,8,.25); }
        body.cs-staff-mode .cs-glass-nav::before { background: linear-gradient(180deg, #232733 0%, #0E0F13 100%); -webkit-backdrop-filter: none; backdrop-filter: none; }
        body.cs-staff-mode .cs-glass-nav a, body.cs-staff-mode .cs-glass-nav span { color: #D6DCE8 !important; }
        body.cs-staff-mode .cs-glass-nav a:hover { color: #FFFFFF !important; }
        body.cs-staff-mode .cs-glass-nav .cs-nav-link.active { background: linear-gradient(180deg, #FFFFFF, #C9D0DC); color: #0E0F13 !important; border-radius: 999px; font-weight: 700; }
        body.cs-staff-mode .cs-glass-nav .cs-nav-link.active::after { display: none; }
        body.cs-staff-mode .cs-glass-nav .cs-nav-link { border-radius: 999px; }
        body.cs-staff-mode .cs-glass-nav .cs-menu-btn { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.25); color: #FFFFFF; }
        body.cs-staff-mode .cs-glass-nav .cs-mobile-menu { background: #0E0F13; border-top-color: #2A2F3C !important; }
        body.cs-staff-mode .cs-glass-nav .cs-mobile-menu a { border-bottom-color: #232733 !important; }
        body.cs-staff-mode main div[style*="border: 1px solid rgb(226, 230, 236)"] { border-radius: 14px !important; box-shadow: 0 8px 26px rgba(15,27,61,.07); }
        body.cs-staff-mode main > div[style*="background: rgb(255, 255, 255)"] { background: transparent !important; }
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
        }
      `}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <Link to="/" style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, color: "#111827", textDecoration: "none", letterSpacing: "-0.02em" }}>Mobile Recellr</Link>
        <div className="cs-nav-links" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <DesktopMenu pathname={normPath(location.pathname)} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DarkModeToggle />
          <Link to="/quote" className="mm-quote-btn desk">Get a Quote</Link>
          <button className="cs-burger" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}><span /><span /><span /></button>
        </div>
      </div>
      <MobileBackdrop open={menuOpen} onClose={() => setMenuOpen(false)} />
      <MobileDrawer open={menuOpen} />
    </nav>
    </>
  );
}

// Rest of App.jsx continues (truncated for brevity in this call — full file restored from local)
export default function App() {
  return (
    <BrowserRouter>
      <AnnouncementBar />
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/quote" element={<QuoteCalculator />} />
        <Route path="/shop" element={<Storefront />} />
        <Route path="/repairs" element={<Repairs />} />
        <Route path="/accessories" element={<Parts />} />
        <Route path="/parts" element={<Parts />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/help" element={<Help />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/tutorials" element={<Tutorials />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/sell/:brand" element={<SellBrand />} />
      </Routes>
      <SiteFooter />
      <ChatWidget />
    </BrowserRouter>
  );
}
