import React, { useState } from "react";

const NAV = [
  { id: "dashboard", label: "Dashboard", href: "/portal", icon: "📊" },
  { id: "pricing", label: "Pricing", href: "/portal/pricing", icon: "💰" },
  { id: "inspect", label: "Inspect", href: "/portal/inspect", icon: "🔍" },
  { id: "pos", label: "POS", href: "/portal/pos", icon: "🛒" },
  { id: "repairs", label: "Repairs", href: "/portal/repairs", icon: "🔧" },
  { id: "till", label: "Till", href: "/portal/till", icon: "💵" },
  { id: "crm", label: "CRM", href: "/portal/crm", icon: "👥" },
  { id: "team", label: "Team", href: "/portal/team", icon: "👤" },
  { id: "activity", label: "Activity", href: "/portal/activity", icon: "📋" },
  { id: "unlock", label: "Unlock", href: "/portal/unlock", icon: "🔓" },
  { id: "products", label: "Products", href: "/portal/products", icon: "📱" },
];

export default function PortalLayout({ children, title, active }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const current = active || window.location.pathname.split("/")[2] || "dashboard";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <aside style={{ width: sidebarOpen ? 220 : 60, background: "#fff", borderRight: "1px solid #E5E7EB", transition: "width 0.2s", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 12px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: "#7A1F2B", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, flexShrink: 0 }}>R</div>
          {sidebarOpen && <span style={{ fontWeight: 700, fontSize: 16 }}>Recellr</span>}
        </div>
        <nav style={{ flex: 1, padding: "12px 8px", overflow: "auto" }}>
          {NAV.map(n => (
            <a key={n.id} href={n.href} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, marginBottom: 4, textDecoration: "none", background: current === n.id ? "#7A1F2B" : "transparent", color: current === n.id ? "#fff" : "#374151", fontSize: 14, fontWeight: 500 }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              {sidebarOpen && <span>{n.label}</span>}
            </a>
          ))}
        </nav>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ margin: 8, padding: 8, border: "none", background: "#F3F4F6", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>
          {sidebarOpen ? "◀" : "▶"}
        </button>
      </aside>
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#111" }}>{title || "Dashboard"}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#6B7280" }}>{new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
          </div>
        </header>
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
}

export function PortalCard({ title, children, style }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #E5E7EB", ...style }}>
      {title && <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "#111" }}>{title}</h3>}
      {children}
    </div>
  );
}

export function PortalStat({ label, value, sub, color }) {
  return (
    <div style={{ background: color || "#fff", borderRadius: 16, padding: 20, border: color ? "none" : "1px solid #E5E7EB" }}>
      <div style={{ color: color ? "rgba(255,255,255,0.7)" : "#6B7280", fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ? "#fff" : "#111" }}>{value}</div>
      {sub && <div style={{ color: color ? "rgba(255,255,255,0.7)" : "#22C55E", fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
