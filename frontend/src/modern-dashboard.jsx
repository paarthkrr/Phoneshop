import React, { useState, useEffect, useMemo } from "react";
import { sydneyDay, sydneyToday } from "./sydney-time.js";
import PortalLayout, { PortalCard, PortalStat } from "./portal-layout.jsx";

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared) {
  if (!storageAvailable()) return [];
  try { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : []; }
  catch (e) { return []; }
}

const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;

export default function ModernDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const [orders, inventory, sales, tickets] = await Promise.all([
        loadJSON("orders", true), loadJSON("inventory", true),
        loadJSON("sales", true), loadJSON("repair_tickets", true),
      ]);
      setData({ orders, inventory, sales, tickets });
    })();
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const { orders, inventory, sales, tickets } = data;
    const today = sydneyToday();
    const todaySales = sales.filter(s => sydneyDay(s.soldAt) === today);
    const todayRevenue = todaySales.reduce((a, s) => a + (s.salePrice || 0), 0);
    const pendingOrders = orders.filter(o => ["received_inspecting", "awaiting_shipment"].includes(o.status)).length;
    const inStock = inventory.filter(i => i.status === "in_stock").length;
    const openRepairs = tickets.filter(t => !["completed", "not_repairable"].includes(t.status)).length;
    const totalRevenue = sales.reduce((a, s) => a + (s.salePrice || 0), 0);
    return { todayRevenue, todaySales: todaySales.length, pendingOrders, inStock, openRepairs, totalRevenue };
  }, [data]);

  if (!stats) return (
    <PortalLayout title="Dashboard" active="dashboard">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <div style={{ width: 32, height: 32, border: "3px solid #E5E7EB", borderTopColor: "#7A1F2B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </PortalLayout>
  );

  return (
    <PortalLayout title="Dashboard" active="dashboard">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: "#111" }}>Good morning</h2>
        <p style={{ color: "#6B7280", fontSize: 14, margin: "4px 0 0" }}>Here's what's happening with your shop today.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <PortalStat label="Today's Revenue" value={fmt(stats.todayRevenue)} sub={`${stats.todaySales} sales today`} />
        <PortalStat label="Total Revenue" value={fmt(stats.totalRevenue)} sub="All time" color="#7A1F2B" />
        <PortalStat label="Pending Orders" value={stats.pendingOrders} sub="Needs attention" />
        <PortalStat label="In Stock" value={stats.inStock} sub={`${stats.openRepairs} repairs open`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <PortalCard title="Quick Actions">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "New Trade-in Quote", href: "/quote", icon: "📱" },
              { label: "Add to Inventory", href: "/portal/pos", icon: "📦" },
              { label: "Check Market Prices", href: "/portal/pricing", icon: "💰" },
              { label: "View All Orders", href: "/portal/inspect", icon: "📋" },
            ].map((a, i) => (
              <a key={i} href={a.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#F8F9FA", borderRadius: 10, textDecoration: "none", color: "#111", fontSize: 14, fontWeight: 500 }}>
                <span style={{ fontSize: 18 }}>{a.icon}</span>
                {a.label}
              </a>
            ))}
          </div>
        </PortalCard>
        <PortalCard title="Recent Activity">
          <div style={{ color: "#6B7280", fontSize: 13, textAlign: "center", padding: 32 }}>
            No recent activity
          </div>
        </PortalCard>
      </div>
    </PortalLayout>
  );
}
