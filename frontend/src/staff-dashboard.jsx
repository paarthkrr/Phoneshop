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
async function saveJSON(key, value, shared) {
  if (!storageAvailable()) return false;
  try { await window.storage.set(key, JSON.stringify(value), shared); return true; }
  catch (e) { return false; }
}

const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;

const NAV = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "orders", label: "Orders", icon: "📋" },
  { id: "repairs", label: "Repairs", icon: "🔧" },
  { id: "pricing", label: "Pricing", icon: "💰" },
  { id: "pos", label: "POS", icon: "🛒" },
  { id: "till", label: "Till", icon: "💵" },
  { id: "crm", label: "CRM", icon: "👥" },
  { id: "inventory", label: "Inventory", icon: "📦" },
];

export default function StaffDashboard() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

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
    return { todayRevenue, todaySales: todaySales.length, pendingOrders, inStock, openRepairs, orders, tickets };
  }, [data]);

  async function acceptPrice(orderId) {
    if (!data) return;
    const updated = data.orders.map(o => o.id === orderId ? { ...o, status: "approved_paid", paidAt: new Date().toISOString() } : o);
    await saveJSON("orders", updated, true);
    setData({ ...data, orders: updated });
    setSelectedOrder(null);
    alert("Price accepted! Order marked as paid.");
  }

  async function updateOrderStatus(orderId, status) {
    if (!data) return;
    const updated = data.orders.map(o => o.id === orderId ? { ...o, status, updatedAt: new Date().toISOString() } : o);
    await saveJSON("orders", updated, true);
    setData({ ...data, orders: updated });
  }

  if (!stats) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <aside style={{ width: 200, background: "#fff", borderRight: "1px solid #E5E7EB", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, background: "#7A1F2B", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>R</div>
          <span style={{ fontWeight: 700 }}>Recellr</span>
        </div>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "none", borderRadius: 10, marginBottom: 4, cursor: "pointer", background: tab === n.id ? "#7A1F2B" : "transparent", color: tab === n.id ? "#fff" : "#374151", fontSize: 14, fontWeight: 500, textAlign: "left" }}>
            <span>{n.icon}</span> {n.label}
          </button>
        ))}
      </aside>
      <main style={{ flex: 1, padding: 24 }}>
        {tab === "overview" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>Good morning</h1>
            <p style={{ color: "#6B7280", margin: "0 0 24px" }}>Here's what's happening today.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
              <StatCard label="Today's Revenue" value={fmt(stats.todayRevenue)} sub={`${stats.todaySales} sales`} />
              <StatCard label="Pending Orders" value={stats.pendingOrders.length} sub="Needs attention" color="#F59E0B" />
              <StatCard label="In Stock" value={stats.inStock} sub="Devices" />
              <StatCard label="Open Repairs" value={stats.openRepairs.length} sub="Active jobs" />
            </div>
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #E5E7EB" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Quick Actions</h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <ActionBtn label="New Quote" onClick={() => window.location.href = "/quote"} />
                <ActionBtn label="Check Prices" onClick={() => window.location.href = "/portal/pricing"} />
                <ActionBtn label="Add Inventory" onClick={() => window.location.href = "/portal/pos"} />
                <ActionBtn label="New Repair" onClick={() => window.location.href = "/portal/repairs"} />
              </div>
            </div>
          </>
        )}
        {tab === "orders" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 16px" }}>Orders</h1>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden" }}>
              {stats.orders.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>No orders</div> :
                stats.orders.slice(0, 20).map(o => (
                  <div key={o.id} style={{ padding: 16, borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{o.device?.brand} {o.device?.model}</div>
                      <div style={{ fontSize: 12, color: "#6B7280" }}>{o.customer?.name} · {o.id}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, background: "#F3F4F6" }}>{o.status?.replace(/_/g, " ")}</span>
                      {o.status === "received_inspecting" && (
                        <button onClick={() => acceptPrice(o.id)} style={{ padding: "6px 12px", background: "#22C55E", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Accept Price</button>
                      )}
                      <select value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 12 }}>
                        <option value="awaiting_shipment">Awaiting</option>
                        <option value="received_inspecting">Inspecting</option>
                        <option value="approved_paid">Paid</option>
                        <option value="returned">Returned</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
        {tab === "repairs" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 16px" }}>Repairs</h1>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden" }}>
              {stats.tickets.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>No repairs</div> :
                stats.tickets.slice(0, 20).map(t => (
                  <div key={t.id} style={{ padding: 16, borderBottom: "1px solid #E5E7EB" }}>
                    <div style={{ fontWeight: 600 }}>{t.device?.brand} {t.device?.model}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{t.status} · {t.id}</div>
                  </div>
                ))}
            </div>
          </>
        )}
        {tab === "pricing" && <Redirect href="/portal/pricing" label="Open Pricing Console" />}
        {tab === "pos" && <Redirect href="/portal/pos" label="Open POS" />}
        {tab === "till" && <Redirect href="/portal/till" label="Open Till" />}
        {tab === "crm" && <Redirect href="/portal/crm" label="Open CRM" />}
        {tab === "inventory" && <Redirect href="/portal/pos" label="Open Inventory" />}
      </main>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #E5E7EB" }}>
      <div style={{ color: "#6B7280", fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: color || "#22C55E", fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ActionBtn({ label, onClick }) {
  return <button onClick={onClick} style={{ padding: "12px 20px", background: "#7A1F2B", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 500 }}>{label}</button>;
}

function Redirect({ href, label }) {
  return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <a href={href} style={{ padding: "16px 32px", background: "#7A1F2B", color: "#fff", borderRadius: 10, textDecoration: "none", fontWeight: 500 }}>{label} →</a>
    </div>
  );
}
