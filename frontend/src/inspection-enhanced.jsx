import React, { useState, useEffect, useMemo } from "react";
import PortalLayout, { PortalCard } from "./portal-layout.jsx";

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

const STATUS_COLORS = {
  awaiting_shipment: "#F59E0B", received_inspecting: "#3B82F6", revised_pending_customer: "#8B5CF6",
  approved_paid: "#22C55E", returned: "#6B7280", cancelled: "#EF4444"
};

export default function InspectionEnhanced() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ brand: "", model: "", imei: "", customer: "", notes: "" });

  useEffect(() => {
    loadJSON("orders", true).then(setOrders);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter(o => o.status === filter);
  }, [orders, filter]);

  async function deleteOrder(id) {
    if (!confirm("Delete this order permanently?")) return;
    const updated = orders.filter(o => o.id !== id);
    await saveJSON("orders", updated, true);
    setOrders(updated);
    if (selected?.id === id) setSelected(null);
  }

  async function updateStatus(id, status) {
    const updated = orders.map(o => o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o);
    await saveJSON("orders", updated, true);
    setOrders(updated);
    if (selected?.id === id) setSelected({ ...selected, status });
  }

  async function addManualInspection() {
    if (!manualForm.brand || !manualForm.model) return alert("Brand and model required");
    const newOrder = {
      id: `MAN-${Date.now().toString(36)}`,
      status: "received_inspecting",
      createdAt: new Date().toISOString(),
      device: { brand: manualForm.brand, model: manualForm.model, imei: manualForm.imei },
      customer: { name: manualForm.customer || "Walk-in", email: "" },
      notes: manualForm.notes,
      quotedTotal: 0,
      manual: true
    };
    const updated = [newOrder, ...orders];
    await saveJSON("orders", updated, true);
    setOrders(updated);
    setShowManual(false);
    setManualForm({ brand: "", model: "", imei: "", customer: "", notes: "" });
  }

  return (
    <PortalLayout title="Inspection Console" active="inspect">
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB" }}>
          <option value="all">All Orders</option>
          <option value="awaiting_shipment">Awaiting Shipment</option>
          <option value="received_inspecting">Inspecting</option>
          <option value="approved_paid">Completed</option>
        </select>
        <button onClick={() => setShowManual(true)} style={{ padding: "8px 16px", background: "#7A1F2B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 500 }}>
          + Manual Inspection
        </button>
      </div>

      {showManual && (
        <PortalCard title="Manual Inspection" style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input placeholder="Brand (e.g. Apple)" value={manualForm.brand} onChange={e => setManualForm({...manualForm, brand: e.target.value})} style={{ padding: 10, borderRadius: 8, border: "1px solid #E5E7EB" }} />
            <input placeholder="Model (e.g. iPhone 16 Pro)" value={manualForm.model} onChange={e => setManualForm({...manualForm, model: e.target.value})} style={{ padding: 10, borderRadius: 8, border: "1px solid #E5E7EB" }} />
            <input placeholder="IMEI (optional)" value={manualForm.imei} onChange={e => setManualForm({...manualForm, imei: e.target.value})} style={{ padding: 10, borderRadius: 8, border: "1px solid #E5E7EB" }} />
            <input placeholder="Customer name" value={manualForm.customer} onChange={e => setManualForm({...manualForm, customer: e.target.value})} style={{ padding: 10, borderRadius: 8, border: "1px solid #E5E7EB" }} />
          </div>
          <textarea placeholder="Notes" value={manualForm.notes} onChange={e => setManualForm({...manualForm, notes: e.target.value})} style={{ width: "100%", marginTop: 12, padding: 10, borderRadius: 8, border: "1px solid #E5E7EB", minHeight: 60 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={addManualInspection} style={{ padding: "10px 20px", background: "#22C55E", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Create</button>
            <button onClick={() => setShowManual(false)} style={{ padding: "10px 20px", background: "#E5E7EB", border: "none", borderRadius: 8, cursor: "pointer" }}>Cancel</button>
          </div>
        </PortalCard>
      )}

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 16 }}>
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>No orders found</div>
          ) : filtered.map(o => (
            <div key={o.id} onClick={() => setSelected(o)} style={{ padding: 16, borderBottom: "1px solid #E5E7EB", cursor: "pointer", background: selected?.id === o.id ? "#FEF2F2" : "transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{o.device?.brand} {o.device?.model}</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{o.customer?.name || "Unknown"} · {o.id}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: STATUS_COLORS[o.status] + "20", color: STATUS_COLORS[o.status] }}>{o.status?.replace(/_/g, " ")}</span>
                  <button onClick={e => { e.stopPropagation(); deleteOrder(o.id); }} style={{ padding: "4px 8px", background: "#FEE2E2", color: "#EF4444", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <PortalCard title="Order Details">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{selected.device?.brand} {selected.device?.model}</div>
              <div style={{ color: "#6B7280", fontSize: 13 }}>IMEI: {selected.device?.imei || "N/A"}</div>
              <div style={{ color: "#6B7280", fontSize: 13 }}>Customer: {selected.customer?.name || "Unknown"}</div>
              <div style={{ color: "#6B7280", fontSize: 13 }}>Quoted: ${selected.quotedTotal || 0}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#6B7280" }}>Update Status</label>
              <select value={selected.status} onChange={e => updateStatus(selected.id, e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #E5E7EB", marginTop: 4 }}>
                <option value="awaiting_shipment">Awaiting Shipment</option>
                <option value="received_inspecting">Inspecting</option>
                <option value="revised_pending_customer">Revised - Pending</option>
                <option value="approved_paid">Approved & Paid</option>
                <option value="returned">Returned</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <a href={`/portal/crm?email=${selected.customer?.email}`} style={{ display: "block", textAlign: "center", padding: 10, background: "#F3F4F6", borderRadius: 8, textDecoration: "none", color: "#374151", fontSize: 14 }}>
              View Customer Profile →
            </a>
          </PortalCard>
        )}
      </div>
    </PortalLayout>
  );
}
