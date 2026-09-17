import React, { useState, useEffect, useCallback } from "react";

/* =================================================================
   ADMIN PRICING CONSOLE
   This is the database. Every number the quote calculator uses —
   retail prices, the age-retention curve, brand factors, condition
   tier factors, fault percentages, region multipliers, holding
   cost — lives here in persistent storage, editable without code,
   with every change logged. This is the piece that turns "a file I
   hand-patch" into "a system your team can actually run."
================================================================= */

const CONFIG_KEY = "pricing-config";
const HISTORY_KEY = "pricing-history";

const DEFAULT_CONFIG = {
  version: 6,
  businessSettings: {
    shopName: "Your Phone Shop", abn: "", gstRegistered: true,
    address: "", phone: "", email: "", bankDetails: "",
    // Storefront trust stats — deliberately blank by default. These show
    // up on the public website, so nothing gets shown unless YOU fill it
    // in with a real number. No shop should have "13+ years in business"
    // fabricated for it on day one.
    yearsInBusiness: "", devicesSoldCount: "", googleRating: "",
  },
  holdingCostPct: 0.02,
  regions: {
    AU: { label: "Australia", currency: "AUD", symbol: "A$", mult: 1.00 },
    US: { label: "United States", currency: "USD", symbol: "$", mult: 0.70 },
    UK: { label: "United Kingdom", currency: "GBP", symbol: "£", mult: 0.46 },
    IN: { label: "India", currency: "INR", symbol: "₹", mult: 37 },
    AE: { label: "UAE", currency: "AED", symbol: "AED ", mult: 2.35 },
  },
  retentionPoints: [
    { m: 0, r: 0.80 }, { m: 12, r: 0.68 }, { m: 24, r: 0.63 },
    { m: 36, r: 0.566 }, { m: 48, r: 0.44 }, { m: 60, r: 0.311 },
    { m: 72, r: 0.22 }, { m: 84, r: 0.15 }, { m: 96, r: 0.10 }, { m: 120, r: 0.06 },
  ],
  brandFactors: {
    Apple: 1.00, Samsung: 0.88, Google: 0.80, OnePlus: 0.72,
    Xiaomi: 0.60, Oppo: 0.68, Vivo: 0.65, Motorola: 0.62, Nothing: 0.58,
  },
  tiers: [
    { id: "new", label: "Brand New", factor: 1.00 },
    { id: "asnew", label: "Like New", factor: 0.94 },
    { id: "good", label: "Good", factor: 0.89 },
    { id: "fair", label: "Fair", factor: 0.75 },
    { id: "parts", label: "Faulty / For Parts", factor: 0.09 },
  ],
  faultGroups: [
    { group: "Display", faults: [
      { id: "screen_scratch", label: "Minor scratches on screen", pct: 0.05 },
      { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
      { id: "screen_crack_severe", label: "Screen glass missing pieces", pct: 0.40 },
      { id: "dead_pixels", label: "Dead pixels or lines", pct: 0.15 },
      { id: "burn_in", label: "Screen burn-in (OLED)", pct: 0.15 },
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
  ],
  catalog: [
  { brand: "Apple", model: "iPhone 18 Pro Max", release: "2026-09-18", retail: { "256GB": 2299, "512GB": 2699 }, category: "phone" },
  { brand: "Apple", model: "iPhone 18 Pro", release: "2026-09-18", retail: { "256GB": 2099, "512GB": 2499 }, category: "phone" },
  { brand: "Apple", model: "iPhone 17 Pro Max", release: "2025-09-19", retail: { "256GB": 2199, "512GB": 2549 }, category: "phone" },
  { brand: "Apple", model: "iPhone 17 Pro", release: "2025-09-19", retail: { "128GB": 1999, "256GB": 2199 }, category: "phone" },
  { brand: "Apple", model: "iPhone 17", release: "2025-09-19", retail: { "128GB": 1399, "256GB": 1649 }, category: "phone" },
  { brand: "Apple", model: "iPhone 16 Pro Max", release: "2024-09-20", retail: { "256GB": 2149, "512GB": 2519 }, category: "phone" },
  { brand: "Apple", model: "iPhone 16 Pro", release: "2024-09-20", retail: { "128GB": 1799, "256GB": 1999 }, category: "phone" },
  { brand: "Apple", model: "iPhone 16 Plus", release: "2024-09-20", retail: { "128GB": 1599, "256GB": 1799 }, category: "phone" },
  { brand: "Apple", model: "iPhone 16", release: "2024-09-20", retail: { "128GB": 1399, "256GB": 1649 }, category: "phone" },
  { brand: "Apple", model: "iPhone 15 Pro Max", release: "2023-09-22", retail: { "256GB": 2199, "512GB": 2569, "1TB": 2939 }, category: "phone" },
  { brand: "Apple", model: "iPhone 15 Pro", release: "2023-09-22", retail: { "128GB": 1849, "256GB": 2049 }, category: "phone" },
  { brand: "Apple", model: "iPhone 15 Plus", release: "2023-09-22", retail: { "128GB": 1649, "256GB": 1849 }, category: "phone" },
  { brand: "Apple", model: "iPhone 15", release: "2023-09-22", retail: { "128GB": 1499, "256GB": 1699, "512GB": 2099 }, category: "phone" },
  { brand: "Apple", model: "iPhone 14 Pro Max", release: "2022-09-16", retail: { "128GB": 1899, "256GB": 2069, "512GB": 2409 }, category: "phone" },
  { brand: "Apple", model: "iPhone 14 Pro", release: "2022-09-16", retail: { "128GB": 1749, "256GB": 1919, "512GB": 2259 }, category: "phone" },
  { brand: "Apple", model: "iPhone 14 Plus", release: "2022-09-16", retail: { "128GB": 1579, "256GB": 1749 }, category: "phone" },
  { brand: "Apple", model: "iPhone 14", release: "2022-09-16", retail: { "128GB": 1399, "256GB": 1569 }, category: "phone" },
  { brand: "Apple", model: "iPhone 13 Pro Max", release: "2021-09-24", retail: { "128GB": 1849, "256GB": 2019 }, category: "phone" },
  { brand: "Apple", model: "iPhone 13", release: "2021-09-24", retail: { "128GB": 1349, "256GB": 1519 }, category: "phone" },
  { brand: "Apple", model: "iPhone 12", release: "2020-10-23", retail: { "64GB": 1349, "128GB": 1429, "256GB": 1579 }, category: "phone" },
  { brand: "Apple", model: "iPhone SE (2022)", release: "2022-03-18", retail: { "64GB": 719, "128GB": 789 }, category: "phone" },
  { brand: "Apple", model: "iPhone 11", release: "2019-09-20", retail: { "64GB": 1199, "128GB": 1279 }, category: "phone" },

  { brand: "Samsung", model: "Galaxy S26 Ultra", release: "2026-02-01", retail: { "256GB": 2199, "512GB": 2419 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S26+", release: "2026-02-01", retail: { "256GB": 1799, "512GB": 1999 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S26", release: "2026-02-01", retail: { "128GB": 1499, "256GB": 1599 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S25 Ultra", release: "2025-01-22", retail: { "256GB": 2049, "512GB": 2269 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S25", release: "2025-01-22", retail: { "128GB": 1399, "256GB": 1499 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S24 Ultra", release: "2024-01-24", retail: { "256GB": 1999, "512GB": 2199 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S24", release: "2024-01-24", retail: { "128GB": 1399 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S23 Ultra", release: "2023-02-17", retail: { "256GB": 1949 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S23", release: "2023-02-17", retail: { "128GB": 1499 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S22 Ultra", release: "2022-02-25", retail: { "256GB": 1849 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy S22", release: "2022-02-25", retail: { "128GB": 1349 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy Z Fold8 Ultra", release: "2026-08-14", retail: { "256GB": 2999, "512GB": 3299, "1TB": 3899 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy Z Fold8", release: "2026-08-14", retail: { "256GB": 2699, "512GB": 2999, "1TB": 3599 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy Z Flip8", release: "2026-08-14", retail: { "256GB": 1949, "512GB": 2249 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy Z Fold7", release: "2025-07-25", retail: { "256GB": 2799, "512GB": 2999 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy Z Fold6", release: "2024-07-24", retail: { "256GB": 2599 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy Z Flip7", release: "2025-07-25", retail: { "256GB": 1799 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy Z Flip6", release: "2024-07-24", retail: { "256GB": 1649 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy Z Flip5", release: "2023-07-26", retail: { "256GB": 1499 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy A56", release: "2025-03-06", retail: { "128GB": 699, "256GB": 799 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy A17", release: "2025-09-01", retail: { "128GB": 399 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy A16", release: "2025-01-08", retail: { "128GB": 349 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy A55", release: "2024-03-11", retail: { "128GB": 699 }, category: "phone" },
  { brand: "Samsung", model: "Galaxy A54", release: "2023-03-24", retail: { "128GB": 699 }, category: "phone" },

  { brand: "Google", model: "Pixel 10 Pro Fold", release: "2025-10-09", retail: { "256GB": 2699, "512GB": 2999 }, category: "phone" },
  { brand: "Google", model: "Pixel 10 Pro XL", release: "2025-08-28", retail: { "256GB": 1799, "512GB": 1999, "1TB": 2299 }, category: "phone" },
  { brand: "Google", model: "Pixel 10 Pro", release: "2025-08-28", retail: { "128GB": 1499, "256GB": 1699, "512GB": 1899 }, category: "phone" },
  { brand: "Google", model: "Pixel 10", release: "2025-08-28", retail: { "128GB": 1199, "256GB": 1399 }, category: "phone" },
  { brand: "Google", model: "Pixel 9a", release: "2025-04-10", retail: { "128GB": 849, "256GB": 949 }, category: "phone" },
  { brand: "Google", model: "Pixel 9 Pro", release: "2024-08-22", retail: { "128GB": 1699, "256GB": 1849 }, category: "phone" },
  { brand: "Google", model: "Pixel 9", release: "2024-08-22", retail: { "128GB": 1199 }, category: "phone" },
  { brand: "Google", model: "Pixel 8 Pro", release: "2023-10-12", retail: { "128GB": 1299, "256GB": 1449 }, category: "phone" },
  { brand: "Google", model: "Pixel 8", release: "2023-10-12", retail: { "128GB": 999 }, category: "phone" },
  { brand: "Google", model: "Pixel 8a", release: "2024-05-14", retail: { "128GB": 749, "256GB": 849 }, category: "phone" },
  { brand: "Google", model: "Pixel 7", release: "2022-10-13", retail: { "128GB": 999 }, category: "phone" },
  { brand: "Google", model: "Pixel 6a", release: "2022-07-28", retail: { "128GB": 749 }, category: "phone" },

  { brand: "OnePlus", model: "OnePlus 13", release: "2025-01-07", retail: { "256GB": 1499 }, category: "phone" },
  { brand: "OnePlus", model: "OnePlus 12", release: "2024-01-23", retail: { "256GB": 1399 }, category: "phone" },
  { brand: "OnePlus", model: "OnePlus 11", release: "2023-02-07", retail: { "128GB": 1099 }, category: "phone" },

  { brand: "Xiaomi", model: "Xiaomi 14", release: "2023-10-26", retail: { "256GB": 1299 }, category: "phone" },
  { brand: "Xiaomi", model: "Redmi Note 13 Pro", release: "2024-01-04", retail: { "128GB": 499 }, category: "phone" },
  { brand: "Xiaomi", model: "Mi 11", release: "2021-02-08", retail: { "128GB": 999 }, category: "phone" },

  { brand: "Oppo", model: "Find X7 Ultra", release: "2024-03-01", retail: { "256GB": 1899 }, category: "phone" },
  { brand: "Oppo", model: "Reno 11", release: "2023-11-01", retail: { "256GB": 799 }, category: "phone" },

  { brand: "Vivo", model: "X100 Pro", release: "2023-12-01", retail: { "256GB": 1699 }, category: "phone" },
  { brand: "Vivo", model: "V29", release: "2023-08-01", retail: { "128GB": 799 }, category: "phone" },


  { brand: "Motorola", model: "Edge 50 Pro", release: "2024-04-25", retail: { "256GB": 999 }, category: "phone" },
  { brand: "Motorola", model: "Razr 50", release: "2024-07-25", retail: { "256GB": 1399 }, category: "phone" },


  { brand: "Nothing", model: "Nothing Phone (3)", release: "2025-07-04", retail: { "256GB": 999, "512GB": 1149 }, category: "phone" },
  { brand: "Nothing", model: "Nothing Phone (3a) Pro", release: "2025-03-11", retail: { "128GB": 649 }, category: "phone" },
  { brand: "Nothing", model: "Nothing Phone (2a)", release: "2024-03-05", retail: { "128GB": 449 }, category: "phone" },

  { brand: "Apple", model: "Apple Watch Ultra 3", release: "2025-09-19", retail: { "49mm": 1099 }, category: "watch" },
  { brand: "Apple", model: "Apple Watch Series 11", release: "2025-09-19", retail: { "42mm": 429, "46mm": 459 }, category: "watch" },
  { brand: "Apple", model: "Apple Watch SE 3", release: "2025-09-19", retail: { "40mm": 329, "44mm": 359 }, category: "watch" },
  { brand: "Samsung", model: "Galaxy Watch Ultra 2", release: "2026-08-14", retail: { "47mm": 949 }, category: "watch" },
  { brand: "Samsung", model: "Galaxy Watch9", release: "2026-08-14", retail: { "BT": 649, "LTE": 749 }, category: "watch" },
  { brand: "Samsung", model: "Galaxy Watch7", release: "2024-07-24", retail: { "40mm": 499, "44mm": 549 }, category: "watch" },

  { brand: "Apple", model: "iPad Pro 13 (M4)", release: "2024-05-15", retail: { "256GB": 2199, "512GB": 2499 }, category: "tablet" },
  { brand: "Apple", model: "iPad Pro 11 (M4)", release: "2024-05-15", retail: { "256GB": 1699, "512GB": 1999 }, category: "tablet" },
  { brand: "Apple", model: "iPad Air 13 (M3)", release: "2025-03-12", retail: { "128GB": 1299, "256GB": 1449 }, category: "tablet" },
  { brand: "Apple", model: "iPad Air 11 (M3)", release: "2025-03-12", retail: { "128GB": 999, "256GB": 1149 }, category: "tablet" },
  { brand: "Apple", model: "iPad mini (A17 Pro)", release: "2024-10-23", retail: { "128GB": 839, "256GB": 999 }, category: "tablet" },
  { brand: "Apple", model: "iPad (11th gen, A16)", release: "2025-03-12", retail: { "128GB": 749, "256GB": 899 }, category: "tablet" },
  { brand: "Samsung", model: "Galaxy Tab S10 Ultra", release: "2024-09-25", retail: { "256GB": 2199 }, category: "tablet" },
  { brand: "Samsung", model: "Galaxy Tab A9+", release: "2023-10-17", retail: { "64GB": 399 }, category: "tablet" },

  { brand: "Apple", model: "MacBook Pro 14 (M4)", release: "2024-11-08", retail: { "512GB": 3199 }, category: "laptop" },
  { brand: "Apple", model: "MacBook Air 15 (M4)", release: "2025-03-12", retail: { "256GB": 2399 }, category: "laptop" },
  { brand: "Apple", model: "MacBook Air 13 (M4)", release: "2025-03-12", retail: { "256GB": 2099 }, category: "laptop" },
  { brand: "Apple", model: "MacBook Neo", release: "2026-06-01", retail: { "256GB": 1049 }, category: "laptop" },
  ],
};
const CONFIG_VERSION = 6;
const CATEGORY_FACTOR = { phone: 1.00, tablet: 1.05, laptop: 1.15, watch: 0.70 };

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadConfig() {
  if (!storageAvailable()) return null;
  try {
    const r = await window.storage.get(CONFIG_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveConfig(config) {
  if (!storageAvailable()) return false;
  try {
    await window.storage.set(CONFIG_KEY, JSON.stringify(config), true);
    return true;
  } catch (e) {
    return false;
  }
}
async function loadHistory() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(HISTORY_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function pushHistory(entries) {
  const existing = await loadHistory();
  const updated = [...entries, ...existing].slice(0, 200);
  if (storageAvailable()) {
    try { await window.storage.set(HISTORY_KEY, JSON.stringify(updated), true); } catch (e) { /* keep in-memory only */ }
  }
  return updated;
}

const PRICE_MATCH_KEY = "price_match_requests";
async function loadPriceMatches() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(PRICE_MATCH_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function savePriceMatches(list) {
  if (!storageAvailable()) return false;
  try { await window.storage.set(PRICE_MATCH_KEY, JSON.stringify(list), true); return true; } catch (e) { return false; }
}

const TABS = ["Business", "Catalog", "Age Curve", "Brand Factors", "Condition Tiers", "Faults", "Regions", "Price Matches", "History"];

export default function AdminPricingConsole() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [priceMatches, setPriceMatches] = useState([]);
  const [tab, setTab] = useState("Catalog");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [persisted, setPersisted] = useState(true);

  const init = useCallback(async () => {
    setLoading(true);
    // Never hang forever: fall back to defaults after 4s no matter what.
    const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), 4000));
    const work = (async () => {
      let c = await loadConfig();
      let isNew = false;
      let migrated = false;
      if (!c) { c = DEFAULT_CONFIG; isNew = true; }
      else if ((c.version || 1) < CONFIG_VERSION) {
        // Migration: earlier version only seeded 17 catalog entries.
        // Bring the catalog up to the full list without touching any
        // prices staff may have already edited for models that existed before.
        const prevByKey = Object.fromEntries(c.catalog.map((d) => [d.brand + "|" + d.model, d]));
        c = { ...c, version: CONFIG_VERSION, catalog: DEFAULT_CONFIG.catalog.map((d) => prevByKey[d.brand + "|" + d.model] || d) };
        // Merge in any NEW businessSettings fields (like the storefront
        // stats) without wiping fields the shop already set — same
        // preserve-existing-edits principle as the catalog merge above.
        c.businessSettings = { ...DEFAULT_CONFIG.businessSettings, ...(c.businessSettings || {}) };
        migrated = true;
      }
      const ok = (isNew || migrated) ? await saveConfig(c) : true;
      if (isNew && ok) {
        await pushHistory([{ ts: Date.now(), field: "system", note: "Initialized pricing database with default values" }]);
      }
      if (migrated && ok) {
        await pushHistory([{ ts: Date.now(), field: "system", note: `Migrated catalog to v${CONFIG_VERSION} — now ${DEFAULT_CONFIG.catalog.length} devices across phones/tablets/laptops/watches, kept existing price edits` }]);
      }
      const h = await loadHistory();
      const pm = await loadPriceMatches();
      return { c, h, pm, persisted: storageAvailable() && ok };
    })();
    const result = await Promise.race([work, timeout]);
    if (result === "timeout" || !result) {
      setConfig(DEFAULT_CONFIG);
      setDraft(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
      setHistory([]);
      setPriceMatches([]);
      setPersisted(false);
    } else {
      setConfig(result.c);
      setDraft(JSON.parse(JSON.stringify(result.c)));
      setHistory(result.h);
      setPriceMatches(result.pm);
      setPersisted(result.persisted);
    }
    setLoading(false);
  }, []);

  useEffect(() => { init(); }, [init]);

  const dirty = config && draft && JSON.stringify(config) !== JSON.stringify(draft);

  const diffSummary = useCallback((oldC, newC, section) => {
    const notes = [];
    if (section === "businessSettings") {
      Object.keys(newC.businessSettings).forEach((k) => {
        if (oldC.businessSettings[k] !== newC.businessSettings[k]) notes.push(`${k}: "${oldC.businessSettings[k]}" → "${newC.businessSettings[k]}"`);
      });
    } else if (section === "catalog") {
      newC.catalog.forEach((d, i) => {
        const old = oldC.catalog[i];
        if (!old) { notes.push(`Added ${d.brand} ${d.model}`); return; }
        Object.keys(d.retail).forEach((s) => {
          if (old.retail[s] !== d.retail[s]) notes.push(`${d.brand} ${d.model} ${s}: $${old.retail[s]} → $${d.retail[s]}`);
        });
      });
    } else if (section === "retentionPoints") {
      newC.retentionPoints.forEach((p, i) => {
        const old = oldC.retentionPoints[i];
        if (old && old.r !== p.r) notes.push(`${p.m}mo retention: ${(old.r * 100).toFixed(1)}% → ${(p.r * 100).toFixed(1)}%`);
      });
    } else if (section === "brandFactors") {
      Object.keys(newC.brandFactors).forEach((b) => {
        if (oldC.brandFactors[b] !== newC.brandFactors[b]) notes.push(`${b} factor: ${oldC.brandFactors[b]} → ${newC.brandFactors[b]}`);
      });
    } else if (section === "tiers") {
      newC.tiers.forEach((t, i) => {
        const old = oldC.tiers[i];
        if (old && old.factor !== t.factor) notes.push(`${t.label} tier: ${(old.factor * 100).toFixed(0)}% → ${(t.factor * 100).toFixed(0)}%`);
      });
    } else if (section === "faultGroups") {
      newC.faultGroups.forEach((g, gi) => {
        g.faults.forEach((f, fi) => {
          const old = oldC.faultGroups[gi]?.faults[fi];
          if (old && old.pct !== f.pct) notes.push(`"${f.label}": ${(old.pct * 100).toFixed(0)}% → ${(f.pct * 100).toFixed(0)}%`);
        });
      });
    } else if (section === "regions") {
      Object.keys(newC.regions).forEach((r) => {
        if (oldC.regions[r].mult !== newC.regions[r].mult) notes.push(`${r} multiplier: ${oldC.regions[r].mult} → ${newC.regions[r].mult}`);
      });
    } else if (section === "holdingCostPct") {
      if (oldC.holdingCostPct !== newC.holdingCostPct) notes.push(`Holding cost: ${(oldC.holdingCostPct * 100).toFixed(1)}% → ${(newC.holdingCostPct * 100).toFixed(1)}%`);
    }
    return notes;
  }, []);

  async function handleSave(section) {
    const notes = diffSummary(config, draft, section);
    if (notes.length === 0) { setStatus("No changes to save."); setTimeout(() => setStatus(""), 2000); return; }
    setStatus("Saving…");
    try {
      await saveConfig(draft);
      const entries = notes.map((note) => ({ ts: Date.now(), field: section, note }));
      const h = await pushHistory(entries);
      setConfig(JSON.parse(JSON.stringify(draft)));
      setHistory(h);
      setStatus(`Saved ${notes.length} change${notes.length > 1 ? "s" : ""}.`);
      setTimeout(() => setStatus(""), 2500);
    } catch (e) {
      setStatus("Save failed — try again.");
    }
  }

  function discardSection() {
    setDraft(JSON.parse(JSON.stringify(config)));
    setStatus("Discarded unsaved changes.");
    setTimeout(() => setStatus(""), 2000);
  }

  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#BE3F29", brassDim = "rgba(190,63,41,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

  const numInput = (value, onChange, opts = {}) => (
    <input
      type="number"
      step={opts.step || "0.01"}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={{ width: opts.width || 76, padding: "6px 8px", borderRadius: 2, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13 }}
    />
  );

  if (loading) {
    return (
      <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif", display: "flex", alignItems: "center", gap: 10 }}>
        <span>Loading pricing database…</span>
      </div>
    );
  }

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: "-0.01em", marginBottom: 4 }}>Pricing Console</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 18 }}>
          Every number your quote calculator uses lives here. Changes save to a shared database — visible to anyone with this console open — and every edit is logged below.
        </div>
        {!persisted && (
          <div style={{ border: `1px solid ${red}`, borderRadius: 3, padding: "10px 14px", marginBottom: 18, fontSize: 12.5, color: red }}>
            Storage isn't available right now, so this is running on defaults only — nothing you change here will save. Try reopening this artifact; if it keeps happening, the storage backend may be down.
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20, borderBottom: `1px solid ${line}`, paddingBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                border: `1px solid ${tab === t ? brass : line}`, background: tab === t ? brassDim : "transparent",
                color: tab === t ? brass : paper }}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Business" && (
          <Section title="Business details — shown on every invoice and receipt" onSave={() => handleSave("businessSettings")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {[
              { key: "shopName", label: "Shop name" }, { key: "abn", label: "ABN (or local business number)" },
              { key: "address", label: "Business address" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }}>{f.label}</label>
                <input value={draft.businessSettings[f.key]} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, [f.key]: e.target.value } })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }}>Bank details for customer transfers (shown on payout/purchase invoices)</label>
              <textarea value={draft.businessSettings.bankDetails} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, bankDetails: e.target.value } })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, minHeight: 60, boxSizing: "border-box" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={draft.businessSettings.gstRegistered} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, gstRegistered: e.target.checked } })} />
              Registered for GST (10%) — shows a GST breakdown on invoices when on
            </label>

            <div style={{ fontSize: 13, marginTop: 20, marginBottom: 4 }}>Storefront trust stats (optional)</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
              Shown on the public website if filled in. Leave blank to hide — never fabricate a number here just to look established.
            </div>
            {[
              { key: "yearsInBusiness", label: "Years in business", placeholder: "e.g. 3" },
              { key: "devicesSoldCount", label: "Devices sold (lifetime, approx.)", placeholder: "e.g. 850" },
              { key: "googleRating", label: "Google rating (out of 5)", placeholder: "e.g. 4.8" },
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }}>{f.label}</label>
                <input value={draft.businessSettings[f.key]} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, [f.key]: e.target.value } })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
          </Section>
        )}

        {tab === "Catalog" && (
          <Section title="Device retail prices (AUD)" onSave={() => handleSave("catalog")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {draft.catalog.map((d, di) => (
              <div key={d.brand + d.model} style={{ padding: "10px 0", borderTop: di === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>{d.brand} {d.model} <span style={{ color: muted }}>· released {d.release}</span></div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {Object.keys(d.retail).map((s) => (
                    <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: muted }}>
                      {s}
                      {numInput(d.retail[s], (v) => {
                        const next = { ...draft };
                        next.catalog = [...next.catalog];
                        next.catalog[di] = { ...d, retail: { ...d.retail, [s]: v } };
                        setDraft(next);
                      }, { step: "1", width: 70 })}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </Section>
        )}

        {tab === "Age Curve" && (
          <Section title="Retention curve — % of retail retained by age" onSave={() => handleSave("retentionPoints")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
              Anchored: 36mo and 60mo are calibrated against real Mobile Monster prices. Edit the rest as you gather more data.
            </div>
            {draft.retentionPoints.map((p, i) => (
              <div key={p.m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ width: 70, fontSize: 13 }}>{p.m} months</div>
                {numInput((p.r * 100).toFixed(1), (v) => {
                  const next = { ...draft };
                  next.retentionPoints = draft.retentionPoints.map((pp, ii) => ii === i ? { ...pp, r: v / 100 } : pp);
                  setDraft(next);
                }, { step: "0.1" })}
                <span style={{ fontSize: 12, color: muted }}>%</span>
              </div>
            ))}
          </Section>
        )}

        {tab === "Brand Factors" && (
          <Section title="Brand liquidity factor" onSave={() => handleSave("brandFactors")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Multiplies the age curve. 1.00 = holds value like Apple. Only Apple is verified against real data — the rest are estimates.</div>
            {Object.keys(draft.brandFactors).map((b, i) => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ width: 100, fontSize: 13 }}>{b}</div>
                {numInput(draft.brandFactors[b], (v) => setDraft({ ...draft, brandFactors: { ...draft.brandFactors, [b]: v } }))}
              </div>
            ))}
          </Section>
        )}

        {tab === "Condition Tiers" && (
          <Section title="Condition tier factors" onSave={() => handleSave("tiers")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {draft.tiers.map((t, i) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ width: 160, fontSize: 13 }}>{t.label}</div>
                {numInput((t.factor * 100).toFixed(0), (v) => {
                  const next = { ...draft };
                  next.tiers = draft.tiers.map((tt, ii) => ii === i ? { ...tt, factor: v / 100 } : tt);
                  setDraft(next);
                }, { step: "1" })}
                <span style={{ fontSize: 12, color: muted }}>%</span>
              </div>
            ))}
          </Section>
        )}

        {tab === "Faults" && (
          <Section title="Fault deduction percentages" onSave={() => handleSave("faultGroups")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {draft.faultGroups.map((g, gi) => (
              <div key={g.group} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: brass, marginBottom: 6 }}>{g.group}</div>
                {g.faults.map((f, fi) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: fi === 0 ? "none" : `1px solid ${line}` }}>
                    <div style={{ fontSize: 13 }}>{f.label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {numInput((f.pct * 100).toFixed(0), (v) => {
                        const next = { ...draft };
                        next.faultGroups = draft.faultGroups.map((gg, gii) =>
                          gii === gi ? { ...gg, faults: gg.faults.map((ff, fii) => fii === fi ? { ...ff, pct: v / 100 } : ff) } : gg
                        );
                        setDraft(next);
                      }, { step: "1" })}
                      <span style={{ fontSize: 12, color: muted }}>%</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </Section>
        )}

        {tab === "Regions" && (
          <Section title="Region multipliers (relative to AUD)" onSave={() => handleSave("regions")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {Object.keys(draft.regions).map((code, i) => (
              <div key={code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ width: 160, fontSize: 13 }}>{draft.regions[code].label} ({draft.regions[code].currency})</div>
                {numInput(draft.regions[code].mult, (v) => setDraft({ ...draft, regions: { ...draft.regions, [code]: { ...draft.regions[code], mult: v } } }), { step: "0.01" })}
              </div>
            ))}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${line}` }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Holding & refurb cost</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {numInput((draft.holdingCostPct * 100).toFixed(1), (v) => setDraft({ ...draft, holdingCostPct: v / 100 }), { step: "0.1" })}
                <span style={{ fontSize: 12, color: muted }}>%</span>
              </div>
            </div>
          </Section>
        )}

        {tab === "Price Matches" && (
          <PriceMatchesTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            requests={priceMatches} regions={draft.regions}
            onApprove={async (id, approvedPrice, note) => {
              const next = priceMatches.map((r) => r.id === id ? { ...r, status: "approved", approvedPrice, staffNote: note } : r);
              await savePriceMatches(next); setPriceMatches(next);
              await pushHistory([{ ts: Date.now(), field: "price_match", note: `Approved price match ${id} at ${approvedPrice}` }]);
              setHistory(await loadHistory());
            }}
            onDeny={async (id, note) => {
              const next = priceMatches.map((r) => r.id === id ? { ...r, status: "denied", staffNote: note } : r);
              await savePriceMatches(next); setPriceMatches(next);
              await pushHistory([{ ts: Date.now(), field: "price_match", note: `Denied price match ${id}${note ? `: ${note}` : ""}` }]);
              setHistory(await loadHistory());
            }} />
        )}

        {tab === "History" && (
          <div>
            <div style={{ fontSize: 15, marginBottom: 4 }}>Edit history</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 14 }}>Every saved change, most recent first. Nothing here can be un-logged — mistakes are visible, not hidden.</div>
            {history.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No changes yet.</div>}
            {history.map((h, i) => (
              <div key={i} style={{ padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 13 }}>
                <div>{h.note}</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{h.field} · {new Date(h.ts).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, onSave, onDiscard, dirty, status, line, muted }) {
  const brass = "#BE3F29", panel = "#FFFFFF", paper = "#201C18";
  return (
    <div>
      <div style={{ fontSize: 15, marginBottom: 12 }}>{title}</div>
      <div style={{ marginBottom: 16 }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "sticky", bottom: 12, background: panel, border: `1px solid ${line}`, borderRadius: 3, padding: "10px 14px" }}>
        <button onClick={onSave} disabled={!dirty}
          style={{ padding: "9px 18px", borderRadius: 3, border: "none", background: dirty ? brass : line, color: dirty ? "#1a1408" : muted, fontSize: 13, fontWeight: 600, cursor: dirty ? "pointer" : "default" }}>
          Save changes
        </button>
        {dirty && <button onClick={onDiscard} style={{ padding: "9px 14px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: muted, fontSize: 13, cursor: "pointer" }}>Discard</button>}
        {status && <span style={{ fontSize: 12, color: muted }}>{status}</span>}
      </div>
    </div>
  );
}

function PriceMatchesTab({ colors, requests, regions, onApprove, onDeny }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [drafts, setDrafts] = useState({});
  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  const fmt = (n, regionCode) => {
    const r = (regions && regions[regionCode]) || { symbol: "$" };
    return `${r.symbol}${Math.round(n || 0).toLocaleString()}`;
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
        Customer-submitted "beat this quote" requests. Approving sets the price customers see when they track their request — it doesn't automatically change anything else.
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Pending ({pending.length})</div>
      {pending.length === 0 && <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>Nothing waiting.</div>}
      {pending.map((r) => {
        const d = drafts[r.id] || { price: String(r.competitorPrice), note: "" };
        return (
          <div key={r.id} style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>{r.id}</span>
              <span style={{ fontSize: 12, color: muted }}>{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>{r.device ? `${r.device.brand} ${r.device.model} · ${r.device.storage}` : "No device on file"}</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
              Our quote: {fmt(r.ourQuote, r.region)} · {r.competitorName} quoted: <span style={{ color: red }}>{fmt(r.competitorPrice, r.region)}</span>
              {r.note && <div style={{ marginTop: 4 }}>Customer note: {r.note}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={d.price} onChange={(e) => setDrafts((s) => ({ ...s, [r.id]: { ...d, price: e.target.value } }))} placeholder="Price to match at" type="number"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
            </div>
            <input value={d.note} onChange={(e) => setDrafts((s) => ({ ...s, [r.id]: { ...d, note: e.target.value } }))} placeholder="Note to customer (required if denying)"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onApprove(r.id, parseFloat(d.price), d.note)} style={{ flex: 1, padding: "9px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                Approve at this price
              </button>
              <button onClick={() => d.note.trim() && onDeny(r.id, d.note)} disabled={!d.note.trim()}
                style={{ flex: 1, padding: "9px", borderRadius: 3, border: `1px solid ${red}`, background: "transparent", color: red, fontSize: 12.5, cursor: d.note.trim() ? "pointer" : "default", opacity: d.note.trim() ? 1 : 0.5 }}>
                Deny (needs a note)
              </button>
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: 13, marginBottom: 8, marginTop: 20 }}>Resolved ({resolved.length})</div>
      {resolved.slice(0, 20).map((r) => (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
          <span>{r.id} · {r.competitorName}</span>
          <span style={{ color: r.status === "approved" ? green : muted }}>{r.status === "approved" ? `matched at ${fmt(r.approvedPrice, r.region)}` : "denied"}</span>
        </div>
      ))}
    </div>
  );
}
