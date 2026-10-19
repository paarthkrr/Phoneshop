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
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    (async () => {
      const [orders, inventory, sales, tickets] = await Promise.all([
        loadJSON("orders", true), loadJSON("inventory", true),
        loadJSON("sales", true), loadJSON("repair_tickets", true),
      ]);
      setData({ orders, inventory, sales, tickets });
    })();
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
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
    return { todayRevenue, todaySales: todaySales.length, pendingOrders, inStock, openRepairs };
  }, [data]);

  if (!stats) return (
    <div style={{ background: "#0F0F0F", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 40, height: 40, border: "3px solid #333", borderTopColor: "#7A1F2B", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const cards = [
    { label: "Today's Revenue", value: fmt(stats.todayRevenue), icon: "💰", color: "#22C55E" },
    { label: "Sales Today", value: stats.todaySales, icon: "📱", color: "#3B82F6" },
    { label: "Pending Orders", value: stats.pendingOrders, icon: "📦", color: "#F59E0B" },
    { label: "In Stock", value: stats.inStock, icon: "🏪", color: "#8B5CF6" },
    { label: "Open Repairs", value: stats.openRepairs, icon: "🔧", color: "#EF4444" },
  ];

  return (
    <div style={{ background: "linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 100%)", minHeight: "100vh", padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, margin: 0 }}>Dashboard</h1>
            <p style={{ color: "#888", fontSize: 14, margin: "4px 0 0" }}>{time.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "8px 16px", color: "#fff", fontSize: 14 }}>
            {time.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
          {cards.map((c, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, transition: "transform 0.2s, box-shadow 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 20px 40px rgba(0,0,0,0.3)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>{c.label}</div>
                  <div style={{ color: "#fff", fontSize: 28, fontWeight: 700 }}>{c.value}</div>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${c.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{c.icon}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Quick Actions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {[
                { label: "New Trade-in", href: "/quote", color: "#7A1F2B" },
                { label: "Add Inventory", href: "/portal/inventory", color: "#2150C8" },
                { label: "Check Prices", href: "/portal/pricing", color: "#22C55E" },
                { label: "View Orders", href: "/portal/orders", color: "#F59E0B" },
              ].map((a, i) => (
                <a key={i} href={a.href} style={{ display: "block", background: `${a.color}15`, border: `1px solid ${a.color}30`, borderRadius: 12, padding: 16, color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 500, textAlign: "center", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${a.color}25`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${a.color}15`; }}>
                  {a.label}
                </a>
              ))}
            </div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Recent Activity</h3>
            <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 20 }}>
              Activity feed coming soon
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
