import React from "react";
import { Link, useLocation } from "react-router-dom";

const NAV = [
  { to: "/portal", label: "Dashboard", icon: "📊" },
  { to: "/portal/pricing", label: "Pricing", icon: "💰" },
  { to: "/portal/inspect", label: "Inspect", icon: "🔍" },
  { to: "/portal/pos", label: "POS", icon: "🛒" },
  { to: "/portal/repairs", label: "Repairs", icon: "🔧" },
  { to: "/portal/till", label: "Till", icon: "💵" },
  { to: "/portal/crm", label: "CRM", icon: "👥" },
  { to: "/portal/team", label: "Team", icon: "👤" },
  { to: "/portal/activity", label: "Activity", icon: "📋" },
  { to: "/portal/unlock", label: "Unlock", icon: "🔓" },
  { to: "/portal/products", label: "Products", icon: "📱" },
];

export default function PortalLayout({ children }) {
  const location = useLocation();
  const current = location.pathname;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <aside style={{ width: 200, background: "#fff", borderRight: "1px solid #E5E7EB", padding: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, background: "#7A1F2B", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>R</div>
          <span style={{ fontWeight: 700 }}>Recellr</span>
        </div>
        {NAV.map(n => (
          <Link key={n.to} to={n.to} style={{ 
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", 
            borderRadius: 10, marginBottom: 4, textDecoration: "none",
            background: current === n.to ? "#7A1F2B" : "transparent", 
            color: current === n.to ? "#fff" : "#374151", 
            fontSize: 14, fontWeight: 500 
          }}>
            <span>{n.icon}</span> {n.label}
          </Link>
        ))}
      </aside>
      <main style={{ flex: 1, overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
