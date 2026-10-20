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
          <div style={{ padding: 24, background: "#F8FAFC", minHeight: "100vh" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#0F172A" }}>Welcome back</h1>
                <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: 14 }}>Here's what's happening with your store today.</p>
              </div>
              <div style={{ fontSize: 13, color: "#64748B" }}>{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            </div>
            {stats ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                  <ModernStat icon="💰" label="Today's Revenue" value={fmt(stats.todayRevenue)} change="+12%" color="#10B981" bg="#ECFDF5" />
                  <ModernStat icon="📦" label="Pending Orders" value={stats.pendingOrders} change="Needs action" color="#F59E0B" bg="#FFFBEB" />
                  <ModernStat icon="📱" label="In Stock" value={stats.inStock} change="Devices" color="#3B82F6" bg="#EFF6FF" />
                  <ModernStat icon="🔧" label="Open Repairs" value={stats.openRepairs} change="Active jobs" color="#8B5CF6" bg="#F5F3FF" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
                  <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Quick Actions</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      <QuickAction icon="🔍" label="Inspect Device" onClick={() => setTab("inspect")} />
                      <QuickAction icon="🛒" label="New Sale" onClick={() => setTab("pos")} />
                      <QuickAction icon="🔧" label="New Repair" onClick={() => setTab("repairs")} />
                      <QuickAction icon="💰" label="Check Price" onClick={() => setTab("pricing")} />
                      <QuickAction icon="👥" label="Customers" onClick={() => setTab("crm")} />
                      <QuickAction icon="🔓" label="Check IMEI" onClick={() => setTab("unlock")} />
                    </div>
                  </div>
                  <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Today's Summary</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <SummaryRow label="Sales" value={stats.todaySales} />
                      <SummaryRow label="Revenue" value={fmt(stats.todayRevenue)} />
                      <SummaryRow label="Pending" value={stats.pendingOrders} />
                      <SummaryRow label="Stock" value={stats.inStock} />
                    </div>
                  </div>
                </div>
              </>
            ) : <div style={{ padding: 40, textAlign: "center", color: "#64748B" }}>Loading...</div>}
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

function ModernStat({ icon, label, value, change, color, bg }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid #E2E8F0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div>
        <span style={{ fontSize: 12, color: color, fontWeight: 500 }}>{change}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 16, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, cursor: "pointer", transition: "all 0.2s" }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: "#334155" }}>{label}</span>
    </button>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}>
      <span style={{ color: "#64748B", fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#0F172A" }}>{value}</span>
    </div>
  );
}
