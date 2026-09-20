import React, { useState, useEffect, useMemo } from "react";

/* =================================================================
   REPAIR TICKETS
   The piece a repair shop actually runs on day-to-day: a device
   comes in broken, gets diagnosed, gets fixed with parts that cost
   money, and goes back out — with the customer able to check status
   without calling. None of the buy/sell tools built so far cover
   this; it's a separate workflow with its own lifecycle.
================================================================= */

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared) {
  if (!storageAvailable()) return null;
  try {
    const r = await window.storage.get(key, shared);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveJSON(key, value, shared) {
  if (!storageAvailable()) return false;
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch (e) {
    return false;
  }
}
const genId = () => "RPR-" + Math.floor(100000 + Math.random() * 900000);
const TICKETS_KEY = "repair_tickets";
const STAFF_KEY = "staff_on_shift"; // fallback only — real login (when deployed) overrides this, see getAuthedUser() below
function getAuthedUser() {
  try {
    return (typeof window !== "undefined" && window.shopAuth && typeof window.shopAuth.currentUser === "function")
      ? window.shopAuth.currentUser() : null;
  } catch (e) {
    return null;
  }
}
const PARTS_STOCK_KEY = "parts_stock";
const genPartId = () => "PART-" + Math.floor(10000 + Math.random() * 90000);

// Same notification queue the calculator writes to — low stock is exactly
// the kind of thing that should reach a real email/SMS provider once one's
// connected, not just a red border on a screen nobody's currently looking at.
async function queueNotification(entry) {
  if (!storageAvailable()) return false;
  try {
    const r = await loadJSON("notification_queue", true);
    const list = r || [];
    list.unshift({ id: "NTF-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), status: "pending", ...entry });
    await window.storage.set("notification_queue", JSON.stringify(list), true);
    return true;
  } catch (e) {
    return false;
  }
}

const REPAIR_TYPES = [
  { id: "screen", label: "Screen replacement", typicalPrice: 150 },
  { id: "battery", label: "Battery replacement", typicalPrice: 60 },
  { id: "charge_port", label: "Charging port repair", typicalPrice: 80 },
  { id: "back_glass", label: "Back glass replacement", typicalPrice: 90 },
  { id: "camera", label: "Camera repair", typicalPrice: 100 },
  { id: "speaker_mic", label: "Speaker / mic repair", typicalPrice: 55 },
  { id: "water_damage", label: "Water damage treatment", typicalPrice: 70 },
  { id: "software", label: "Software / data issue", typicalPrice: 40 },
  { id: "other", label: "Other", typicalPrice: 0 },
];

const STATUSES = ["dropped_off", "diagnosing", "awaiting_parts", "in_repair", "ready_for_pickup", "completed", "not_repairable"];
const STATUS_LABELS = {
  dropped_off: "Dropped off", diagnosing: "Diagnosing", awaiting_parts: "Awaiting parts",
  in_repair: "In repair", ready_for_pickup: "Ready for pickup", completed: "Completed & picked up",
  not_repairable: "Not repairable",
};
const NEXT_STATUS = {
  dropped_off: "diagnosing", diagnosing: "in_repair", awaiting_parts: "in_repair",
  in_repair: "ready_for_pickup", ready_for_pickup: "completed",
};

function fmt(n) { return `$${Math.round(n || 0).toLocaleString()}`; }

export default function RepairTickets() {
  const [tickets, setTickets] = useState(null);
  const [staffName, setStaffName] = useState("");
  const [authedUser, setAuthedUser] = useState(null);
  const [view, setView] = useState("queue"); // queue | intake | detail | track
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("open"); // open | all | completed
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResult, setTrackResult] = useState(undefined);
  const [partsStock, setPartsStock] = useState(null);

  useEffect(() => {
    (async () => {
      const [t, s, ps] = await Promise.all([loadJSON(TICKETS_KEY, true), loadJSON(STAFF_KEY, false), loadJSON(PARTS_STOCK_KEY, true)]);
      setTickets(t || []);
      const authed = getAuthedUser();
      if (authed) { setAuthedUser(authed); setStaffName(authed.username); }
      else if (s) setStaffName(s);
      setPartsStock(ps || []);
    })();
  }, []);

  async function persist(next) { await saveJSON(TICKETS_KEY, next, true); setTickets(next); }
  async function persistStaffName(name) { setStaffName(name); await saveJSON(STAFF_KEY, name, false); }
  async function persistStock(next) { await saveJSON(PARTS_STOCK_KEY, next, true); setPartsStock(next); }

  async function addStockItem(item) {
    await persistStock([{ id: genPartId(), qtyOnHand: 0, lowStockThreshold: 2, ...item }, ...(partsStock || [])]);
  }
  async function adjustStock(id, delta) {
    const item = (partsStock || []).find((p) => p.id === id);
    if (!item) return;
    const newQty = Math.max(0, item.qtyOnHand + delta);
    await persistStock((partsStock || []).map((p) => p.id === id ? { ...p, qtyOnHand: newQty } : p));
    // Only fire once when CROSSING into low stock, not every time it's
    // adjusted while already low — otherwise every single decrement once
    // you're at zero would spam another notification.
    if (delta < 0 && newQty <= item.lowStockThreshold && item.qtyOnHand > item.lowStockThreshold) {
      await queueNotification({
        type: "low_stock_part", channel: "email", recipientEmail: "",
        subject: `Low stock: ${item.name}`,
        message: `${item.name} is down to ${newQty} unit(s) (threshold: ${item.lowStockThreshold}). Consider reordering.`,
        relatedId: item.id,
      });
    }
  }

  // Adding a part to a ticket that's linked to stock decrements stock atomically
  // with the ticket update — this is the actual "deducts from stock when used" behavior.
  async function usePartFromStock(ticketId, stockItem) {
    if (stockItem.qtyOnHand <= 0) return false;
    const t = (tickets || []).find((x) => x.id === ticketId);
    const nextParts = [...(t.parts || []), { name: stockItem.name, cost: stockItem.costPerUnit, stockItemId: stockItem.id }];
    await updateTicket(ticketId, { parts: nextParts });
    await adjustStock(stockItem.id, -1);
    return true;
  }

  // Completing a repair is real revenue, exactly like a phone sale — so it
  // writes to the SAME shared "sales" collection everything else reads,
  // instead of only living in repair_tickets where CRM and the till never
  // look. This is the actual fix for repair income being invisible in
  // every financial report.
  async function completeRepairWithPayment(ticketId, payMethod, finalPrice) {
    const t = (tickets || []).find((x) => x.id === ticketId);
    if (!t) return;
    const completedAt = new Date().toISOString();
    await updateTicket(ticketId, { status: "completed", completedAt, finalPrice }, true);
    const sales = (await loadJSON("sales", true)) || [];
    const partsCost = (t.parts || []).reduce((s, p) => s + p.cost, 0);
    await saveJSON("sales", [{
      id: "SALE-" + Math.floor(100000 + Math.random() * 900000), itemId: ticketId,
      customerName: t.customer.name, customerEmail: t.customer.email || "",
      salePrice: finalPrice, costBasis: partsCost,
      brand: t.device.brand, model: t.device.model, storage: "repair",
      region: "AU", payMethod, soldAt: completedAt,
      staffHandled: staffName || "unattributed", channel: "repair",
    }, ...sales], true);
  }

  const open = tickets?.find((t) => t.id === openId);

  const filtered = (tickets || []).filter((t) => {
    if (filter === "open") return !["completed", "not_repairable"].includes(t.status);
    if (filter === "completed") return ["completed", "not_repairable"].includes(t.status);
    return true;
  });

  async function createTicket(data) {
    const ticket = {
      id: genId(), createdAt: new Date().toISOString(), status: "dropped_off",
      customer: { name: data.name, phone: data.phone, email: data.email },
      device: { brand: data.brand, model: data.model },
      issue: data.issue, repairTypeId: data.repairTypeId,
      quotedPrice: data.quotedPrice, deposit: data.deposit || 0,
      parts: [], finalPrice: null, warrantyDays: 90, warrantyOf: null,
      staffHandled: staffName || "unattributed", notifiedAt: null, completedAt: null,
      statusLog: [{ status: "dropped_off", at: new Date().toISOString(), by: staffName || "unattributed" }],
    };
    await persist([ticket, ...(tickets || [])]);
    setOpenId(ticket.id);
    setView("detail");
  }

  async function updateTicket(id, patch, logStatus) {
    const next = (tickets || []).map((t) => {
      if (t.id !== id) return t;
      const updated = { ...t, ...patch };
      if (logStatus) updated.statusLog = [...t.statusLog, { status: patch.status, at: new Date().toISOString(), by: staffName || "unattributed" }];
      return updated;
    });
    await persist(next);
  }

  async function reopenForWarranty(ticket) {
    const daysSince = (Date.now() - new Date(ticket.completedAt).getTime()) / (1000 * 60 * 60 * 24);
    const withinWarranty = daysSince <= ticket.warrantyDays;
    const newTicket = {
      id: genId(), createdAt: new Date().toISOString(), status: "diagnosing",
      customer: ticket.customer, device: ticket.device,
      issue: `Warranty claim on ${ticket.id}: ${ticket.issue}`, repairTypeId: ticket.repairTypeId,
      quotedPrice: withinWarranty ? 0 : ticket.quotedPrice, deposit: 0,
      parts: [], finalPrice: null, warrantyDays: 90, warrantyOf: ticket.id,
      staffHandled: staffName || "unattributed", notifiedAt: null, completedAt: null,
      statusLog: [{ status: "diagnosing", at: new Date().toISOString(), by: staffName || "unattributed" }],
    };
    await persist([newTicket, ...(tickets || [])]);
    return withinWarranty;
  }

  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";
  const colors = { ink, panel, panel2, paper, muted, brass, brassDim, red, green, line };

  if (tickets === null) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading repair queue…</div>;

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: '-0.01em', marginBottom: 4 }}>Repair Bench</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 14 }}>{(tickets || []).filter((t) => !["completed", "not_repairable"].includes(t.status)).length} jobs currently open.</div>

        {authedUser ? (
          <div style={{ fontSize: 12.5, color: green, marginBottom: 18, border: `1px solid ${line}`, borderRadius: 3, padding: "8px 12px" }}>
            ✓ Logged in as <strong>{authedUser.username}</strong> ({authedUser.role}) — attributed automatically, not editable here.
          </div>
        ) : (
          <input value={staffName} onChange={(e) => persistStaffName(e.target.value)} placeholder="Your name (attributed to jobs you handle)"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 12.5, marginBottom: 18, outline: "none", boxSizing: "border-box" }} />
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: `1px solid ${line}`, paddingBottom: 14 }}>
          {[{ id: "queue", label: "Queue" }, { id: "intake", label: "New job" }, { id: "stock", label: "Parts Stock" }, { id: "track", label: "Track a job" }].map((v) => (
            <button key={v.id} onClick={() => { setView(v.id); setOpenId(null); }}
              style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                border: `1px solid ${view === v.id ? brass : line}`, background: view === v.id ? brassDim : "transparent", color: view === v.id ? brass : paper }}>
              {v.label}
            </button>
          ))}
        </div>

        {view === "intake" && <IntakeForm colors={colors} repairTypes={REPAIR_TYPES} onCreate={createTicket} />}

        {view === "stock" && (
          <PartsStockTab colors={colors} stock={partsStock || []} onAdd={addStockItem} onAdjust={adjustStock} />
        )}

        {view === "queue" && !open && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {["open", "completed", "all"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12.5, cursor: "pointer",
                  border: `1px solid ${filter === f ? brass : line}`, background: filter === f ? brassDim : "transparent", color: filter === f ? brass : paper }}>
                  {f}
                </button>
              ))}
            </div>
            {filtered.length === 0 && <div style={{ color: muted, fontSize: 13 }}>Nothing here.</div>}
            {filtered.map((t) => (
              <button key={t.id} onClick={() => { setOpenId(t.id); setView("queue"); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 3,
                  border: `1px solid ${line}`, borderLeft: `3px solid ${t.status === "not_repairable" ? red : t.status === "completed" ? green : brass}`, background: panel, color: paper, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13 }}>{t.id}</span>
                  <span style={{ fontSize: 12, color: muted }}>{STATUS_LABELS[t.status]}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{t.device.brand} {t.device.model} — {REPAIR_TYPES.find((r) => r.id === t.repairTypeId)?.label}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{t.customer.name} · {fmt(t.finalPrice ?? t.quotedPrice)}{t.warrantyOf && " · warranty job"}</div>
              </button>
            ))}
          </>
        )}

        {open && (
          <TicketDetail colors={colors} ticket={open} repairTypes={REPAIR_TYPES} stock={partsStock || []}
            onUpdate={(patch, logStatus) => updateTicket(open.id, patch, logStatus)}
            onUseStock={(stockItem) => usePartFromStock(open.id, stockItem)}
            onReopenWarranty={() => reopenForWarranty(open)}
            onComplete={(payMethod, finalPrice) => completeRepairWithPayment(open.id, payMethod, finalPrice)}
            onBack={() => setOpenId(null)} />
        )}

        {view === "track" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} placeholder="Job number or phone number"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
              <button onClick={() => {
                  const q = trackQuery.trim().toLowerCase();
                  setTrackResult((tickets || []).find((t) => t.id.toLowerCase() === q || t.customer.phone === trackQuery.trim()) || null);
                }} style={{ padding: "10px 16px", borderRadius: 3, border: "none", background: brass, color: "#1a1408", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Find
              </button>
            </div>
            {trackResult === null && <div style={{ color: red, fontSize: 13 }}>No job found.</div>}
            {trackResult && (
              <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14 }}>
                <div style={{ fontSize: 14, marginBottom: 4 }}>{trackResult.id} — {STATUS_LABELS[trackResult.status]}</div>
                <div style={{ fontSize: 13, color: muted }}>{trackResult.device.brand} {trackResult.device.model} · {REPAIR_TYPES.find((r) => r.id === trackResult.repairTypeId)?.label}</div>
                <div style={{ fontSize: 13, color: brass, marginTop: 6 }}>{fmt(trackResult.finalPrice ?? trackResult.quotedPrice)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IntakeForm({ colors, repairTypes, onCreate }) {
  const { panel2, paper, muted, brass, brassDim, line } = colors;
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [brand, setBrand] = useState(""); const [model, setModel] = useState("");
  const [repairTypeId, setRepairTypeId] = useState(null); const [issue, setIssue] = useState("");
  const [quotedPrice, setQuotedPrice] = useState(""); const [deposit, setDeposit] = useState("");

  const selectedType = repairTypes.find((r) => r.id === repairTypeId);
  const ready = name.trim() && phone.trim() && brand.trim() && model.trim() && repairTypeId && quotedPrice;

  const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" };

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Customer</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" style={inputStyle} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" style={inputStyle} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" style={inputStyle} />

      <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>Device</div>
      <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand, e.g. Apple" style={inputStyle} />
      <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model, e.g. iPhone 13" style={inputStyle} />

      <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>What's wrong</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {repairTypes.map((r) => (
          <button key={r.id} onClick={() => { setRepairTypeId(r.id); setQuotedPrice(String(r.typicalPrice || "")); }}
            style={{ padding: "8px 12px", borderRadius: 3, fontSize: 12.5, cursor: "pointer",
              border: `1px solid ${repairTypeId === r.id ? brass : line}`, background: repairTypeId === r.id ? brassDim : "transparent", color: repairTypeId === r.id ? brass : paper }}>
            {r.label}
          </button>
        ))}
      </div>
      <textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Describe the issue in the customer's words"
        style={{ ...inputStyle, minHeight: 60 }} />

      <div style={{ display: "flex", gap: 10 }}>
        <input value={quotedPrice} onChange={(e) => setQuotedPrice(e.target.value)} placeholder="Quoted price" type="number" style={inputStyle} />
        <input value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Deposit taken (optional)" type="number" style={inputStyle} />
      </div>

      <button disabled={!ready} onClick={() => onCreate({ name, phone, email, brand, model, repairTypeId, issue, quotedPrice: parseFloat(quotedPrice), deposit: parseFloat(deposit) || 0 })}
        style={{ width: "100%", padding: "13px", borderRadius: 3, border: "none", marginTop: 6,
          background: ready ? brass : line, color: ready ? "#1a1408" : muted, fontSize: 14, fontWeight: 600, cursor: ready ? "pointer" : "default" }}>
        Create job ticket
      </button>
    </div>
  );
}

function TicketDetail({ colors, ticket, repairTypes, stock, onUpdate, onUseStock, onReopenWarranty, onComplete, onBack }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [partName, setPartName] = useState(""); const [partCost, setPartCost] = useState("");
  const [finalPrice, setFinalPrice] = useState(String(ticket.finalPrice ?? ticket.quotedPrice));
  const [warrantyResult, setWarrantyResult] = useState(null);
  const [stockNotice, setStockNotice] = useState("");
  const [completingPayMethod, setCompletingPayMethod] = useState(null); // null = not confirming yet

  const partsCost = (ticket.parts || []).reduce((s, p) => s + p.cost, 0);
  const margin = (ticket.finalPrice ?? ticket.quotedPrice) - partsCost;
  const canReopen = ticket.status === "completed" && !ticket.warrantyOf;
  const daysSinceCompleted = ticket.completedAt ? (Date.now() - new Date(ticket.completedAt).getTime()) / (1000 * 60 * 60 * 24) : null;
  const withinWarranty = daysSinceCompleted != null && daysSinceCompleted <= ticket.warrantyDays;

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>← Back to queue</button>

      <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 15, marginBottom: 4 }}>{ticket.id}{ticket.warrantyOf && <span style={{ color: brass, fontSize: 12 }}> · warranty claim on {ticket.warrantyOf}</span>}</div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>{ticket.device.brand} {ticket.device.model} · {repairTypes.find((r) => r.id === ticket.repairTypeId)?.label}</div>
        <div style={{ fontSize: 13 }}>{ticket.customer.name} · {ticket.customer.phone}</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>Issue: {ticket.issue || "—"}</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>Handled by {ticket.staffHandled}</div>
      </div>

      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Status</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => {
              if (s === "completed") { setCompletingPayMethod("cash"); return; } // needs a payment method first — see below
              onUpdate({ status: s, completedAt: ticket.completedAt }, true);
            }}
            style={{ padding: "7px 12px", borderRadius: 3, fontSize: 12, cursor: "pointer",
              border: `1px solid ${ticket.status === s ? brass : line}`, background: ticket.status === s ? brassDim : "transparent", color: ticket.status === s ? brass : paper }}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {completingPayMethod && ticket.status !== "completed" && (
        <div style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>How did the customer pay? (needed so this shows up correctly in the till and reports)</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["cash", "card"].map((m) => (
              <button key={m} onClick={() => setCompletingPayMethod(m)} style={{ flex: 1, padding: "9px", borderRadius: 3, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${completingPayMethod === m ? brass : line}`, background: completingPayMethod === m ? brassDim : "transparent", color: completingPayMethod === m ? brass : paper }}>
                {m === "cash" ? "Cash" : "Card"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setCompletingPayMethod(null)} style={{ padding: "9px 14px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: muted, fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => { onComplete(completingPayMethod, parseFloat(finalPrice) || ticket.quotedPrice); setCompletingPayMethod(null); }}
              style={{ flex: 1, padding: "9px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Confirm completion & payment
            </button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Parts used</div>
      <div style={{ border: `1px solid ${line}`, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
        {(ticket.parts || []).map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 13 }}>
            <span>{p.name}{p.stockItemId && <span style={{ color: green, fontSize: 11 }}> · from stock</span>}</span><span style={{ color: red }}>{fmt(p.cost)}</span>
          </div>
        ))}
        {(!ticket.parts || ticket.parts.length === 0) && <div style={{ padding: 12, fontSize: 12.5, color: muted }}>No parts logged yet.</div>}
      </div>

      {stock && stock.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Pick from stock (deducts automatically)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {stock.map((s) => (
              <button key={s.id} disabled={s.qtyOnHand <= 0}
                onClick={async () => {
                  const ok = await onUseStock(s);
                  setStockNotice(ok ? `Added ${s.name} — 1 deducted from stock.` : `${s.name} is out of stock.`);
                  setTimeout(() => setStockNotice(""), 2500);
                }}
                style={{ padding: "7px 12px", borderRadius: 3, fontSize: 12, cursor: s.qtyOnHand > 0 ? "pointer" : "default",
                  border: `1px solid ${s.qtyOnHand > 0 ? line : red}`, background: "transparent", color: s.qtyOnHand > 0 ? paper : red, opacity: s.qtyOnHand > 0 ? 1 : 0.6 }}>
                {s.name} · {fmt(s.costPerUnit)} · {s.qtyOnHand} in stock
              </button>
            ))}
          </div>
          {stockNotice && <div style={{ fontSize: 12, color: brass, marginBottom: 10 }}>{stockNotice}</div>}
        </>
      )}

      <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Or add a one-off part not tracked in stock</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Part name" style={{ flex: 2, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        <input value={partCost} onChange={(e) => setPartCost(e.target.value)} placeholder="Cost" type="number" style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        <button disabled={!partName.trim() || !partCost} onClick={() => {
            onUpdate({ parts: [...(ticket.parts || []), { name: partName.trim(), cost: parseFloat(partCost) }] });
            setPartName(""); setPartCost("");
          }} style={{ padding: "9px 14px", borderRadius: 3, border: "none", background: partName.trim() && partCost ? brass : line, color: partName.trim() && partCost ? "#1a1408" : muted, fontSize: 12.5, cursor: partName.trim() && partCost ? "pointer" : "default" }}>
          Add
        </button>
      </div>

      <div style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, color: muted }}>Final price charged</span>
          <input value={finalPrice} onChange={(e) => { setFinalPrice(e.target.value); onUpdate({ finalPrice: parseFloat(e.target.value) || 0 }); }} type="number"
            style={{ width: 90, padding: "4px 8px", borderRadius: 2, border: `1px solid ${line}`, background: panel2, color: brass, fontSize: 13, textAlign: "right" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: muted }}>
          <span>Parts cost</span><span>{fmt(partsCost)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
          <span>Margin (labour + markup)</span><span style={{ color: green }}>{fmt(margin)}</span>
        </div>
      </div>

      {canReopen && (
        <button onClick={async () => setWarrantyResult(await onReopenWarranty())}
          style={{ width: "100%", padding: "12px", borderRadius: 3, border: `1px solid ${brass}`, background: "transparent", color: brass, fontSize: 13.5, cursor: "pointer" }}>
          Reopen as warranty claim
        </button>
      )}
      {warrantyResult !== null && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: warrantyResult ? green : red }}>
          {warrantyResult ? "Within warranty window — new job created at no charge." : "Warranty period has expired — new job created at the standard quoted price."}
        </div>
      )}
    </div>
  );
}

function PartsStockTab({ colors, stock, onAdd, onAdjust }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [name, setName] = useState(""); const [sku, setSku] = useState("");
  const [qty, setQty] = useState(""); const [cost, setCost] = useState(""); const [threshold, setThreshold] = useState("2");

  const ready = name.trim() && qty !== "" && cost !== "";

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
        Stock used by repair jobs. Adding a part to a ticket from stock automatically deducts one unit here.
      </div>

      <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 13, marginBottom: 10 }}>Add stock item</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Part name, e.g. iPhone 13 screen assembly"
            style={{ flex: 2, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU (optional)"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Starting quantity" type="number"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
          <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost per unit" type="number"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
          <input value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Low-stock alert at" type="number"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        </div>
        <button disabled={!ready} onClick={() => {
            onAdd({ name: name.trim(), sku: sku.trim(), qtyOnHand: parseInt(qty), costPerUnit: parseFloat(cost), lowStockThreshold: parseInt(threshold) || 2 });
            setName(""); setSku(""); setQty(""); setCost(""); setThreshold("2");
          }} style={{ width: "100%", padding: "10px", borderRadius: 3, border: "none", background: ready ? brass : line, color: ready ? "#1a1408" : muted, fontSize: 13, fontWeight: 600, cursor: ready ? "pointer" : "default" }}>
          Add to stock
        </button>
      </div>

      <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Current stock ({stock.length} item{stock.length === 1 ? "" : "s"})</div>
      {stock.length === 0 && <div style={{ color: muted, fontSize: 13 }}>Nothing stocked yet.</div>}
      {stock.map((s) => {
        const low = s.qtyOnHand <= s.lowStockThreshold;
        return (
          <div key={s.id} style={{ border: `1px solid ${low ? red : line}`, borderRadius: 3, padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13 }}>{s.name}{s.sku && <span style={{ color: muted, fontSize: 11 }}> · {s.sku}</span>}</div>
              <div style={{ fontSize: 12, color: low ? red : muted, marginTop: 2 }}>
                {s.qtyOnHand} on hand{low && " · low stock"} · {fmt(s.costPerUnit)} each
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onAdjust(s.id, -1)} disabled={s.qtyOnHand <= 0}
                style={{ width: 28, height: 28, borderRadius: 2, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>−</button>
              <button onClick={() => onAdjust(s.id, 1)}
                style={{ width: 28, height: 28, borderRadius: 2, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>+</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

