import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { sydneyDay, sydneyToday } from "./sydney-time.js";

const Pricing = lazy(() => import("./admin-pricing-console.jsx"));
const Inspect = lazy(() => import("./staff-inspection-console.jsx"));
const POS = lazy(() => import("./pos-inventory.jsx"));
const Repairs = lazy(() => import("./repair-tickets.jsx"));
const Till = lazy(() => import("./till-reconciliation.jsx"));
const CRM = lazy(() => import("./crm-enhanced.jsx"));
const Team = lazy(() => import("./team.jsx"));
const Activity = lazy(() => import("./activity.jsx"));
const Unlock = lazy(() => import("./unlock-checker.jsx"));
const Products = lazy(() => import("./products.jsx"));

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared) {
  if (!storageAvailable()) return [];
  try { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : []; }
  catch (e) { return []; }
}

const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;

const TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "pricing", label: "Pricing", icon: "💰" },
  { id: "inspect", label: "Inspect", icon: "🔍" },
  { id: "pos", label: "POS", icon: "🛒" },
  { id: "repairs", label: "Repairs", icon: "🔧" },
  { id: "till", label: "Till", icon: "💵" },
  { id: "crm", label: "CRM", icon: "👥" },
  { id: "team", label: "Team", icon: "👤" },
  { id: "activity", label: "Activity", icon: "📋" },
  { id: "unlock", label: "Unlock", icon: "🔓" },
  { id: "products", label: "Products", icon: "📱" },
];

export default function UnifiedDashboard() {
  const [tab, setTab] = useState("overview");
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
    const pendingOrders = orders.filter(o => ["received_inspecting", "awaiting_shipment"].includes(o.status));
    const inStock = inventory.filter(i => i.status === "in_stock").length;
    const openRepairs = tickets.filter(t => !["completed", "not_repairable"].includes(t.status));
    return { todayRevenue, todaySales: todaySales.length, pendingOrders: pendingOrders.length, inStock, openRepairs: openRepairs.length };
  }, [data]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <aside style={{ width: 200, background: "linear-gradient(180deg, #1F2937 0%, #111827 100%)", padding: 16, flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, padding: "0 4px" }}>
          <div style={{ width: 36, height: 36, background: "#7A1F2B", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16 }}>R</div>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>Recellr</span>
        </div>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ 
            width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", 
            border: "none", borderRadius: 8, marginBottom: 2, cursor: "pointer", textAlign: "left",
            background: tab === t.id ? "#7A1F2B" : "transparent", 
            color: tab === t.id ? "#fff" : "#9CA3AF", 
            fontSize: 13, fontWeight: 500 
          }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </aside>
      <main style={{ flex: 1, overflow: "auto", background: "#F3F4F6" }}>
        {tab === "overview" && (
          <div style={{ padding: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>Good morning</h1>
            <p style={{ color: "#6B7280", margin: "0 0 24px" }}>Here's what's happening today.</p>
            {stats ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                <StatCard label="Today's Revenue" value={fmt(stats.todayRevenue)} sub={`${stats.todaySales} sales`} />
                <StatCard label="Pending Orders" value={stats.pendingOrders} sub="Needs attention" color="#F59E0B" />
                <StatCard label="In Stock" value={stats.inStock} sub="Devices" />
                <StatCard label="Open Repairs" value={stats.openRepairs} sub="Active jobs" />
              </div>
            ) : <div>Loading...</div>}
          </div>
        )}
        <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading...</div>}>
          {tab !== "overview" && (
            <div style={{ padding: 20 }}>
              <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
                {tab === "pricing" && <Pricing />}
                {tab === "inspect" && <Inspect />}
                {tab === "pos" && <POS />}
                {tab === "repairs" && <Repairs />}
                {tab === "till" && <Till />}
                {tab === "crm" && <CRM />}
                {tab === "team" && <Team />}
                {tab === "activity" && <Activity />}
                {tab === "unlock" && <Unlock />}
                {tab === "products" && <Products />}
              </div>
            </div>
          )}
        </Suspense>
      </main>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #E5E7EB" }}>
      <div style={{ color: "#6B7280", fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: color || "#22C55E", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
