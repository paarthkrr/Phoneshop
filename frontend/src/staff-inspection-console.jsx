import { PHONE_FAULT_GROUPS, FAULT_GROUPS_BY_CATEGORY } from "./instant-quote-calculator.jsx";
import { DEFAULT_TIERS, ACCESSORY_BONUS_PCT } from "./pricing.js";
import React, { useState, useEffect, useMemo } from "react";
import { currentRole, hasArea } from "./roles.js";
import DeviceArt, { inferDeviceType } from "./device-art.jsx";
import { mergeCatalog } from "./device-catalog.js";
import { imeiProblem, cleanImei, newStockItem, newShopRepairJob, addToSharedList } from "./device-flow.js";

/* =================================================================
   STAFF INSPECTION CONSOLE
   Where a submitted order actually gets turned into a payout.
   Pulls the same shared pricing-config the calculator and admin
   console use, so a re-assessment here uses identical math to the
   customer's original quote — no separate "staff formula" to drift
   out of sync.
================================================================= */

const CONFIG_KEY = "pricing-config";
const ORDERS_KEY = "orders";

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

const RETENTION_POINTS = [
  { m: 0, r: 0.80 }, { m: 12, r: 0.68 }, { m: 24, r: 0.63 },
  { m: 36, r: 0.566 }, { m: 48, r: 0.44 }, { m: 60, r: 0.311 },
  { m: 72, r: 0.22 }, { m: 84, r: 0.15 }, { m: 96, r: 0.10 }, { m: 120, r: 0.06 },
];
const BRAND_FACTOR = { Apple: 1.00, Samsung: 0.88, Google: 0.80, OnePlus: 0.72, Xiaomi: 0.60, Oppo: 0.68, Vivo: 0.65, Honor: 0.65, Motorola: 0.62, Sony: 0.68 };
const REGIONS = {
  AU: { symbol: "A$", mult: 1.00, round: 1 }, US: { symbol: "$", mult: 0.70, round: 1 },
  UK: { symbol: "£", mult: 0.46, round: 1 }, IN: { symbol: "₹", mult: 37, round: 10 }, AE: { symbol: "AED ", mult: 2.35, round: 1 },
};
const HOLDING_COST_PCT = 0.02;
// Fallback fault list so the console still has something to re-assess against
// even if the admin console's shared config hasn't been created yet.
// One checklist everywhere: staff inspect against exactly the faults customers
// can declare. Saved % changes from the Pricing Console are applied by id.
function withSavedPcts(groups, saved) {
  const pct = {}; (saved || []).forEach((g) => (g.faults || []).forEach((f) => { pct[f.id] = f.pct; }));
  return groups.map((g) => ({ ...g, faults: g.faults.map((f) => ({ ...f, pct: pct[f.id] ?? f.pct })) }));
}
const DEFAULT_FAULT_GROUPS = [
  { group: "Display", faults: [
    { id: "screen_scratch", label: "Minor scratches on screen", pct: 0.05 },
    { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
    { id: "screen_crack_severe", label: "Screen glass missing pieces", pct: 0.40 },
    { id: "dead_pixels", label: "Dead pixels or lines", pct: 0.15 },
    { id: "touch_dead", label: "Touch completely unresponsive", pct: 0.35 },
  ]},
  { group: "Body & Battery", faults: [
    { id: "back_crack", label: "Cracked back glass", pct: 0.10 },
    { id: "bent", label: "Bent chassis", pct: 0.20 },
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.12 },
    { id: "batt_swollen", label: "Battery swollen", pct: 0.25 },
  ]},
  { group: "Functional", faults: [
    { id: "cam_rear", label: "Rear camera not working", pct: 0.12 },
    { id: "port_charge", label: "Charging port faulty", pct: 0.10 },
    { id: "speaker", label: "Speaker not working", pct: 0.08 },
    { id: "biometric", label: "Face ID / fingerprint not working", pct: 0.10 },
  ]},
];

function retentionAt(months, points) {
  const pts = points || RETENTION_POINTS;
  if (months <= pts[0].m) return pts[0].r;
  for (let i = 0; i < pts.length - 1; i++) {
    if (months <= pts[i + 1].m) {
      const t = (months - pts[i].m) / (pts[i + 1].m - pts[i].m);
      return pts[i].r + t * (pts[i + 1].r - pts[i].r);
    }
  }
  const last = pts[pts.length - 1];
  return Math.max(0.04, last.r - (months - last.m) * 0.0015);
}
function ageMonths(releaseDate) {
  return Math.max(0, (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30));
}
function fmt(n, regionCode, regionsMap) {
  const r = (regionsMap || REGIONS)[regionCode] || REGIONS.AU;
  if (n == null || !Number.isFinite(Number(n))) return "—"; // no amount on the record yet
  const val = r.round >= 10 ? Math.round(n / r.round) * r.round : Math.round(n);
  return `${r.symbol}${val.toLocaleString()}`;
}

const STATUS_LABELS = {
  awaiting_shipment: "Awaiting device",
  received_inspecting: "Inspecting",
  revised_pending_customer: "Revised — awaiting customer",
  approved_paid: "Paid",
  rejected: "Rejected",
  returned: "Returned to customer",
  held: "Held (police)",
  cancelled: "Cancelled",
};
const FLOW = ["awaiting_shipment", "received_inspecting", "revised_pending_customer", "rejected", "approved_paid", "returned", "cancelled"];
const STATUS_COLOR = (s, brass, muted, red, green) => ({
  awaiting_shipment: muted, received_inspecting: brass, revised_pending_customer: "#B54708",
  approved_paid: green, rejected: red, held: red, returned: muted, cancelled: muted,
}[s] || muted);
// Every box ticked before money changes hands (second-hand dealer rules and our own fraud checks).
const CHECKS = [
  { id: "blacklist", label: "IMEI not blacklisted", short: "blacklist check", help: "Checked on the Unlock checker or the carrier's lookup" },
  { id: "account", label: "Find My / Google account off", short: "account removed", help: "Signed out and erased in front of you" },
  { id: "id", label: "Photo ID sighted", short: "ID sighted", help: "Name matches the order; keep the ID details" },
  { id: "matches", label: "Same phone as ordered", short: "model and storage match", help: "Model, storage and not a replica" },
];
const REJECT_REASONS = ["Blacklisted / reported stolen", "Account lock can't be removed", "Not the phone ordered", "Fake or replaced parts", "No valid ID", "Customer changed their mind", "Other"];

export default function StaffInspectionConsole() {
  const viewOnly = !!currentRole() && !hasArea("register"); // without the register area (e.g. Technicians) staff can look but not act
  const [orders, setOrders] = useState(null);
  const [config, setConfig] = useState(null);
  const [priceMatches, setPriceMatches] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [reassessFaults, setReassessFaults] = useState({});
  const [reassessTier, setReassessTier] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState(""); // "" | "reject"
  const [imei, setImei] = useState("");
  const [checks, setChecks] = useState({});
  const [addToStock, setAddToStock] = useState(true);
  const [needsRepair, setNeedsRepair] = useState(false);
  const [repairIssue, setRepairIssue] = useState("");
  const [payRef, setPayRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    (async () => {
      const [o, c, pm] = await Promise.all([loadJSON(ORDERS_KEY, true), loadJSON(CONFIG_KEY, true), loadJSON("price_match_requests", true)]);
      setOrders(o || []);
      setConfig(c);
      setPriceMatches(pm || []);
    })();
  }, []);

  const retentionPts = config?.retentionPoints || RETENTION_POINTS;
  const brandFactors = { ...BRAND_FACTOR, ...(config?.brandFactors || {}) };
  // Same tiers (with their quote "mode") as the customer quote, so re-assessment uses the same rules.
  const tiers = DEFAULT_TIERS.map((t) => ({ ...t, factor: config?.tiers?.find((x) => x.id === t.id)?.factor ?? t.factor }));
  const regions = useMemo(() => {
    const m = {};
    Object.keys(REGIONS).forEach((c) => { m[c] = { ...REGIONS[c], ...(config?.regions?.[c] || {}) }; });
    return m;
  }, [config]);
  const openCategory = orders?.find((o) => o.id === openId)?.device?.category;
  // The same checklist the customer saw for this kind of device (phone, tablet, laptop, watch).
  const faultGroups = useMemo(() => withSavedPcts(FAULT_GROUPS_BY_CATEGORY[openCategory] || PHONE_FAULT_GROUPS, config?.faultGroups), [config, openCategory]);
  const faultList = useMemo(() => {
    const groups = faultGroups;
    const list = [];
    groups.forEach((g) => g.faults.forEach((f) => list.push({ ...f, cosmetic: !!g.cosmetic })));
    return list;
  }, [faultGroups]);
  const faultById = useMemo(() => Object.fromEntries(faultList.map((f) => [f.id, f])), [faultList]);
  const holdingPct = config?.holdingCostPct ?? HOLDING_COST_PCT;

  const open = orders?.find((o) => o.id === openId);
  // Product photos the owner added in the Pricing Console; a drawn phone otherwise.
  const photos = useMemo(() => Object.fromEntries(mergeCatalog(config?.catalog).filter((d) => d.imageUrl).map((d) => [`${d.brand}|${d.model}`, d.imageUrl])), [config]);
  const thumb = (dev, size) => <DeviceArt type={inferDeviceType(dev.model, dev.category)} size={size} brand={dev.brand} model={dev.model} imageUrl={photos[`${dev.brand}|${dev.model}`]} />;

  const reassessed = useMemo(() => {
    if (!open) return null;
    const tier = tiers.find((t) => t.id === (reassessTier || open.tierId)) || tiers[0];
    // The order carries the exact Brand-New-tier base computed at quote time
    // (brandNewBase), so re-assessment uses precisely the same numbers the
    // customer saw — no reconstruction, no drift.
    // Mirrors the customer quote (instant-quote-calculator.jsx `calc`) step for step, so
    // approving with nothing changed pays exactly what the customer was quoted.
    const base = open.brandNewBase ?? open.quotedTotal;
    const tierBase = base * tier.factor;
    if (tier.mode === "parts") return { tier, tierBase, total: tierBase, lines: [] };
    let total = tierBase;
    const lines = [];
    if (tier.mode === "full" || tier.mode === "functional-only") {
      Object.keys(reassessFaults).forEach((fid) => {
        const f = faultById[fid];
        if (!reassessFaults[fid] || !f || (tier.mode === "functional-only" && f.cosmetic)) return;
        const amt = tierBase * f.pct;
        total -= amt;
        lines.push({ id: fid, amt });
      });
      if (open.hasAccessories) total += tierBase * ACCESSORY_BONUS_PCT;
    }
    total -= tierBase * holdingPct;
    total = Math.max(total, base * 0.05);
    return { tier, tierBase, total, lines };
  }, [open, reassessFaults, reassessTier, tiers, faultById, holdingPct]);

  // A customer may have gotten an approved price-match promise before or
  // after this order was submitted — look it up independently by email +
  // device rather than relying on it having been linked at approval time,
  // so the order arriving in either order still gets caught.
  const matchedPriceMatch = useMemo(() => {
    if (!open) return null;
    return priceMatches.find((pm) =>
      pm.status === "approved" &&
      pm.customerEmail?.toLowerCase() === open.customer.email?.toLowerCase() &&
      pm.device?.brand === open.device.brand && pm.device?.model === open.device.model
    ) || null;
  }, [open, priceMatches]);

  const staff = (() => { try { return window.shopAuth?.currentUser()?.username || ""; } catch (e) { return ""; } })();
  const isOwner = currentRole() === "admin";

  function openOrder(o) {
    setOpenId(o.id);
    setReassessTier(o.tierId);
    // Start from what the customer declared, so staff only add or remove what differs.
    const declared = new Set(o.faultLabels || []);
    const pre = {};
    (FAULT_GROUPS_BY_CATEGORY[o.device?.category] || PHONE_FAULT_GROUPS).forEach((g) => g.faults.forEach((f) => { if (declared.has(f.label)) pre[f.id] = true; }));
    setReassessFaults(pre);
    setNote(""); setMode(""); setImei(o.inspection?.imei || ""); setChecks({}); setNeedsRepair(false); setRepairIssue("");
    setAddToStock(true); setPayRef(""); setRejectReason(""); setMsg("");
  }

  async function updateOrder(id, patch) {
    setSaving(true);
    const list = await loadJSON(ORDERS_KEY, true) || orders || [];
    const next = list.map((o) => (o.id === id ? { ...o, ...patch, history: [...(o.history || []), { at: new Date().toISOString(), by: staff || "unattributed", status: patch.status || o.status, ...(patch.archived != null ? { archived: patch.archived } : {}) }] } : o));
    const ok = await saveJSON(ORDERS_KEY, next, true);
    setOrders(next);
    setSaving(false);
    return ok;
  }

  const ticked = Object.keys(reassessFaults).filter((k) => reassessFaults[k] && faultById[k]).map((k) => faultById[k].label);
  const imeiErr = imeiProblem(imei);
  const missingChecks = CHECKS.filter((c) => !checks[c.id]);
  const priceOk = !!reassessed && Number.isFinite(reassessed.total) && reassessed.total > 0;
  const readyToPay = !imeiErr && missingChecks.length === 0 && priceOk;

  // Paying is the end of inspection and the start of stock: one step records the
  // payout, puts the phone in stock (or straight onto the repair bench) and closes the order.
  async function payAndStock(total, extra = {}) {
    if (!open) return;
    // Someone else may have paid it in the meantime (two counters, two tabs).
    const fresh = (await loadJSON(ORDERS_KEY, true) || []).find((o) => o.id === open.id);
    if (fresh && (fresh.status === "approved_paid" || fresh.inventoryItemId)) { setOrders((list) => list.map((o) => (o.id === fresh.id ? fresh : o))); setMsg("This trade-in was already paid by someone else, nothing was done."); return; }
    const now = new Date().toISOString();
    let item = null, repairMsg = "";
    if (addToStock) {
      item = newStockItem({ brand: open.device.brand, model: open.device.model, storage: open.device.storage, imei, costBasis: total,
        region: open.region, currency: open.currency, sourceOrderId: open.id, faults: ticked, staff, needsRepair });
      const added = await addToSharedList("inventory", item);
      if (!added) { setMsg("Couldn't add the phone to stock, nothing was changed. Try again."); return; }
      if (needsRepair) {
        const job = newShopRepairJob({ item, issue: repairIssue.trim() || (ticked.length ? `Fix: ${ticked.join(", ")}` : "Fix up to sell"), staff });
        repairMsg = (await addToSharedList("repair_tickets", job)) ? ` Repair job ${job.id} is on the bench.` : " Couldn't open the repair job — open it from Repairs.";
      }
    }
    await updateOrder(open.id, {
      status: "approved_paid", paidAt: now,
      inspection: { confirmedTotal: total, staffNote: note, inspectedAt: now, inspectedBy: staff, tierId: reassessed?.tier.id || open.tierId, faultsFound: ticked,
        imei: cleanImei(imei), checks: CHECKS.map((c) => c.id), paidVia: open.customer.payoutMethod || "cash", paidRef: payRef.trim(), ...extra },
      ...(item ? { receivedToInventory: true, inventoryItemId: item.id } : {}),
    });
    setOpenId(null);
    setDone(`${open.id}: paid ${fmt(total, open.region, regions)}.${item ? ` ${item.id} is ${needsRepair ? "waiting for repair" : "in stock"}.` : ""}${repairMsg}`);
  }

  async function handleRevise() {
    if (!open || !reassessed) return;
    await updateOrder(open.id, {
      status: "revised_pending_customer",
      inspection: { confirmedTotal: reassessed.total, staffNote: note, inspectedAt: new Date().toISOString(), inspectedBy: staff, tierId: reassessed.tier.id, faultsFound: ticked, imei: cleanImei(imei) },
    });
    setOpenId(null);
    setDone(`${open.id}: revised offer of ${fmt(reassessed.total, open.region, regions)} sent. It shows on the customer's Track page.`);
  }
  async function handleReject() {
    if (!open || !rejectReason) return;
    await updateOrder(open.id, { status: "rejected", rejection: { reason: rejectReason, note: note.trim(), at: new Date().toISOString(), by: staff, imei: cleanImei(imei) } });
    setMode("");
  }
  async function setStatus(status, extra = {}) {
    if (!open) return;
    await updateOrder(open.id, { status, ...extra });
    if (status !== "received_inspecting") setOpenId(null);
  }
  async function toggleArchive(o) { await updateOrder(o.id, { archived: !o.archived }); setOpenId(null); }

  const C = { ink: "var(--mr-bg)", panel: "var(--mr-surface)", panel2: "var(--mr-surface-2)", paper: "var(--mr-text)", muted: "var(--mr-muted)", brass: "var(--mr-brand)", brassDim: "var(--mr-brand-soft)", red: "var(--mr-bad)", redDim: "color-mix(in srgb, var(--mr-bad) 12%, transparent)", green: "var(--mr-ok)", greenDim: "color-mix(in srgb, var(--mr-ok) 12%, transparent)", amber: "#B54708", line: "var(--mr-line)" };
  const card = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 14 };
  const chip = (on, tone = C.brass) => ({ padding: "9px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    border: `1.5px solid ${on ? tone : C.line}`, background: on ? (tone === C.red ? C.redDim : tone === C.green ? C.greenDim : C.brassDim) : "var(--mr-surface)", color: on ? tone : C.paper });
  const bigBtn = (bg, fg = "#fff", on = true) => ({ flex: "1 1 180px", minHeight: 50, padding: "12px 16px", borderRadius: 14, border: "none", background: on ? bg : "var(--mr-surface-2)", color: on ? fg : "var(--mr-muted)",
    fontSize: 15, fontWeight: 700, cursor: on ? "pointer" : "not-allowed", fontFamily: "inherit" });
  const outBtn = (tone) => ({ flex: "1 1 160px", minHeight: 46, padding: "10px 14px", borderRadius: 14, border: `1.5px solid ${tone}`, background: "var(--mr-surface)", color: tone, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const h3 = { fontSize: 15, fontWeight: 700, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 };
  const step = (n) => <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.brass, color: "#fff", display: "inline-grid", placeItems: "center", fontSize: 12.5, fontWeight: 800 }}>{n}</span>;

  const q = search.trim().toLowerCase();
  const visibleOrders = (orders || []).filter((o) => (filter === "archived" ? o.archived : !o.archived));
  const filtered = visibleOrders
    .filter((o) => filter === "all" || filter === "archived" || o.status === filter)
    .filter((o) => !q || [o.id, o.customer?.name, o.customer?.phone, o.customer?.email, o.device?.brand, o.device?.model, o.inspection?.imei].some((v) => String(v || "").toLowerCase().includes(q)));
  const count = (s) => visibleOrders.filter((o) => o.status === s).length;

  if (orders === null) {
    return <div style={{ color: C.muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading trade-ins…</div>;
  }

  const outcome = open && (open.status === "received_inspecting" || open.status === "awaiting_shipment") && !viewOnly;
  const statusChip = (s) => <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--mr-surface-2)", color: STATUS_COLOR(s, C.brass, C.muted, C.red, C.green) }}>{STATUS_LABELS[s] || s}</span>;

  return (
    <div style={{ color: C.paper, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "22px 16px 60px" }}>
        {!open && (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, letterSpacing: "-0.01em" }}>Trade-ins</div>
                <div style={{ color: C.muted, fontSize: 13.5 }}>Mark a phone received, check it, then pay, revise or reject. Paying puts it straight into stock.</div>
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, order, model or IMEI" aria-label="Search trade-ins"
                style={{ flex: "1 1 260px", maxWidth: 380, padding: "11px 14px", border: `1px solid ${C.line}`, background: "var(--mr-surface)", fontSize: 14 }} />
            </div>
            {done && <div role="status" style={{ ...card, background: C.greenDim, borderColor: "color-mix(in srgb, var(--mr-ok) 35%, transparent)", color: C.green, fontWeight: 600, fontSize: 14 }}>✓ {done}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {["all", ...FLOW, "archived"].map((s) => (
                <button key={s} onClick={() => setFilter(s)} style={chip(filter === s)}>
                  {s === "all" ? `All (${visibleOrders.length})` : s === "archived" ? "Archived" : `${STATUS_LABELS[s]} (${count(s)})`}
                </button>
              ))}
            </div>
            {filtered.length === 0 && <div style={{ ...card, color: C.muted, fontSize: 14 }}>{q ? "Nothing matches that search." : "No trade-ins here."}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
              {filtered.map((o) => (
                <button key={o.id} onClick={() => openOrder(o)}
                  style={{ ...card, marginBottom: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderLeft: `4px solid ${STATUS_COLOR(o.status, C.brass, C.muted, C.red, C.green)}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{o.id}</span>{statusChip(o.status)}
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ flex: "none" }}>{thumb(o.device, 52)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 700 }}>{o.device.brand} {o.device.model}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{[o.device.storage, o.tierLabel, o.customer?.name].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>{o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""}{o.priceCheck && o.priceCheck.verified === false ? " · ⚠ check price" : ""}</span>
                    <b>{fmt(o.inspection?.confirmedTotal ?? o.quotedTotal, o.region, regions)}</b>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {open && (
          <div>
            <button onClick={() => setOpenId(null)} style={{ background: "none", border: "none", color: C.brass, fontSize: 14, fontWeight: 700, marginBottom: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>← All trade-ins</button>

            <div style={{ ...card, display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 14, alignItems: "start" }}>
              <div>{thumb(open.device, 72)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}><span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{open.id}</span>{statusChip(open.status)}{open.archived && <span style={{ fontSize: 12, color: C.muted }}>· archived</span>}</div>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22 }}>{open.device.brand} {open.device.model}</div>
                <div style={{ fontSize: 13.5, color: C.muted, marginTop: 2 }}>{open.device.storage} · customer said "{open.tierLabel}"{open.faultLabels?.length ? ` · declared: ${open.faultLabels.join(", ")}` : " · no faults declared"}{open.hasAccessories ? " · with box & charger" : ""}</div>
                <div style={{ fontSize: 14, marginTop: 10 }}><b>{open.customer.name}</b> · <a href={`tel:${open.customer.phone}`} style={{ color: C.brass }}>{open.customer.phone}</a> · {open.customer.email}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>Name on ID: {open.customer.idOwnerName || open.customer.name}. {open.fulfillment === "post" ? "Posting it in." : "In person."}</div>
                {open.customer.payoutMethod && (
                  <div style={{ fontSize: 13, marginTop: 6 }}>Payout: <b>{open.customer.payoutMethod === "cash" ? "💵 Cash on collection / drop-off" : open.customer.payoutMethod === "bank" ? `Bank · BSB ${open.customer.bankBsb} · Acc ${open.customer.bankAccountNumber}` : `PayPal · ${open.customer.paypalEmail}`}</b></div>
                )}
                {open.priceCheck && open.priceCheck.verified === false && (
                  <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 8, fontWeight: 600 }}>
                    ⚠ {open.priceCheck.quoteTooHigh ? `Quoted above the price list (about ${fmt(open.priceCheck.maxQuote, open.region, regions)} at most). Don't honour it without checking.` : open.priceCheck.reason ? `Couldn't verify this quote (${open.priceCheck.reason}).` : "The price from the customer's browser didn't match the price list. The price below uses the shop's own list."}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12.5, color: C.muted }}>Quoted</div>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22 }}>{fmt(open.quotedTotal, open.region, regions)}</div>
              </div>
            </div>

            {viewOnly && <div style={{ ...card, fontSize: 14, color: C.muted }}>View only: ask the Counter, a Manager or the Owner to update this trade-in.</div>}

            {!viewOnly && open.status === "awaiting_shipment" && (
              <div style={card}>
                <div style={h3}>Waiting for the phone</div>
                {open.fulfillment === "post" && <ShippingTrackingField order={open} onSave={(shipping) => updateOrder(open.id, { shipping })} colors={{ paper: C.paper, muted: C.muted, brass: C.brass, panel2: C.panel2, line: C.line }} />}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button onClick={() => setStatus("received_inspecting", { receivedAt: new Date().toISOString() })} style={bigBtn(C.brass)}>Phone is here — start inspection</button>
                  <button onClick={() => setStatus("cancelled", { cancellation: { reason: "Customer cancelled", at: new Date().toISOString(), by: staff } })} style={outBtn(C.muted)}>Customer cancelled</button>
                  <button onClick={() => setStatus("cancelled", { cancellation: { reason: "No-show / never arrived", at: new Date().toISOString(), by: staff } })} style={outBtn(C.muted)}>No-show</button>
                </div>
              </div>
            )}

            {outcome && open.status === "received_inspecting" && (
              <>
                <div style={card}>
                  <div style={h3}>{step(1)} Checks before paying</div>
                  <label style={{ display: "block", fontSize: 13, color: C.muted, marginBottom: 6 }}>IMEI (dial *#06#)</label>
                  <input value={imei} onChange={(e) => setImei(e.target.value)} inputMode="numeric" placeholder="15 digits" aria-invalid={!!imei && !!imeiErr}
                    style={{ width: "100%", maxWidth: 320, padding: "11px 14px", border: `1.5px solid ${imei && imeiErr ? C.red : C.line}`, fontSize: 16, letterSpacing: ".06em", background: "var(--mr-surface)" }} />
                  {imei && imeiErr && <div style={{ fontSize: 12.5, color: C.red, marginTop: 4 }}>{imeiErr}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 12 }}>
                    {CHECKS.map((c) => (
                      <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 12px", borderRadius: 12, border: `1.5px solid ${checks[c.id] ? C.green : C.line}`, background: checks[c.id] ? C.greenDim : "var(--mr-surface)", cursor: "pointer", fontSize: 13.5 }}>
                        <input type="checkbox" checked={!!checks[c.id]} onChange={(e) => setChecks((s) => ({ ...s, [c.id]: e.target.checked }))} style={{ marginTop: 2 }} />
                        <span><b>{c.label}</b><span style={{ display: "block", color: C.muted, fontSize: 12 }}>{c.help}</span></span>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>Failed a check? Use <b>Reject</b> below with the reason.</div>
                </div>

                <div style={card}>
                  <div style={h3}>{step(2)} Condition you found</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                    {tiers.map((t) => <button key={t.id} onClick={() => setReassessTier(t.id)} style={chip((reassessTier || open.tierId) === t.id)}>{t.label}</button>)}
                  </div>
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Faults found {ticked.length ? `(${ticked.length} ticked)` : "(none)"} — the customer's declared faults start ticked. Open a section to change.</div>
                  {faultGroups.map((g) => {
                    const n = g.faults.filter((f) => reassessFaults[f.id]).length;
                    return (
                      <details key={g.group} open={n > 0} style={{ border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 8, background: "var(--mr-surface)", overflow: "hidden" }}>
                        <summary style={{ cursor: "pointer", padding: "12px 14px", fontSize: 14, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                          <span>{g.group}</span><span style={{ fontSize: 12.5, color: n ? C.red : C.muted, fontWeight: 600 }}>{n ? `${n} ticked` : `${g.faults.length} checks`}</span>
                        </summary>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "4px 14px 14px" }}>
                          {g.faults.map((f) => (
                            <button key={f.id} type="button" onClick={() => setReassessFaults((s) => ({ ...s, [f.id]: !s[f.id] }))} aria-pressed={!!reassessFaults[f.id]} style={{ ...chip(!!reassessFaults[f.id], C.red), fontWeight: 500, fontSize: 13 }}>
                              {f.label} <span style={{ opacity: 0.7 }}>−{Math.round(f.pct * 100)}%</span>
                            </button>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>

                <div style={card}>
                  <div style={h3}>{step(3)} Outcome</div>
                  {reassessed && (
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline", marginBottom: 12 }}>
                      <span style={{ fontSize: 13.5, color: C.muted }}>Quoted <b style={{ color: C.paper }}>{fmt(open.quotedTotal, open.region, regions)}</b></span>
                      <span style={{ fontSize: 13.5, color: C.muted }}>On inspection <b style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, color: Math.round(reassessed.total) < Math.round(open.quotedTotal) ? C.red : C.green }}>{fmt(reassessed.total, open.region, regions)}</b></span>
                    </div>
                  )}
                  {matchedPriceMatch && (
                    <div style={{ border: `1.5px solid ${C.green}`, borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13.5 }}>
                      Approved price match {matchedPriceMatch.id} (vs {matchedPriceMatch.competitorName}): promised <b>{fmt(matchedPriceMatch.approvedPrice, open.region, regions)}</b>. Paying below honours it.
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13.5, marginBottom: 10 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={addToStock} onChange={(e) => setAddToStock(e.target.checked)} />Add to stock when paid</label>
                    {addToStock && <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={needsRepair} onChange={(e) => setNeedsRepair(e.target.checked)} />Needs repair before selling</label>}
                  </div>
                  {addToStock && needsRepair && <input value={repairIssue} onChange={(e) => setRepairIssue(e.target.value)} placeholder={ticked.length ? `What to fix (default: ${ticked.join(", ")})` : "What to fix"} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.line}`, fontSize: 14, marginBottom: 10, background: "var(--mr-surface)" }} />}
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (the customer sees it on a revised offer; required to revise or reject)"
                    style={{ width: "100%", minHeight: 56, padding: 12, border: `1px solid ${C.line}`, background: "var(--mr-surface)", color: C.paper, fontSize: 14, marginBottom: 10 }} />
                  {open.customer.payoutMethod && open.customer.payoutMethod !== "cash" && (
                    <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={`${open.customer.payoutMethod === "bank" ? "Bank transfer" : "PayPal"} reference (optional)`} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.line}`, fontSize: 14, marginBottom: 10, background: "var(--mr-surface)" }} />
                  )}
                  {!priceOk && <div role="alert" style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>This order has no quoted price, so there's nothing to pay against. Set the price with a revised offer, or reject it.</div>}
                  {priceOk && !readyToPay && <div style={{ fontSize: 13, color: C.amber, marginBottom: 10 }}>To pay: {[imeiErr && "a valid IMEI", ...missingChecks.map((c) => c.short)].filter(Boolean).join(", ")}.</div>}
                  {msg && <div role="alert" style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>{msg}</div>}
                  {mode !== "reject" ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {matchedPriceMatch
                        ? <button disabled={saving || !readyToPay} onClick={() => payAndStock(matchedPriceMatch.approvedPrice, { priceMatchId: matchedPriceMatch.id, staffNote: `Price match honored (${matchedPriceMatch.id})` })} style={bigBtn(C.green, "#fff", readyToPay && !saving)}>Pay {fmt(matchedPriceMatch.approvedPrice, open.region, regions)} (price match)</button>
                        : <button disabled={saving || !readyToPay || !reassessed} onClick={() => payAndStock(reassessed.total)} style={bigBtn(C.green, "#fff", readyToPay && !saving)}>Pay {reassessed ? fmt(reassessed.total, open.region, regions) : ""}{addToStock ? (needsRepair ? " → repair" : " → stock") : ""}</button>}
                      <button disabled={saving || !note.trim() || !priceOk} onClick={handleRevise} style={{ ...outBtn(C.brass), opacity: note.trim() && priceOk ? 1 : 0.5 }}>Send revised offer</button>
                      <button onClick={() => setMode("reject")} style={outBtn(C.red)}>Reject</button>
                    </div>
                  ) : (
                    <div style={{ border: `1.5px solid ${C.red}`, borderRadius: 14, padding: 14 }}>
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>Why can't we buy it?</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        {REJECT_REASONS.map((r) => <button key={r} onClick={() => setRejectReason(r)} style={chip(rejectReason === r, C.red)}>{r}</button>)}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button disabled={!rejectReason || saving} onClick={handleReject} style={bigBtn(C.red, "#fff", !!rejectReason && !saving)}>Reject trade-in</button>
                        <button onClick={() => setMode("")} style={outBtn(C.muted)}>Back</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {!viewOnly && open.status === "revised_pending_customer" && (
              <div style={card}>
                <div style={h3}>Waiting on the customer</div>
                <div style={{ fontSize: 14, color: C.muted, marginBottom: 12 }}>Revised to <b style={{ color: C.paper }}>{fmt(open.inspection?.confirmedTotal, open.region, regions)}</b>{open.inspection?.staffNote ? ` — "${open.inspection.staffNote}"` : ""}. They can accept or decline on the Track page, or tell you in person.</div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13.5, marginBottom: 10 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={addToStock} onChange={(e) => setAddToStock(e.target.checked)} />Add to stock when paid</label>
                  {addToStock && <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={needsRepair} onChange={(e) => setNeedsRepair(e.target.checked)} />Needs repair before selling</label>}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button disabled={saving} onClick={() => { setReassessFaults({}); payAndStock(open.inspection?.confirmedTotal ?? open.quotedTotal, { staffNote: open.inspection?.staffNote || "", faultsFound: open.inspection?.faultsFound || [], tierId: open.inspection?.tierId || open.tierId }); }} style={bigBtn(C.green)}>Accepted — pay {fmt(open.inspection?.confirmedTotal, open.region, regions)}</button>
                  <button onClick={() => setStatus("returned", { returnedAt: new Date().toISOString() })} style={outBtn(C.muted)}>Declined — returned to customer</button>
                </div>
              </div>
            )}

            {!viewOnly && open.status === "rejected" && (
              <div style={{ ...card, borderColor: "#F3C7C2" }}>
                <div style={h3}>Rejected: {open.rejection?.reason}</div>
                {open.rejection?.note && <div style={{ fontSize: 14, color: C.muted, marginBottom: 10 }}>"{open.rejection.note}"</div>}
                <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 12 }}>{/stolen|blacklist/i.test(open.rejection?.reason || "") ? "Don't hand a blacklisted phone back without checking with the police first." : "Give the phone back to the customer and mark it below."}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setStatus("returned", { returnedAt: new Date().toISOString() })} style={bigBtn(C.brass)}>Returned to customer</button>
                  <button onClick={() => setStatus("held", { heldAt: new Date().toISOString() })} style={outBtn(C.red)}>Held / handed to police</button>
                  <button onClick={() => setStatus("received_inspecting")} style={outBtn(C.muted)}>Undo — inspect again</button>
                </div>
              </div>
            )}

            {["approved_paid", "returned", "cancelled", "held"].includes(open.status) && (
              <div style={card}>
                <div style={h3}>{STATUS_LABELS[open.status]}</div>
                <div style={{ fontSize: 14, color: C.muted }}>
                  {open.status === "approved_paid" && !viewOnly && !open.inventoryItemId && !open.receivedToInventory && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: C.paper, marginBottom: 6 }}>The customer accepted online, so the phone isn't in stock yet.</div>
                      <input value={imei} onChange={(e) => setImei(e.target.value)} inputMode="numeric" placeholder="IMEI" style={{ padding: "10px 12px", border: `1px solid ${C.line}`, fontSize: 15, marginRight: 8, background: "var(--mr-surface)" }} />
                      <button disabled={!!imeiErr || saving} onClick={async () => {
                        const item = newStockItem({ brand: open.device.brand, model: open.device.model, storage: open.device.storage, imei, costBasis: open.inspection?.confirmedTotal ?? open.quotedTotal,
                          region: open.region, currency: open.currency, sourceOrderId: open.id, faults: open.inspection?.faultsFound || open.faultLabels || [], staff });
                        if (await addToSharedList("inventory", item)) { await updateOrder(open.id, { receivedToInventory: true, inventoryItemId: item.id, inspection: { ...(open.inspection || {}), imei: cleanImei(imei) } }); setDone(`${open.id}: ${item.id} added to stock.`); setOpenId(null); }
                        else setMsg("Couldn't add it to stock. Try again.");
                      }} style={{ ...bigBtn(C.brass, "#fff", !imeiErr), flex: "0 0 auto" }}>Add to stock</button>
                      {imei && imeiErr && <div style={{ color: C.red, fontSize: 12.5, marginTop: 4 }}>{imeiErr}</div>}
                    </div>
                  )}
                  {open.status === "approved_paid" && <>Paid {fmt(open.inspection?.confirmedTotal, open.region, regions)}{open.inspection?.paidVia ? ` by ${open.inspection.paidVia}` : ""}{open.inspection?.paidRef ? ` (ref ${open.inspection.paidRef})` : ""}{open.inspection?.inspectedBy ? ` · ${open.inspection.inspectedBy}` : ""}{open.inspection?.imei ? ` · IMEI ${open.inspection.imei}` : ""}. {open.inventoryItemId ? `In stock as ${open.inventoryItemId}.` : open.receivedToInventory ? "Added to stock." : ""}</>}
                  {open.status === "cancelled" && <>{open.cancellation?.reason || "Cancelled"}.</>}
                  {open.status === "returned" && <>The phone went back to the customer.</>}
                  {open.status === "held" && <>Held: {open.rejection?.reason}.</>}
                </div>
                {(open.history || []).length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12.5, color: C.muted }}>
                    {open.history.slice(-5).map((h, i) => <div key={i}>{new Date(h.at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} · {h.by} · {h.archived === true ? "archived" : h.archived === false ? "restored" : STATUS_LABELS[h.status] || h.status}</div>)}
                  </div>
                )}
              </div>
            )}

            {!viewOnly && (isOwner || ["returned", "cancelled", "held", "approved_paid"].includes(open.status)) && (
              <button onClick={() => toggleArchive(open)} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", padding: 0 }}>
                {open.archived ? "Restore to the list" : "Archive (hide from the list)"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Real carrier API integration (Australia Post eParcel/MyPost Business,
// or an aggregator like Sendle/Starshipit) needs an actual business
// shipping contract this system can't create for you — so this doesn't
// pretend to auto-generate a label. What it does instead: once you've
// created the real label through whatever carrier account you set up,
// paste the real tracking number here so the customer can actually
// follow their parcel, instead of just knowing an address to write on
// a box. Wiring this to auto-fill from a real carrier API later is a
// backend-only change — this field doesn't need to know how it got filled.
function ShippingTrackingField({ order, onSave, colors }) {
  const { paper, muted, brass, panel2, line } = colors;
  const [trackingNumber, setTrackingNumber] = useState(order.shipping?.trackingNumber || "");
  const [carrier, setCarrier] = useState(order.shipping?.carrier || "Australia Post");
  const [saved, setSaved] = useState(!!order.shipping?.trackingNumber);

  return (
    <div style={{ marginTop: 10, padding: 10, border: `1px dashed ${line}`, borderRadius: 3 }}>
      <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>
        {saved ? "Tracking number on file — customer can see this when they check their order." : "Once you've booked the shipment (AusPost MyPost Business, Sendle, etc.), record the real tracking number here."}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={trackingNumber} onChange={(e) => { setTrackingNumber(e.target.value); setSaved(false); }} placeholder="Tracking number"
          style={{ flex: 1, padding: "7px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 12.5, outline: "none" }} />
        <select value={carrier} onChange={(e) => { setCarrier(e.target.value); setSaved(false); }}
          style={{ padding: "7px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 12.5 }}>
          <option>Australia Post</option>
          <option>Sendle</option>
          <option>StarTrack</option>
          <option>Other</option>
        </select>
        <button disabled={!trackingNumber.trim() || saved} onClick={() => { onSave({ trackingNumber: trackingNumber.trim(), carrier, issuedAt: new Date().toISOString() }); setSaved(true); }}
          style={{ padding: "7px 12px", borderRadius: 3, border: "none", background: trackingNumber.trim() && !saved ? brass : line, color: trackingNumber.trim() && !saved ? "#fff" : muted, fontSize: 12, cursor: trackingNumber.trim() && !saved ? "pointer" : "default" }}>
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
