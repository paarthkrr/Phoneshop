import { UnitPhotos } from "./spin-360.jsx";
import FlowBoard, { StatTiles, LayoutSwitch, useLayout, lastTime } from "./flow-board.jsx";
import MessageCustomer, { orderMessages } from "./customer-messages.jsx";
import { DEFAULT_CATALOG, mergeCatalog } from "./device-catalog.js";
import { FAULT_GROUPS_BY_CATEGORY as SHARED_FAULT_GROUPS } from "./instant-quote-calculator.jsx";
import { newShopRepairJob, addToSharedList, GRADES, targetPrice, SOURCES, sourceOf, imeiProblem, cleanImei, agedDrop, marketplaceListing } from "./device-flow.js";
import PhonePassport from "./phone-passport.jsx";
import DeviceArt, { inferDeviceType } from "./device-art.jsx";
import { sydneyDay, sydneyToday } from "./sydney-time.js";
import React, { useState, useEffect, useMemo } from "react";
import { ScanButton } from "./barcode-scanner.jsx";
import { generateBarcode } from "./barcode-gen.js";
import SalesTab from "./sales-tab.jsx";
import { hasArea } from "./roles.js";
import { publishPatch, pricePatch, wasPrice, MIN_DAYS_AT_OLD_PRICE } from "./price-history.js";

/* =================================================================
   POS + INVENTORY
   Three real workflows: buy a device at the counter (walk-in),
   receive an already-approved online trade-in into physical stock,
   and sell graded inventory to a customer. Shares the same pricing
   formula as the calculator/staff console so a counter quote and an
   online quote for the same phone never disagree.
================================================================= */

const CONFIG_KEY = "pricing-config";
const ORDERS_KEY = "orders";
const INVENTORY_KEY = "inventory";
const SALES_KEY = "sales";

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
const genId = (prefix) => `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
const ensureBarcode = (item) => item.barcode || item.imei || generateBarcode(item.brand?.slice(0,2) || "MR");
const ACCESSORY_LOW_STOCK_THRESHOLD = 2;
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

/* ---- Pricing formula, identical to the calculator + staff console ---- */
const RETENTION_POINTS = [
  { m: 0, r: 0.80 }, { m: 12, r: 0.68 }, { m: 24, r: 0.63 },
  { m: 36, r: 0.566 }, { m: 48, r: 0.44 }, { m: 60, r: 0.311 },
  { m: 72, r: 0.22 }, { m: 84, r: 0.15 }, { m: 96, r: 0.10 }, { m: 120, r: 0.06 },
];
const BRAND_FACTOR = { Apple: 1.00, Samsung: 0.88, Google: 0.80, OnePlus: 0.72, Xiaomi: 0.60, Oppo: 0.68, Vivo: 0.65, Motorola: 0.62, Nothing: 0.58 };
const CATEGORY_FACTOR = { phone: 1.00, tablet: 1.05, laptop: 1.15, watch: 0.70 };
const TIERS = [
  { id: "new", label: "Brand New", factor: 1.00 },
  { id: "asnew", label: "Like New", factor: 0.94 },
  { id: "good", label: "Good", factor: 0.89 },
  { id: "fair", label: "Fair", factor: 0.75 },
  { id: "parts", label: "Faulty / For Parts", factor: 0.09 },
];
const REGIONS = {
  AU: { symbol: "A$", mult: 1.00, round: 1 }, US: { symbol: "$", mult: 0.70, round: 1 },
  UK: { symbol: "£", mult: 0.46, round: 1 }, IN: { symbol: "₹", mult: 37, round: 10 }, AE: { symbol: "AED ", mult: 2.35, round: 1 },
};
const HOLDING_COST_PCT = 0.02;
// Fallback catalog, identical to the admin console's default so a counter
// quote matches an online quote for the same phone even before the admin
// console has ever been opened. Keep these two lists in sync.
// Device catalogue now lives in device-catalog.js (shared by every tool).
const FAULT_GROUPS_DEFAULT = [
  { group: "Display", faults: [
    { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
    { id: "touch_dead", label: "Touch completely unresponsive", pct: 0.35 },
  ]},
  { group: "Body & Battery", faults: [
    { id: "back_crack", label: "Cracked back glass", pct: 0.10 },
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.12 },
  ]},
  { group: "Functional", faults: [
    { id: "cam_rear", label: "Rear camera not working", pct: 0.12 },
    { id: "port_charge", label: "Charging port faulty", pct: 0.10 },
  ]},
];
const FAULT_GROUPS_TABLET = [
  { group: "Display", faults: [
    { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
    { id: "touch_dead", label: "Touch completely unresponsive", pct: 0.35 },
  ]},
  { group: "Body & Battery", faults: [
    { id: "back_crack", label: "Cracked back casing", pct: 0.10 },
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.12 },
  ]},
  { group: "Functional", faults: [
    { id: "cam_rear", label: "Rear camera not working", pct: 0.10 },
    { id: "port_charge", label: "Charging port faulty", pct: 0.10 },
    { id: "stylus_pair", label: "Apple Pencil / stylus won't pair", pct: 0.05 },
  ]},
];
const FAULT_GROUPS_LAPTOP = [
  { group: "Display", faults: [
    { id: "screen_crack", label: "Cracked screen", pct: 0.30 },
    { id: "hinge_issue", label: "Hinge loose, stiff, or broken", pct: 0.15 },
  ]},
  { group: "Battery & Casing", faults: [
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.15 },
    { id: "batt_swollen", label: "Battery swollen (safety issue)", pct: 0.30 },
  ]},
  { group: "Keyboard & Ports", faults: [
    { id: "trackpad_issue", label: "Trackpad unresponsive or erratic", pct: 0.12 },
    { id: "keys_sticky", label: "Keys sticky, missing, or unresponsive", pct: 0.10 },
    { id: "port_usb", label: "USB-C / Thunderbolt port not working", pct: 0.10 },
    { id: "wont_boot", label: "Won't boot / major software issue", pct: 0.20 },
  ]},
];
const FAULT_GROUPS_WATCH = [
  { group: "Display & Body", faults: [
    { id: "screen_crack", label: "Cracked screen / crystal", pct: 0.25 },
    { id: "band_damaged", label: "Band or strap damaged", pct: 0.05 },
    { id: "back_crack", label: "Cracked back / ceramic casing", pct: 0.10 },
  ]},
  { group: "Battery & Function", faults: [
    { id: "batt_nocharge", label: "Won't hold charge / won't charge", pct: 0.20 },
    { id: "crown_button", label: "Crown or button not working", pct: 0.10 },
    { id: "gps_cellular", label: "GPS / cellular not connecting", pct: 0.10 },
    { id: "waterproof_seal", label: "Water resistance seal compromised", pct: 0.12 },
  ]},
];
const FAULT_GROUPS_BY_CATEGORY = SHARED_FAULT_GROUPS; // same checklist as the customer quote and the inspection console

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
function ageMonths(releaseDate) { return Math.max(0, (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30)); }
// Receipts and tax invoices show exact cents (GST is price/11, e.g. A$81.73).
function fmtCents(n, regionCode, regionsMap) {
  const r = (regionsMap || REGIONS)[regionCode] || REGIONS.AU;
  return `${r.symbol}${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmt(n, regionCode, regionsMap) {
  const r = (regionsMap || REGIONS)[regionCode] || REGIONS.AU;
  const val = r.round >= 10 ? Math.round(n / r.round) * r.round : Math.round(n);
  return `${r.symbol}${val.toLocaleString()}`;
}


/* ---- Code 39 barcode, hand-rolled — no external library available in
   this environment. Standard published Code 39 pattern table (9 bars/
   spaces per char, 1=wide, 0=narrow). Verified against the spec, but
   not tested against a physical scanner — worth a real scan test
   before relying on it for warehouse use. ---- */
const CODE39 = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000",
  "4": "000110001", "5": "100110000", "6": "001110000", "7": "000100101",
  "8": "100100100", "9": "001100100", A: "100001001", B: "001001001",
  C: "101001000", D: "000011001", E: "100011000", F: "001011000",
  G: "000001101", H: "100001100", I: "001001100", J: "000011100",
  K: "100000011", L: "001000011", M: "101000010", N: "000010011",
  O: "100010010", P: "001010010", Q: "000000111", R: "100000110",
  S: "001000110", T: "000010110", U: "110000001", V: "011000001",
  W: "111000000", X: "010010001", Y: "110010000", Z: "011010000",
  "-": "010000101", ".": "110000100", " ": "011000100", "*": "010010100",
};
function Code39Barcode({ value, height = 50, narrow = 2 }) {
  const chars = ("*" + value.toUpperCase().replace(/[^0-9A-Z\-. ]/g, "") + "*").split("");
  let x = 0;
  const bars = [];
  chars.forEach((ch, ci) => {
    const pattern = CODE39[ch] || CODE39["-"];
    for (let i = 0; i < 9; i++) {
      const isBar = i % 2 === 0;
      const w = pattern[i] === "1" ? narrow * 2.5 : narrow;
      if (isBar) bars.push(<rect key={`${ci}-${i}`} x={x} y={0} width={w} height={height} fill="#000" />);
      x += w;
    }
    x += narrow; // inter-character gap
  });
  return <svg width={x} height={height} viewBox={`0 0 ${x} ${height}`}>{bars}</svg>;
}

const TABS = ["Buy", "Quick Add", "Receive Orders", "Inventory", "Accessories", "Web Orders", "Sell", "Sales"];
const ACCESSORIES_KEY = "accessories";
const ACCESSORY_CATEGORIES = ["Cases & covers", "Screen protectors", "Chargers & cables", "DIY repair kits", "Audio", "Power banks", "Other"];

const STAFF_KEY = "staff_on_shift";
// If this page was deployed with real login (storage-shim.js's mountLoginGate),
// window.shopAuth.currentUser() returns the actually-authenticated staff
// member. Inside Claude.ai there's no such backend, so this is null there —
// falls back to the free-text "staff_on_shift" field either way, same
// graceful-degradation pattern as everything else in this system.
function getAuthedUser() {
  try {
    return (typeof window !== "undefined" && window.shopAuth && typeof window.shopAuth.currentUser === "function")
      ? window.shopAuth.currentUser() : null;
  } catch (e) {
    return null;
  }
}

export default function POSInventory() {
  const [tab, setTab] = useState("Buy");
  const [staffName, setStaffName] = useState("");
  const [authedUser, setAuthedUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [accessories, setAccessories] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [accessoryOrders, setAccessoryOrders] = useState([]);

  useEffect(() => {
    (async () => {
      const [c, o, inv, s, staff, acc, po, ao] = await Promise.all([
        loadJSON(CONFIG_KEY, true), loadJSON(ORDERS_KEY, true), loadJSON(INVENTORY_KEY, true), loadJSON(SALES_KEY, true), loadJSON(STAFF_KEY, false), loadJSON(ACCESSORIES_KEY, true), loadJSON("purchase_orders", true), loadJSON("accessory_orders", true),
      ]);
      setConfig(c); setOrders(o || []); // Merge with localStorage (quick-add)
        let localInv = [];
        try { localInv = JSON.parse(localStorage.getItem('inventory') || '[]'); } catch {}
        const merged = [...(inv || []), ...localInv.filter(l => !(inv || []).some(i => i.id === l.id))];
        // Quick Add (USB scanner) saved phones as "available"; everywhere else that's "in stock".
        // Quick Add also kept its buy price only in "price"; the P&L and margins read costBasis.
        setInventory(merged.map((i) => {
          let x = i.status === "available" ? { ...i, status: "in_stock", gradeId: i.gradeId || i.grade || null } : i;
          if (x.costBasis == null && Number(x.price) > 0 && x.listedPrice == null) x = { ...x, costBasis: Number(x.price) };
          return x;
        })); setSales(s || []);
      const authed = getAuthedUser();
      if (authed) { setAuthedUser(authed); setStaffName(authed.username); } // real login overrides free text entirely
      else if (staff) setStaffName(staff);
      setAccessories(acc || []);
      setPurchaseOrders(po || []);
      setAccessoryOrders(ao || []);
      setLoaded(true);
    })();
  }, []);
  async function persistStaffName(name) { setStaffName(name); await saveJSON(STAFF_KEY, name, false); }
  async function persistAccessories(next) { await saveJSON(ACCESSORIES_KEY, next, true); setAccessories(next); }
  async function persistPurchaseOrders(next) { await saveJSON("purchase_orders", next, true); setPurchaseOrders(next); }
  async function persistAccessoryOrders(next) { await saveJSON("accessory_orders", next, true); setAccessoryOrders(next); }
  // Completing an online accessory order: take stock out and record one sale
  // per line, in the same shape as a counter sale, so P&L and reports include it.
  async function completeAccessoryOrder(order, payMethod) {
    const byId = Object.fromEntries(order.items.map((i) => [i.id, i.qty]));
    await persistAccessories(accessories.map((a) => byId[a.id] ? { ...a, qtyOnHand: Math.max(0, a.qtyOnHand - byId[a.id]) } : a));
    const now = new Date().toISOString();
    const newSales = order.items.map((i, n) => {
      const item = accessories.find((a) => a.id === i.id) || {};
      return { id: genId("SALE"), itemId: i.id, customerName: order.customer.name, brand: "Accessory", model: i.name, storage: i.category,
        region: "AU", salePrice: i.price * i.qty, costBasis: (item.cost || 0) * i.qty, payMethod, soldAt: now, channel: "online", onlineOrderId: order.id,
        staffHandled: staffName || "unattributed", ...(n === 0 && order.shipping ? { shippingCharged: order.shipping } : {}) };
    });
    await persistSales([...newSales, ...sales]);
    await persistAccessoryOrders(accessoryOrders.map((o) => o.id === order.id ? { ...o, status: "completed", completedAt: now, payMethod } : o));
  }

  const catalog = mergeCatalog(config?.catalog);
  const retentionPts = config?.retentionPoints || RETENTION_POINTS;
  const brandFactors = { ...BRAND_FACTOR, ...(config?.brandFactors || {}) };
  const tiers = TIERS.map((t) => ({ ...t, factor: config?.tiers?.find((x) => x.id === t.id)?.factor ?? t.factor }));
  const regions = useMemo(() => {
    const m = {};
    Object.keys(REGIONS).forEach((c) => { m[c] = { ...REGIONS[c], ...(config?.regions?.[c] || {}) }; });
    return m;
  }, [config]);
  const faultGroupsByCategory = useMemo(() => {
    const pctById = {};
    (config?.faultGroups || []).forEach((g) => g.faults.forEach((f) => { pctById[f.id] = f.pct; }));
    const merged = {};
    Object.keys(FAULT_GROUPS_BY_CATEGORY).forEach((cat) => {
      merged[cat] = FAULT_GROUPS_BY_CATEGORY[cat].map((g) => ({ ...g, faults: g.faults.map((f) => ({ ...f, pct: pctById[f.id] ?? f.pct })) }));
    });
    return merged;
  }, [config]);
  const holdingPct = config?.holdingCostPct ?? HOLDING_COST_PCT;

  function baseBuybackAUD(device, storage) {
    const retail = device.retail[storage];
    const months = ageMonths(device.release);
    const brandF = brandFactors[device.brand] ?? 0.65;
    const categoryF = CATEGORY_FACTOR[device.category] ?? 1.00;
    return retail * retentionAt(months, retentionPts) * brandF * categoryF;
  }

  async function persistInventory(next) { await saveJSON(INVENTORY_KEY, next, true); setInventory(next); }
  async function persistOrders(next) { await saveJSON(ORDERS_KEY, next, true); setOrders(next); }
  async function persistSales(next) { await saveJSON(SALES_KEY, next, true); setSales(next); }

  const ink = "var(--mr-bg)", panel = "var(--mr-surface)", panel2 = "var(--mr-surface-2)", paper = "var(--mr-text)", muted = "var(--mr-muted)",
    brass = "var(--mr-brand)", brassDim = "var(--mr-brand-soft)", red = "var(--mr-bad)", green = "var(--mr-ok)", line = "var(--mr-line)";

  if (!loaded) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading POS…</div>;

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=optional');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: '-0.01em', marginBottom: 4 }}>Register</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 14 }}>Buy, receive, grade, and sell — all from the same shared stock.</div>
        {authedUser ? (
          <div style={{ fontSize: 12.5, color: green, marginBottom: 18, border: `1px solid ${line}`, borderRadius: 3, padding: "8px 12px" }}>
            ✓ Logged in as <strong>{authedUser.username}</strong> ({authedUser.role}) — attributed automatically, not editable here.
          </div>
        ) : (
          <input value={staffName} onChange={(e) => persistStaffName(e.target.value)} placeholder="Your name (attributed to transactions you process)"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 12.5, marginBottom: 18, outline: "none", boxSizing: "border-box" }} />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 16 }}>
          <div style={{ background: panel2, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: brass }}>{inventory.filter(i => i.status === "in_stock" || i.status === "listed").length}</div>
            <div style={{ fontSize: 11, color: muted }}>In Stock</div>
          </div>
          <div style={{ background: panel2, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#7A1F2B" }}>{inventory.filter(i => i.status === "in_repair").length}</div>
            <div style={{ fontSize: 11, color: muted }}>In Repair</div>
          </div>
          <div style={{ background: panel2, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: green }}>{sales.filter(s => s.soldAt && sydneyDay(s.soldAt) === sydneyToday()).length}</div>
            <div style={{ fontSize: 11, color: muted }}>Today Sales</div>
          </div>
          <div style={{ background: panel2, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#F59E0B" }}>{orders.filter(o => o.status === "approved_paid" && !o.receivedToInventory).length}</div>
            <div style={{ fontSize: 11, color: muted }}>To Receive</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20, borderBottom: `1px solid ${line}`, paddingBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                border: `1px solid ${tab === t ? brass : line}`, background: tab === t ? brassDim : "transparent", color: tab === t ? brass : paper }}>
              {t}{t === "Receive Orders" && orders.filter((o) => o.status === "approved_paid" && !o.receivedToInventory).length > 0
                ? ` (${orders.filter((o) => o.status === "approved_paid" && !o.receivedToInventory).length})` : ""}
              {t === "Web Orders" && purchaseOrders.filter((o) => o.status === "pending_payment" || o.status === "pending_pickup" || o.status === "paid").length > 0
                ? ` (${purchaseOrders.filter((o) => o.status === "pending_payment" || o.status === "pending_pickup" || o.status === "paid").length})` : ""}
            </button>
          ))}
        </div>

        {tab === "Buy" && (
          <BuyTab colors={{ ink, panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            catalog={catalog} tiers={tiers} faultGroupsByCategory={faultGroupsByCategory} regions={regions} holdingPct={holdingPct}
            baseBuybackAUD={baseBuybackAUD} staffName={staffName}
            onComplete={async (item) => { await persistInventory([{ ...item, staffHandled: staffName || "unattributed" }, ...inventory]); setTab("Inventory"); }} />
        )}

        {tab === "Receive Orders" && (
          <ReceiveOrdersTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            orders={orders.filter((o) => o.status === "approved_paid")} regions={regions}
            onReceive={async (order, imei) => {
              const item = {
                id: genId("INV"), sourceOrderId: order.id, brand: order.device.brand, model: order.device.model,
                storage: order.device.storage, imei, gradeId: null, costBasis: order.inspection?.confirmedTotal ?? order.quotedTotal,
                source: "Online trade-in", sellerName: order.customer?.name || "", sellerPhone: order.customer?.phone || "", faults: order.inspection?.faultsFound || order.faultLabels || [],
                currency: order.currency, region: order.region, status: "in_stock", listedPrice: null,
                receivedAt: new Date().toISOString(), soldAt: null, staffHandled: staffName || "unattributed",
              };
              await persistInventory([item, ...inventory]);
              await persistOrders(orders.map((o) => (o.id === order.id ? { ...o, receivedToInventory: true, inventoryItemId: item.id } : o)));
            }} />
        )}

        {tab === "Quick Add" && (
          <QuickAddTab colors={{ panel, panel2, paper, muted, brass, brassDim, green, line }} onAdd={async (item) => {
            await persistInventory([{ ...item, status: item.status === "available" ? "in_stock" : item.status, gradeId: item.gradeId || item.grade || null, receivedAt: item.receivedAt || new Date().toISOString(), staffHandled: staffName || "unattributed" }, ...inventory]);
            setTab("Inventory");
          }} />
        )}
        {tab === "Inventory" && (
          <InventoryTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            inventory={inventory} regions={regions} staffName={staffName}
            photos={Object.fromEntries(catalog.filter((d) => d.imageUrl).map((d) => [`${d.brand}|${d.model}`, d.imageUrl]))}
            onUpdate={async (id, patch) => { await persistInventory(inventory.map((i) => (i.id === id ? { ...i, ...patch } : i))); }} />
        )}

        {tab === "Accessories" && (
          <AccessoriesTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            accessories={accessories}
            onAdd={async (item) => { await persistAccessories([{ id: genId("ACC"), qtyOnHand: 0, ...item }, ...accessories]); }}
            onAdjust={async (id, delta) => {
              const item = accessories.find((a) => a.id === id);
              if (!item) return;
              const newQty = Math.max(0, item.qtyOnHand + delta);
              await persistAccessories(accessories.map((a) => (a.id === id ? { ...a, qtyOnHand: newQty } : a)));
              if (delta < 0 && newQty <= ACCESSORY_LOW_STOCK_THRESHOLD && item.qtyOnHand > ACCESSORY_LOW_STOCK_THRESHOLD) {
                await queueNotification({ type: "low_stock_accessory", channel: "email", recipientEmail: "",
                  subject: `Low stock: ${item.name}`, message: `${item.name} is down to ${newQty} unit(s). Consider reordering.`, relatedId: item.id });
              }
            }}
            onSellOne={async (item, customerName, payMethod) => {
              const newQty = Math.max(0, item.qtyOnHand - 1);
              await persistAccessories(accessories.map((a) => (a.id === item.id ? { ...a, qtyOnHand: newQty } : a)));
              if (newQty <= ACCESSORY_LOW_STOCK_THRESHOLD && item.qtyOnHand > ACCESSORY_LOW_STOCK_THRESHOLD) {
                await queueNotification({ type: "low_stock_accessory", channel: "email", recipientEmail: "",
                  subject: `Low stock: ${item.name}`, message: `${item.name} is down to ${newQty} unit(s). Consider reordering.`, relatedId: item.id });
              }
              const sale = { customerName: customerName || "Walk-in", brand: "Accessory", model: item.name, storage: item.category,
                region: "AU", salePrice: item.sellPrice, costBasis: item.cost, payMethod,
                soldAt: new Date().toISOString(), staffHandled: staffName || "unattributed" };
              await persistSales([{ ...sale, id: genId("SALE"), itemId: item.id }, ...sales]);
            }} />
        )}

        {tab === "Web Orders" && (
          <AccessoryOrdersPanel colors={{ panel, paper, muted, brass, red, green, line }} orders={accessoryOrders}
            onReady={(o) => persistAccessoryOrders(accessoryOrders.map((x) => x.id === o.id ? { ...x, status: "ready" } : x))}
            onComplete={completeAccessoryOrder}
            onCancel={(o) => persistAccessoryOrders(accessoryOrders.map((x) => x.id === o.id ? { ...x, status: "cancelled" } : x))} />
        )}
        {tab === "Web Orders" && (
          <WebOrdersTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            purchaseOrders={purchaseOrders} inventory={inventory}
            onContact={(order, e) => persistPurchaseOrders(purchaseOrders.map((o) => o.id === order.id ? { ...o, contactLog: [...(o.contactLog || []), { ...e, by: staffName || "" }] } : o))}
            onMarkPaid={async (orderId) => {
              await persistPurchaseOrders(purchaseOrders.map((o) => o.id === orderId ? { ...o, status: "paid" } : o));
            }}
            onComplete={async (order) => {
              await persistPurchaseOrders(purchaseOrders.map((o) => o.id === order.id ? { ...o, status: "completed" } : o));
              await persistInventory(inventory.map((i) => i.id === order.itemId ? { ...i, status: "sold", soldAt: new Date().toISOString() } : i));
              const item = inventory.find((i) => i.id === order.itemId);
              await persistSales([{
                id: genId("SALE"), itemId: order.itemId, customerName: order.customer.name, customerEmail: order.customer.email,
                salePrice: order.price, costBasis: item?.costBasis, brand: order.brand, model: order.model, storage: order.storage,
                region: order.region, payMethod: order.paymentMethod === "bank_transfer" ? "bank" : "cash",
                soldAt: new Date().toISOString(), staffHandled: staffName || "unattributed", channel: "web",
              }, ...sales]);
            }}
            onCancel={async (order) => {
              await persistPurchaseOrders(purchaseOrders.map((o) => o.id === order.id ? { ...o, status: "cancelled" } : o));
              await persistInventory(inventory.map((i) => i.id === order.itemId ? { ...i, status: "listed", reservedByOrderId: null } : i));
            }} />
        )}

        {tab === "Sales" && (
          <SalesTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }} sales={sales} canUndo={hasArea("reports")}
            onRefund={async (orig, r) => {
              const at = new Date().toISOString();
              const back = r.restock && orig.costBasis != null ? -Number(orig.costBasis) : 0;
              const refund = { id: genId("RFD"), refundOf: orig.id, channel: "refund", refundChannel: orig.channel || "", itemId: orig.itemId,
                brand: orig.brand, model: orig.model, storage: orig.storage, region: orig.region || "AU",
                customerName: orig.customerName || "", customerEmail: orig.customerEmail || "", customerPhone: orig.customerPhone || "",
                salePrice: -Math.abs(r.amount), costBasis: back, payMethod: r.method, refundReason: r.reason, restocked: !!r.restock,
                soldAt: at, staffHandled: staffName || "unattributed" };
              const updated = sales.map((x) => (x.id === orig.id ? { ...x, refundedAmount: (Number(x.refundedAmount) || 0) + Math.abs(r.amount), ...(r.undo ? { voided: true } : {}) } : x));
              await persistSales([refund, ...updated]);
              if (r.restock) {
                if (orig.brand === "Accessory") {
                  const a = accessories.find((x) => x.id === orig.itemId);
                  if (a) await persistAccessories(accessories.map((x) => (x.id === a.id ? { ...x, qtyOnHand: (Number(x.qtyOnHand) || 0) + 1 } : x)));
                } else if (inventory.some((i) => i.id === orig.itemId)) {
                  await persistInventory(inventory.map((i) => (i.id === orig.itemId ? { ...i, status: "in_stock", soldAt: null, returnedAt: at, returnReason: r.reason } : i)));
                }
              }
            }} />
        )}

        {tab === "Sell" && (
          <SellTab staffName={staffName} businessSettings={config?.businessSettings} colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            inventory={inventory.filter((i) => i.status !== "sold")} regions={regions}
            onSell={async (item, sale) => {
              await persistInventory(inventory.map((i) => (i.id === item.id ? { ...i, status: "sold", soldAt: new Date().toISOString() } : i)));
              await persistSales([{ ...sale, id: sale.id || genId("SALE"), itemId: item.id, soldAt: new Date().toISOString(), staffHandled: staffName || "unattributed" }, ...sales]);
            }} />
        )}
      </div>
    </div>
  );
}

function Money({ n, region, regions, brass }) { return <span style={{ color: brass }}>{fmt(n, region, regions)}</span>; }

function BuyTab({ colors, catalog, tiers, faultGroupsByCategory, regions, holdingPct, baseBuybackAUD, onComplete, staffName }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [region, setRegion] = useState("AU");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [tierId, setTierId] = useState(null);
  const [faults, setFaults] = useState({});
  const faultGroups = faultGroupsByCategory[selected?.category] || faultGroupsByCategory.phone;
  const [imei, setImei] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [idType, setIdType] = useState("license");
  const [idOwnerName, setIdOwnerName] = useState("");
  const [idSighted, setIdSighted] = useState(false);
  const [source, setSource] = useState("Walk-in");
  const [sellerPhone, setSellerPhone] = useState("");
  const [agreed, setAgreed] = useState(""); // blank = pay the calculated price
  const [checked, setChecked] = useState({ blacklist: false, account: false });
  const [needsRepair, setNeedsRepair] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = catalog.filter((d) => !search || (d.brand + " " + d.model).toLowerCase().includes(search.toLowerCase()));
  const tier = tiers.find((t) => t.id === tierId);

  const calc = useMemo(() => {
    if (!selected || !tier) return null;
    const baseAUD = baseBuybackAUD(selected, selected.storage);
    const r = regions[region];
    const baseRegion = baseAUD * r.mult;
    const tierBase = baseRegion * tier.factor;
    let total = tierBase;
    const lines = [];
    if (tier.id !== "parts") {
      faultGroups.forEach((g) => g.faults.forEach((f) => {
        if (faults[f.id]) { const amt = tierBase * f.pct; total -= amt; lines.push({ label: f.label, amt }); }
      }));
      total -= tierBase * holdingPct;
    }
    total = Math.max(total, baseRegion * 0.05);
    return { tierBase, total, lines };
  }, [selected, tier, faults, region]);

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Region</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {Object.keys(regions).map((code) => (
          <button key={code} onClick={() => setRegion(code)}
            style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12.5, border: `1px solid ${region === code ? brass : line}`, background: region === code ? brassDim : "transparent", color: region === code ? brass : paper, cursor: "pointer" }}>
            {code}
          </button>
        ))}
      </div>

      {!selected && (
        <>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search device"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <div style={{ border: `1px solid ${line}`, borderRadius: 3, overflow: "hidden" }}>
            {filtered.length > 20 && <div style={{ fontSize: 12, color: "var(--mr-muted)", margin: "0 0 8px" }}>Showing 20 of {filtered.length} matches — keep typing (e.g. add the model number) to narrow it down.</div>}
            {filtered.slice(0, 20).map((d, i) => (
              <div key={d.brand + d.model} style={{ padding: "8px 14px", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>{d.brand} {d.model}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.keys(d.retail).map((s) => (
                    <button key={s} onClick={() => { setSelected({ ...d, storage: s }); setTierId(null); setFaults({}); }}
                      style={{ padding: "6px 10px", borderRadius: 2, fontSize: 12.5, border: `1px solid ${line}`, background: panel, color: paper, cursor: "pointer" }}>{s}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {selected && (
        <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", background: panel }}>
          <span style={{ fontSize: 14 }}>{selected.brand} {selected.model} · {selected.storage}</span>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: brass, fontSize: 13, cursor: "pointer" }}>Change</button>
        </div>
      )}

      {selected && (
        <div style={{ marginBottom: 16 }}>
          {tiers.map((t) => (
            <button key={t.id} onClick={() => { setTierId(t.id); setFaults({}); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", marginBottom: 6, cursor: "pointer",
                background: tierId === t.id ? brassDim : panel, border: "none", borderLeft: `3px solid ${tierId === t.id ? brass : "transparent"}`, borderRadius: 3, color: paper, fontSize: 13 }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tier && tier.id !== "parts" && (
        <div style={{ marginBottom: 16 }}>
          {faultGroups.map((g) => (
            <div key={g.group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, color: brass, marginBottom: 4 }}>{g.group}</div>
              {g.faults.map((f) => (
                <label key={f.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 4px", fontSize: 13, cursor: "pointer" }}>
                  <span><input type="checkbox" checked={!!faults[f.id]} onChange={(e) => setFaults((s) => ({ ...s, [f.id]: e.target.checked }))} /> {f.label}</span>
                  <span style={{ color: red }}>−{Math.round(f.pct * 100)}%</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {calc && (
        <div style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: muted }}>Pay this customer</span>
            <span style={{ fontSize: 24, color: brass, fontFamily: "'Archivo Black', sans-serif" }}><Money n={calc.total} region={region} regions={regions} brass={brass} /></span>
          </div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Where did it come from?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {SOURCES.filter((x) => x !== "Online trade-in").map((x) => (
              <button key={x} onClick={() => setSource(x)} style={{ padding: "7px 10px", borderRadius: 2, fontSize: 12, cursor: "pointer",
                border: `1px solid ${source === x ? brass : line}`, background: source === x ? brassDim : "transparent", color: source === x ? brass : paper }}>{x}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: muted }}>Price agreed $</span>
            <input value={agreed} onChange={(e) => setAgreed(e.target.value)} inputMode="decimal" placeholder={String(Math.round(calc.total))} aria-label="Price agreed"
              style={{ width: 110, padding: "9px 10px", border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14 }} />
            <span style={{ fontSize: 12, color: muted }}>{agreed ? `calculator says ${fmt(calc.total, region, regions)}` : "blank = calculator price"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI (dial *#06#)"
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            <ScanButton onScan={(c) => setImei(c)} title="Scan IMEI barcode (box or Settings > About)" />
          </div>
          <div style={{ fontSize: 12, color: imei && imeiProblem(imei) ? red : muted, marginBottom: 10 }}>{imei ? imeiProblem(imei) || "✓ IMEI checks out" : " "}</div>
          {[["blacklist", "IMEI not blacklisted (checked)"], ["account", "Find My / Google account removed in front of me"]].map(([k, label]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={checked[k]} onChange={(e) => setChecked((c) => ({ ...c, [k]: e.target.checked }))} />{label}
            </label>
          ))}
          <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Photo ID — required by law</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[{ id: "license", label: "Licence" }, { id: "passport", label: "Passport" }, { id: "other", label: "Other" }].map((opt) => (
              <button key={opt.id} onClick={() => setIdType(opt.id)}
                style={{ flex: 1, padding: "7px 4px", borderRadius: 2, fontSize: 11.5, cursor: "pointer",
                  border: `1px solid ${idType === opt.id ? brass : line}`, background: idType === opt.id ? brassDim : "transparent", color: idType === opt.id ? brass : paper }}>
                {opt.label}
              </button>
            ))}
          </div>
          <input value={idOwnerName} onChange={(e) => setIdOwnerName(e.target.value)} placeholder="Full name (as it appears on their ID)"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
          <input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} placeholder="Seller's phone (optional)" inputMode="tel"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={idSighted} onChange={(e) => setIdSighted(e.target.checked)} />
            I've sighted the original ID in person and it matches this customer
          </label>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["cash", "bank"].map((m) => (
              <button key={m} onClick={() => setPayMethod(m)} style={{ flex: 1, padding: "8px", borderRadius: 3, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${payMethod === m ? brass : line}`, background: payMethod === m ? brassDim : "transparent", color: payMethod === m ? brass : paper }}>
                {m === "cash" ? "Cash" : "Bank transfer"}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={needsRepair} onChange={(e) => setNeedsRepair(e.target.checked)} />
            Needs repair before selling (opens a shop repair job)
          </label>
          {(() => {
            const paid = agreed ? parseFloat(String(agreed).replace(/[$,]/g, "")) : Math.round(calc.total);
            const ready = !imeiProblem(imei) && idOwnerName.trim() && idSighted && checked.blacklist && checked.account && paid > 0 && !busy;
            const faultLabels = faultGroups.flatMap((g) => g.faults.filter((f) => faults[f.id]).map((f) => f.label));
            return (
              <button disabled={!ready} onClick={async () => {
                setBusy(true);
                const item = {
                  id: genId("INV"), sourceOrderId: null, brand: selected.brand, model: selected.model, storage: selected.storage,
                  imei: cleanImei(imei), gradeId: null, costBasis: Math.round(paid), currency: regions[region].symbol, region,
                  status: needsRepair ? "in_repair" : "in_stock", listedPrice: null, receivedAt: new Date().toISOString(), soldAt: null, payMethod,
                  source, sellerName: idOwnerName.trim(), sellerPhone: sellerPhone.trim(), sellerIdType: idType, sellerIdOwnerName: idOwnerName.trim(),
                  faults: faultLabels, checks: ["blacklist", "account", "id"], quotedByCalculator: Math.round(calc.total),
                };
                if (needsRepair) {
                  const job = newShopRepairJob({ item, issue: faultLabels.length ? `Fix: ${faultLabels.join(", ")}` : "Fix up to sell", staff: staffName });
                  if (await addToSharedList("repair_tickets", job)) item.repairJobId = job.id;
                }
                await onComplete(item);
                setBusy(false);
              }}
                style={{ width: "100%", padding: "12px", borderRadius: 3, border: "none", background: ready ? "var(--mr-brand-fill)" : line, color: ready ? "#fff" : muted,
                  fontSize: 14, fontWeight: 600, cursor: ready ? "pointer" : "default" }}>
                Pay {paid > 0 ? fmt(paid, region, regions) : ""} → {needsRepair ? "repair bench" : "stock"}
              </button>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function ReceiveOrdersTab({ colors, orders, regions, onReceive }) {
  const { panel, panel2, paper, muted, brass, brassDim, line } = colors;
  const [imeiDrafts, setImeiDrafts] = useState({});
  const pending = orders.filter((o) => !o.receivedToInventory);

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>Approved online trade-ins waiting to be logged into physical stock.</div>
      {pending.length === 0 && <div style={{ color: muted, fontSize: 13 }}>Nothing waiting — all approved orders are in inventory.</div>}
      {pending.map((o) => (
        <div key={o.id} style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 10, background: panel }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{o.id}</span>
            <span style={{ fontSize: 13, color: brass }}>{fmt(o.inspection?.confirmedTotal ?? o.quotedTotal, o.region, regions)}</span>
          </div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>{o.device.brand} {o.device.model} · {o.device.storage} · {o.customer.name}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={imeiDrafts[o.id] || ""} onChange={(e) => setImeiDrafts((s) => ({ ...s, [o.id]: e.target.value }))} placeholder="IMEI from device"
              style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
            <ScanButton onScan={(c) => setImeiDrafts((s) => ({ ...s, [o.id]: c }))} title="Scan IMEI barcode" />
            <button disabled={!imeiDrafts[o.id]?.trim()} onClick={() => onReceive(o, imeiDrafts[o.id].trim())}
              style={{ padding: "8px 14px", borderRadius: 3, border: "none", background: imeiDrafts[o.id]?.trim() ? "var(--mr-brand-fill)" : line, color: imeiDrafts[o.id]?.trim() ? "#fff" : muted, fontSize: 12.5, cursor: imeiDrafts[o.id]?.trim() ? "pointer" : "default" }}>
              Add to inventory
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AccessoryOrdersPanel({ colors, orders, onReady, onComplete, onCancel }) {
  const { paper, muted, brass, red, green, line } = colors;
  const open = orders.filter((o) => o.status === "new" || o.status === "ready");
  const money = (n) => "$" + Number(n || 0).toFixed(2);
  const b = (c) => ({ padding: "6px 10px", fontSize: 12, border: `1px solid ${c}`, color: c, background: "transparent", borderRadius: 3, cursor: "pointer" });
  return (
    <div style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 14, marginBottom: 18, color: paper }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Online accessory orders ({open.length} open)</div>
      {open.length === 0 && <div style={{ fontSize: 13, color: muted }}>No open online orders.</div>}
      {open.map((o) => (
        <div key={o.id} style={{ borderTop: `1px solid ${line}`, padding: "10px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><strong>{o.id} · {o.customer.name}</strong><span>{money(o.total)}</span></div>
          <div style={{ fontSize: 12, color: muted, margin: "3px 0" }}>{o.customer.email}{o.customer.phone ? ` · ${o.customer.phone}` : ""}</div>
          <div style={{ fontSize: 12.5, margin: "3px 0" }}>{o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
            {o.fulfilment === "collect" ? "Click & collect — customer pays on pickup" : `Delivery to: ${o.customer.address} — send a payment link before posting`}
            {o.status === "ready" ? " · ✓ marked ready/sent" : ""}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {o.status === "new" && <button onClick={() => onReady(o)} style={b(brass)}>{o.fulfilment === "collect" ? "Mark ready to collect" : "Mark sent"}</button>}
            <button onClick={() => onComplete(o, "card")} style={b(green)}>Complete — paid by card</button>
            <button onClick={() => onComplete(o, "cash")} style={b(green)}>Complete — paid cash</button>
            <button onClick={() => onCancel(o)} style={b(red)}>Cancel</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebOrdersTab({ colors, purchaseOrders, inventory, onMarkPaid, onComplete, onCancel, onContact }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [filter, setFilter] = useState("open");
  const STATUS_LABELS = { pending_payment: "Awaiting payment", pending_pickup: "Awaiting pickup", paid: "Paid — ready to ship/hand over", completed: "Completed", cancelled: "Cancelled" };
  const [layout, setLayout] = useLayout("mr-weborders-layout");
  const recent = (o, days) => o.completedAt ? Date.now() - Date.parse(o.completedAt) < days * 864e5 : Date.now() - Date.parse(o.createdAt || 0) < days * 864e5;

  const filtered = purchaseOrders.filter((o) => {
    if (filter === "open") return !["completed", "cancelled"].includes(o.status);
    if (filter === "closed") return ["completed", "cancelled"].includes(o.status);
    return true;
  });

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>Orders placed through the online storefront.</div>
      <StatTiles tiles={[
        ["Waiting for payment", purchaseOrders.filter((o) => o.status === "pending_payment").length, "bank transfer not in yet"],
        ["Waiting for pickup", purchaseOrders.filter((o) => o.status === "pending_pickup").length, "cash on pickup"],
        ["Paid: send or hand over", purchaseOrders.filter((o) => o.status === "paid").length, ""],
        ["Sold online, last 30 days", purchaseOrders.filter((o) => o.status === "completed" && recent(o, 30)).length,
          `$${Math.round(purchaseOrders.filter((o) => o.status === "completed" && recent(o, 30)).reduce((a, o) => a + (Number(o.price) || 0), 0)).toLocaleString()}`],
      ]} />
      <LayoutSwitch value={layout} onChange={setLayout} />
      {layout === "board" && (
        <FlowBoard
          columns={[
            { id: "pending_payment", label: "Waiting for payment", lateDays: 2 },
            { id: "pending_pickup", label: "Waiting for pickup", lateDays: 3 },
            { id: "paid", label: "Paid: send / hand over", lateDays: 1 },
            { id: "completed", label: "Done (last 14 days)" },
          ]}
          items={purchaseOrders}
          colOf={(o) => (o.status === "completed" ? (recent(o, 14) ? "completed" : null) : o.status === "cancelled" ? null : o.status)}
          since={(o) => lastTime(o.status === "paid" ? o.paidAt : o.status === "completed" ? o.completedAt : null, o.createdAt)}
          onOpen={() => setLayout("list")}
          card={(o) => ({
            right: o.id,
            title: `${o.brand} ${o.model}`,
            sub: `${o.customer?.name || ""} · ${o.currency || "$"}${Math.round(o.price || 0).toLocaleString()}`,
            chips: [[o.paymentMethod === "bank_transfer" ? "Bank transfer" : "Cash on pickup", "muted"]],
            actions: o.status === "pending_payment" || o.status === "pending_pickup"
              ? [{ label: o.status === "pending_pickup" ? "Paid & collected →" : "Money's in →", onClick: () => (o.status === "pending_pickup" ? onComplete(o) : onMarkPaid(o.id)) }]
              : o.status === "paid" ? [{ label: "Handed over →", tone: "ok", onClick: () => onComplete(o) }] : [],
          })} />
      )}
      {layout === "list" && <>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {["open", "closed", "all"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12.5, cursor: "pointer",
            border: `1px solid ${filter === f ? brass : line}`, background: filter === f ? brassDim : "transparent", color: filter === f ? brass : paper }}>
            {f}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No web orders here.</div>}
      {filtered.map((o) => (
        <div key={o.id} style={{ border: `1px solid ${line}`, borderLeft: `3px solid ${o.status === "cancelled" ? red : o.status === "completed" ? green : brass}`, borderRadius: 3, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13 }}>{o.id}</span>
            <span style={{ fontSize: 12, color: muted }}>{STATUS_LABELS[o.status]}</span>
          </div>
          <div style={{ fontSize: 13, marginBottom: 2 }}>{o.brand} {o.model} · {o.storage} · Grade {o.gradeId}</div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>{o.customer.name} · {o.customer.email} · {o.paymentMethod === "bank_transfer" ? "Bank transfer" : "Cash on pickup"}</div>
          <div style={{ fontSize: 13, color: brass, marginBottom: 10 }}>{o.currency}{Math.round(o.price).toLocaleString()}</div>
          {o.status !== "cancelled" && onContact && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: brass }}>💬 Message {o.customer.name || "the customer"}{o.contactLog?.length ? ` (${o.contactLog.length} sent)` : ""}</summary>
              <div style={{ marginTop: 8 }}>
                <MessageCustomer phone={o.customer.phone} email={o.customer.email} contactLog={o.contactLog} title="Message the customer"
                  templates={orderMessages({ ...o, orderId: o.id, item: { brand: o.brand, model: o.model } })} onSent={(e) => onContact(o, e)} />
              </div>
            </details>
          )}
          {(o.status === "pending_payment" || o.status === "pending_pickup") && (
            <div style={{ display: "flex", gap: 8 }}>
              {o.paymentMethod === "bank_transfer" && (
                <button onClick={() => onMarkPaid(o.id)} style={{ flex: 1, padding: "8px", borderRadius: 3, border: "none", background: "var(--mr-brand-fill)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  Mark payment received
                </button>
              )}
              {o.paymentMethod === "cash_on_pickup" && (
                <button onClick={() => onComplete(o)} style={{ flex: 1, padding: "8px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  Customer paid & collected
                </button>
              )}
              <button onClick={() => onCancel(o)} style={{ flex: 1, padding: "8px", borderRadius: 3, border: `1px solid ${red}`, background: "transparent", color: red, fontSize: 12.5, cursor: "pointer" }}>
                Cancel & relist
              </button>
            </div>
          )}
          {o.status === "paid" && (
            <button onClick={() => onComplete(o)} style={{ width: "100%", padding: "8px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Mark shipped / handed over
            </button>
          )}
        </div>
      ))}
      </>}
    </div>
  );
}

function AccessoriesTab({ colors, accessories, onAdd, onAdjust, onSellOne }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [name, setName] = useState(""); const [category, setCategory] = useState(ACCESSORY_CATEGORIES[0]);
  const [compatibleWith, setCompatibleWith] = useState(""); const [imageUrl, setImageUrl] = useState(""); const [showOnline, setShowOnline] = useState(true);
  const [cost, setCost] = useState(""); const [sellPrice, setSellPrice] = useState(""); const [qty, setQty] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [customerName, setCustomerName] = useState("");
  const [notice, setNotice] = useState("");

  const ready = name.trim() && cost !== "" && sellPrice !== "" && qty !== "";

  return (
    <div>
      <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 13, marginBottom: 10 }}>Add accessory</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Clear case - iPhone 15"
            style={{ flex: 2, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13 }}>
            {ACCESSORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost" type="number"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
          <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="Sell price" type="number"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Starting qty" type="number"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input value={compatibleWith} onChange={(e) => setCompatibleWith(e.target.value)} placeholder="Fits (optional), e.g. iPhone 15, iPhone 15 Pro"
            style={{ flex: 2, minWidth: 180, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Photo link (optional)"
            style={{ flex: 1, minWidth: 140, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: muted, marginBottom: 10 }}>
          <input type="checkbox" checked={showOnline} onChange={(e) => setShowOnline(e.target.checked)} /> Show in the online shop
        </label>
        <button disabled={!ready} onClick={() => {
            onAdd({ name: name.trim(), category, cost: parseFloat(cost), sellPrice: parseFloat(sellPrice), qtyOnHand: parseInt(qty),
              compatibleWith: compatibleWith.trim(), imageUrl: imageUrl.trim(), showOnline });
            setName(""); setCost(""); setSellPrice(""); setQty(""); setCompatibleWith(""); setImageUrl(""); setShowOnline(true);
          }} style={{ width: "100%", padding: "10px", borderRadius: 3, border: "none", background: ready ? "var(--mr-brand-fill)" : line, color: ready ? "#fff" : muted, fontSize: 13, fontWeight: 600, cursor: ready ? "pointer" : "default" }}>
          Add to stock
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name for next sale (optional — defaults to Walk-in)"
          style={{ flex: 2, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 12.5, outline: "none" }} />
        {["cash", "card"].map((m) => (
          <button key={m} onClick={() => setPayMethod(m)} style={{ flex: 1, padding: "9px", borderRadius: 3, fontSize: 12, cursor: "pointer",
            border: `1px solid ${payMethod === m ? brass : line}`, background: payMethod === m ? brassDim : "transparent", color: payMethod === m ? brass : paper }}>
            {m === "cash" ? "Cash" : "Card"}
          </button>
        ))}
      </div>
      {notice && <div style={{ fontSize: 12, color: green, marginBottom: 10 }}>{notice}</div>}

      <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Stock ({accessories.length} item{accessories.length === 1 ? "" : "s"})</div>
      {accessories.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No accessories added yet.</div>}
      {accessories.map((a) => {
        const low = a.qtyOnHand <= 2;
        return (
          <div key={a.id} style={{ border: `1px solid ${low ? red : line}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13 }}>{a.name} <span style={{ color: muted, fontSize: 11 }}>· {a.category}</span></span>
              <span style={{ fontSize: 13, color: brass }}>{fmt(a.sellPrice, "AU")}</span>
            </div>
            <div style={{ fontSize: 12, color: low ? red : muted, marginTop: 4, marginBottom: 8 }}>
              {a.qtyOnHand} on hand{low && " · low stock"} · cost {fmt(a.cost, "AU")}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onAdjust(a.id, -1)} disabled={a.qtyOnHand <= 0} style={{ width: 28, height: 28, borderRadius: 2, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>−</button>
              <button onClick={() => onAdjust(a.id, 1)} style={{ width: 28, height: 28, borderRadius: 2, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>+</button>
              <button disabled={a.qtyOnHand <= 0} onClick={() => {
                  onSellOne(a, customerName.trim(), payMethod);
                  setNotice(`Sold ${a.name} to ${customerName.trim() || "Walk-in"} for ${fmt(a.sellPrice, "AU")}.`);
                  setTimeout(() => setNotice(""), 2500);
                }} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 2, fontSize: 12, border: `1px solid ${green}`, background: "transparent", color: a.qtyOnHand > 0 ? green : muted, cursor: a.qtyOnHand > 0 ? "pointer" : "default" }}>
                Sell one
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}


function QuickAddTab({ colors, onAdd }) {
  const { panel, panel2, paper, muted, brass, brassDim, green, line } = colors;
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('quickadd')) {
      setPending({
        imei: params.get('imei') || '',
        model: params.get('model') || '',
        serial: params.get('serial') || '',
        storage: params.get('storage') || '',
        color: params.get('color') || '',
        year: params.get('year') || '',
        ios: params.get('ios') || '',
        battery: params.get('battery') || '',
        cycles: params.get('cycles') || '',
      });
    }
    try {
      const local = JSON.parse(localStorage.getItem('inventory') || '[]');
      setItems(local.filter(i => i.status === 'available'));
    } catch {}
  }, []);

  const getCategory = (model) => {
    if (!model) return 'Other';
    if (model.includes('iPhone 18')) return 'iPhone 18';
    if (model.includes('iPhone 17')) return 'iPhone 17';
    if (model.includes('iPhone 16')) return 'iPhone 16';
    if (model.includes('iPhone 15')) return 'iPhone 15';
    if (model.includes('iPhone 14')) return 'iPhone 14';
    if (model.includes('iPhone 13')) return 'iPhone 13';
    if (model.includes('Galaxy')) return 'Samsung';
    if (model.includes('Pixel')) return 'Google';
    return 'Other';
  };

  const grouped = items.reduce((acc, item) => {
    const cat = getCategory(item.model);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const handleAddPending = () => {
    const price = document.getElementById('qa-price')?.value;
    const grade = document.getElementById('qa-grade')?.value || 'A';
    if (!price) return alert('Enter buy price');
    const item = {
      ...pending,
      model: document.getElementById('qa-model')?.value || pending.model,
      storage: document.getElementById('qa-storage')?.value || pending.storage,
      color: document.getElementById('qa-color')?.value || pending.color,
      year: document.getElementById('qa-year')?.value || pending.year,
      imei: document.getElementById('qa-imei')?.value || pending.imei,
      serial: document.getElementById('qa-serial')?.value || pending.serial,
      price: Number(price),
      costBasis: Number(price), // what we paid, so the P&L and margins know it
      sourceOrderId: null,
      grade,
      status: 'available',
      id: 'QA-' + Date.now(),
      category: getCategory(document.getElementById('qa-model')?.value || pending.model),
    };
    onAdd(item);
    setPending(null);
  };

  if (pending) {
    return (
      <div style={{ background: panel2, border: `1px solid ${line}`, borderRadius: 6, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>USB Scanned Device — Edit details then add</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: muted }}>Model</label>
            <input id="qa-model" defaultValue={pending.model} style={{ width: '100%', padding: 8, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: muted }}>Storage</label>
            <input id="qa-storage" defaultValue={pending.storage} placeholder="128GB" style={{ width: '100%', padding: 8, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: muted }}>Color</label>
            <input id="qa-color" defaultValue={pending.color} style={{ width: '100%', padding: 8, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: muted }}>Year</label>
            <input id="qa-year" defaultValue={pending.year} style={{ width: '100%', padding: 8, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: muted }}>IMEI</label>
            <input id="qa-imei" defaultValue={pending.imei} style={{ width: '100%', padding: 8, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: muted }}>Serial</label>
            <input id="qa-serial" defaultValue={pending.serial} style={{ width: '100%', padding: 8, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper, marginTop: 4 }} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: muted }}>Buy Price ($)</label>
          <input id="qa-price" type="number" placeholder="Enter buy price" style={{ width: '100%', padding: 10, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: muted }}>Grade</label>
          <select id="qa-grade" style={{ width: '100%', padding: 10, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }}>
            <option value="A">Grade A - Like New</option>
            <option value="B">Grade B - Excellent</option>
            <option value="C">Grade C - Good</option>
            <option value="D">Grade D - Fair</option>
          </select>
        </div>
        <button onClick={handleAddPending} style={{ width: '100%', padding: 12, background: green, color: 'var(--mr-surface)', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}>
          Add to Inventory
        </button>
      </div>
    );
  }

  if (!items.length) return <div style={{ color: muted, padding: 20 }}>No devices from USB scan. Connect phone via USB.</div>;

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>USB scanned devices by category</div>
      {Object.entries(grouped).map(([cat, catItems]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: brass }}>{cat}</div>
          {catItems.map((item, i) => (
            <div key={item.id || i} style={{ background: panel2, border: `1px solid ${line}`, borderRadius: 6, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{item.model} {item.storage}</div>
                <div style={{ fontSize: 12, color: muted }}>Color: {item.color || 'N/A'} · Grade: {item.grade || 'A'} · Year: {item.year || ''}</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>IMEI: •••{item.imei?.slice(-4) || '••••'}</div>
              </div>
              <button onClick={() => onAdd(item)} style={{ padding: '8px 16px', background: green, color: 'var(--mr-surface)', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                Add to Inventory
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function InventoryTab({ colors, inventory, regions, onUpdate, staffName, photos = {} }) {
  const [copiedId, setCopiedId] = useState(null);
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useLayout("mr-stock-layout");
  const [search, setSearch] = useState("");
  const [repairFor, setRepairFor] = useState(null); // item being sent to the repair bench
  const [repairIssue, setRepairIssue] = useState("");
  const [flash, setFlash] = useState("");
  const [labelItem, setLabelItem] = useState(null);
  const [writeOffItem, setWriteOffItem] = useState(null);
  const [writeOffReason, setWriteOffReason] = useState("Damaged");
  const [writeOffNote, setWriteOffNote] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const [drafts, setDrafts] = useState({}); // price being typed, per phone
  const [passportItem, setPassportItem] = useState(null);
  const [photoItemId, setPhotoItemId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const q = search.trim().toLowerCase();
  const filtered = inventory
    .filter((i) => filter === "all" || (filter === "slow" ? !!agedDrop(i) : i.status === filter))
    .filter((i) => !q || [i.id, i.imei, i.brand, i.model, i.storage, i.sourceOrderId].some((v) => String(v || "").toLowerCase().includes(q)));
  const daysIn = (i) => (i.receivedAt ? Math.floor((Date.now() - new Date(i.receivedAt).getTime()) / 864e5) : null);
  // Our own phone onto the repair bench: a shop job in Repairs, and the phone stays
  // off sale ("in repair") until that job is finished.
  async function sendToRepair(item) {
    const job = newShopRepairJob({ item, issue: repairIssue.trim() || (item.faults && item.faults.length ? `Fix: ${item.faults.join(", ")}` : "Fix up to sell"), staff: staffName });
    if (!(await addToSharedList("repair_tickets", job))) { setFlash("Couldn't open the repair job. Try again."); return; }
    await onUpdate(item.id, { status: "in_repair", repairJobId: job.id, ...(item.status === "listed" ? { unlistedAt: new Date().toISOString() } : {}) });
    setRepairFor(null); setRepairIssue("");
    setFlash(`${item.brand} ${item.model} is on the repair bench as ${job.id}. It comes back to stock when the job is done.`);
  }
  const visible = filtered.slice(0, visibleCount);
  const WRITE_OFF_REASONS = ["Damaged", "Stolen", "Lost", "Unsellable", "Other"];

  if (writeOffItem) {
    return (
      <div>
        <button onClick={() => setWriteOffItem(null)} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>← Back to inventory</button>
        <div style={{ border: `1px solid ${red}`, borderRadius: 3, padding: 16 }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>Write off {writeOffItem.brand} {writeOffItem.model}</div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 14 }}>
            This removes it from sellable stock permanently and records the loss ({fmt(writeOffItem.costBasis, writeOffItem.region, regions)}) against your P&L in Reports. This can't be undone from here.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {WRITE_OFF_REASONS.map((r) => (
              <button key={r} onClick={() => setWriteOffReason(r)} style={{ padding: "7px 12px", borderRadius: 3, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${writeOffReason === r ? red : line}`, background: writeOffReason === r ? "rgba(193,85,74,0.12)" : "transparent", color: writeOffReason === r ? red : paper }}>
                {r}
              </button>
            ))}
          </div>
          <textarea value={writeOffNote} onChange={(e) => setWriteOffNote(e.target.value)} placeholder="Details (optional)"
            style={{ width: "100%", minHeight: 60, padding: 10, borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }} />
          <button onClick={() => {
              onUpdate(writeOffItem.id, { status: "written_off", writeOffReason, writeOffNote, writeOffAt: new Date().toISOString() });
              setWriteOffItem(null); setWriteOffNote(""); setWriteOffReason("Damaged");
            }} style={{ width: "100%", padding: "12px", borderRadius: 3, border: "none", background: red, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Confirm write-off
          </button>
        </div>
      </div>
    );
  }

  if (passportItem) return <PhonePassport item={inventory.find((i) => i.id === passportItem.id) || passportItem} photo={photos[`${passportItem.brand}|${passportItem.model}`]} onClose={() => setPassportItem(null)} />;

  if (labelItem) {
    return (
      <div>
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #print-label, #print-label * { visibility: visible; }
            #print-label { position: fixed; top: 0; left: 0; width: 4in; height: 2in; }
          }
        `}</style>
        <button onClick={() => setLabelItem(null)} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>← Back to inventory</button>
        <div id="print-label" style={{ background: "var(--mr-surface)", color: "#000", padding: 16, borderRadius: 3, width: "4in", boxSizing: "border-box", fontFamily: "Archivo, sans-serif" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{labelItem.brand} {labelItem.model}</div>
          <div style={{ fontSize: 11 }}>{labelItem.storage} · Grade {labelItem.gradeId || "—"} · {labelItem.id}</div>
          <div style={{ marginTop: 6 }}><Code39Barcode value={labelItem.imei} height={40} narrow={1.4} /></div>
          <div style={{ fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{labelItem.imei}</div>
        </div>
        <button onClick={() => window.print()} style={{ marginTop: 16, width: "100%", padding: "12px", borderRadius: 3, border: "none", background: "var(--mr-brand-fill)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Print label
        </button>
      </div>
    );
  }


  if (editItem) {
    return (
      <div>
        <button onClick={() => setEditItem(null)} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>← Back</button>
        <div style={{ border: `1px solid ${line}`, borderRadius: 6, padding: 16, background: panel2 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Edit {editItem.model}</div>
          <div style={{ fontSize: 12.5, color: muted, marginBottom: 10 }}>Grade and sale price are set from the stock list (the grade buttons and Change price).</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={{ fontSize: 12, color: muted }}>Model</label><input id="ed-model" defaultValue={editItem.model || ""} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} /></div>
            <div><label style={{ fontSize: 12, color: muted }}>Storage</label><input id="ed-storage" defaultValue={editItem.storage || ""} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} /></div>
            <div><label style={{ fontSize: 12, color: muted }}>Color</label><input id="ed-color" defaultValue={editItem.color || ""} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} /></div>
            <div><label style={{ fontSize: 12, color: muted }}>Year</label><input id="ed-year" defaultValue={editItem.year || ""} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} /></div>
            <div><label style={{ fontSize: 12, color: muted }}>IMEI</label><input id="ed-imei" defaultValue={editItem.imei || ""} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} /></div>
            <div><label style={{ fontSize: 12, color: muted }}>Bought from</label>
              <select id="ed-source" defaultValue={sourceOf(editItem)} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }}>
                {[...new Set([sourceOf(editItem), ...SOURCES])].map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize: 12, color: muted }}>Seller name</label><input id="ed-seller" defaultValue={editItem.sellerName || editItem.sellerIdOwnerName || ""} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} /></div>
            <div><label style={{ fontSize: 12, color: muted }}>Seller phone</label><input id="ed-sellerphone" defaultValue={editItem.sellerPhone || ""} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} /></div>
            <div><label style={{ fontSize: 12, color: muted }}>Buy Price ($)</label><input id="ed-price" type="number" defaultValue={editItem.costBasis ?? editItem.price ?? ""} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 4, border: `1px solid ${line}`, background: panel, color: paper }} /></div>
          </div>
          <button onClick={() => {
            // This is the BUY price (what we paid). It never touches the sale price on the
            // website: that's changed with "Sell Price", which refuses $0.
            const buy = Number(document.getElementById("ed-price").value);
            const patch = {
              model: document.getElementById("ed-model").value,
              storage: document.getElementById("ed-storage").value,
              color: document.getElementById("ed-color").value,
              year: document.getElementById("ed-year").value,
              imei: document.getElementById("ed-imei").value,
              source: document.getElementById("ed-source").value,
              sellerName: document.getElementById("ed-seller").value.trim(),
              sellerPhone: document.getElementById("ed-sellerphone").value.trim(),
            };
            if (Number.isFinite(buy) && buy > 0) { patch.costBasis = buy; if (editItem.costBasis == null) patch.price = buy; }
            onUpdate(editItem.id, patch);
            setEditItem(null);
          }} style={{ marginTop: 14, width: "100%", padding: 12, background: green, color: "#fff", border: "none", borderRadius: 4, fontWeight: 600, cursor: "pointer" }}>Save Changes</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input value={search} onChange={(e) => { setSearch(e.target.value); setVisibleCount(30); }} placeholder="Search IMEI, model, stock no. or order"
        aria-label="Search stock" style={{ width: "100%", padding: "10px 12px", border: `1px solid ${line}`, background: panel, color: paper, fontSize: 14, marginBottom: 10 }} />
      {(() => {
        const inStock = inventory.filter((i) => ["in_stock", "listed", "in_repair", "reserved"].includes(i.status));
        const sold30 = inventory.filter((i) => i.status === "sold" && i.soldAt && Date.now() - Date.parse(i.soldAt) < 30 * 864e5);
        return <StatTiles tiles={[
          ["Phones we own (incl. in repair)", inStock.length, `${fmt(inStock.reduce((a, i) => a + (Number(i.costBasis) || 0), 0), "AU", regions)} at cost`],
          ["To grade and price", inventory.filter((i) => i.status === "in_stock" && (!i.gradeId || !(Number(i.listedPrice) > 0))).length, "not ready to sell yet"],
          ["On the website", inventory.filter((i) => i.status === "listed").length, `${inventory.filter((i) => agedDrop(i)).length} slow sellers`],
          ["Sold, last 30 days", sold30.length, ""],
        ]} />;
      })()}
      <LayoutSwitch value={layout} onChange={setLayout} />
      {layout === "board" && (
        <FlowBoard
          columns={[
            { id: "in_repair", label: "Being repaired", lateDays: 5 },
            { id: "grade", label: "To grade & price", lateDays: 2 },
            { id: "store", label: "In store only", lateDays: 7 },
            { id: "listed", label: "On the website", lateDays: 30 },
            { id: "reserved", label: "Reserved (web order)", lateDays: 2 },
            { id: "sold", label: "Sold (last 14 days)" },
          ]}
          items={inventory.filter((i) => !search.trim() || `${i.id} ${i.brand} ${i.model} ${i.imei || ""}`.toLowerCase().includes(search.trim().toLowerCase()))}
          colOf={(i) => i.status === "in_stock" ? (!i.gradeId || !(Number(i.listedPrice) > 0) ? "grade" : "store")
            : i.status === "sold" ? (i.soldAt && Date.now() - Date.parse(i.soldAt) < 14 * 864e5 ? "sold" : null)
            : ["in_repair", "listed", "reserved"].includes(i.status) ? i.status : null}
          since={(i) => lastTime(i.status === "listed" ? i.listedAt : i.status === "sold" ? i.soldAt : i.status === "in_stock" ? (i.gradedAt || i.unlistedAt) : null, i.receivedAt, i.createdAt)}
          onOpen={(i) => { setSearch(i.id); setFilter("all"); setLayout("list"); }}
          card={(i) => ({
            right: i.id,
            title: `${i.brand} ${i.model}`,
            sub: [i.storage, i.gradeId ? `Grade ${i.gradeId}` : null, Number(i.listedPrice) > 0 ? fmt(i.listedPrice, i.region, regions) : null].filter(Boolean).join(" · "),
            chips: [...(agedDrop(i) ? [["🐢 Slow", "bad"]] : []), ...(i.faults && i.faults.length ? [[`${i.faults.length} fault${i.faults.length > 1 ? "s" : ""}`, "muted"]] : [])],
            actions: i.status === "in_stock" ? [{ label: !i.gradeId || !(Number(i.listedPrice) > 0) ? "Grade & price →" : "List it →", onClick: () => { setSearch(i.id); setFilter("all"); setLayout("list"); } }] : [],
          })} />
      )}
      {layout === "list" && <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["all", "in_stock", "in_repair", "listed", "slow", "reserved", "sold", "written_off"].map((s) => (
          <button key={s} onClick={() => { setFilter(s); setVisibleCount(30); }} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12.5, cursor: "pointer",
            border: `1px solid ${filter === s ? brass : line}`, background: filter === s ? brassDim : "transparent", color: filter === s ? brass : paper }}>
            {s === "all" ? "All" : s === "slow" ? "🐢 Slow sellers" : s.replace("_", " ")} ({s === "all" ? inventory.length : s === "slow" ? inventory.filter((i) => agedDrop(i)).length : inventory.filter((i) => i.status === s).length})
          </button>
        ))}
      </div>
      {flash && <div role="status" style={{ fontSize: 13, color: green, border: `1px solid ${line}`, padding: "8px 12px", marginBottom: 12 }}>{flash}</div>}
      <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>{filtered.length} item{filtered.length === 1 ? "" : "s"}{visibleCount < filtered.length ? ` — showing first ${visibleCount}` : ""}</div>
      {filtered.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No items here yet.</div>}
      {visible.map((item) => (
        <div key={item.id} style={{ border: `1px solid ${item.status === "written_off" ? red : line}`, borderRadius: 3, padding: 14, marginBottom: 10, background: panel }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 10 }}>
              <DeviceArt type={inferDeviceType(item.model, item.category)} size={40} brand={item.brand} model={item.model} imageUrl={photos[`${item.brand}|${item.model}`]} />
              <span><b style={{ fontSize: 14 }}>{item.brand} {item.model}</b> · {item.storage}{item.gradeId ? ` · Grade ${item.gradeId}` : ""}</span>
            </span>
            <span style={{ fontSize: 12, color: item.status === "sold" ? muted : item.status === "written_off" ? red : brass }}>{item.status.replace("_", " ")}</span>
          </div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
            IMEI {item.imei} · cost {fmt(item.costBasis, item.region, regions)} {item.sourceOrderId ? `· from ${item.sourceOrderId}` : "· in-store buy"}
            {daysIn(item) != null && item.status !== "sold" && ` · ${daysIn(item)} day${daysIn(item) === 1 ? "" : "s"} in stock`}
            {Array.isArray(item.faults) && item.faults.length > 0 && <span style={{ color: red }}> · faults: {item.faults.join(", ")}</span>}
            {item.sellerIdNumber && ` · ID ${item.sellerIdType} ending ${item.sellerIdNumber.slice(-4).padStart(item.sellerIdNumber.length, "•")}`}
          </div>
          {photoItemId === item.id && <UnitPhotos item={item} colors={colors} onSave={(patch) => onUpdate(item.id, patch)} onClose={() => setPhotoItemId(null)} />}
          {item.status === "written_off" && (
            <div style={{ fontSize: 12, color: red }}>Written off — {item.writeOffReason}{item.writeOffNote && `: ${item.writeOffNote}`}</div>
          )}
          {item.status === "in_repair" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: "#7A1F2B" }}>
              🔧 On the repair bench{item.repairJobId ? ` (${item.repairJobId})` : ""}. It comes back to stock when the job is marked done in Repairs.
              <button onClick={() => onUpdate(item.id, { status: "in_stock" })} style={{ padding: "5px 10px", fontSize: 12, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>Back to stock now</button>
            </div>
          )}
          {repairFor === item.id && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
              <input value={repairIssue} onChange={(e) => setRepairIssue(e.target.value)} autoFocus placeholder={item.faults && item.faults.length ? `What to fix (default: ${item.faults.join(", ")})` : "What to fix"}
                style={{ flex: "1 1 220px", padding: "8px 10px", fontSize: 13, border: `1px solid ${line}` }} />
              <button onClick={() => sendToRepair(item)} style={{ padding: "8px 12px", fontSize: 12.5, border: "none", background: "#7A1F2B", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Open repair job</button>
              <button onClick={() => setRepairFor(null)} style={{ padding: "8px 10px", fontSize: 12.5, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>Cancel</button>
            </div>
          )}
          {item.status === "reserved" && (
            <div style={{ fontSize: 12, color: brass, fontStyle: "italic" }}>
              Reserved for a pending online order — grading and write-off are locked until the Web Orders tab completes or cancels it.
            </div>
          )}
          {item.status !== "sold" && item.status !== "written_off" && item.status !== "reserved" && item.status !== "in_repair" && (() => {
            // Grade → price (pre-filled from the shop's standard) → list. One row, one main button.
            const cost = Number(item.costBasis) || 0;
            const standard = targetPrice(cost, item.gradeId);
            const draft = drafts[item.id] ?? String(item.listedPrice ?? standard ?? "");
            const price = parseFloat(String(draft).replace(/[$,]/g, ""));
            const priceOk = Number.isFinite(price) && price > 0;
            const listed = item.status === "listed";
            const changed = priceOk && Math.round(price) !== Math.round(Number(item.listedPrice) || 0);
            const warn = !priceOk ? "" : price < cost ? `Below what it cost us (${fmt(cost, item.region, regions)})` : standard && price < standard ? `Below the grade ${item.gradeId} standard (${fmt(standard, item.region, regions)})` : "";
            const btn = (tone, filled) => ({ padding: "8px 12px", borderRadius: 2, fontSize: 12.5, cursor: "pointer", fontWeight: 600, border: `1px solid ${tone}`, background: filled ? tone : "transparent", color: filled ? "#fff" : tone });
            return (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: muted }}>Grade</span>
                  {GRADES.map((g) => (
                    <button key={g.id} title={g.label} onClick={() => { onUpdate(item.id, { gradeId: g.id, gradedAt: new Date().toISOString() }); setDrafts((d) => ({ ...d, [item.id]: listed ? d[item.id] : String(targetPrice(cost, g.id) || "") })); }}
                      style={{ padding: "6px 10px", borderRadius: 2, fontSize: 12, cursor: "pointer", border: `1px solid ${item.gradeId === g.id ? brass : line}`, background: item.gradeId === g.id ? brassDim : "transparent", color: item.gradeId === g.id ? brass : paper }}>
                      {g.id}
                    </button>
                  ))}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                    <span style={{ fontSize: 12, color: muted }}>{listed ? "Price" : "Sell for"} $</span>
                    <input value={draft} onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))} inputMode="decimal" aria-label="Sale price"
                      style={{ width: 90, padding: "6px 8px", fontSize: 13, border: `1px solid ${warn ? "#B54708" : line}` }} />
                  </span>
                  {standard != null && <span style={{ fontSize: 12, color: muted }}>standard {fmt(standard, item.region, regions)}</span>}
                  {listed && wasPrice(item) && <span style={{ fontSize: 12, color: brass }}>shows "Was {fmt(wasPrice(item).was, item.region, regions)}" online</span>}
                </div>
                {warn && <div style={{ fontSize: 12, color: "#B54708", marginBottom: 6 }}>⚠ {warn}</div>}
                {(() => {
                  const drop = agedDrop(item);
                  return drop && !changed ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, marginBottom: 8, padding: "7px 10px", borderRadius: 8, background: "color-mix(in srgb, #B54708 10%, transparent)" }}>
                      <span>🐢 {drop.days} days {listed ? "on the website" : "in stock"}. Try {fmt(drop.suggested, item.region, regions)} (about 5% off, still above cost).</span>
                      <button onClick={() => setDrafts((d) => ({ ...d, [item.id]: String(drop.suggested) }))} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "1px solid #B54708", background: "transparent", color: "#B54708", fontWeight: 600 }}>Use {fmt(drop.suggested, item.region, regions)}</button>
                    </div>
                  ) : null;
                })()}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {!listed && (
                    <button disabled={!item.gradeId || !priceOk} title={!item.gradeId ? "Grade it first" : ""}
                      onClick={() => { onUpdate(item.id, { listedPrice: Math.round(price), ...publishPatch({ ...item, listedPrice: Math.round(price) }) }); setDrafts((d) => { const n = { ...d }; delete n[item.id]; return n; }); }}
                      style={{ ...btn(green, true), opacity: item.gradeId && priceOk ? 1 : 0.45 }}>
                      List on website{priceOk ? ` for ${fmt(price, item.region, regions)}` : ""}
                    </button>
                  )}
                  {!listed && changed && <button onClick={() => onUpdate(item.id, { listedPrice: Math.round(price) })} style={btn(brass)}>Save price (in store only)</button>}
                  {listed && changed && (
                    <button onClick={() => { const p = pricePatch(item, price); if (p) onUpdate(item.id, p); }} title={`A lower price shows "Was" online only if the old price was live ${MIN_DAYS_AT_OLD_PRICE}+ days (Australian Consumer Law).`} style={btn(brass, true)}>
                      Update price to {fmt(price, item.region, regions)}
                    </button>
                  )}
                  {listed && (
                    <button onClick={() => onUpdate(item.id, { status: "in_stock", unlistedAt: new Date().toISOString() })} style={btn(paper)}>Take off website</button>
                  )}
                  <button onClick={() => setPassportItem(item)} style={btn(brass)}>History & cost</button>
                  {item.gradeId && Number(item.listedPrice) > 0 && (
                    <button title="Copies a ready listing for Facebook Marketplace or Gumtree" onClick={async () => {
                      const l = marketplaceListing(item);
                      try { await navigator.clipboard.writeText(l.text); setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2500); }
                      catch (e) { window.prompt("Copy this listing:", l.text); }
                    }} style={btn(muted)}>{copiedId === item.id ? "✓ Listing copied" : "Copy for Marketplace"}</button>
                  )}
                  <button onClick={() => setEditItem(item)} style={btn(muted)}>Edit</button>
                  <button onClick={() => setLabelItem(item)} style={btn(muted)}>Label</button>
                  <button onClick={() => setPhotoItemId(photoItemId === item.id ? null : item.id)} style={btn(muted)}>
                    {Array.isArray(item.spinUrls) && item.spinUrls.length ? "Photos + 360° ✓" : item.photoUrl ? "Photos ✓" : "Photos"}
                  </button>
                  <button onClick={() => { setRepairFor(item.id); setRepairIssue(""); }} style={btn("#7A1F2B")}>Send to repair</button>
                  <button onClick={() => setWriteOffItem(item)} style={{ ...btn(red), marginLeft: "auto" }}>Write off</button>
                </div>
              </div>
            );
          })()}
          {(item.status === "sold" || item.status === "written_off" || item.status === "in_repair") && (
            <button onClick={() => setPassportItem(item)} style={{ marginTop: 6, padding: "6px 10px", borderRadius: 2, fontSize: 12, border: `1px solid ${brass}`, background: "transparent", color: brass, cursor: "pointer" }}>History & cost</button>
          )}
        </div>
      ))}
      {visibleCount < filtered.length && (
        <button onClick={() => setVisibleCount((c) => c + 30)}
          style={{ width: "100%", padding: "12px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, fontSize: 13, cursor: "pointer" }}>
          Load {Math.min(30, filtered.length - visibleCount)} more ({filtered.length - visibleCount} remaining)
        </button>
      )}
      </>}
    </div>
  );
}

function SellTab({ colors, inventory, regions, onSell, staffName, businessSettings }) {
  const { panel, panel2, paper, muted, brass, brassDim, green, line } = colors;
  // Listed online, or kept in store with a price set: both can be sold at the counter.
  const [find, setFind] = useState("");
  const fq = find.trim().toLowerCase();
  const sellable = inventory.filter((i) => i.status === "listed" || (i.status === "in_stock" && Number(i.listedPrice) > 0))
    .filter((i) => !fq || [i.brand, i.model, i.imei, i.id].some((v) => String(v || "").toLowerCase().includes(fq)));
  const [chosen, setChosen] = useState(null);
  const [salePrice, setSalePrice] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [payMethod, setPayMethod] = useState("cash");

  return (
    <div>
      {!chosen && !receipt && (
        <>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a phone: model, IMEI or stock no."
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${line}`, background: panel, color: paper, fontSize: 14, marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>Phones with a price, online or in store.</div>
          {sellable.length === 0 && <div style={{ color: muted, fontSize: 13 }}>{fq ? "Nothing matches." : "No phone has a price yet — grade it and set a price in the Inventory tab."}</div>}
          {sellable.map((item) => (
            <button key={item.id} onClick={() => { setChosen(item); setSalePrice(String(item.listedPrice)); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 3, border: `1px solid ${line}`, background: panel, color: paper, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13 }}>{item.brand} {item.model} · {item.storage} · Grade {item.gradeId || "—"}{item.status === "in_stock" ? " · in store only" : ""}</span>
                <span style={{ color: brass, fontSize: 13 }}>{fmt(item.listedPrice, item.region, regions)}</span>
              </div>
            </button>
          ))}
        </>
      )}

      {chosen && !receipt && (
        <div style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 16 }}>
          <div style={{ fontSize: 14, marginBottom: 10 }}>{chosen.brand} {chosen.model} · {chosen.storage} · Grade {chosen.gradeId}</div>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Customer email (for receipt & records)"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Sale price" type="number"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          {Number(salePrice) > 0 && Number(chosen.costBasis) > 0 && Number(salePrice) < Number(chosen.costBasis) && (
            <div role="alert" style={{ fontSize: 12.5, color: "#B42318", marginBottom: 10 }}>⚠ That's below what this phone cost us ({fmt(chosen.costBasis, chosen.region, regions)}).</div>
          )}
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[{ id: "cash", label: "Cash" }, { id: "card", label: "Card" }, { id: "bank", label: "Bank transfer" }].map((m) => (
              <button key={m.id} onClick={() => setPayMethod(m.id)} style={{ flex: 1, padding: "8px", borderRadius: 3, fontSize: 12, cursor: "pointer",
                border: `1px solid ${payMethod === m.id ? brass : line}`, background: payMethod === m.id ? brassDim : "transparent", color: payMethod === m.id ? brass : paper }}>
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setChosen(null)} style={{ padding: "10px 14px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: muted, fontSize: 13, cursor: "pointer" }}>Back</button>
            <button disabled={!customerName.trim() || !salePrice}
              onClick={() => {
                const sale = { customerName, customerEmail, salePrice: parseFloat(salePrice), brand: chosen.brand, model: chosen.model, storage: chosen.storage, region: chosen.region, costBasis: chosen.costBasis, payMethod };
                // One sale number for both the receipt and the records.
                const id = genId("SALE");
                onSell(chosen, { ...sale, id });
                setReceipt({ ...sale, id, staffHandled: staffName || "unattributed" });
                setChosen(null);
              }}
              style={{ flex: 1, padding: "10px", borderRadius: 3, border: "none", background: customerName.trim() && salePrice ? green : line, color: customerName.trim() && salePrice ? "#0c1a12" : muted, fontSize: 13, fontWeight: 600, cursor: customerName.trim() && salePrice ? "pointer" : "default" }}>
              Complete sale
            </button>
          </div>
        </div>
      )}

      {receipt && (() => {
        const biz = businessSettings || {};
        const gstOn = biz.gstRegistered;
        // Standard AU-style GST-inclusive pricing: the listed price already
        // includes GST, so GST component = price / 11 (i.e. price * 10/110).
        const gstAmount = gstOn ? receipt.salePrice / 11 : 0;
        const exGst = receipt.salePrice - gstAmount;
        return (
        <div style={{ border: `1px solid ${green}`, borderRadius: 3, padding: 16 }}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #print-receipt, #print-receipt * { visibility: visible; }
              #print-receipt { position: fixed; top: 0; left: 0; width: 3in; }
            }
          `}</style>
          <div id="print-receipt" style={{ marginBottom: 12 }}>
            {biz.shopName && <div style={{ fontSize: 15, marginBottom: 2 }}>{biz.shopName}</div>}
            {biz.abn && <div style={{ fontSize: 11, color: muted, marginBottom: 2 }}>ABN {biz.abn}</div>}
            {biz.address && <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>{biz.address}</div>}
            <div style={{ fontSize: 13, color: brass, marginBottom: 4 }}>{gstOn ? "TAX INVOICE" : "RECEIPT"} — {receipt.id}</div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>{receipt.brand} {receipt.model} · {receipt.storage}</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Sold to {receipt.customerName}</div>
            <div style={{ borderTop: `1px solid ${line}`, paddingTop: 8, fontSize: 12.5 }}>
              {gstOn ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Price (ex. GST)</span><span>{fmtCents(exGst, receipt.region, regions)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>GST (10%)</span><span>{fmtCents(gstAmount, receipt.region, regions)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: 4 }}><span>Total (inc. GST)</span><span>{fmtCents(receipt.salePrice, receipt.region, regions)}</span></div>
                </>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total</span><span>{fmtCents(receipt.salePrice, receipt.region, regions)}</span></div>
              )}
            </div>
            <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>{new Date().toLocaleString()}{receipt.staffHandled && ` · served by ${receipt.staffHandled}`}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.print()} style={{ flex: 1, padding: "10px", borderRadius: 3, border: `1px solid ${brass}`, background: "transparent", color: brass, fontSize: 13, cursor: "pointer" }}>
              Print {gstOn ? "tax invoice" : "receipt"}
            </button>
            <button onClick={() => setReceipt(null)} style={{ flex: 1, padding: "10px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, fontSize: 13, cursor: "pointer" }}>
              New sale
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
// rebuild 1791825853
