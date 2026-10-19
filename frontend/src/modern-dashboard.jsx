import React, { useState, useEffect, useMemo } from "react";
import { sydneyDay, sydneyToday } from "./sydney-time.js";

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
  const [tab, setTab] = useState("overview");

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
    <div style={{ background: "#F8F9FA", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #E5E7EB", borderTopColor: "#7A1F2B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const tabs = ["Overview", "Activity", "Orders", "Inventory", "Repairs"];

  return (
    <div style={{ background: "#F8F9FA", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "12px 24px", display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, background: "#7A1F2B", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>R</div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Recellr</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t.toLowerCase())} style={{ padding: "8px 16px", borderRadius: 20, border: "none", background: tab === t.toLowerCase() ? "#111" : "transparent", color: tab === t.toLowerCase() ? "#fff" : "#666", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: "#111" }}>Good morning</h2>
          <p style={{ color: "#888", fontSize: 14, margin: "4px 0 0" }}>Here's what's happening with your shop today.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #E5E7EB" }}>
            <div style={{ color: "#888", fontSize: 13, marginBottom: 8 }}>Today's Revenue</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111" }}>{fmt(stats.todayRevenue)}</div>
            <div style={{ color: "#22C55E", fontSize: 12, marginTop: 4 }}>{stats.todaySales} sales today</div>
          </div>
          <div style={{ background: "#7A1F2B", borderRadius: 16, padding: 20 }}>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 8 }}>Total Revenue</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>{fmt(stats.totalRevenue)}</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4 }}>All time</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #E5E7EB" }}>
            <div style={{ color: "#888", fontSize: 13, marginBottom: 8 }}>Pending Orders</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111" }}>{stats.pendingOrders}</div>
            <div style={{ color: "#F59E0B", fontSize: 12, marginTop: 4 }}>Needs attention</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #E5E7EB" }}>
            <div style={{ color: "#888", fontSize: 13, marginBottom: 8 }}>In Stock</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#111" }}>{stats.inStock}</div>
            <div style={{ color: "#3B82F6", fontSize: 12, marginTop: 4 }}>{stats.openRepairs} repairs open</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #E5E7EB" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px", color: "#111" }}>Quick Actions</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "New Trade-in Quote", href: "/quote", icon: "📱" },
                { label: "Add to Inventory", href: "/portal/inventory", icon: "📦" },
                { label: "Check Market Prices", href: "/portal/pricing", icon: "💰" },
                { label: "View All Orders", href: "/portal/orders", icon: "📋" },
              ].map((a, i) => (
                <a key={i} href={a.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#F8F9FA", borderRadius: 10, textDecoration: "none", color: "#111", fontSize: 14, fontWeight: 500 }}>
                  <span style={{ fontSize: 18 }}>{a.icon}</span>
                  {a.label}
                </a>
              ))}
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #E5E7EB" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px", color: "#111" }}>Recent Orders</h3>
            <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 32 }}>
              No recent orders
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
