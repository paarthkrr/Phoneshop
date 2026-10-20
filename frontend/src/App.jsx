import { withBusinessDefaults, waLink } from "./business-info.js";
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
import CustomerDisplay from "./customer-display.jsx";

const ink = "#FFFFFF", panel = "#FFFFFF", paper = "#111827", muted = "#5B6472",
  brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", line = "#E2E6EC";

const STAFF_BASES = ["/portal", "/staff"];
export function normPath(p) {
  const n = p.replace(/\/index\.html$/, "").replace(/(.)\/$/, "$1");
  return n || "/";
}

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
const CRMDashboard = staffScreen(() => import("./crm-enhanced.jsx"));
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
  { to: "/portal", label: "Dashboard" },
  { to: "/portal/pricing", label: "Pricing" },
  { to: "/portal/inspect", label: "Inspect" },
  { to: "/portal/pos", label: "POS" },
  { to: "/portal/repairs", label: "Repairs" },
  { to: "/portal/till", label: "Till" },
  { to: "/portal/crm", label: "CRM" },
  { to: "/portal/team", label: "Team" },
  { to: "/portal/activity", label: "Activity" },
  { to: "/portal/unlock", label: "Unlock" },
  { to: "/portal/products", label: "Products" },
];

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/quote" element={<QuoteCalculator />} />
        <Route path="/portal" element={<StaffGate><DailyDashboard /></StaffGate>} />
        <Route path="*" element={<div>Not Found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

function StaffGate({ children }) {
  return children;
}

export default App;
