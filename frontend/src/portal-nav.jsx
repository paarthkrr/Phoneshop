// Every staff screen, in one list: the portal sidebar, the phone tab bar and the
// dashboard's tool grid all read from here, so a screen added once shows up everywhere.
// Who can open what is still decided by roles.js (canSeeScreen) and the server.
import React from "react";

const P = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></>,
  pos: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  inspect: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /><path d="m8.5 11 1.8 1.8 3.4-3.6" /></>,
  repairs: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></>,
  till: <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18" /><circle cx="12" cy="15" r="1.6" /><path d="M7 7V5h10v2" /></>,
  crm: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5" /></>,
  pricing: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  products: <><path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
  unlock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.8-1.2" /></>,
  team: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  logout: <><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  site: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
};
export const PIcon = ({ k, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[k]}</svg>
);

export const PORTAL_GROUPS = ["Overview", "Buy & sell", "Service", "Business", "Admin"];
export const PORTAL_ITEMS = [
  { to: "/portal", label: "Dashboard", icon: "home", group: "Overview", desc: "Today at a glance" },
  { to: "/portal/pos", label: "Register", icon: "pos", group: "Buy & sell", desc: "Buy, receive, grade and sell stock" },
  { to: "/portal/inspect", label: "Inspection", icon: "inspect", group: "Buy & sell", desc: "Check trade-ins and release payment" },
  { to: "/portal/till", label: "Till", icon: "till", group: "Buy & sell", desc: "Open, count and close the cash drawer" },
  { to: "/portal/products", label: "Products", icon: "products", group: "Buy & sell", desc: "Accessories and parts in the online shop" },
  { to: "/portal/repairs", label: "Repairs", icon: "repairs", group: "Service", desc: "Repair jobs from booking to pickup" },
  { to: "/portal/unlock", label: "Unlock checker", icon: "unlock", group: "Service", desc: "IMEI checks and ownership proof" },
  { to: "/portal/crm", label: "Customers & reports", icon: "crm", group: "Business", desc: "Customers, profit & loss, expenses, leads" },
  { to: "/portal/pricing", label: "Pricing", icon: "pricing", group: "Business", desc: "Every number the quote tool uses" },
  { to: "/portal/team", label: "Team", icon: "team", group: "Admin", desc: "Who can sign in, passwords, two-step" },
  { to: "/portal/activity", label: "Activity", icon: "activity", group: "Admin", desc: "Every change the team makes" },
];
// Phone tab bar: the four screens used most at the counter, plus "All tools".
export const TAB_ITEMS = ["/portal", "/portal/pos", "/portal/inspect", "/portal/repairs"];
