import React from "react";

const NAV = [
  { id: "overview", label: "Overview", href: "/portal" },
  { id: "activity", label: "Activity", href: "/portal/activity" },
  { id: "orders", label: "Orders", href: "/portal/inspect" },
  { id: "repairs", label: "Repairs", href: "/portal/repairs" },
  { id: "pricing", label: "Pricing", href: "/portal/pricing" },
  { id: "pos", label: "POS", href: "/portal/pos" },
  { id: "till", label: "Till", href: "/portal/till" },
  { id: "crm", label: "CRM", href: "/portal/crm" },
  { id: "team", label: "Team", href: "/portal/team" },
  { id: "unlock", label: "Unlock", href: "/portal/unlock" },
  { id: "products", label: "Products", href: "/portal/products" },
];

export default function StaffNav({ active }) {
  const current = active || window.location.pathname.split("/")[2] || "overview";
  
  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, overflowX: "auto" }}>
      <div style={{ width: 36, height: 36, background: "#7A1F2B", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, flexShrink: 0 }}>R</div>
      <span style={{ fontWeight: 600, marginRight: 16, flexShrink: 0 }}>Recellr</span>
      {NAV.map(n => (
        <a key={n.id} href={n.href} style={{ 
          padding: "8px 16px", 
          borderRadius: 20, 
          textDecoration: "none", 
          background: current === n.id ? "#111" : "transparent", 
          color: current === n.id ? "#fff" : "#374151", 
          fontSize: 14, 
          fontWeight: 500,
          whiteSpace: "nowrap"
        }}>{n.label}</a>
      ))}
    </div>
  );
}
