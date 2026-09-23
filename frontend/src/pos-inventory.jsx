import React, { useState, useEffect, useMemo } from "react";

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
const DEFAULT_CATALOG = [
  { brand: "Apple", model: "iPhone 18 Pro Max", release: "2026-09-18", retail: { "256GB": 2299, "512GB": 2699 } },
  { brand: "Apple", model: "iPhone 17 Pro Max", release: "2025-09-19", retail: { "256GB": 2199, "512GB": 2549 } },
  { brand: "Apple", model: "iPhone 16 Pro Max", release: "2024-09-20", retail: { "256GB": 2149, "512GB": 2519 } },
  { brand: "Apple", model: "iPhone 15 Pro Max", release: "2023-09-22", retail: { "256GB": 2199, "512GB": 2569, "1TB": 2939 } },
  { brand: "Apple", model: "iPhone 15 Pro", release: "2023-09-22", retail: { "128GB": 1849, "256GB": 2049 } },
  { brand: "Apple", model: "iPhone 15", release: "2023-09-22", retail: { "128GB": 1499, "256GB": 1699 } },
  { brand: "Apple", model: "iPhone 14 Pro Max", release: "2022-09-16", retail: { "128GB": 1899, "256GB": 2069 } },
  { brand: "Apple", model: "iPhone 14", release: "2022-09-16", retail: { "128GB": 1399, "256GB": 1569 } },
  { brand: "Apple", model: "iPhone 13", release: "2021-09-24", retail: { "128GB": 1349, "256GB": 1519 } },
  { brand: "Apple", model: "iPhone 12", release: "2020-10-23", retail: { "64GB": 1349, "128GB": 1429 } },
  { brand: "Apple", model: "iPhone 11", release: "2019-09-20", retail: { "64GB": 1199, "128GB": 1279 } },
  { brand: "Samsung", model: "Galaxy S25 Ultra", release: "2025-01-22", retail: { "256GB": 2049, "512GB": 2269 } },
  { brand: "Samsung", model: "Galaxy S24 Ultra", release: "2024-01-24", retail: { "256GB": 1999, "512GB": 2199 } },
  { brand: "Samsung", model: "Galaxy S23", release: "2023-02-17", retail: { "128GB": 1499 } },
  { brand: "Samsung", model: "Galaxy Z Fold6", release: "2024-07-24", retail: { "256GB": 2599 } },
  { brand: "Google", model: "Pixel 9 Pro", release: "2024-08-22", retail: { "128GB": 1699, "256GB": 1849 } },
  { brand: "Google", model: "Pixel 8", release: "2023-10-12", retail: { "128GB": 1049 } },
];
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
const FAULT_GROUPS_BY_CATEGORY = { phone: FAULT_GROUPS_DEFAULT, tablet: FAULT_GROUPS_TABLET, laptop: FAULT_GROUPS_LAPTOP, watch: FAULT_GROUPS_WATCH };

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
function fmt(n, regionCode, regionsMap) {
  const r = (regionsMap || REGIONS)[regionCode] || REGIONS.AU;
  const val = r.round >= 10 ? Math.round(n / r.round) * r.round : Math.round(n);
  return `${r.symbol}${val.toLocaleString()}`;
}

const GRADES = [
  { id: "A", label: "Grade A — Excellent", markup: 1.35 },
  { id: "B", label: "Grade B — Good", markup: 1.20 },
  { id: "C", label: "Grade C — Fair", markup: 1.08 },
  { id: "parts", label: "Parts only", markup: 0.5 },
];

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

const TABS = ["Buy", "Receive Orders", "Inventory", "Accessories", "Web Orders", "Sell"];
const ACCESSORIES_KEY = "accessories";
const ACCESSORY_CATEGORIES = ["Case", "Cable", "Charger", "Screen protector", "Other"];

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

  useEffect(() => {
    (async () => {
      const [c, o, inv, s, staff, acc, po] = await Promise.all([
        loadJSON(CONFIG_KEY, true), loadJSON(ORDERS_KEY, true), loadJSON(INVENTORY_KEY, true), loadJSON(SALES_KEY, true), loadJSON(STAFF_KEY, false), loadJSON(ACCESSORIES_KEY, true), loadJSON("purchase_orders", true),
      ]);
      setConfig(c); setOrders(o || []); setInventory(inv || []); setSales(s || []);
      const authed = getAuthedUser();
      if (authed) { setAuthedUser(authed); setStaffName(authed.username); } // real login overrides free text entirely
      else if (staff) setStaffName(staff);
      setAccessories(acc || []);
      setPurchaseOrders(po || []);
      setLoaded(true);
    })();
  }, []);
  async function persistStaffName(name) { setStaffName(name); await saveJSON(STAFF_KEY, name, false); }
  async function persistAccessories(next) { await saveJSON(ACCESSORIES_KEY, next, true); setAccessories(next); }
  async function persistPurchaseOrders(next) { await saveJSON("purchase_orders", next, true); setPurchaseOrders(next); }

  const catalog = config?.catalog?.length ? config.catalog : DEFAULT_CATALOG;
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

  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

  if (!loaded) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading POS…</div>;

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
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
            baseBuybackAUD={baseBuybackAUD}
            onComplete={async (item) => { await persistInventory([{ ...item, staffHandled: staffName || "unattributed" }, ...inventory]); setTab("Inventory"); }} />
        )}

        {tab === "Receive Orders" && (
          <ReceiveOrdersTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            orders={orders.filter((o) => o.status === "approved_paid")} regions={regions}
            onReceive={async (order, imei) => {
              const item = {
                id: genId("INV"), sourceOrderId: order.id, brand: order.device.brand, model: order.device.model,
                storage: order.device.storage, imei, gradeId: null, costBasis: order.inspection?.confirmedTotal ?? order.quotedTotal,
                currency: order.currency, region: order.region, status: "in_stock", listedPrice: null,
                receivedAt: new Date().toISOString(), soldAt: null, staffHandled: staffName || "unattributed",
              };
              await persistInventory([item, ...inventory]);
              await persistOrders(orders.map((o) => (o.id === order.id ? { ...o, receivedToInventory: true } : o)));
            }} />
        )}

        {tab === "Inventory" && (
          <InventoryTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            inventory={inventory} regions={regions}
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
          <WebOrdersTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            purchaseOrders={purchaseOrders} inventory={inventory}
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

        {tab === "Sell" && (
          <SellTab staffName={staffName} businessSettings={config?.businessSettings} colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            inventory={inventory.filter((i) => i.status !== "sold")} regions={regions}
            onSell={async (item, sale) => {
              await persistInventory(inventory.map((i) => (i.id === item.id ? { ...i, status: "sold", soldAt: new Date().toISOString() } : i)));
              await persistSales([{ ...sale, id: genId("SALE"), itemId: item.id, soldAt: new Date().toISOString(), staffHandled: staffName || "unattributed" }, ...sales]);
            }} />
        )}
      </div>
    </div>
  );
}

function Money({ n, region, regions, brass }) { return <span style={{ color: brass }}>{fmt(n, region, regions)}</span>; }

function BuyTab({ colors, catalog, tiers, faultGroupsByCategory, regions, holdingPct, baseBuybackAUD, onComplete }) {
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
            {filtered.slice(0, 10).map((d, i) => (
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
          <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI (dial *#06#)"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
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
          <button disabled={!imei.trim() || !idOwnerName.trim() || !idSighted} onClick={() => onComplete({
              id: genId("INV"), sourceOrderId: null, brand: selected.brand, model: selected.model, storage: selected.storage,
              imei: imei.trim(), gradeId: null, costBasis: calc.total, currency: regions[region].symbol, region,
              status: "in_stock", listedPrice: null, receivedAt: new Date().toISOString(), soldAt: null, payMethod,
              sellerIdType: idType, sellerIdOwnerName: idOwnerName.trim(),
            })}
            style={{ width: "100%", padding: "12px", borderRadius: 3, border: "none",
              background: imei.trim() && idOwnerName.trim() && idSighted ? brass : line, color: imei.trim() && idOwnerName.trim() && idSighted ? "#1a1408" : muted,
              fontSize: 14, fontWeight: 600, cursor: imei.trim() && idOwnerName.trim() && idSighted ? "pointer" : "default" }}>
            Complete purchase → add to inventory
          </button>
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
              style={{ flex: 1, padding: "8px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
            <button disabled={!imeiDrafts[o.id]?.trim()} onClick={() => onReceive(o, imeiDrafts[o.id].trim())}
              style={{ padding: "8px 14px", borderRadius: 3, border: "none", background: imeiDrafts[o.id]?.trim() ? brass : line, color: imeiDrafts[o.id]?.trim() ? "#1a1408" : muted, fontSize: 12.5, cursor: imeiDrafts[o.id]?.trim() ? "pointer" : "default" }}>
              Add to inventory
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebOrdersTab({ colors, purchaseOrders, inventory, onMarkPaid, onComplete, onCancel }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [filter, setFilter] = useState("open");
  const STATUS_LABELS = { pending_payment: "Awaiting payment", pending_pickup: "Awaiting pickup", paid: "Paid — ready to ship/hand over", completed: "Completed", cancelled: "Cancelled" };

  const filtered = purchaseOrders.filter((o) => {
    if (filter === "open") return !["completed", "cancelled"].includes(o.status);
    if (filter === "closed") return ["completed", "cancelled"].includes(o.status);
    return true;
  });

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>Orders placed through the online storefront.</div>
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
          {(o.status === "pending_payment" || o.status === "pending_pickup") && (
            <div style={{ display: "flex", gap: 8 }}>
              {o.paymentMethod === "bank_transfer" && (
                <button onClick={() => onMarkPaid(o.id)} style={{ flex: 1, padding: "8px", borderRadius: 3, border: "none", background: brass, color: "#1a1408", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
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
    </div>
  );
}

function AccessoriesTab({ colors, accessories, onAdd, onAdjust, onSellOne }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [name, setName] = useState(""); const [category, setCategory] = useState(ACCESSORY_CATEGORIES[0]);
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
        <button disabled={!ready} onClick={() => {
            onAdd({ name: name.trim(), category, cost: parseFloat(cost), sellPrice: parseFloat(sellPrice), qtyOnHand: parseInt(qty) });
            setName(""); setCost(""); setSellPrice(""); setQty("");
          }} style={{ width: "100%", padding: "10px", borderRadius: 3, border: "none", background: ready ? brass : line, color: ready ? "#1a1408" : muted, fontSize: 13, fontWeight: 600, cursor: ready ? "pointer" : "default" }}>
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

function InventoryTab({ colors, inventory, regions, onUpdate }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [filter, setFilter] = useState("all");
  const [labelItem, setLabelItem] = useState(null);
  const [writeOffItem, setWriteOffItem] = useState(null);
  const [writeOffReason, setWriteOffReason] = useState("Damaged");
  const [writeOffNote, setWriteOffNote] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const filtered = inventory.filter((i) => filter === "all" || i.status === filter);
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
        <div id="print-label" style={{ background: "#fff", color: "#000", padding: 16, borderRadius: 3, width: "4in", boxSizing: "border-box", fontFamily: "Archivo, sans-serif" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{labelItem.brand} {labelItem.model}</div>
          <div style={{ fontSize: 11 }}>{labelItem.storage} · Grade {labelItem.gradeId || "—"} · {labelItem.id}</div>
          <div style={{ marginTop: 6 }}><Code39Barcode value={labelItem.imei} height={40} narrow={1.4} /></div>
          <div style={{ fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{labelItem.imei}</div>
        </div>
        <button onClick={() => window.print()} style={{ marginTop: 16, width: "100%", padding: "12px", borderRadius: 3, border: "none", background: brass, color: "#1a1408", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Print label
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["all", "in_stock", "listed", "reserved", "sold", "written_off"].map((s) => (
          <button key={s} onClick={() => { setFilter(s); setVisibleCount(30); }} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12.5, cursor: "pointer",
            border: `1px solid ${filter === s ? brass : line}`, background: filter === s ? brassDim : "transparent", color: filter === s ? brass : paper }}>
            {s === "all" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>{filtered.length} item{filtered.length === 1 ? "" : "s"}{visibleCount < filtered.length ? ` — showing first ${visibleCount}` : ""}</div>
      {filtered.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No items here yet.</div>}
      {visible.map((item) => (
        <div key={item.id} style={{ border: `1px solid ${item.status === "written_off" ? red : line}`, borderRadius: 3, padding: 14, marginBottom: 10, background: panel }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13 }}>{item.brand} {item.model} · {item.storage}</span>
            <span style={{ fontSize: 12, color: item.status === "sold" ? muted : item.status === "written_off" ? red : brass }}>{item.status.replace("_", " ")}</span>
          </div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
            IMEI {item.imei} · cost {fmt(item.costBasis, item.region, regions)} {item.sourceOrderId ? `· from ${item.sourceOrderId}` : "· in-store buy"}
            {item.sellerIdNumber && ` · ID ${item.sellerIdType} ending ${item.sellerIdNumber.slice(-4).padStart(item.sellerIdNumber.length, "•")}`}
          </div>
          {item.status === "written_off" && (
            <div style={{ fontSize: 12, color: red }}>Written off — {item.writeOffReason}{item.writeOffNote && `: ${item.writeOffNote}`}</div>
          )}
          {item.status === "reserved" && (
            <div style={{ fontSize: 12, color: brass, fontStyle: "italic" }}>
              Reserved for a pending online order — grading and write-off are locked until the Web Orders tab completes or cancels it.
            </div>
          )}
          {item.status !== "sold" && item.status !== "written_off" && item.status !== "reserved" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {GRADES.map((g) => (
                <button key={g.id} onClick={() => onUpdate(item.id, { gradeId: g.id, listedPrice: Math.round(item.costBasis * g.markup) })}
                  style={{ padding: "6px 10px", borderRadius: 2, fontSize: 12, cursor: "pointer",
                    border: `1px solid ${item.gradeId === g.id ? brass : line}`, background: item.gradeId === g.id ? brassDim : "transparent", color: item.gradeId === g.id ? brass : paper }}>
                  {g.id}
                </button>
              ))}
              {item.listedPrice != null && (
                <span style={{ fontSize: 12.5, color: green, marginLeft: 6 }}>list {fmt(item.listedPrice, item.region, regions)}</span>
              )}
              <button onClick={() => setLabelItem(item)} style={{ padding: "6px 10px", borderRadius: 2, fontSize: 12, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" }}>
                Print label
              </button>
              {item.gradeId && item.status === "in_stock" && (
                <button onClick={() => onUpdate(item.id, { status: "listed" })} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12, border: `1px solid ${green}`, background: "transparent", color: green, cursor: "pointer" }}>
                  Publish listing
                </button>
              )}
              <button onClick={() => setWriteOffItem(item)} style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 2, fontSize: 12, border: `1px solid ${red}`, background: "transparent", color: red, cursor: "pointer" }}>
                Write off
              </button>
            </div>
          )}
        </div>
      ))}
      {visibleCount < filtered.length && (
        <button onClick={() => setVisibleCount((c) => c + 30)}
          style={{ width: "100%", padding: "12px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, fontSize: 13, cursor: "pointer" }}>
          Load {Math.min(30, filtered.length - visibleCount)} more ({filtered.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

function SellTab({ colors, inventory, regions, onSell, staffName, businessSettings }) {
  const { panel, panel2, paper, muted, brass, brassDim, green, line } = colors;
  const sellable = inventory.filter((i) => i.status === "listed");
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
          <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>Listed items ready to sell.</div>
          {sellable.length === 0 && <div style={{ color: muted, fontSize: 13 }}>Nothing listed yet — grade and publish items from the Inventory tab first.</div>}
          {sellable.map((item) => (
            <button key={item.id} onClick={() => { setChosen(item); setSalePrice(String(item.listedPrice)); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 3, border: `1px solid ${line}`, background: panel, color: paper, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13 }}>{item.brand} {item.model} · {item.storage} · Grade {item.gradeId}</span>
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
                onSell(chosen, sale);
                setReceipt({ ...sale, id: genId("SALE"), staffHandled: staffName || "unattributed" });
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
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Price (ex. GST)</span><span>{fmt(exGst, receipt.region, regions)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>GST (10%)</span><span>{fmt(gstAmount, receipt.region, regions)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: 4 }}><span>Total (inc. GST)</span><span>{fmt(receipt.salePrice, receipt.region, regions)}</span></div>
                </>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total</span><span>{fmt(receipt.salePrice, receipt.region, regions)}</span></div>
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
