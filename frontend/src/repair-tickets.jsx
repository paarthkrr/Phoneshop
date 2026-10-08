import React, { useState, useEffect, useMemo } from "react";
import { hasArea } from "./roles.js";
import { partsCostOf } from "./pnl.js";
import { ScanButton } from "./barcode-scanner.jsx";
import { SYMPTOMS, PARTS, diagnose, stockFor, LIKELIHOOD_LABEL } from "./diagnosis-guide.js";

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
  const [repairRequests, setRepairRequests] = useState([]);
  const [team, setTeam] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [stockPrefill, setStockPrefill] = useState("");

  useEffect(() => {
    (async () => {
      const [t, s, ps, rr, inv] = await Promise.all([loadJSON(TICKETS_KEY, true), loadJSON(STAFF_KEY, false), loadJSON(PARTS_STOCK_KEY, true), loadJSON("repair_requests", true), loadJSON("inventory", true)]);
      setInventory(Array.isArray(inv) ? inv : []);
      setTickets(t || []);
      const authed = getAuthedUser();
      if (authed) { setAuthedUser(authed); setStaffName(authed.username); }
      else if (s) setStaffName(s);
      setPartsStock(ps || []);
      setRepairRequests(rr || []);
      if (authed && window.SHOP_API_BASE_URL) {
        try {
          const r = await fetch(`${window.SHOP_API_BASE_URL}/auth/team`, { headers: { Authorization: `Bearer ${window.shopAuth.authToken()}` } });
          if (r.ok) setTeam((await r.json()).team || []);
        } catch (e) { /* assigning just shows free text then */ }
      }
    })();
  }, []);

  async function persist(next) { await saveJSON(TICKETS_KEY, next, true); setTickets(next); }
  async function persistStaffName(name) { setStaffName(name); await saveJSON(STAFF_KEY, name, false); }
  async function persistStock(next) { await saveJSON(PARTS_STOCK_KEY, next, true); setPartsStock(next); }
  async function markRequestContacted(id) {
    const next = repairRequests.map((r) => r.id === id ? { ...r, status: "contacted" } : r);
    await saveJSON("repair_requests", next, true);
    setRepairRequests(next);
  }

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
  // Every part records who fitted it, when, and whether its barcode was
  // scanned (the Parts usage tab shows who scans and who doesn't).
  async function usePartFromStock(ticketId, stockItem, meta = {}) {
    if (stockItem.qtyOnHand <= 0) return false;
    const t = (tickets || []).find((x) => x.id === ticketId);
    const nextParts = [...(t.parts || []), { name: stockItem.name, cost: stockItem.costPerUnit, stockItemId: stockItem.id,
      scanned: !!meta.scanned, barcode: meta.barcode || "", by: staffName || "unattributed", at: new Date().toISOString() }];
    const needed = (t.partsNeeded || []).map((n) => (!n.done && stockFor(n.partId, [stockItem], t.device.model).length ? { ...n, done: true } : n));
    await updateTicket(ticketId, needed.length ? { parts: nextParts, partsNeeded: needed } : { parts: nextParts });
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
    const partsCost = partsCostOf(t), labourCost = Number(t.techPay) || 0;
    await saveJSON("sales", [{
      id: "SALE-" + Math.floor(100000 + Math.random() * 900000), itemId: ticketId,
      customerName: t.customer.name, customerEmail: t.customer.email || "",
      salePrice: finalPrice, costBasis: partsCost + labourCost, partsCost, labourCost, technician: t.assignedTo || "",
      brand: t.device.brand, model: t.device.model, storage: "repair",
      region: "AU", payMethod, soldAt: completedAt,
      staffHandled: staffName || "unattributed", channel: "repair",
    }, ...sales], true);
  }

  // A shop job (our own phone being fixed up to sell) has no customer and no
  // payment. Finishing it adds the parts and labour to that phone's cost in
  // stock, so its profit on sale is right. Only staff with stock access can
  // change stock; for anyone else the cost waits on the ticket.
  async function completeShopJob(ticketId) {
    const t = (tickets || []).find((x) => x.id === ticketId);
    if (!t) return "";
    const completedAt = new Date().toISOString();
    const extra = partsCostOf(t) + (Number(t.techPay) || 0);
    let costAdded = false;
    if (t.inventoryItemId && !t.refurbCostAdded && hasArea("register") && extra > 0) {
      const inv = (await loadJSON("inventory", true)) || [];
      if (inv.some((i) => i.id === t.inventoryItemId)) {
        costAdded = await saveJSON("inventory", inv.map((i) => i.id === t.inventoryItemId
          ? { ...i, costBasis: (Number(i.costBasis) || 0) + extra, refurbJobs: [...(i.refurbJobs || []), { jobId: t.id, cost: extra, at: completedAt }] } : i), true);
      }
    }
    await updateTicket(ticketId, { status: "completed", completedAt, ...(costAdded ? { refurbCostAdded: true } : {}) }, true);
    if (costAdded) return `Done. ${fmt(extra)} parts and labour added to this phone's cost in stock.`;
    if (extra > 0 && t.inventoryItemId) return `Done. Ask the counter to add ${fmt(extra)} repair cost to this phone in stock.`;
    return "Done. The phone is ready to go back on sale.";
  }

  const open = tickets?.find((t) => t.id === openId);

  const filtered = (tickets || []).filter((t) => {
    if (filter === "mine") return t.assignedTo === staffName && !["completed", "not_repairable"].includes(t.status);
    if (filter === "open") return !["completed", "not_repairable"].includes(t.status);
    if (filter === "completed") return ["completed", "not_repairable"].includes(t.status);
    if (filter === "shop") return t.jobType === "shop" && !["completed", "not_repairable"].includes(t.status);
    return true;
  });

  async function createTicket(data) {
    const now = new Date().toISOString();
    const shop = data.jobType === "shop";
    const ticket = {
      id: genId(), createdAt: now, status: "dropped_off",
      jobType: shop ? "shop" : "customer",
      customer: shop ? { name: "Shop stock", phone: "", email: "" } : { name: data.name, phone: data.phone, email: data.email },
      device: { brand: data.brand, model: data.model, imei: data.imei || "", storage: data.storage || "", colour: data.colour || "", condition: data.condition || "" },
      inventoryItemId: shop ? data.inventoryItemId || null : null,
      symptoms: data.symptoms || [], partsNeeded: [], priority: data.priority || "normal", dueAt: data.dueAt || null,
      assignedTo: data.assignedTo || null, assignedAt: data.assignedTo ? now : null,
      issue: data.issue, repairTypeId: data.repairTypeId,
      quotedPrice: shop ? 0 : data.quotedPrice, deposit: shop ? 0 : data.deposit || 0,
      parts: [], finalPrice: null, warrantyDays: 90, warrantyOf: null,
      staffHandled: staffName || "unattributed", notifiedAt: null, completedAt: null,
      statusLog: [{ status: "dropped_off", at: now, by: staffName || "unattributed" }],
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
    // A completed job's sale record follows later changes to price, parts or
    // technician pay, so every report shows the same profit.
    const t = next.find((x) => x.id === id);
    if (t && t.status === "completed" && !logStatus && ["finalPrice", "parts", "techPay", "assignedTo"].some((f) => f in patch)) {
      const sales = (await loadJSON("sales", true)) || [];
      const partsCost = partsCostOf(t), labourCost = Number(t.techPay) || 0;
      if (sales.some((s) => s.itemId === id && s.channel === "repair")) {
        await saveJSON("sales", sales.map((s) => s.itemId === id && s.channel === "repair"
          ? { ...s, salePrice: t.finalPrice ?? s.salePrice, costBasis: partsCost + labourCost, partsCost, labourCost, technician: t.assignedTo || "" } : s), true);
      }
    }
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

  const ink = "#FFFFFF", panel = "#FFFFFF", panel2 = "#F4F6F9", paper = "#111827", muted = "#5B6472",
    brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#E2E6EC";
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

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20, borderBottom: `1px solid ${line}`, paddingBottom: 14 }}>
          {[{ id: "queue", label: "Queue" }, { id: "intake", label: "New job" }, { id: "stock", label: "Parts Stock" }, { id: "usage", label: "Parts usage" }, { id: "track", label: "Track a job" }].map((v) => (
            <button key={v.id} onClick={() => { setView(v.id); setOpenId(null); }}
              style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                border: `1px solid ${view === v.id ? brass : line}`, background: view === v.id ? brassDim : "transparent", color: view === v.id ? brass : paper }}>
              {v.label}
            </button>
          ))}
        </div>

        {view === "intake" && <IntakeForm colors={colors} repairTypes={REPAIR_TYPES} team={team} me={staffName} inventory={inventory} onCreate={createTicket} />}

        {view === "usage" && <PartsUsage colors={colors} tickets={tickets || []} onOpen={(id) => { setOpenId(id); setView("queue"); }} />}

        {view === "stock" && (
          <PartsStockTab colors={colors} stock={partsStock || []} onAdd={addStockItem} onAdjust={adjustStock} prefillBarcode={stockPrefill} onPrefillUsed={() => setStockPrefill("")} />
        )}

        {view === "queue" && !open && (
          <>
            {repairRequests.filter((r) => r.status === "new").length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Incoming repair requests ({repairRequests.filter((r) => r.status === "new").length} new)</div>
                {repairRequests.filter((r) => r.status === "new").map((r) => (
                  <div key={r.id} style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name} — {r.deviceType}: {r.model}</span>
                      <span style={{ fontSize: 11, color: muted }}>{r.id}</span>
                    </div>
                    <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>{r.email}{r.phone && ` · ${r.phone}`}{` · ${r.method === "mailin" ? "📮 Mail-in" : "🏪 In store"}`}</div>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>{r.issue}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setView("intake")} style={{ padding: "6px 12px", borderRadius: 3, fontSize: 11.5, border: `1px solid ${brass}`, background: "transparent", color: brass, cursor: "pointer" }}>
                        Start ticket
                      </button>
                      <button onClick={() => markRequestContacted(r.id)} style={{ padding: "6px 12px", borderRadius: 3, fontSize: 11.5, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>
                        Mark contacted
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {["mine", "open", "shop", "completed", "all"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12.5, cursor: "pointer",
                  border: `1px solid ${filter === f ? brass : line}`, background: filter === f ? brassDim : "transparent", color: filter === f ? brass : paper }}>
                  {f === "mine" ? `my jobs (${(tickets || []).filter((t) => t.assignedTo === staffName && !["completed", "not_repairable"].includes(t.status)).length})` : f === "shop" ? "shop phones" : f}
                </button>
              ))}
            </div>
            {filtered.length === 0 && <div style={{ color: muted, fontSize: 13 }}>Nothing here.</div>}
            {filtered.map((t) => (
              <button key={t.id} onClick={() => { setOpenId(t.id); setView("queue"); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 3,
                  border: `1px solid ${line}`, borderLeft: `3px solid ${t.status === "not_repairable" ? red : t.status === "completed" ? green : brass}`, background: panel, color: paper, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{t.id} <JobBadge colors={colors} ticket={t} /></span>
                  <span style={{ fontSize: 12, color: muted }}>{STATUS_LABELS[t.status]}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{t.device.brand} {t.device.model} — {REPAIR_TYPES.find((r) => r.id === t.repairTypeId)?.label}</div>
                {(t.symptoms || []).length > 0 && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{t.symptoms.map((id) => SYMPTOMS.find((x) => x.id === id)?.label).filter(Boolean).join(" · ")}</div>}
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{t.jobType === "shop" ? "Shop phone" : t.customer.name}{t.jobType === "shop" ? "" : ` · ${fmt(t.finalPrice ?? t.quotedPrice)}`}{t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleDateString("en-AU")}` : ""}{t.warrantyOf && " · warranty job"}{t.assignedTo ? ` · 🔧 ${t.assignedTo}` : " · not assigned"}</div>
              </button>
            ))}
          </>
        )}

        {open && (
          <TicketDetail colors={colors} ticket={open} repairTypes={REPAIR_TYPES} stock={partsStock || []} team={team} me={staffName}
            onUpdate={(patch, logStatus) => updateTicket(open.id, patch, logStatus)}
            onUseStock={(stockItem, meta) => usePartFromStock(open.id, stockItem, meta)}
            onCompleteShop={() => completeShopJob(open.id)}
            onAddUnknownBarcode={(code) => { setStockPrefill(code); setOpenId(null); setView("stock"); }}
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

function IntakeForm({ colors, repairTypes, team, me, inventory, onCreate }) {
  const { panel2, paper, muted, brass, brassDim, red, line } = colors;
  const [jobType, setJobType] = useState("customer");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [brand, setBrand] = useState(""); const [model, setModel] = useState("");
  const [imei, setImei] = useState(""); const [storage, setStorage] = useState(""); const [colour, setColour] = useState(""); const [condition, setCondition] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [symptoms, setSymptoms] = useState([]);
  const [repairTypeId, setRepairTypeId] = useState(null); const [issue, setIssue] = useState("");
  const [quotedPrice, setQuotedPrice] = useState(""); const [deposit, setDeposit] = useState("");
  const [assignedTo, setAssignedTo] = useState(""); const [priority, setPriority] = useState("normal"); const [dueAt, setDueAt] = useState("");
  const [scanNote, setScanNote] = useState("");

  const shop = jobType === "shop";
  const stockPhones = (inventory || []).filter((i) => i && !i.soldAt && i.status !== "sold");
  const ready = brand.trim() && model.trim() && repairTypeId && (shop || (name.trim() && phone.trim() && quotedPrice));
  const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const chip = (on) => ({ padding: "8px 12px", borderRadius: 3, fontSize: 12.5, cursor: "pointer", border: `1px solid ${on ? brass : line}`, background: on ? brassDim : "transparent", color: on ? brass : paper, fontFamily: "inherit" });
  const names = (team || []).length ? [...team].sort((x, y) => (x.role === "technician" ? -1 : 0) - (y.role === "technician" ? -1 : 0)) : (me ? [{ username: me, role: "" }] : []);

  function pickStockPhone(item) {
    if (!item) { setInventoryItemId(""); return; }
    setInventoryItemId(item.id); setBrand(item.brand || ""); setModel(item.model || ""); setImei(item.imei || ""); setStorage(item.storage || "");
  }
  function onScanImei(code) {
    setImei(code);
    const hit = (inventory || []).find((i) => i && i.imei && String(i.imei).trim() === code);
    if (hit) { pickStockPhone(hit); if (!shop) setJobType("shop"); setScanNote(`Found in stock: ${hit.brand} ${hit.model}.`); }
    else setScanNote(shop ? "Not found in stock. Check the IMEI or pick the phone from the list." : "");
  }
  const toggleSymptom = (id) => setSymptoms((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Job type</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 16 }}>
        {[["customer", "Customer repair", "Customer's phone at the counter"], ["shop", "Shop phone", "Our stock, fixing it to sell"]].map(([k, t, d]) => (
          <button key={k} type="button" onClick={() => setJobType(k)} aria-pressed={jobType === k}
            style={{ ...chip(jobType === k), textAlign: "left", padding: "12px 14px" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{t}</div><div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{d}</div>
          </button>
        ))}
      </div>

      {!shop && <>
        <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Customer</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" style={inputStyle} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" style={inputStyle} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" style={inputStyle} />
      </>}

      <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>Device</div>
      {shop && (
        <select value={inventoryItemId} onChange={(e) => pickStockPhone(stockPhones.find((i) => i.id === e.target.value))} aria-label="Phone from stock" style={inputStyle}>
          <option value="">Pick the phone from stock (or scan its IMEI label)</option>
          {stockPhones.map((i) => <option key={i.id} value={i.id}>{i.brand} {i.model} {i.storage || ""}{i.imei ? ` · IMEI …${String(i.imei).slice(-5)}` : ""}</option>)}
        </select>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "stretch" }}>
        <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI or serial (dial *#06#)" style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0 }} />
        <ScanButton onScan={onScanImei} title="Scan IMEI / serial" />
      </div>
      {scanNote && <div style={{ fontSize: 12.5, color: brass, marginBottom: 10 }}>{scanNote}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand, e.g. Apple" style={inputStyle} />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model, e.g. iPhone 13" style={inputStyle} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Storage, e.g. 128GB" style={inputStyle} />
        <input value={colour} onChange={(e) => setColour(e.target.value)} placeholder="Colour" style={inputStyle} />
      </div>
      <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Condition on arrival: scratches, dents, cracked back…" style={inputStyle} />

      <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>Problems (pick all that apply)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {SYMPTOMS.map((x) => <button key={x.id} type="button" aria-pressed={symptoms.includes(x.id)} onClick={() => toggleSymptom(x.id)} style={chip(symptoms.includes(x.id))}>{symptoms.includes(x.id) ? "✓ " : ""}{x.label}</button>)}
      </div>
      {symptoms.length > 0 && <DiagnosisSummary colors={colors} symptoms={symptoms} brand={brand} model={model} compact />}

      <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>Repair type</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {repairTypes.map((r) => (
          <button key={r.id} type="button" onClick={() => { setRepairTypeId(r.id); if (!shop) setQuotedPrice(String(r.typicalPrice || "")); }} style={chip(repairTypeId === r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      <textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder={shop ? "Notes for the technician" : "Describe the issue in the customer's words"}
        style={{ ...inputStyle, minHeight: 60 }} />

      <div style={{ fontSize: 13, color: muted, margin: "6px 0 8px" }}>Technician</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} aria-label="Assign technician" style={{ ...inputStyle, flex: "2 1 180px" }}>
          <option value="">Assign later</option>
          {names.map((u) => <option key={u.username} value={u.username}>{u.username}{u.role === "technician" ? " (technician)" : ""}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority" style={{ ...inputStyle, flex: "1 1 120px" }}>
          <option value="normal">Normal</option><option value="urgent">Urgent</option>
        </select>
        <label style={{ flex: "1 1 150px", fontSize: 12, color: muted }}>Due by
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={inputStyle} />
        </label>
      </div>

      {!shop && (
        <div style={{ display: "flex", gap: 10 }}>
          <input value={quotedPrice} onChange={(e) => setQuotedPrice(e.target.value)} placeholder="Quoted price" type="number" style={inputStyle} />
          <input value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Deposit taken (optional)" type="number" style={inputStyle} />
        </div>
      )}
      {!ready && <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Needs: {[!shop && !name.trim() && "name", !shop && !phone.trim() && "phone", !brand.trim() && "brand", !model.trim() && "model", !repairTypeId && "repair type", !shop && !quotedPrice && "quote"].filter(Boolean).join(", ")}</div>}

      <button disabled={!ready} onClick={() => onCreate({ jobType, name, phone, email, brand: brand.trim(), model: model.trim(), imei: imei.trim(), storage: storage.trim(), colour: colour.trim(), condition: condition.trim(),
          inventoryItemId: shop ? inventoryItemId : "", symptoms, repairTypeId, issue, assignedTo, priority, dueAt: dueAt ? new Date(dueAt + "T17:00:00").toISOString() : null,
          quotedPrice: parseFloat(quotedPrice) || 0, deposit: parseFloat(deposit) || 0 })}
        style={{ width: "100%", padding: "13px", borderRadius: 3, border: "none", marginTop: 6,
          background: ready ? brass : line, color: ready ? "#fff" : muted, fontSize: 14, fontWeight: 600, cursor: ready ? "pointer" : "default" }}>
        {shop ? "Create shop job" : "Create job ticket"}
      </button>
    </div>
  );
}

// Badges on a job: who it belongs to and how urgent it is.
function JobBadge({ colors, ticket }) {
  const { brass, red } = colors;
  const pill = (bg, fg) => ({ display: "inline-block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 999, background: bg, color: fg, marginLeft: 6, verticalAlign: "middle" });
  return (
    <>
      {ticket.jobType === "shop" ? <span style={pill("#EEF1FB", brass)}>SHOP</span> : <span style={pill("#F1F3F6", "#3B4452")}>COUNTER</span>}
      {ticket.priority === "urgent" && <span style={pill("#FBEDEC", red)}>URGENT</span>}
    </>
  );
}

// Likely causes, checks and parts for the picked problems (diagnosis-guide.js).
function DiagnosisSummary({ colors, symptoms, brand, model, stock, compact, neededIds, onNeed }) {
  const { panel2, paper, muted, brass, green, line } = colors;
  const d = useMemo(() => diagnose(symptoms, brand, model), [symptoms, brand, model]);
  const [showChecks, setShowChecks] = useState(!compact);
  const tone = { common: "#8B2E2E", possible: "#9A6B00", less: "#5B6472" };
  if (!d.causes.length) return null;
  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 14, background: "#FAFBFD" }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>🩺 Likely causes{d.brand !== "other" ? ` (${d.brand === "apple" ? "iPhone" : d.brand === "samsung" ? "Samsung" : "Pixel"})` : ""}</div>
      <ol style={{ margin: "0 0 10px", paddingLeft: 20 }}>
        {d.causes.slice(0, compact ? 4 : 10).map((c) => (
          <li key={c.text} style={{ fontSize: 13, marginBottom: 4 }}>
            {c.text} <span style={{ fontSize: 11, color: tone[c.likelihood] }}>· {LIKELIHOOD_LABEL[c.likelihood]}</span>
            {c.part && <span style={{ fontSize: 11, color: muted }}> · part: {PARTS[c.part].label}</span>}
          </li>
        ))}
      </ol>
      {d.parts.length > 0 && !compact && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: muted, marginBottom: 6 }}>Parts to have ready</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {d.parts.map((p) => {
              const inStock = stockFor(p.id, stock, model).reduce((n, s) => n + (Number(s.qtyOnHand) || 0), 0);
              const added = (neededIds || []).includes(p.id);
              return (
                <button key={p.id} type="button" disabled={added || !onNeed} onClick={() => onNeed && onNeed(p.id)}
                  style={{ padding: "7px 10px", borderRadius: 3, fontSize: 12, cursor: added || !onNeed ? "default" : "pointer", border: `1px solid ${added ? green : line}`, background: added ? "#EEF5EC" : "#fff", color: added ? green : paper, fontFamily: "inherit" }}>
                  {added ? "✓ " : "+ "}{p.label} · <span style={{ color: inStock ? green : "#8B2E2E" }}>{inStock ? `${inStock} in stock` : "none in stock"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {d.notes.map((n) => <div key={n.text} style={{ fontSize: 12.5, background: "#EEF1FB", color: "#1C2B57", borderRadius: 3, padding: "8px 10px", marginBottom: 8 }}>ℹ️ {n.text}</div>)}
      <button type="button" onClick={() => setShowChecks((v) => !v)} style={{ background: "none", border: "none", color: brass, fontSize: 12.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
        {showChecks ? "Hide checks" : `Show what to check (${d.checks.length})`}
      </button>
      {showChecks && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {d.checks.map((c, i) => <li key={i} style={{ fontSize: 12.5, marginBottom: 3 }}>{c.text}</li>)}
        </ul>
      )}
      {!compact && d.sources.length > 0 && (
        <div style={{ fontSize: 11.5, color: muted, marginTop: 10 }}>Maker guidance: {d.sources.map((src, i) => <span key={src.url}>{i ? " · " : ""}<a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: brass }}>{src.label}</a></span>)}</div>
      )}
      <div style={{ fontSize: 11, color: muted, marginTop: 6, background: panel2, padding: "4px 0 0" }}>Ranking is a starting point from common bench experience. Test before quoting a part.</div>
    </div>
  );
}

function TicketDetail({ colors, ticket, repairTypes, stock, team, me, onUpdate, onUseStock, onReopenWarranty, onComplete, onCompleteShop, onAddUnknownBarcode, onBack }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [partName, setPartName] = useState(""); const [partCost, setPartCost] = useState("");
  const [finalPrice, setFinalPrice] = useState(String(ticket.finalPrice ?? ticket.quotedPrice));
  const [warrantyResult, setWarrantyResult] = useState(null);
  const [stockNotice, setStockNotice] = useState("");
  const [completingPayMethod, setCompletingPayMethod] = useState(null); // null = not confirming yet
  const [unknownCode, setUnknownCode] = useState("");
  const [shopDoneNote, setShopDoneNote] = useState("");
  const shop = ticket.jobType === "shop";
  const symptoms = ticket.symptoms || [];
  const needed = ticket.partsNeeded || [];

  // Technician scans the part's barcode: it is matched to Parts Stock,
  // fitted to this job and one is taken off stock, all in one step.
  async function onScanPart(code) {
    const c = String(code).trim().toLowerCase();
    const hit = (stock || []).find((x) => (x.barcode && String(x.barcode).trim().toLowerCase() === c) || (x.sku && String(x.sku).trim().toLowerCase() === c));
    setUnknownCode("");
    if (!hit) { setUnknownCode(code); setStockNotice(""); return; }
    if (hit.qtyOnHand <= 0) { setStockNotice(`${hit.name} shows 0 in stock. Count the shelf and fix the stock number.`); return; }
    const ok = await onUseStock(hit, { scanned: true, barcode: code });
    setStockNotice(ok ? `✓ Scanned: ${hit.name}. Fitted to this job, 1 taken off stock.` : `${hit.name} is out of stock.`);
    setTimeout(() => setStockNotice(""), 4000);
  }

  const partsCost = partsCostOf(ticket);
  const techPay = Number(ticket.techPay) || 0;
  const margin = (ticket.finalPrice ?? ticket.quotedPrice) - partsCost - techPay;
  const canReopen = ticket.status === "completed" && !ticket.warrantyOf && !shop;
  const daysSinceCompleted = ticket.completedAt ? (Date.now() - new Date(ticket.completedAt).getTime()) / (1000 * 60 * 60 * 24) : null;
  const withinWarranty = daysSinceCompleted != null && daysSinceCompleted <= ticket.warrantyDays;

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>← Back to queue</button>

      <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 15, marginBottom: 4 }}>{ticket.id}<JobBadge colors={colors} ticket={ticket} />{ticket.warrantyOf && <span style={{ color: brass, fontSize: 12 }}> · warranty claim on {ticket.warrantyOf}</span>}</div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>{ticket.device.brand} {ticket.device.model}{ticket.device.storage ? ` ${ticket.device.storage}` : ""}{ticket.device.colour ? ` · ${ticket.device.colour}` : ""} · {repairTypes.find((r) => r.id === ticket.repairTypeId)?.label}</div>
        {ticket.device.imei && <div style={{ fontSize: 12.5, marginBottom: 4 }}>IMEI / serial: <span style={{ fontFamily: "ui-monospace, monospace" }}>{ticket.device.imei}</span></div>}
        {ticket.device.condition && <div style={{ fontSize: 12.5, color: muted, marginBottom: 4 }}>Condition on arrival: {ticket.device.condition}</div>}
        <div style={{ fontSize: 13 }}>{shop ? "Shop phone (fixing to sell)" : `${ticket.customer.name} · ${ticket.customer.phone}`}</div>
        {ticket.dueAt && <div style={{ fontSize: 12.5, color: new Date(ticket.dueAt) < new Date() && !["completed", "not_repairable"].includes(ticket.status) ? red : muted, marginTop: 4 }}>Due {new Date(ticket.dueAt).toLocaleDateString("en-AU")}</div>}
        <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>{shop ? "Notes" : "Issue"}: {ticket.issue || "—"}</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>Handled by {ticket.staffHandled}</div>
      </div>

      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Status</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => {
              if (s === "completed" && shop) { onCompleteShop().then((m) => setShopDoneNote(m || "")); return; }
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

      {shopDoneNote && <div role="status" style={{ fontSize: 13, color: green, border: `1px solid ${green}`, borderRadius: 3, padding: "10px 12px", marginBottom: 16 }}>{shopDoneNote}</div>}

      <TechJob colors={colors} ticket={ticket} team={team} me={me} onUpdate={onUpdate} />

      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Problems</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {SYMPTOMS.map((x) => {
          const on = symptoms.includes(x.id);
          return <button key={x.id} type="button" aria-pressed={on} onClick={() => onUpdate({ symptoms: on ? symptoms.filter((y) => y !== x.id) : [...symptoms, x.id] })}
            style={{ padding: "6px 10px", borderRadius: 3, fontSize: 12, cursor: "pointer", border: `1px solid ${on ? brass : line}`, background: on ? brassDim : "transparent", color: on ? brass : paper, fontFamily: "inherit" }}>{on ? "✓ " : ""}{x.label}</button>;
        })}
      </div>
      {symptoms.length > 0 && <DiagnosisSummary colors={colors} symptoms={symptoms} brand={ticket.device.brand} model={ticket.device.model} stock={stock}
        neededIds={needed.map((n) => n.partId)} onNeed={(partId) => onUpdate({ partsNeeded: [...needed, { partId, label: PARTS[partId].label, done: false, at: new Date().toISOString() }] })} />}

      {needed.length > 0 && (
        <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Parts needed for this job</div>
          {needed.map((n, i) => {
            const have = stockFor(n.partId, stock, ticket.device.model).reduce((a, x) => a + (Number(x.qtyOnHand) || 0), 0);
            return (
              <div key={n.partId + i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i ? `1px solid ${line}` : "none", fontSize: 13 }}>
                <span style={{ textDecoration: n.done ? "line-through" : "none", color: n.done ? muted : paper }}>{n.label}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {n.done ? <span style={{ color: green, fontSize: 12 }}>✓ fitted</span> : <span style={{ fontSize: 12, color: have ? green : red }}>{have ? `${have} in stock` : "need to order"}</span>}
                  <button type="button" onClick={() => onUpdate({ partsNeeded: needed.filter((_, j) => j !== i) })} aria-label={`Remove ${n.label}`} style={{ border: "none", background: "none", color: muted, cursor: "pointer", fontSize: 16 }}>×</button>
                </span>
              </div>
            );
          })}
          {needed.some((n) => !n.done && !stockFor(n.partId, stock, ticket.device.model).some((x) => x.qtyOnHand > 0)) && ticket.status !== "awaiting_parts" && (
            <button type="button" onClick={() => onUpdate({ status: "awaiting_parts" }, true)} style={{ marginTop: 8, padding: "7px 12px", borderRadius: 3, fontSize: 12, border: `1px solid ${red}`, background: "transparent", color: red, cursor: "pointer", fontFamily: "inherit" }}>Mark job as awaiting parts</button>
          )}
        </div>
      )}

      <Checklist colors={colors} ticket={ticket} onUpdate={onUpdate} />

      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Parts used</div>
      <div style={{ border: `1px solid ${line}`, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
        {(ticket.parts || []).map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 13 }}>
            <span>{p.name}
              {p.scanned ? <span style={{ color: green, fontSize: 11 }}> · ✓ scanned</span> : p.stockItemId ? <span style={{ color: "#9A6B00", fontSize: 11 }}> · from stock, not scanned</span> : <span style={{ color: muted, fontSize: 11 }}> · one-off</span>}
              {p.by && <span style={{ color: muted, fontSize: 11 }}> · {p.by}{p.at ? ` ${new Date(p.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}</span>}
            </span><span style={{ color: red }}>{fmt(p.cost)}</span>
          </div>
        ))}
        {(!ticket.parts || ticket.parts.length === 0) && <div style={{ padding: 12, fontSize: 12.5, color: muted }}>No parts logged yet.</div>}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <ScanButton onScan={onScanPart} title="Scan the part's barcode" label="Scan part used" style={{ padding: "12px 18px", fontSize: 14.5 }} />
        <span style={{ fontSize: 12, color: muted }}>Scan every part you fit. It is logged to this job and taken off stock.</span>
      </div>
      {unknownCode && (
        <div style={{ border: `1px solid ${red}`, borderRadius: 3, padding: 12, marginBottom: 12, fontSize: 13 }}>
          Barcode <strong style={{ fontFamily: "ui-monospace, monospace" }}>{unknownCode}</strong> isn't in Parts Stock yet.
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => onAddUnknownBarcode(unknownCode)} style={{ padding: "7px 12px", borderRadius: 3, fontSize: 12.5, border: "none", background: brass, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Add it to stock</button>
            <button type="button" onClick={() => setUnknownCode("")} style={{ padding: "7px 12px", borderRadius: 3, fontSize: 12.5, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
          </div>
        </div>
      )}
      {stockNotice && <div role="status" style={{ fontSize: 12.5, color: brass, marginBottom: 10 }}>{stockNotice}</div>}

      {stock && stock.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 12, color: muted, cursor: "pointer", marginBottom: 6 }}>No barcode on the part? Pick it from stock (logged as not scanned)</summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {stock.map((s) => (
              <button key={s.id} disabled={s.qtyOnHand <= 0}
                onClick={async () => {
                  const ok = await onUseStock(s, { scanned: false });
                  setStockNotice(ok ? `Added ${s.name} — 1 deducted from stock.` : `${s.name} is out of stock.`);
                  setTimeout(() => setStockNotice(""), 2500);
                }}
                style={{ padding: "7px 12px", borderRadius: 3, fontSize: 12, cursor: s.qtyOnHand > 0 ? "pointer" : "default",
                  border: `1px solid ${s.qtyOnHand > 0 ? line : red}`, background: "transparent", color: s.qtyOnHand > 0 ? paper : red, opacity: s.qtyOnHand > 0 ? 1 : 0.6 }}>
                {s.name} · {fmt(s.costPerUnit)} · {s.qtyOnHand} in stock
              </button>
            ))}
          </div>
        </details>
      )}

      <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Or add a one-off part not tracked in stock</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Part name" style={{ flex: 2, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        <input value={partCost} onChange={(e) => setPartCost(e.target.value)} placeholder="Cost" type="number" style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        <button disabled={!partName.trim() || !partCost} onClick={() => {
            onUpdate({ parts: [...(ticket.parts || []), { name: partName.trim(), cost: parseFloat(partCost), scanned: false, by: me || "unattributed", at: new Date().toISOString() }] });
            setPartName(""); setPartCost("");
          }} style={{ padding: "9px 14px", borderRadius: 3, border: "none", background: partName.trim() && partCost ? brass : line, color: partName.trim() && partCost ? "#1a1408" : muted, fontSize: 12.5, cursor: partName.trim() && partCost ? "pointer" : "default" }}>
          Add
        </button>
      </div>

      <div style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 14, marginBottom: 16 }}>
        {!shop && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, color: muted }}>Final price charged</span>
          <input value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} onBlur={() => { const v = parseFloat(finalPrice) || 0; if (v !== ticket.finalPrice) onUpdate({ finalPrice: v }); }} type="number" aria-label="Final price charged"
            style={{ width: 90, padding: "4px 8px", borderRadius: 2, border: `1px solid ${line}`, background: panel2, color: brass, fontSize: 13, textAlign: "right" }} />
        </div>}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: muted }}>
          <span>Parts cost</span><span>{fmt(partsCost)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: muted }}>
          <span>Technician pay</span><span>{fmt(techPay)}</span>
        </div>
        {shop && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}><span>Repair cost added to this phone</span><span>{fmt(partsCost + techPay)}</span></div>}
        {!shop && hasArea("reports") && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
          <span>Shop profit on this job</span><span style={{ color: margin >= 0 ? green : red }}>{fmt(margin)}</span>
        </div>}
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

// Who does the job, how long it took, and what the technician is paid for it.
// Pay can only be set (and marked paid) by someone with the reports area; the
// server enforces that too.
function TechJob({ colors, ticket, team, me, onUpdate }) {
  const { panel2, paper, muted, brass, green, red, line } = colors;
  const canPay = hasArea("reports");
  const [mins, setMins] = useState(String(ticket.timeSpentMins ?? ""));
  const [pay, setPay] = useState(String(ticket.techPay ?? ""));
  useEffect(() => { setMins(String(ticket.timeSpentMins ?? "")); setPay(String(ticket.techPay ?? "")); }, [ticket.id, ticket.timeSpentMins, ticket.techPay]);
  const names = team.length ? [...team].sort((a, b) => (a.role === "technician" ? -1 : 0) - (b.role === "technician" ? -1 : 0)) : (me ? [{ username: me, role: "" }] : []);
  const inputStyle = { padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none", boxSizing: "border-box" };
  const saveMins = (v) => { const n = Math.max(0, Math.round(Number(v) || 0)); setMins(String(n)); if (n !== (ticket.timeSpentMins || 0)) onUpdate({ timeSpentMins: n }); };
  const hm = (m) => (m ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ""}${m % 60 ? `${m % 60}m` : ""}`.trim() : "—");
  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>🔧 Technician job</div>
      <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }} htmlFor={`assign-${ticket.id}`}>Assigned to</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <select id={`assign-${ticket.id}`} value={ticket.assignedTo || ""} onChange={(e) => onUpdate({ assignedTo: e.target.value || null, assignedAt: e.target.value ? new Date().toISOString() : null })}
          style={{ ...inputStyle, flex: "1 1 180px" }}>
          <option value="">Not assigned</option>
          {names.map((u) => <option key={u.username} value={u.username}>{u.username}{u.role === "technician" ? " (technician)" : ""}</option>)}
          {ticket.assignedTo && !names.some((u) => u.username === ticket.assignedTo) && <option value={ticket.assignedTo}>{ticket.assignedTo}</option>}
        </select>
        {me && ticket.assignedTo !== me && <button onClick={() => onUpdate({ assignedTo: me, assignedAt: new Date().toISOString() })} style={{ ...inputStyle, cursor: "pointer", color: brass, background: "transparent" }}>Assign to me</button>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {ticket.timerStartedAt ? (
          <>
            <button type="button" onClick={() => { const add = Math.max(1, Math.round((Date.now() - new Date(ticket.timerStartedAt).getTime()) / 60000)); onUpdate({ timerStartedAt: null, timeSpentMins: (Number(ticket.timeSpentMins) || 0) + add }); }}
              style={{ ...inputStyle, cursor: "pointer", background: red, color: "#fff", border: "none", fontWeight: 700 }}>■ Stop timer</button>
            <span style={{ fontSize: 12.5, color: red }}>Running since {new Date(ticket.timerStartedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span>
          </>
        ) : (
          <button type="button" onClick={() => onUpdate({ timerStartedAt: new Date().toISOString(), ...(ticket.assignedTo ? {} : me ? { assignedTo: me, assignedAt: new Date().toISOString() } : {}) })}
            style={{ ...inputStyle, cursor: "pointer", background: green, color: "#fff", border: "none", fontWeight: 700 }}>▶ Start work timer</button>
        )}
      </div>
      <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }} htmlFor={`mins-${ticket.id}`}>Time spent: <strong style={{ color: paper }}>{hm(Number(ticket.timeSpentMins) || 0)}</strong></label>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <input id={`mins-${ticket.id}`} value={mins} onChange={(e) => setMins(e.target.value)} onBlur={() => saveMins(mins)} type="number" min="0" placeholder="Minutes" style={{ ...inputStyle, width: 100 }} />
        {[15, 30, 60].map((d) => <button key={d} onClick={() => saveMins((Number(ticket.timeSpentMins) || 0) + d)} style={{ ...inputStyle, cursor: "pointer", background: "transparent" }}>+{d === 60 ? "1h" : `${d}m`}</button>)}
      </div>
      <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }} htmlFor={`pay-${ticket.id}`}>Technician pay for this job</label>
      {canPay ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>$</span>
          <input id={`pay-${ticket.id}`} value={pay} onChange={(e) => setPay(e.target.value)} type="number" min="0" step="0.01" placeholder="0"
            onBlur={() => { const v = Math.max(0, Number(pay) || 0); if (v !== (Number(ticket.techPay) || 0)) onUpdate({ techPay: v }); }} style={{ ...inputStyle, width: 110 }} />
          {Number(ticket.techPay) > 0 && (ticket.techPaidAt
            ? <span style={{ fontSize: 12.5, color: green }}>✓ Paid {new Date(ticket.techPaidAt).toLocaleDateString("en-AU")} <button onClick={() => onUpdate({ techPaidAt: null, techPaidBy: null })} style={{ background: "none", border: "none", color: muted, textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>undo</button></span>
            : <button onClick={() => onUpdate({ techPaidAt: new Date().toISOString(), techPaidBy: me || "" })} style={{ ...inputStyle, cursor: "pointer", color: green, background: "transparent", borderColor: green }}>Mark paid</button>)}
        </div>
      ) : (
        <div style={{ fontSize: 13.5 }}>{Number(ticket.techPay) > 0 ? `${fmt(ticket.techPay)}${ticket.techPaidAt ? " · paid" : " · not paid yet"}` : <span style={{ color: muted }}>Set by the Owner or Manager.</span>}</div>
      )}
      {!ticket.assignedTo && Number(ticket.techPay) > 0 && <div style={{ fontSize: 12, color: red, marginTop: 8 }}>Pay is set but nobody is assigned: assign the technician so it shows in their total.</div>}
      {ticket.jobType === "shop" && ticket.status !== "completed" && <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>Shop phone: set the pay before marking it done, so the pay is added to the phone's cost in stock.</div>}
    </div>
  );
}

// Pre- and post-repair function test. Recording what worked BEFORE the
// repair protects the shop if a customer later says the repair broke it.
const CHECKS = ["Screen & touch", "Face ID / fingerprint", "Front camera", "Rear cameras", "Loudspeaker", "Earpiece", "Microphone", "Charging", "Wi-Fi & Bluetooth", "Mobile signal / SIM", "Buttons", "Battery health"];
function Checklist({ colors, ticket, onUpdate }) {
  const { paper, muted, green, red, line } = colors;
  const [stage, setStage] = useState("pre");
  const data = (ticket.checks && ticket.checks[stage]) || {};
  const set = (k, v) => onUpdate({ checks: { ...(ticket.checks || {}), [stage]: { ...data, [k]: data[k] === v ? undefined : v } } });
  const done = CHECKS.filter((k) => data[k]).length;
  const opt = (k, v, label, col) => (
    <button type="button" onClick={() => set(k, v)} aria-pressed={data[k] === v}
      style={{ minWidth: 44, padding: "5px 8px", borderRadius: 3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${data[k] === v ? col : line}`, background: data[k] === v ? col : "transparent", color: data[k] === v ? "#fff" : paper }}>{label}</button>
  );
  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Function test</span>
        <span style={{ display: "flex", gap: 6 }}>
          {[["pre", "Before repair"], ["post", "After repair"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStage(k)} aria-pressed={stage === k} style={{ padding: "5px 10px", borderRadius: 3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${stage === k ? paper : line}`, background: stage === k ? paper : "transparent", color: stage === k ? "#fff" : paper }}>{l}</button>
          ))}
        </span>
      </div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>{done} of {CHECKS.length} checked {stage === "pre" ? "before the repair" : "after the repair"}</div>
      {CHECKS.map((k) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 0", borderTop: `1px solid ${line}` }}>
          <span style={{ fontSize: 13 }}>{k}</span>
          <span style={{ display: "flex", gap: 4 }}>{opt(k, "ok", "OK", green)}{opt(k, "fault", "Fault", red)}{opt(k, "na", "N/A", muted)}</span>
        </div>
      ))}
    </div>
  );
}

// Who fitted which part, when, and whether they scanned it. Built from the
// jobs themselves, so nothing extra has to be saved.
function PartsUsage({ colors, tickets, onOpen }) {
  const { paper, muted, green, red, line, panel2 } = colors;
  const [who, setWho] = useState("all");
  const rows = [];
  for (const t of tickets) for (const p of t.parts || []) rows.push({ ...p, jobId: t.id, device: `${t.device.brand} ${t.device.model}`, shop: t.jobType === "shop", tech: p.by || t.assignedTo || "unattributed" });
  rows.sort((x, y) => String(y.at || "").localeCompare(String(x.at || "")));
  const people = [...new Set(rows.map((r) => r.tech))];
  const stats = people.map((name) => {
    const mine = rows.filter((r) => r.tech === name && r.stockItemId);
    const scanned = mine.filter((r) => r.scanned).length;
    return { name, total: mine.length, scanned, pct: mine.length ? Math.round((scanned / mine.length) * 100) : 0 };
  }).sort((a, b) => b.total - a.total);
  const shown = who === "all" ? rows : rows.filter((r) => r.tech === who);
  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>Every part fitted to a job. Stock parts should be scanned. Unscanned ones are flagged so stock and jobs stay matched.</div>
      {stats.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No parts fitted yet.</div>}
      {stats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
          {stats.map((x) => (
            <button key={x.name} type="button" onClick={() => setWho(who === x.name ? "all" : x.name)} aria-pressed={who === x.name}
              style={{ textAlign: "left", border: `1px solid ${who === x.name ? paper : line}`, borderRadius: 3, padding: 12, background: panel2, cursor: "pointer", fontFamily: "inherit", color: paper }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{x.name}</div>
              <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>{x.total} stock part{x.total === 1 ? "" : "s"} fitted</div>
              <div style={{ fontSize: 13, marginTop: 4, color: x.pct >= 90 ? green : x.pct >= 60 ? "#9A6B00" : red, fontWeight: 700 }}>{x.total ? `${x.pct}% scanned` : "—"}</div>
            </button>
          ))}
        </div>
      )}
      {shown.slice(0, 200).map((r, i) => (
        <button key={r.jobId + i} type="button" onClick={() => onOpen(r.jobId)}
          style={{ display: "flex", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", padding: "9px 10px", border: "none", borderTop: `1px solid ${line}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", color: paper }}>
          <span style={{ fontSize: 13 }}>
            {r.name}
            <span style={{ display: "block", fontSize: 11.5, color: muted }}>{r.jobId} · {r.device}{r.shop ? " · shop phone" : ""} · {r.tech}{r.at ? ` · ${new Date(r.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}</span>
          </span>
          <span style={{ fontSize: 12, whiteSpace: "nowrap", color: r.scanned ? green : r.stockItemId ? red : muted }}>{r.scanned ? "✓ scanned" : r.stockItemId ? "not scanned" : "one-off"}</span>
        </button>
      ))}
    </div>
  );
}

function PartsStockTab({ colors, stock, onAdd, onAdjust, prefillBarcode, onPrefillUsed }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [name, setName] = useState(""); const [sku, setSku] = useState(""); const [barcode, setBarcode] = useState(prefillBarcode || "");
  const [qty, setQty] = useState(""); const [cost, setCost] = useState(""); const [threshold, setThreshold] = useState("2");
  const [find, setFind] = useState(""); const [note, setNote] = useState("");
  useEffect(() => { if (prefillBarcode) { setBarcode(prefillBarcode); onPrefillUsed && onPrefillUsed(); setNote(`New barcode ${prefillBarcode}: fill in the part name, quantity and cost.`); } }, [prefillBarcode]);

  const ready = name.trim() && qty !== "" && cost !== "";
  const byCode = (code) => { const c = String(code).trim().toLowerCase(); return stock.find((x) => (x.barcode && String(x.barcode).trim().toLowerCase() === c) || (x.sku && String(x.sku).trim().toLowerCase() === c)); };
  // Receiving stock: scan a box, one is added. Unknown code: start a new item with it.
  function onReceiveScan(code) {
    const hit = byCode(code);
    if (hit) { onAdjust(hit.id, 1); setNote(`+1 ${hit.name} (now ${hit.qtyOnHand + 1}).`); }
    else { setBarcode(code); setNote(`New barcode ${code}: fill in the part name, quantity and cost below.`); }
  }
  const q = find.trim().toLowerCase();
  const list = q ? stock.filter((x) => `${x.name} ${x.sku || ""} ${x.barcode || ""}`.toLowerCase().includes(q)) : stock;
  const field = { padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none", minWidth: 0, fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
        Stock used by repair jobs. When a technician scans a part on a job, one unit comes off here automatically.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <ScanButton onScan={onReceiveScan} title="Scan to receive stock" label="Scan to receive stock (+1)" />
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search name, SKU or barcode" aria-label="Search stock" style={{ ...field, flex: 1 }} />
      </div>
      {note && <div role="status" style={{ fontSize: 12.5, color: brass, marginBottom: 12 }}>{note}</div>}

      <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 13, marginBottom: 10 }}>Add stock item</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Part name, e.g. iPhone 13 screen assembly" style={{ ...field, flex: "2 1 220px" }} />
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU (optional)" style={{ ...field, flex: "1 1 120px" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode (scan the box)" aria-label="Barcode" style={{ ...field, flex: 1 }} />
          <ScanButton onScan={(c) => { const hit = byCode(c); if (hit) setNote(`That barcode is already ${hit.name}.`); else setBarcode(c); }} title="Scan the part's barcode" />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Starting quantity" type="number" style={{ ...field, flex: 1 }} />
          <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost per unit" type="number" style={{ ...field, flex: 1 }} />
          <input value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Low-stock alert at" type="number" style={{ ...field, flex: 1 }} />
        </div>
        <button disabled={!ready} onClick={() => {
            if (barcode.trim() && byCode(barcode)) { setNote(`Barcode ${barcode.trim()} is already used by ${byCode(barcode).name}.`); return; }
            onAdd({ name: name.trim(), sku: sku.trim(), barcode: barcode.trim(), qtyOnHand: parseInt(qty), costPerUnit: parseFloat(cost), lowStockThreshold: parseInt(threshold) || 2 });
            setName(""); setSku(""); setBarcode(""); setQty(""); setCost(""); setThreshold("2"); setNote("");
          }} style={{ width: "100%", padding: "10px", borderRadius: 3, border: "none", background: ready ? brass : line, color: ready ? "#fff" : muted, fontSize: 13, fontWeight: 600, cursor: ready ? "pointer" : "default" }}>
          Add to stock
        </button>
      </div>

      <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Current stock ({list.length} item{list.length === 1 ? "" : "s"})</div>
      {list.length === 0 && <div style={{ color: muted, fontSize: 13 }}>Nothing stocked yet.</div>}
      {list.map((s) => {
        const low = s.qtyOnHand <= s.lowStockThreshold;
        return (
          <div key={s.id} style={{ border: `1px solid ${low ? red : line}`, borderRadius: 3, padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{s.name}{s.sku && <span style={{ color: muted, fontSize: 11 }}> · {s.sku}</span>}</div>
              <div style={{ fontSize: 12, color: low ? red : muted, marginTop: 2 }}>
                {s.qtyOnHand} on hand{low && " · low stock"} · {fmt(s.costPerUnit)} each{s.barcode ? <span style={{ color: green }}> · barcode ✓</span> : <span> · no barcode</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onAdjust(s.id, -1)} disabled={s.qtyOnHand <= 0} aria-label={`One less ${s.name}`}
                style={{ width: 36, height: 36, borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>−</button>
              <button onClick={() => onAdjust(s.id, 1)} aria-label={`One more ${s.name}`}
                style={{ width: 36, height: 36, borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>+</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
