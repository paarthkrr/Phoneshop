import React, { useState, useEffect, useMemo } from "react";

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

export default function CRMEnhanced() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    (async () => {
      const [orders, tickets, inspections] = await Promise.all([
        loadJSON("orders", true), loadJSON("repair_tickets", true), loadJSON("inspections", true),
      ]);
      setData({ orders, tickets, inspections });
    })();
  }, []);

  const customers = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.orders.forEach(o => {
      const key = o.customer?.phone || o.customer?.email || o.id;
      if (!map.has(key)) map.set(key, { ...o.customer, orders: [], repairs: [], inspections: [] });
      map.get(key).orders.push(o);
    });
    data.tickets.forEach(t => {
      const key = t.customer?.phone || t.customer?.email || t.id;
      if (!map.has(key)) map.set(key, { ...t.customer, orders: [], repairs: [], inspections: [] });
      map.get(key).repairs.push(t);
    });
    return [...map.values()];
  }, [data]);

  const filtered = customers.filter(c => 
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  async function addNote(customerId, orderId) {
    if (!note.trim() || !data) return;
    const updated = data.orders.map(o => o.id === orderId ? { ...o, notes: [...(o.notes || []), { text: note, at: new Date().toISOString() }] } : o);
    await saveJSON("orders", updated, true);
    setData({ ...data, orders: updated });
    setNote("");
  }

  async function saveOrder(order) {
    if (!data) return;
    const updated = data.orders.map(o => o.id === order.id ? order : o);
    await saveJSON("orders", updated, true);
    setData({ ...data, orders: updated });
    setEditing(null);
  }

  if (!data) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ padding: 24, fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 16px" }}>Customer CRM</h1>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." style={{ width: "100%", maxWidth: 400, padding: "12px 16px", borderRadius: 10, border: "1px solid #E5E7EB", marginBottom: 16 }} />
      
      <div style={{ display: "grid", gridTemplateColumns: selected ? "300px 1fr" : "1fr", gap: 16 }}>
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", maxHeight: "70vh", overflow: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
              {customers.length === 0
                ? "No customers yet. They'll appear here automatically once you take orders or log repairs."
                : "No customer matches that search."}
            </div>
          )}
          {filtered.map((c, i) => (
            <div key={i} onClick={() => setSelected(c)} style={{ padding: 16, borderBottom: "1px solid #E5E7EB", cursor: "pointer", background: selected === c ? "#F3F4F6" : "transparent" }}>
              <div style={{ fontWeight: 600 }}>{c.name || "Unknown"}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{c.phone} · {c.orders.length} orders · {c.repairs.length} repairs</div>
            </div>
          ))}
        </div>
        
        {selected && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
            <h2 style={{ margin: "0 0 16px" }}>{selected.name}</h2>
            <p style={{ color: "#6B7280", margin: "0 0 16px" }}>{selected.phone} · {selected.email}</p>
            
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Orders ({selected.orders.length})</h3>
            {selected.orders.map(o => (
              <div key={o.id} style={{ padding: 12, background: "#F9FAFB", borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{o.device?.brand} {o.device?.model}</strong>
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#6B7280" }}>{o.status}</span>
                  </div>
                  <button onClick={() => setEditing(o)} style={{ padding: "4px 8px", fontSize: 11, border: "1px solid #E5E7EB", borderRadius: 4, cursor: "pointer" }}>Edit</button>
                </div>
                {o.notes?.map((n, i) => <div key={i} style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>📝 {n.text}</div>)}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add note..." style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 12 }} />
                  <button onClick={() => addNote(selected.phone, o.id)} style={{ padding: "6px 12px", background: "#7A1F2B", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Add</button>
                </div>
              </div>
            ))}
            
            <h3 style={{ fontSize: 16, margin: "16px 0 12px" }}>Repairs ({selected.repairs.length})</h3>
            {selected.repairs.map(t => (
              <div key={t.id} style={{ padding: 12, background: "#F9FAFB", borderRadius: 8, marginBottom: 8 }}>
                <strong>{t.device?.brand} {t.device?.model}</strong>
                <span style={{ marginLeft: 8, fontSize: 12, color: "#6B7280" }}>{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", padding: 24, borderRadius: 16, width: 400, maxWidth: "90%" }}>
            <h3 style={{ margin: "0 0 16px" }}>Edit Order</h3>
            <label style={{ fontSize: 12, color: "#6B7280" }}>Status</label>
            <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}>
              <option value="awaiting_shipment">Awaiting Shipment</option>
              <option value="received_inspecting">Inspecting</option>
              <option value="approved_paid">Approved/Paid</option>
              <option value="returned">Returned</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <label style={{ fontSize: 12, color: "#6B7280" }}>Quote Amount</label>
            <input type="number" value={editing.quote || 0} onChange={e => setEditing({ ...editing, quote: Number(e.target.value) })} style={{ width: "100%", padding: 10, marginBottom: 16, borderRadius: 8, border: "1px solid #E5E7EB" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => saveOrder(editing)} style={{ flex: 1, padding: 12, background: "#7A1F2B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Save</button>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: 12, background: "#E5E7EB", border: "none", borderRadius: 8, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
