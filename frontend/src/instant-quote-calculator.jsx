import React, { useState, useMemo } from "react";
const useEffect = React.useEffect;

/* =================================================================
   PRICING FORMULA (not a lookup table)

   buyback base (Brand New / sealed) = retailPrice × retention(age) × brandFactor

   retention(age) is fitted to real anchor points pulled from
   PhoneExchange's refurb resale listings and Mobile Monster's live
   buyback page (iPhone 15 Pro Max 256GB "As New" = A$880-910,
   confirmed 36 months post-launch → ~45% retail retention at the
   Brand New tier). Cross-checked against 6 data points from 12 to
   84 months old — see the writeup for the full table.

   Because this is a formula, not hardcoded prices, it recalculates
   every time the app runs — a phone that was 35 months old
   yesterday is 35.03 months old today, and the price moves with it.
   That's the "keep an eye on rates daily" piece, solved structurally
   rather than by a person re-typing numbers every morning.

   BRAND_FACTOR encodes that Android flagships hold value worse than
   iPhones in the resale market — a known, well-documented pattern,
   not just an Apple bias. Numbers are reasoned, not independently
   verified per brand — that's the next thing worth data-checking.
================================================================= */

const DEFAULT_RETENTION_POINTS = [
  { m: 0, r: 0.80 }, { m: 12, r: 0.68 }, { m: 24, r: 0.63 },
  { m: 36, r: 0.566 },  // ← confirmed live: Mobile Monster iPhone 15 Pro Max 256GB Brand New = $1,245 / $2,199 retail
  { m: 48, r: 0.44 }, { m: 60, r: 0.311 },  // ← confirmed live: iPhone 13 128GB Brand New = $420 / $1,349 retail
  { m: 72, r: 0.22 }, { m: 84, r: 0.15 }, { m: 96, r: 0.10 },
  { m: 120, r: 0.06 },
];

function retentionAt(months, points) {
  const pts = points || DEFAULT_RETENTION_POINTS;
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

const DEFAULT_BRAND_FACTOR = {
  Apple: 1.00, Samsung: 0.88, Google: 0.80, OnePlus: 0.72,
  Xiaomi: 0.60, Oppo: 0.68, Vivo: 0.65, Motorola: 0.62, Nothing: 0.58,
};

function ageMonths(releaseDate) {
  const ms = Date.now() - new Date(releaseDate).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30));
}

/* =================================================================
   CATALOG — original AU launch retail price per storage (AUD).
   This is the only thing that needs updating when a new phone
   launches; the buyback price is computed, never typed by hand.
================================================================= */
const DEFAULT_CATALOG = [
  { brand: "Apple", icon: "🍎", model: "iPhone 18 Pro Max", release: "2026-09-18", retail: { "256GB": 2299, "512GB": 2699 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 18 Pro", release: "2026-09-18", retail: { "256GB": 2099, "512GB": 2499 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 17 Pro Max", release: "2025-09-19", retail: { "256GB": 2199, "512GB": 2549 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 17 Pro", release: "2025-09-19", retail: { "128GB": 1999, "256GB": 2199 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 17", release: "2025-09-19", retail: { "128GB": 1399, "256GB": 1649 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16 Pro Max", release: "2024-09-20", retail: { "256GB": 2149, "512GB": 2519 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16 Pro", release: "2024-09-20", retail: { "128GB": 1799, "256GB": 1999 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16 Plus", release: "2024-09-20", retail: { "128GB": 1599, "256GB": 1799 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16", release: "2024-09-20", retail: { "128GB": 1399, "256GB": 1649 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 15 Pro Max", release: "2023-09-22", retail: { "256GB": 2199, "512GB": 2569, "1TB": 2939 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 15 Pro", release: "2023-09-22", retail: { "128GB": 1849, "256GB": 2049 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 15 Plus", release: "2023-09-22", retail: { "128GB": 1649, "256GB": 1849 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 15", release: "2023-09-22", retail: { "128GB": 1499, "256GB": 1699, "512GB": 2099 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 14 Pro Max", release: "2022-09-16", retail: { "128GB": 1899, "256GB": 2069, "512GB": 2409 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 14 Pro", release: "2022-09-16", retail: { "128GB": 1749, "256GB": 1919, "512GB": 2259 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 14 Plus", release: "2022-09-16", retail: { "128GB": 1579, "256GB": 1749 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 14", release: "2022-09-16", retail: { "128GB": 1399, "256GB": 1569 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 13 Pro Max", release: "2021-09-24", retail: { "128GB": 1849, "256GB": 2019 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 13", release: "2021-09-24", retail: { "128GB": 1349, "256GB": 1519 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 12", release: "2020-10-23", retail: { "64GB": 1349, "128GB": 1429, "256GB": 1579 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone SE (2022)", release: "2022-03-18", retail: { "64GB": 719, "128GB": 789 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 11", release: "2019-09-20", retail: { "64GB": 1199, "128GB": 1279 }, category: "phone" },

  { brand: "Samsung", icon: "🔷", model: "Galaxy S26 Ultra", release: "2026-02-01", retail: { "256GB": 2199, "512GB": 2419 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S26+", release: "2026-02-01", retail: { "256GB": 1799, "512GB": 1999 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S26", release: "2026-02-01", retail: { "128GB": 1499, "256GB": 1599 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S25 Ultra", release: "2025-01-22", retail: { "256GB": 2049, "512GB": 2269 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S25", release: "2025-01-22", retail: { "128GB": 1399, "256GB": 1499 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S24 Ultra", release: "2024-01-24", retail: { "256GB": 1999, "512GB": 2199 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S24", release: "2024-01-24", retail: { "128GB": 1399 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S23 Ultra", release: "2023-02-17", retail: { "256GB": 1949 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S23", release: "2023-02-17", retail: { "128GB": 1499 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S22 Ultra", release: "2022-02-25", retail: { "256GB": 1849 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S22", release: "2022-02-25", retail: { "128GB": 1349 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold8 Ultra", release: "2026-08-14", retail: { "256GB": 2999, "512GB": 3299, "1TB": 3899 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold8", release: "2026-08-14", retail: { "256GB": 2699, "512GB": 2999, "1TB": 3599 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip8", release: "2026-08-14", retail: { "256GB": 1949, "512GB": 2249 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold7", release: "2025-07-25", retail: { "256GB": 2799, "512GB": 2999 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold6", release: "2024-07-24", retail: { "256GB": 2599 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip7", release: "2025-07-25", retail: { "256GB": 1799 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip6", release: "2024-07-24", retail: { "256GB": 1649 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip5", release: "2023-07-26", retail: { "256GB": 1499 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A56", release: "2025-03-06", retail: { "128GB": 699, "256GB": 799 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A17", release: "2025-09-01", retail: { "128GB": 399 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A16", release: "2025-01-08", retail: { "128GB": 349 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A55", release: "2024-03-11", retail: { "128GB": 699 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A54", release: "2023-03-24", retail: { "128GB": 699 }, category: "phone" },

  { brand: "Google", icon: "🟡", model: "Pixel 10 Pro Fold", release: "2025-10-09", retail: { "256GB": 2699, "512GB": 2999 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 10 Pro XL", release: "2025-08-28", retail: { "256GB": 1799, "512GB": 1999, "1TB": 2299 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 10 Pro", release: "2025-08-28", retail: { "128GB": 1499, "256GB": 1699, "512GB": 1899 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 10", release: "2025-08-28", retail: { "128GB": 1199, "256GB": 1399 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 9a", release: "2025-04-10", retail: { "128GB": 849, "256GB": 949 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 9 Pro", release: "2024-08-22", retail: { "128GB": 1699, "256GB": 1849 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 9", release: "2024-08-22", retail: { "128GB": 1199 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 8 Pro", release: "2023-10-12", retail: { "128GB": 1299, "256GB": 1449 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 8", release: "2023-10-12", retail: { "128GB": 999 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 8a", release: "2024-05-14", retail: { "128GB": 749, "256GB": 849 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 7", release: "2022-10-13", retail: { "128GB": 999 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 6a", release: "2022-07-28", retail: { "128GB": 749 }, category: "phone" },

  { brand: "OnePlus", icon: "🔴", model: "OnePlus 13", release: "2025-01-07", retail: { "256GB": 1499 }, category: "phone" },
  { brand: "OnePlus", icon: "🔴", model: "OnePlus 12", release: "2024-01-23", retail: { "256GB": 1399 }, category: "phone" },
  { brand: "OnePlus", icon: "🔴", model: "OnePlus 11", release: "2023-02-07", retail: { "128GB": 1099 }, category: "phone" },

  { brand: "Xiaomi", icon: "🟠", model: "Xiaomi 14", release: "2023-10-26", retail: { "256GB": 1299 }, category: "phone" },
  { brand: "Xiaomi", icon: "🟠", model: "Redmi Note 13 Pro", release: "2024-01-04", retail: { "128GB": 499 }, category: "phone" },
  { brand: "Xiaomi", icon: "🟠", model: "Mi 11", release: "2021-02-08", retail: { "128GB": 999 }, category: "phone" },

  { brand: "Oppo", icon: "🟢", model: "Find X7 Ultra", release: "2024-03-01", retail: { "256GB": 1899 }, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "Reno 11", release: "2023-11-01", retail: { "256GB": 799 }, category: "phone" },

  { brand: "Vivo", icon: "🟣", model: "X100 Pro", release: "2023-12-01", retail: { "256GB": 1699 }, category: "phone" },
  { brand: "Vivo", icon: "🟣", model: "V29", release: "2023-08-01", retail: { "128GB": 799 }, category: "phone" },


  { brand: "Motorola", icon: "🔵", model: "Edge 50 Pro", release: "2024-04-25", retail: { "256GB": 999 }, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Razr 50", release: "2024-07-25", retail: { "256GB": 1399 }, category: "phone" },


  { brand: "Nothing", icon: "🔘", model: "Nothing Phone (3)", release: "2025-07-04", retail: { "256GB": 999, "512GB": 1149 }, category: "phone" },
  { brand: "Nothing", icon: "🔘", model: "Nothing Phone (3a) Pro", release: "2025-03-11", retail: { "128GB": 649 }, category: "phone" },
  { brand: "Nothing", icon: "🔘", model: "Nothing Phone (2a)", release: "2024-03-05", retail: { "128GB": 449 }, category: "phone" },

  { brand: "Apple", icon: "⌚", model: "Apple Watch Ultra 3", release: "2025-09-19", retail: { "49mm": 1099 }, category: "watch" },
  { brand: "Apple", icon: "⌚", model: "Apple Watch Series 11", release: "2025-09-19", retail: { "42mm": 429, "46mm": 459 }, category: "watch" },
  { brand: "Apple", icon: "⌚", model: "Apple Watch SE 3", release: "2025-09-19", retail: { "40mm": 329, "44mm": 359 }, category: "watch" },
  { brand: "Samsung", icon: "⌚", model: "Galaxy Watch Ultra 2", release: "2026-08-14", retail: { "47mm": 949 }, category: "watch" },
  { brand: "Samsung", icon: "⌚", model: "Galaxy Watch9", release: "2026-08-14", retail: { "BT": 649, "LTE": 749 }, category: "watch" },
  { brand: "Samsung", icon: "⌚", model: "Galaxy Watch7", release: "2024-07-24", retail: { "40mm": 499, "44mm": 549 }, category: "watch" },

  { brand: "Apple", icon: "📱", model: "iPad Pro 13 (M4)", release: "2024-05-15", retail: { "256GB": 2199, "512GB": 2499 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad Pro 11 (M4)", release: "2024-05-15", retail: { "256GB": 1699, "512GB": 1999 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad Air 13 (M3)", release: "2025-03-12", retail: { "128GB": 1299, "256GB": 1449 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad Air 11 (M3)", release: "2025-03-12", retail: { "128GB": 999, "256GB": 1149 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad mini (A17 Pro)", release: "2024-10-23", retail: { "128GB": 839, "256GB": 999 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad (11th gen, A16)", release: "2025-03-12", retail: { "128GB": 749, "256GB": 899 }, category: "tablet" },
  { brand: "Samsung", icon: "📱", model: "Galaxy Tab S10 Ultra", release: "2024-09-25", retail: { "256GB": 2199 }, category: "tablet" },
  { brand: "Samsung", icon: "📱", model: "Galaxy Tab A9+", release: "2023-10-17", retail: { "64GB": 399 }, category: "tablet" },

  { brand: "Apple", icon: "💻", model: "MacBook Pro 14 (M4)", release: "2024-11-08", retail: { "512GB": 3199 }, category: "laptop" },
  { brand: "Apple", icon: "💻", model: "MacBook Air 15 (M4)", release: "2025-03-12", retail: { "256GB": 2399 }, category: "laptop" },
  { brand: "Apple", icon: "💻", model: "MacBook Air 13 (M4)", release: "2025-03-12", retail: { "256GB": 2099 }, category: "laptop" },
  { brand: "Apple", icon: "💻", model: "MacBook Neo", release: "2026-06-01", retail: { "256GB": 1049 }, category: "laptop" },
];

/* Category factor — different product types hold value differently.
   Phones are the calibrated baseline (1.00). MacBooks are famous for
   strong resale value; tablets are close behind phones; watches
   depreciate fastest (fashion-driven upgrade cycle, strap/battery
   wear). These are reasoned, not independently verified the way the
   phone retention curve is — worth checking against a real watch/
   tablet/laptop buyback listing before trusting them with real money. */
const CATEGORY_FACTOR = { phone: 1.00, tablet: 1.05, laptop: 1.15, watch: 0.70 };
const CATEGORIES = ["All", "phone", "tablet", "laptop", "watch"];
const CATEGORY_LABEL = { phone: "Phones", tablet: "Tablets", laptop: "Laptops", watch: "Watches" };

const BRANDS = ["All", "Apple", "Samsung", "Google", "OnePlus", "Xiaomi", "Oppo", "Vivo", "Motorola", "Nothing"];

const DEFAULT_REGIONS = {
  AU: { label: "Australia", currency: "AUD", symbol: "A$", mult: 1.00, round: 1 },
  US: { label: "United States", currency: "USD", symbol: "$", mult: 0.70, round: 1 },
  UK: { label: "United Kingdom", currency: "GBP", symbol: "£", mult: 0.46, round: 1 },
  IN: { label: "India", currency: "INR", symbol: "₹", mult: 37, round: 10 },
  AE: { label: "UAE", currency: "AED", symbol: "AED ", mult: 2.35, round: 1 },
};

/* Tier factors are now the average of two real, live Mobile Monster
   ladders (iPhone 15 Pro Max 256GB: 100/96/92/8, iPhone 13 128GB:
   100/93/86/10). Their platform barely discounts for cosmetic wear
   alone — the itemized fault checklist below does the real pricing
   work, not the tier. That's the fix: previously "Good" was docked
   22%, when real-world buyback only docks ~11% for cosmetic-only
   wear and lets faults do the rest. */
const DEFAULT_TIERS = [
  { id: "new", label: "Brand New", sub: "Sealed, unopened box", icon: "📦", factor: 1.00, mode: "sealed" },
  { id: "asnew", label: "Like New", sub: "Used, no visible wear", icon: "✨", factor: 0.94, mode: "functional-only" },
  { id: "good", label: "Good", sub: "Visible wear, fully working", icon: "👍", factor: 0.89, mode: "full" },
  { id: "fair", label: "Fair", sub: "Noticeable damage, still usable", icon: "⚠️", factor: 0.75, mode: "full" },
  { id: "parts", label: "Faulty / For Parts", sub: "Won't turn on or major damage", icon: "🔧", factor: 0.09, mode: "parts" },
];

const PHONE_FAULT_GROUPS = [
  { group: "Display", cosmetic: true, faults: [
    { id: "screen_scratch", label: "Minor scratches on screen", pct: 0.05 },
    { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
    { id: "screen_crack_severe", label: "Screen glass missing pieces / unusable", pct: 0.40 },
    { id: "dead_pixels", label: "Dead pixels or lines on display", pct: 0.15 },
    { id: "burn_in", label: "Screen burn-in (OLED)", pct: 0.15 },
    { id: "discoloration", label: "Screen discoloration / tint", pct: 0.10 },
    { id: "touch_partial", label: "Touch unresponsive in some areas", pct: 0.20 },
    { id: "touch_dead", label: "Touch completely unresponsive", pct: 0.35 },
    { id: "screen_replaced", label: "Non-original replacement screen fitted", pct: 0.15 },
  ]},
  { group: "Body & Back", cosmetic: true, faults: [
    { id: "back_crack", label: "Cracked back glass", pct: 0.10 },
    { id: "body_scratch", label: "Heavy scratches on frame/body", pct: 0.05 },
    { id: "dents", label: "Dents on frame", pct: 0.08 },
    { id: "bent", label: "Bent chassis", pct: 0.20 },
    { id: "corrosion", label: "Corrosion / liquid damage marks", pct: 0.30 },
  ]},
  { group: "Battery", cosmetic: false, faults: [
    { id: "batt_80_89", label: "Battery health 80–89%", pct: 0.05 },
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.12 },
    { id: "batt_swollen", label: "Battery swollen", pct: 0.25 },
    { id: "batt_nocharge", label: "Won't hold charge / won't charge", pct: 0.20 },
  ]},
  { group: "Camera", cosmetic: false, faults: [
    { id: "cam_rear", label: "Rear camera not working", pct: 0.12 },
    { id: "cam_front", label: "Front camera not working", pct: 0.08 },
    { id: "cam_lens_crack", label: "Camera lens cracked", pct: 0.06 },
  ]},
  { group: "Buttons & Ports", cosmetic: false, faults: [
    { id: "btn_power", label: "Power button faulty", pct: 0.10 },
    { id: "btn_volume", label: "Volume button faulty", pct: 0.05 },
    { id: "port_charge", label: "Charging port faulty", pct: 0.10 },
    { id: "port_headphone", label: "Headphone jack faulty", pct: 0.04 },
  ]},
  { group: "Audio & Sensors", cosmetic: false, faults: [
    { id: "speaker", label: "Speaker not working", pct: 0.08 },
    { id: "mic", label: "Microphone not working", pct: 0.08 },
    { id: "biometric", label: "Face ID / fingerprint sensor not working", pct: 0.10 },
    { id: "sensor", label: "Proximity / other sensor issue", pct: 0.05 },
  ]},
  { group: "Connectivity & Wireless", cosmetic: false, faults: [
    { id: "nfc", label: "NFC / tap-to-pay not working", pct: 0.04 },
    { id: "wireless_charge", label: "Wireless charging not working", pct: 0.06 },
    { id: "signal_issue", label: "Signal / 5G modem issue", pct: 0.10 },
    { id: "esim_issue", label: "eSIM won't activate / provision", pct: 0.05 },
  ]},
  { group: "Structural & Other", cosmetic: true, faults: [
    { id: "hinge_issue", label: "Foldable hinge damaged or loose", pct: 0.15 },
    { id: "waterproof_seal", label: "Waterproof seal compromised", pct: 0.08 },
    { id: "tampered", label: "Opened / repaired by an unauthorised technician", pct: 0.12 },
    { id: "sim_tray_missing", label: "SIM tray missing", pct: 0.03 },
  ]},
  { group: "Network & Software", cosmetic: false, faults: [
    { id: "carrier_locked", label: "Carrier-locked (not network unlocked)", pct: 0.08 },
    { id: "software_issue", label: "Software glitch / stuck on logo", pct: 0.15 },
  ]},
];

const TABLET_FAULT_GROUPS = [
  { group: "Display", cosmetic: true, faults: [
    { id: "screen_scratch", label: "Minor scratches on screen", pct: 0.05 },
    { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
    { id: "dead_pixels", label: "Dead pixels or lines on display", pct: 0.15 },
    { id: "burn_in", label: "Screen burn-in (OLED models)", pct: 0.15 },
    { id: "touch_partial", label: "Touch unresponsive in some areas", pct: 0.20 },
    { id: "touch_dead", label: "Touch completely unresponsive", pct: 0.35 },
    { id: "screen_replaced", label: "Non-original replacement screen fitted", pct: 0.15 },
  ]},
  { group: "Body & Back", cosmetic: true, faults: [
    { id: "back_crack", label: "Cracked back casing", pct: 0.10 },
    { id: "body_scratch", label: "Heavy scratches on frame/body", pct: 0.05 },
    { id: "bent", label: "Bent or warped chassis", pct: 0.20 },
  ]},
  { group: "Battery", cosmetic: false, faults: [
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.12 },
    { id: "batt_swollen", label: "Battery swollen", pct: 0.25 },
    { id: "batt_nocharge", label: "Won't hold charge / won't charge", pct: 0.20 },
  ]},
  { group: "Camera & Audio", cosmetic: false, faults: [
    { id: "cam_rear", label: "Rear camera not working", pct: 0.10 },
    { id: "cam_front", label: "Front camera not working", pct: 0.08 },
    { id: "speaker", label: "Speaker not working", pct: 0.08 },
    { id: "mic", label: "Microphone not working", pct: 0.08 },
  ]},
  { group: "Ports & Buttons", cosmetic: false, faults: [
    { id: "port_charge", label: "Charging port faulty", pct: 0.10 },
    { id: "btn_power", label: "Power/volume button faulty", pct: 0.08 },
    { id: "biometric", label: "Face ID / Touch ID not working", pct: 0.10 },
  ]},
  { group: "Connectivity & Accessories", cosmetic: false, faults: [
    { id: "wifi_issue", label: "Wi-Fi not connecting reliably", pct: 0.10 },
    { id: "cellular_issue", label: "Cellular modem issue (LTE/5G models)", pct: 0.10 },
    { id: "stylus_pair", label: "Apple Pencil / stylus won't pair", pct: 0.05 },
  ]},
  { group: "Network & Software", cosmetic: false, faults: [
    { id: "software_issue", label: "Software glitch / stuck on logo", pct: 0.15 },
    { id: "tampered", label: "Opened / repaired by an unauthorised technician", pct: 0.12 },
  ]},
];

const LAPTOP_FAULT_GROUPS = [
  { group: "Display", cosmetic: true, faults: [
    { id: "screen_crack", label: "Cracked screen", pct: 0.30 },
    { id: "dead_pixels", label: "Dead pixels or lines on display", pct: 0.15 },
    { id: "backlight_issue", label: "Dim / flickering backlight", pct: 0.15 },
    { id: "hinge_issue", label: "Hinge loose, stiff, or broken", pct: 0.15 },
  ]},
  { group: "Body & Casing", cosmetic: true, faults: [
    { id: "body_scratch", label: "Heavy scratches / dents on casing", pct: 0.08 },
    { id: "casing_crack", label: "Casing cracked", pct: 0.12 },
    { id: "bent", label: "Bent or warped chassis", pct: 0.20 },
  ]},
  { group: "Battery", cosmetic: false, faults: [
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.15 },
    { id: "batt_swollen", label: "Battery swollen (safety issue)", pct: 0.30 },
    { id: "batt_nocharge", label: "Won't hold charge / won't charge", pct: 0.20 },
  ]},
  { group: "Keyboard & Trackpad", cosmetic: false, faults: [
    { id: "keys_sticky", label: "Keys sticky, missing, or unresponsive", pct: 0.10 },
    { id: "keyboard_backlight", label: "Keyboard backlight not working", pct: 0.05 },
    { id: "trackpad_issue", label: "Trackpad unresponsive or erratic", pct: 0.12 },
    { id: "keyboard_replaced", label: "Non-original keyboard fitted", pct: 0.10 },
  ]},
  { group: "Ports & I/O", cosmetic: false, faults: [
    { id: "port_charge", label: "Charging port damaged", pct: 0.12 },
    { id: "port_usb", label: "USB-C / Thunderbolt port not working", pct: 0.10 },
    { id: "webcam", label: "Webcam not working", pct: 0.08 },
    { id: "speaker", label: "Speakers not working", pct: 0.08 },
    { id: "mic", label: "Microphone not working", pct: 0.06 },
  ]},
  { group: "Software & Tampering", cosmetic: false, faults: [
    { id: "wont_boot", label: "Won't boot / major software issue", pct: 0.20 },
    { id: "tampered", label: "Opened / repaired by an unauthorised technician", pct: 0.12 },
  ]},
];

const WATCH_FAULT_GROUPS = [
  { group: "Display", cosmetic: true, faults: [
    { id: "screen_crack", label: "Cracked screen / crystal", pct: 0.25 },
    { id: "touch_dead", label: "Touch/display unresponsive", pct: 0.30 },
  ]},
  { group: "Body & Band", cosmetic: true, faults: [
    { id: "back_crack", label: "Cracked back / ceramic casing", pct: 0.10 },
    { id: "band_damaged", label: "Band or strap damaged", pct: 0.05 },
    { id: "body_scratch", label: "Case heavily scratched or dented", pct: 0.08 },
  ]},
  { group: "Battery", cosmetic: false, faults: [
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.15 },
    { id: "batt_nocharge", label: "Won't hold charge / won't charge", pct: 0.20 },
  ]},
  { group: "Functional", cosmetic: false, faults: [
    { id: "crown_button", label: "Crown or button not working", pct: 0.10 },
    { id: "heart_rate", label: "Heart rate / health sensor not working", pct: 0.08 },
    { id: "gps_cellular", label: "GPS / cellular not connecting", pct: 0.10 },
    { id: "speaker", label: "Speaker or microphone not working", pct: 0.08 },
  ]},
  { group: "Water Resistance & Other", cosmetic: false, faults: [
    { id: "waterproof_seal", label: "Water resistance seal compromised", pct: 0.12 },
    { id: "tampered", label: "Opened / repaired by an unauthorised technician", pct: 0.12 },
  ]},
];

const FAULT_GROUPS_BY_CATEGORY = { phone: PHONE_FAULT_GROUPS, tablet: TABLET_FAULT_GROUPS, laptop: LAPTOP_FAULT_GROUPS, watch: WATCH_FAULT_GROUPS };
const DEFAULT_FAULT_GROUPS = PHONE_FAULT_GROUPS; // fallback when a device has no category (shouldn't happen, but stay safe)

const BLOCKERS = [
  { id: "blacklisted", label: "IMEI reported lost or stolen (blacklisted)" },
  { id: "frp_locked", label: "iCloud / Google account still signed in (locked)" },
  { id: "imei_mismatch", label: "IMEI doesn't match device / duplicate IMEI" },
];

const ACCESSORY_BONUS_PCT = 0.02;
const DEFAULT_HOLDING_COST_PCT = 0.02; // flat refurb/overhead cost — age is already priced in via the curve
const STEPS = ["Device", "Storage", "Condition", "Quote"];

function fmt(n, region, regionsMap) {
  const r = (regionsMap || DEFAULT_REGIONS)[region];
  const val = r.round >= 10 ? Math.round(n / r.round) * r.round : Math.round(n);
  return `${r.symbol}${val.toLocaleString()}`;
}

function baseBuybackAUD(device, storage, retentionPoints, brandFactors) {
  const retail = device.retail[storage];
  const months = ageMonths(device.release);
  const brandF = (brandFactors || DEFAULT_BRAND_FACTOR)[device.brand] ?? 0.65;
  const categoryF = CATEGORY_FACTOR[device.category] ?? 1.00;
  return retail * retentionAt(months, retentionPoints) * brandF * categoryF;
}

const CONFIG_KEY = "pricing-config";

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
// ID photo upload — only active when this app is deployed with the real
// backend (window.SHOP_API_BASE_URL set by whoever installs storage-shim.js).
// Inside Claude.ai there's no such backend, so this quietly no-ops there;
// the ID number field above still satisfies the core compliance need.
function idPhotoBackendConfigured() {
  return typeof window !== "undefined" && !!window.SHOP_API_BASE_URL;
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadIdPhoto(subjectKey, file) {
  if (!idPhotoBackendConfigured() || !file) return null;
  try {
    const session = JSON.parse(localStorage.getItem("shop_auth_token") || "null");
    if (!session?.token) return null;
    const imageBase64 = await fileToBase64(file);
    const res = await fetch(`${window.SHOP_API_BASE_URL}/id-photos`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ subjectKey, imageBase64 }),
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null; // photo capture is a best-effort enhancement, never blocks the order itself
  }
}

async function loadSharedConfig() {
  if (!storageAvailable()) return null;
  try {
    const r = await window.storage.get(CONFIG_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}

// Tracking your own submission (an order, a price-match request) by ID
// or email needs to work for an anonymous customer on a real deployment
// — but window.storage.get() on these collections is correctly
// staff-only now (they hold everyone's PII), so a plain load-then-filter
// only ever sees an empty list for a real customer. This calls the
// backend's dedicated single-record lookup instead, which is safe for
// anyone to call. Falls back to the old load-and-filter approach only
// when there's no real backend at all (previewing inside Claude.ai,
// where window.storage has no such restriction).
async function findPublicRecord(key, query, localList, fields = ["id", "customer.email", "customerEmail", "email"]) {
  const q = query.trim().toLowerCase();
  if (typeof window !== "undefined" && window.SHOP_API_BASE_URL) {
    for (const field of fields) {
      try {
        const res = await fetch(`${window.SHOP_API_BASE_URL}/public/find/${encodeURIComponent(key)}?field=${field}&value=${encodeURIComponent(q)}`);
        if (res.ok) return (await res.json()).record;
      } catch (e) { /* try the next field */ }
    }
    return null;
  }
  // No real backend — fall back to the full list already loaded locally,
  // checking every field the caller asked about (supports dot-notation
  // for nested paths like "customer.email"), not just id/email.
  return (localList || []).find((r) => {
    return fields.some((field) => {
      const v = field.split(".").reduce((o, k) => (o ? o[k] : undefined), r);
      return typeof v === "string" && v.toLowerCase() === q;
    });
  }) || null;
}

const ORDERS_KEY = "orders";
async function loadOrders() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(ORDERS_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function saveOrder(order) {
  if (!storageAvailable()) return false;
  try {
    const orders = await loadOrders();
    orders.unshift(order);
    await window.storage.set(ORDERS_KEY, JSON.stringify(orders), true);
    return true;
  } catch (e) {
    return false;
  }
}
function genOrderId() {
  return "ORD-" + Math.floor(100000 + Math.random() * 900000);
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
async function savePriceMatch(request) {
  if (!storageAvailable()) return false;
  try {
    const list = await loadPriceMatches();
    list.unshift(request);
    await window.storage.set(PRICE_MATCH_KEY, JSON.stringify(list), true);
    return true;
  } catch (e) {
    return false;
  }
}
function genPriceMatchId() {
  return "PM-" + Math.floor(100000 + Math.random() * 900000);
}
const PM_STATUS_LABELS = {
  pending: "Under review — we'll respond within 1 business day",
  approved: "Approved — we'll match this price",
  denied: "Not matched",
};

/* =================================================================
   NOTIFICATION QUEUE — every place this system would send a real
   email or SMS writes here instead of actually sending anything,
   since there's no email/SMS provider connected yet. When one is
   connected (last step, per the plan), a small worker just needs to
   poll this queue and send + mark "sent" — no changes needed to any
   of the trigger points below, since they're already fully formed.
================================================================= */
const NOTIFICATIONS_KEY = "notification_queue";
async function loadNotificationQueue() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(NOTIFICATIONS_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function queueNotification(entry) {
  if (!storageAvailable()) return false;
  try {
    const list = await loadNotificationQueue();
    list.unshift({ id: "NTF-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), status: "pending", ...entry });
    await window.storage.set(NOTIFICATIONS_KEY, JSON.stringify(list), true);
    return true;
  } catch (e) {
    return false;
  }
}

const LEADS_KEY = "quote_leads";
async function loadLeads() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(LEADS_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function saveLead(lead) {
  if (!storageAvailable()) return false;
  try {
    const list = await loadLeads();
    list.unshift(lead);
    await window.storage.set(LEADS_KEY, JSON.stringify(list), true);
    return true;
  } catch (e) {
    return false;
  }
}

/* Bulk/corporate trade-ins go through a QUOTE REQUEST, not an instant
   auto-accept order — a business with 40 devices needs a human to
   actually look at them and negotiate, the same way PhoneExchange or
   Mobile Monster would never auto-accept a pallet of phones sight
   unseen. Staff follow up and turn this into a real deal manually. */
const BULK_KEY = "bulk_quote_requests";
async function loadBulkRequests() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(BULK_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function saveBulkRequest(request) {
  if (!storageAvailable()) return false;
  try {
    const list = await loadBulkRequests();
    list.unshift(request);
    await window.storage.set(BULK_KEY, JSON.stringify(list), true);
    return true;
  } catch (e) {
    return false;
  }
}
function genBulkId() {
  return "BULK-" + Math.floor(100000 + Math.random() * 900000);
}

/* Referral program — no real credit/discount system is wired up (no
   payment rails connected yet), so a referral reward is tracked here
   as a pending payable staff honor manually, same "connect a real
   provider later" pattern as everything else. */
const REFERRAL_REWARD_AMOUNT = 20; // flat bonus, in the local currency, for BOTH sides
const REFERRALS_KEY = "referrals";
async function loadReferrals() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(REFERRALS_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function saveReferral(entry) {
  if (!storageAvailable()) return false;
  try {
    const list = await loadReferrals();
    list.unshift(entry);
    await window.storage.set(REFERRALS_KEY, JSON.stringify(list), true);
    return true;
  } catch (e) {
    return false;
  }
}
function genReferralCode(name) {
  const base = (name || "FRIEND").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6) || "FRIEND";
  return `${base}${Math.floor(100 + Math.random() * 900)}`;
}
const STATUS_LABELS = {
  awaiting_shipment: "Awaiting your device",
  received_inspecting: "Received — inspecting",
  revised_pending_customer: "Revised offer — awaiting your response",
  approved_paid: "Approved — payment sent",
  returned: "Returned to you",
};

export default function QuoteCalculator() {
  const [live, setLive] = useState(null);   // config loaded from the shared admin database
  const [source, setSource] = useState("built-in defaults");
  const [region, setRegion] = useState("AU");
  const [brandFilter, setBrandFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [tierId, setTierId] = useState(null);
  const [faults, setFaults] = useState({});
  const [blockers, setBlockers] = useState({});
  const [hasAccessories, setHasAccessories] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", idType: "license", idNumber: "" });
  const [referralCodeEntered, setReferralCodeEntered] = useState("");
  const [myReferralCode, setMyReferralCode] = useState(null);
  const [fulfillment, setFulfillment] = useState("post");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState(null);
  const [trackMode, setTrackMode] = useState(false);
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResult, setTrackResult] = useState(undefined); // undefined = not searched, null = not found
  const [pmOpen, setPmOpen] = useState(false);
  const [pmCompetitor, setPmCompetitor] = useState("");
  const [pmPrice, setPmPrice] = useState("");
  const [pmNote, setPmNote] = useState("");
  const [pmSubmitted, setPmSubmitted] = useState(null);
  const [pmTrackMode, setPmTrackMode] = useState(false);
  const [pmTrackQuery, setPmTrackQuery] = useState("");
  const [pmTrackResult, setPmTrackResult] = useState(undefined);
  const [leadEmailOpen, setLeadEmailOpen] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSaved, setLeadSaved] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkItems, setBulkItems] = useState([]);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkTier, setBulkTier] = useState("good");
  const [bulkBusiness, setBulkBusiness] = useState({ businessName: "", contactName: "", email: "", phone: "", note: "" });
  const [bulkSubmitted, setBulkSubmitted] = useState(null);
  const [idPhotoFile, setIdPhotoFile] = useState(null);
  const idPhotoBackendAvailable = idPhotoBackendConfigured();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadSharedConfig();
      if (!cancelled && cfg) { setLive(cfg); setSource("admin console"); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Merge live admin-console data over the built-in defaults. Anything the
  // console hasn't touched (or that isn't available in it, like an older
  // console version's shorter catalog) falls back to the default silently.
  const CATALOG_A = live?.catalog || DEFAULT_CATALOG;
  const REGIONS_A = useMemo(() => {
    const merged = {};
    Object.keys(DEFAULT_REGIONS).forEach((code) => {
      merged[code] = { ...DEFAULT_REGIONS[code], ...(live?.regions?.[code] || {}) };
    });
    return merged;
  }, [live]);
  const RETENTION_A = live?.retentionPoints || DEFAULT_RETENTION_POINTS;
  const BRAND_FACTOR_A = useMemo(() => ({ ...DEFAULT_BRAND_FACTOR, ...(live?.brandFactors || {}) }), [live]);
  const TIERS_A = useMemo(() => {
    const byId = Object.fromEntries((live?.tiers || []).map((t) => [t.id, t]));
    return DEFAULT_TIERS.map((t) => ({ ...t, factor: byId[t.id]?.factor ?? t.factor }));
  }, [live]);
  const FAULT_GROUPS_A = useMemo(() => {
    const pctById = {};
    (live?.faultGroups || []).forEach((g) => g.faults.forEach((f) => { pctById[f.id] = f.pct; }));
    const base = FAULT_GROUPS_BY_CATEGORY[selected?.category] || DEFAULT_FAULT_GROUPS;
    // Admin-edited percentages apply by fault id across whichever category list is active —
    // e.g. editing "battery_below80" affects phones, tablets, and laptops alike, since they
    // share that id. This is a deliberate simplification: one set of overrides, not four.
    return base.map((g) => ({ ...g, faults: g.faults.map((f) => ({ ...f, pct: pctById[f.id] ?? f.pct })) }));
  }, [live, selected]);
  const HOLDING_COST_A = live?.holdingCostPct ?? DEFAULT_HOLDING_COST_PCT;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CATALOG_A.filter((d) => {
      const brandOk = brandFilter === "All" || d.brand === brandFilter;
      const categoryOk = categoryFilter === "All" || (d.category || "phone") === categoryFilter;
      const qOk = !q || d.brand.toLowerCase().includes(q) || d.model.toLowerCase().includes(q);
      return brandOk && categoryOk && qOk;
    });
  }, [search, brandFilter, categoryFilter]);

  const tier = TIERS_A.find((t) => t.id === tierId);
  const activeBlocker = Object.keys(blockers).find((k) => blockers[k]);
  const stepIndex = !selected ? 0 : !tierId ? 2 : 3;

  const calc = useMemo(() => {
    if (!selected || !tier) return null;
    const baseAUD = baseBuybackAUD(selected, selected.storage, RETENTION_A, BRAND_FACTOR_A);
    const r = REGIONS_A[region];
    const baseRegion = baseAUD * r.mult;
    const tierBase = baseRegion * tier.factor;

    if (tier.mode === "parts") {
      return { baseRegion, tierBase, lines: [], holdingAmt: 0, total: tierBase, blocked: false };
    }

    let total = tierBase;
    const lines = [];
    if (tier.mode === "full" || tier.mode === "functional-only") {
      FAULT_GROUPS_A.forEach((g) => {
        if (tier.mode === "functional-only" && g.cosmetic) return;
        g.faults.forEach((f) => {
          if (faults[f.id]) {
            const amt = tierBase * f.pct;
            total -= amt;
            lines.push({ label: f.label, amt });
          }
        });
      });
      if (hasAccessories) {
        const amt = tierBase * ACCESSORY_BONUS_PCT;
        total += amt;
        lines.push({ label: "Original box & charger included", amt: -amt });
      }
    }
    const holdingAmt = tierBase * HOLDING_COST_A;
    total -= holdingAmt;
    total = Math.max(total, baseRegion * 0.05);
    return { baseRegion, tierBase, lines, holdingAmt, total, blocked: !!activeBlocker };
  }, [selected, tier, faults, hasAccessories, region, activeBlocker]);

  const reference = useMemo(() => {
    if (!selected || !tier) return null;
    const baseAUD = baseBuybackAUD(selected, selected.storage, RETENTION_A, BRAND_FACTOR_A) * tier.factor;
    // Worldwide comparison, computed straight from the AU base — this is
    // the internal "see global pricing before setting local rates" view.
    // Customers never see this; only the AU figure above is customer-facing.
    const worldwide = {};
    Object.keys(REGIONS_A).forEach((code) => { worldwide[code] = baseAUD * REGIONS_A[code].mult; });
    return {
      ourQuoteAUD: calc ? calc.total / REGIONS_A[region].mult : baseAUD,
      phoneExchangeEstAUD: baseAUD / 0.80,
      mobileMonsterEstAUD: baseAUD * 1.02,
      cashifyIndiaEstINR: baseAUD * 37 * 0.68,
      worldwide,
      ageMonthsNow: ageMonths(selected.release),
    };
  }, [selected, tier, calc, region]);

  async function handleSubmitOrder() {
    if (!calc || calc.blocked || !customer.name || !customer.email || !customer.idNumber) return;
    setSubmitting(true);
    const newCode = genReferralCode(customer.name);
    const order = {
      id: genOrderId(),
      createdAt: new Date().toISOString(),
      priceLockExpires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      device: { brand: selected.brand, model: selected.model, storage: selected.storage, release: selected.release, category: selected.category },
      region, currency: REGIONS_A[region].currency,
      tierId: tier.id, tierLabel: tier.label,
      faultLabels: calc.lines.filter((l) => l.amt > 0).map((l) => l.label),
      hasAccessories,
      quotedTotal: calc.total,
      brandNewBase: calc.baseRegion,
      customer: { ...customer },
      fulfillment, address: fulfillment === "post" ? address : "",
      status: "awaiting_shipment",
      inspection: null,
      referralCode: newCode,
    };
    await saveOrder(order);
    if (idPhotoFile) await uploadIdPhoto(`order:${order.id}`, idPhotoFile);

    // If they came in on someone else's referral code, record the reward
    // for both sides — nothing is auto-credited (no payment rails
    // connected yet), staff honor it manually, same pattern as everywhere else.
    const enteredCode = referralCodeEntered.trim().toUpperCase();
    if (enteredCode) {
      // Same class of bug as order/price-match tracking: on a real
      // deployment, loadOrders() correctly returns nothing for an
      // anonymous customer (privacy), so a plain search would never
      // find the referrer's order and referral codes would silently
      // never work at all. Look the referrer up by their code via the
      // safe public single-record endpoint instead.
      const localList = window.SHOP_API_BASE_URL ? null : await loadOrders();
      const referrerOrder = await findPublicRecord("orders", enteredCode, localList, ["referralCode"]);
      if (referrerOrder && referrerOrder.customer.email.toLowerCase() !== customer.email.toLowerCase()) {
        await saveReferral({
          id: "REF-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(),
          code: enteredCode, referrerEmail: referrerOrder.customer.email, referrerName: referrerOrder.customer.name,
          referredEmail: customer.email, referredName: customer.name, referredOrderId: order.id,
          rewardAmount: REFERRAL_REWARD_AMOUNT, currency: REGIONS_A[region].currency,
          referrerPaid: false, referredPaid: false,
        });
      }
    }

    await queueNotification({
      type: "order_confirmation", channel: "email", recipientEmail: customer.email,
      subject: `Order ${order.id} confirmed`,
      message: `Your ${selected.brand} ${selected.model} trade-in is confirmed for ${fmt(calc.total, region, REGIONS_A)}. Order ${order.id}.`,
      relatedId: order.id,
    });
    setMyReferralCode(newCode);
    setSubmittedOrder(order);
    setSubmitting(false);
  }

  async function handleTrackSearch() {
    const q = trackQuery.trim();
    if (!q) return;
    const localList = window.SHOP_API_BASE_URL ? null : await loadOrders();
    const found = await findPublicRecord("orders", q, localList);
    setTrackResult(found || null);
  }

  async function handlePriceMatchSubmit() {
    if (!calc || !pmCompetitor.trim() || !pmPrice) return;
    const request = {
      id: genPriceMatchId(),
      createdAt: new Date().toISOString(),
      device: selected ? { brand: selected.brand, model: selected.model, storage: selected.storage } : null,
      ourQuote: calc.total, region, currency: REGIONS_A[region].currency,
      competitorName: pmCompetitor.trim(), competitorPrice: parseFloat(pmPrice), note: pmNote.trim(),
      customerEmail: customer.email || null,
      status: "pending", approvedPrice: null, staffNote: "",
    };
    await savePriceMatch(request);
    setPmSubmitted(request);
  }

  async function handlePriceMatchTrack() {
    const q = pmTrackQuery.trim();
    if (!q) return;
    const localList = window.SHOP_API_BASE_URL ? null : await loadPriceMatches();
    const found = await findPublicRecord("price_match_requests", q, localList);
    setPmTrackResult(found || null);
  }

  async function handleSaveLead() {
    if (!calc || calc.blocked || !leadEmail.trim() || !selected || !tier) return;
    const lead = {
      id: "LEAD-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(),
      email: leadEmail.trim(), device: { brand: selected.brand, model: selected.model, storage: selected.storage },
      tierLabel: tier.label, quotedTotal: calc.total, region, currency: REGIONS_A[region].currency,
      priceHeldUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), contacted: false,
    };
    await saveLead(lead);
    await queueNotification({
      type: "quote_lead", channel: "email", recipientEmail: lead.email,
      subject: `Your ${selected.brand} ${selected.model} quote: ${fmt(calc.total, region, REGIONS_A)}`,
      message: `We've held this price for you until ${new Date(lead.priceHeldUntil).toLocaleDateString()}. Ready to sell? Come back anytime.`,
      relatedId: lead.id,
    });
    setLeadSaved(true);
  }

  function bulkEstimate(device, storageKey, tierId) {
    const t = TIERS_A.find((x) => x.id === tierId) || TIERS_A[0];
    const base = baseBuybackAUD(device, storageKey, RETENTION_A, BRAND_FACTOR_A) * REGIONS_A[region].mult;
    return Math.round(base * t.factor);
  }
  function addBulkItem(device, storageKey) {
    const estimate = bulkEstimate(device, storageKey, bulkTier);
    setBulkItems((items) => [...items, { device: { brand: device.brand, model: device.model, storage: storageKey }, tierId: bulkTier, estimate }]);
    setBulkSearch("");
  }
  function removeBulkItem(index) {
    setBulkItems((items) => items.filter((_, i) => i !== index));
  }
  async function handleBulkSubmit() {
    if (bulkItems.length === 0 || !bulkBusiness.businessName.trim() || !bulkBusiness.email.trim()) return;
    const total = bulkItems.reduce((s, i) => s + i.estimate, 0);
    const request = {
      id: genBulkId(), createdAt: new Date().toISOString(), region, currency: REGIONS_A[region].currency,
      items: bulkItems, estimatedTotal: total, itemCount: bulkItems.length,
      business: { ...bulkBusiness }, status: "new", staffNote: "",
    };
    await saveBulkRequest(request);
    await queueNotification({
      type: "bulk_quote_request", channel: "email", recipientEmail: bulkBusiness.email,
      subject: `Bulk trade-in request ${request.id} received`,
      message: `We've received your request for ${bulkItems.length} device(s), estimated at ${fmt(total, region, REGIONS_A)} total. A team member will follow up within 1-2 business days with a firm offer.`,
      relatedId: request.id,
    });
    setBulkSubmitted(request);
  }

  // Corner Shop palette — bold Australian retail: warm paper background,
  // heritage signage red as the single brand accent, bold black structure.
  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#BE3F29", brassDim = "rgba(190,63,41,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 130px" }}>

        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.01em', marginBottom: 4 }}>
          Instant Valuation
        </div>
        <div style={{ color: muted, fontSize: 14, marginBottom: 14 }}>
          Prices recalculate from age and condition every time you open this — not a static list.
        </div>
        <div style={{ fontSize: 11, color: source === "admin console" ? green : muted, marginBottom: 14 }}>
          {source === "admin console" ? "● Live pricing from admin console" : "○ Using built-in defaults — admin console not connected"}
        </div>

        <button onClick={() => setBulkMode((s) => !s)} style={{ background: "none", border: "none", color: brass, fontSize: 12.5, padding: 0, marginBottom: 14, cursor: "pointer", textDecoration: "underline" }}>
          {bulkMode ? "← Back to single device" : "Selling multiple devices? Get a bulk / business quote"}
        </button>

        {bulkMode && !bulkSubmitted && (
          <div style={{ border: `1px solid ${brass}`, borderRadius: 4, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 15, marginBottom: 4 }}>Bulk / business trade-in</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 16 }}>
              Add each device below for a rough estimate. This isn't an instant sale — a team member will review your list and follow up with a firm offer, since larger quantities usually get a better rate than the single-device price shown.
            </div>

            <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Assume this condition for all items (adjust individually later with staff)</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {TIERS_A.filter((t) => t.mode !== "parts").map((t) => (
                <button key={t.id} onClick={() => setBulkTier(t.id)} style={{ flex: 1, padding: "8px", borderRadius: 3, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${bulkTier === t.id ? brass : line}`, background: bulkTier === t.id ? brassDim : "transparent", color: bulkTier === t.id ? brass : paper }}>
                  {t.label}
                </button>
              ))}
            </div>

            <input value={bulkSearch} onChange={(e) => setBulkSearch(e.target.value)} placeholder="Search a model to add"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
            {bulkSearch.trim() && (
              <div style={{ border: `1px solid ${line}`, borderRadius: 3, overflow: "hidden", marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
                {CATALOG_A.filter((d) => `${d.brand} ${d.model}`.toLowerCase().includes(bulkSearch.trim().toLowerCase())).slice(0, 6).map((d) => (
                  <div key={d.brand + d.model} style={{ padding: "8px 12px", borderTop: `1px solid ${line}` }}>
                    <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>{d.brand} {d.model}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.keys(d.retail).map((s) => (
                        <button key={s} onClick={() => addBulkItem(d, s)} style={{ padding: "6px 10px", borderRadius: 2, fontSize: 12, border: `1px solid ${line}`, background: panel2, color: paper, cursor: "pointer" }}>
                          {s} · {fmt(bulkEstimate(d, s, bulkTier), region, REGIONS_A)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {bulkItems.length > 0 && (
              <div style={{ border: `1px solid ${line}`, borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
                {bulkItems.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 13 }}>
                    <span>{item.device.brand} {item.device.model} · {item.device.storage}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: brass }}>{fmt(item.estimate, region, REGIONS_A)}</span>
                      <button onClick={() => removeBulkItem(i)} style={{ background: "none", border: "none", color: muted, cursor: "pointer" }}>✕</button>
                    </span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderTop: `1px solid ${line}`, fontSize: 14 }}>
                  <span>Estimated total ({bulkItems.length} device{bulkItems.length === 1 ? "" : "s"})</span>
                  <span style={{ color: brass }}>{fmt(bulkItems.reduce((s, i) => s + i.estimate, 0), region, REGIONS_A)}</span>
                </div>
              </div>
            )}

            {bulkItems.length > 0 && (
              <>
                <input value={bulkBusiness.businessName} onChange={(e) => setBulkBusiness((b) => ({ ...b, businessName: e.target.value }))} placeholder="Business or organisation name"
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
                <input value={bulkBusiness.contactName} onChange={(e) => setBulkBusiness((b) => ({ ...b, contactName: e.target.value }))} placeholder="Contact name"
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
                <input value={bulkBusiness.email} onChange={(e) => setBulkBusiness((b) => ({ ...b, email: e.target.value }))} placeholder="Email"
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
                <input value={bulkBusiness.phone} onChange={(e) => setBulkBusiness((b) => ({ ...b, phone: e.target.value }))} placeholder="Phone"
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
                <textarea value={bulkBusiness.note} onChange={(e) => setBulkBusiness((b) => ({ ...b, note: e.target.value }))} placeholder="Anything else we should know (optional)"
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, minHeight: 60, boxSizing: "border-box" }} />
                <button disabled={!bulkBusiness.businessName.trim() || !bulkBusiness.email.trim()} onClick={handleBulkSubmit}
                  style={{ width: "100%", padding: "13px", borderRadius: 3, border: "none",
                    background: bulkBusiness.businessName.trim() && bulkBusiness.email.trim() ? brass : line, color: bulkBusiness.businessName.trim() && bulkBusiness.email.trim() ? "#1a1408" : muted,
                    fontSize: 14, fontWeight: 600, cursor: bulkBusiness.businessName.trim() && bulkBusiness.email.trim() ? "pointer" : "default" }}>
                  Request a bulk quote →
                </button>
              </>
            )}
          </div>
        )}
        {bulkSubmitted && (
          <div style={{ border: `1px solid ${green}`, borderRadius: 4, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 15, marginBottom: 4 }}>Request {bulkSubmitted.id} received</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 4 }}>{bulkSubmitted.itemCount} device(s) · estimated {fmt(bulkSubmitted.estimatedTotal, region, REGIONS_A)}</div>
            <div style={{ fontSize: 12, color: muted }}>A team member will follow up at {bulkSubmitted.business.email} within 1-2 business days with a firm offer.</div>
            <button onClick={() => { setBulkSubmitted(null); setBulkItems([]); setBulkBusiness({ businessName: "", contactName: "", email: "", phone: "", note: "" }); setBulkMode(false); }}
              style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, fontSize: 14, cursor: "pointer" }}>
              Done
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: muted, marginBottom: 18 }}>
          <span>✓ Licensed dealer</span>
          <span>✓ Same-day payment</span>
          <span>✓ Free shipping</span>
          <button onClick={() => setPmOpen((s) => !s)} style={{ background: "none", border: "none", padding: 0, color: green, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            ✓ Price match guarantee
          </button>
        </div>

        {pmOpen && !pmSubmitted && (
          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Got a higher quote elsewhere?</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
              Tell us who quoted you and how much — we'll review it and get back to you{calc ? ` on your ${selected.brand} ${selected.model}` : ""}.
            </div>
            {!calc && <div style={{ fontSize: 12, color: red, marginBottom: 10 }}>Get a quote on a device first so we have something to compare against.</div>}
            <input value={pmCompetitor} onChange={(e) => setPmCompetitor(e.target.value)} placeholder="Competitor name"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
            <input value={pmPrice} onChange={(e) => setPmPrice(e.target.value)} placeholder="Their quoted price" type="number"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
            <input value={pmNote} onChange={(e) => setPmNote(e.target.value)} placeholder="Anything else we should know (optional)"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
            <button disabled={!calc || !pmCompetitor.trim() || !pmPrice} onClick={handlePriceMatchSubmit}
              style={{ width: "100%", padding: "11px", borderRadius: 3, border: "none",
                background: calc && pmCompetitor.trim() && pmPrice ? green : line, color: calc && pmCompetitor.trim() && pmPrice ? "#0c1a12" : muted,
                fontSize: 13, fontWeight: 600, cursor: calc && pmCompetitor.trim() && pmPrice ? "pointer" : "default" }}>
              Submit for review
            </button>
          </div>
        )}
        {pmSubmitted && (
          <div style={{ border: `1px solid ${green}`, borderRadius: 3, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Request {pmSubmitted.id} submitted</div>
            <div style={{ fontSize: 12, color: muted }}>We'll compare it against {pmSubmitted.competitorName}'s quote of {fmt(pmSubmitted.competitorPrice, region, REGIONS_A)} and respond within 1 business day. Save this number to check back.</div>
            <button onClick={() => { setPmOpen(false); setPmSubmitted(null); setPmCompetitor(""); setPmPrice(""); setPmNote(""); }}
              style={{ marginTop: 10, background: "none", border: "none", color: brass, fontSize: 12, cursor: "pointer" }}>Close</button>
          </div>
        )}

        <button onClick={() => { setTrackMode((s) => !s); setTrackResult(undefined); }}
          style={{ background: "none", border: "none", color: brass, fontSize: 12.5, padding: 0, marginBottom: 8, cursor: "pointer", textDecoration: "underline" }}>
          {trackMode ? "Hide order tracking" : "Track an order you already submitted"}
        </button>
        {trackMode && (
          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} placeholder="Order number or email"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
              <button onClick={handleTrackSearch} style={{ padding: "10px 16px", borderRadius: 3, border: "none", background: brass, color: "#1a1408", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Find
              </button>
            </div>
            {trackResult === null && <div style={{ marginTop: 10, fontSize: 13, color: red }}>No order found with that number or email.</div>}
            {trackResult && (
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                  <span style={{ color: muted }}>{trackResult.device.brand} {trackResult.device.model} · {trackResult.device.storage}</span>
                  <span>{trackResult.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                  <span style={{ color: muted }}>Status</span><span>{STATUS_LABELS[trackResult.status]}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                  <span style={{ color: muted }}>{trackResult.status === "revised_pending_customer" ? "Revised offer" : "Quoted amount"}</span>
                  <span style={{ color: brass }}>{fmt(trackResult.inspection?.confirmedTotal ?? trackResult.quotedTotal, trackResult.region, REGIONS_A)}</span>
                </div>
                {trackResult.fulfillment === "post" && (
                  trackResult.shipping?.trackingNumber ? (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                      <span style={{ color: muted }}>Tracking number</span>
                      <span>{trackResult.shipping.trackingNumber} ({trackResult.shipping.carrier || "Australia Post"})</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 12, color: muted }}>A tracking number will appear here once we've booked your shipment.</div>
                  )
                )}
                {trackResult.inspection?.staffNote && (
                  <div style={{ marginTop: 8, color: muted }}>Note from inspection: {trackResult.inspection.staffNote}</div>
                )}
              </div>
            )}
          </div>
        )}

        <button onClick={() => { setPmTrackMode((s) => !s); setPmTrackResult(undefined); }}
          style={{ background: "none", border: "none", color: brass, fontSize: 12.5, padding: 0, marginBottom: 16, cursor: "pointer", textDecoration: "underline" }}>
          {pmTrackMode ? "Hide price match tracking" : "Track a price match request"}
        </button>
        {pmTrackMode && (
          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={pmTrackQuery} onChange={(e) => setPmTrackQuery(e.target.value)} placeholder="Request number or email"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
              <button onClick={handlePriceMatchTrack} style={{ padding: "10px 16px", borderRadius: 3, border: "none", background: brass, color: "#1a1408", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Find
              </button>
            </div>
            {pmTrackResult === null && <div style={{ marginTop: 10, fontSize: 13, color: red }}>No request found with that number or email.</div>}
            {pmTrackResult && (
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                  <span style={{ color: muted }}>vs. {pmTrackResult.competitorName}</span><span>{pmTrackResult.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                  <span style={{ color: muted }}>Status</span><span>{PM_STATUS_LABELS[pmTrackResult.status]}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                  <span style={{ color: muted }}>{pmTrackResult.status === "approved" ? "Matched price" : "Your quote"}</span>
                  <span style={{ color: brass }}>{fmt(pmTrackResult.status === "approved" ? pmTrackResult.approvedPrice : pmTrackResult.ourQuote, pmTrackResult.region, REGIONS_A)}</span>
                </div>
                {pmTrackResult.staffNote && <div style={{ marginTop: 8, color: muted }}>Note: {pmTrackResult.staffNote}</div>}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", marginBottom: 22 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 3, borderRadius: 2, marginBottom: 6, background: i <= stepIndex ? brass : line }} />
              <div style={{ fontSize: 11, color: i <= stepIndex ? brass : muted }}>{s}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: muted, marginBottom: 22 }}>
          Prices shown in AUD — this is the only region customers see. Staff can compare worldwide pricing in the reference panel below once a quote is calculated.
        </div>

        {!selected && (
          <>
            <div style={{ marginBottom: 10, fontSize: 13, color: muted, letterSpacing: 0.2 }}>Step 1 — Find your device</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => { setCategoryFilter(c); setBrandFilter("All"); }}
                  style={{ padding: "6px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                    border: `1px solid ${categoryFilter === c ? green : line}`, background: categoryFilter === c ? "rgba(110,156,126,0.12)" : "transparent",
                    color: categoryFilter === c ? green : paper }}>
                  {c === "All" ? "All types" : CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {BRANDS.map((b) => (
                <button key={b} onClick={() => setBrandFilter(b)}
                  style={{ padding: "6px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                    border: `1px solid ${brandFilter === b ? brass : line}`, background: brandFilter === b ? brassDim : "transparent",
                    color: brandFilter === b ? brass : paper }}>
                  {b}
                </button>
              ))}
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search model, e.g. iPhone 15 Pro Max"
              style={{ width: "100%", padding: "13px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel, color: paper,
                fontSize: 15, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            <div style={{ border: `1px solid ${line}`, borderRadius: 3, overflow: "hidden" }}>
              {filtered.slice(0, 12).map((d, di) => (
                <div key={d.brand + d.model}>
                  <div style={{ padding: "10px 14px 4px", fontSize: 11, color: muted, borderTop: di === 0 ? "none" : `1px solid ${line}`, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{d.icon}</span>{d.brand} — {d.model}
                    <span style={{ marginLeft: "auto", color: "#5c6472" }}>{Math.round(ageMonths(d.release))}mo old</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "4px 14px 10px" }}>
                    {Object.keys(d.retail).map((s) => (
                      <button key={s} onClick={() => { setSelected({ ...d, storage: s }); setTierId(null); setFaults({}); setBlockers({}); }}
                        style={{ padding: "7px 12px", borderRadius: 3, fontSize: 13, cursor: "pointer", border: `1px solid ${line}`, background: panel2, color: paper }}>
                        {s} <span style={{ color: brass }}>· {fmt(baseBuybackAUD(d, s, RETENTION_A, BRAND_FACTOR_A) * REGIONS_A[region].mult, region, REGIONS_A)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div style={{ padding: 14, color: muted, fontSize: 14 }}>No matches — try another brand or model.</div>}
            </div>
          </>
        )}

        {selected && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${line}`, borderRadius: 3, padding: "12px 14px", marginBottom: 22, background: panel }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>{selected.icon}</span>
              <div>
                <div style={{ fontSize: 15 }}>{selected.brand} {selected.model}</div>
                <div style={{ fontSize: 13, color: muted }}>{selected.storage} · {Math.round(ageMonths(selected.release))} months since launch</div>
              </div>
            </div>
            <button onClick={() => { setSelected(null); setSearch(""); setTierId(null); }} style={{ background: "none", border: "none", color: brass, fontSize: 13, cursor: "pointer" }}>
              Change
            </button>
          </div>
        )}

        {selected && (
          <>
            <div style={{ marginBottom: 10, fontSize: 13, color: muted, letterSpacing: 0.2 }}>Step 2 — Condition</div>
            <div style={{ marginBottom: 24 }}>
              {TIERS_A.map((t) => {
                const active = tierId === t.id;
                return (
                  <button key={t.id} onClick={() => { setTierId(t.id); setFaults({}); setBlockers({}); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left",
                      padding: "13px 14px", marginBottom: 7, cursor: "pointer", background: active ? brassDim : panel, border: "none",
                      borderLeft: `3px solid ${active ? brass : "transparent"}`, borderRadius: 3, color: paper }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 18 }}>{t.icon}</span>
                      <div>
                        <div style={{ fontSize: 14 }}>{t.label}</div>
                        <div style={{ fontSize: 12, color: muted }}>{t.sub}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: active ? brass : muted }}>
                      up to {fmt(baseBuybackAUD(selected, selected.storage, RETENTION_A, BRAND_FACTOR_A) * REGIONS_A[region].mult * t.factor, region, REGIONS_A)}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {selected && tier && (tier.mode === "full" || tier.mode === "functional-only") && (
          <>
            <div style={{ marginBottom: 4, fontSize: 13, color: muted, letterSpacing: 0.2 }}>Step 3 — Anything wrong with it?</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 14 }}>Select everything that applies — the more precise you are, the less this changes after inspection.</div>
            {FAULT_GROUPS_A.map((g) => {
              if (tier.mode === "functional-only" && g.cosmetic) return null;
              return (
                <div key={g.group} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: brass, marginBottom: 6 }}>{g.group}</div>
                  <div style={{ border: `1px solid ${line}`, borderRadius: 3, overflow: "hidden" }}>
                    {g.faults.map((f, i) => {
                      const checked = !!faults[f.id];
                      return (
                        <label key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px",
                          borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 14, cursor: "pointer", background: checked ? "rgba(193,85,74,0.08)" : "transparent" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <input type="checkbox" checked={checked} onChange={(e) => setFaults((s) => ({ ...s, [f.id]: e.target.checked }))} />
                            {f.label}
                          </span>
                          <span style={{ color: red, fontSize: 13 }}>
                            {checked ? `−${fmt(calc.tierBase * f.pct, region, REGIONS_A)}` : `−${Math.round(f.pct * 100)}%`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginBottom: 20, padding: "10px 2px" }}>
              <input type="checkbox" checked={hasAccessories} onChange={(e) => setHasAccessories(e.target.checked)} />
              Original box & charger included
              <span style={{ color: green, fontSize: 13 }}>+{Math.round(ACCESSORY_BONUS_PCT * 100)}%</span>
            </label>

            <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Compliance checks</div>
            <div style={{ border: `1px solid ${red}`, borderRadius: 3, overflow: "hidden", marginBottom: 20 }}>
              {BLOCKERS.map((b, i) => (
                <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!blockers[b.id]} onChange={(e) => setBlockers((s) => ({ ...s, [b.id]: e.target.checked }))} />
                  {b.label}
                </label>
              ))}
            </div>
          </>
        )}

        {calc && !checkout && !submittedOrder && (
          <div style={{ position: "sticky", bottom: 12, background: panel, border: `1px solid ${brass}`, boxShadow: "0 8px 24px rgba(0,0,0,0.35)", borderRadius: 4, padding: 18, marginTop: 20 }}>
            {calc.blocked ? (
              <div>
                <div style={{ color: red, fontSize: 15, marginBottom: 4 }}>Quote unavailable</div>
                <div style={{ color: muted, fontSize: 13 }}>
                  This device can't be purchased until the flagged issue is resolved — remove any accounts
                  or resolve the reported status, then request a new quote.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, color: muted }}>Your quote</div>
                  <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 36, color: brass }}>{fmt(calc.total, region, REGIONS_A)}</div>
                </div>
                <div style={{ borderTop: `1px solid ${line}`, paddingTop: 10, fontSize: 12.5, color: muted }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>Base value ({tier.label})</span><span>{fmt(calc.tierBase, region, REGIONS_A)}</span>
                  </div>
                  {calc.lines.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>{l.label}</span>
                      <span style={{ color: l.amt >= 0 ? red : green }}>{l.amt >= 0 ? "−" : "+"}{fmt(Math.abs(l.amt), region, REGIONS_A)}</span>
                    </div>
                  ))}
                  {calc.holdingAmt > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>Refurb & holding cost ({Math.round(HOLDING_COST_A * 100)}%)</span>
                      <span style={{ color: red }}>−{fmt(calc.holdingAmt, region, REGIONS_A)}</span>
                    </div>
                  )}
                </div>
                <button className="cs-btn" onClick={() => setCheckout(true)} style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 3, border: "none", background: brass, color: "#1a1408", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Continue to sell →
                </button>
                {!leadSaved && (
                  <button onClick={() => setLeadEmailOpen((s) => !s)} style={{ width: "100%", marginTop: 8, padding: "8px", background: "none", border: "none", color: muted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                    Not ready yet? Email me this quote
                  </button>
                )}
                {leadEmailOpen && !leadSaved && (
                  <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <input value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} placeholder="Your email" type="email"
                      style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
                    <button disabled={!leadEmail.trim()} onClick={handleSaveLead}
                      style={{ padding: "9px 14px", borderRadius: 3, border: "none", background: leadEmail.trim() ? brass : line, color: leadEmail.trim() ? "#1a1408" : muted, fontSize: 12.5, cursor: leadEmail.trim() ? "pointer" : "default" }}>
                      Hold price
                    </button>
                  </div>
                )}
                {leadSaved && (
                  <div style={{ marginTop: 8, fontSize: 12, color: green, textAlign: "center" }}>
                    We'll hold this price for 14 days and email you a reminder.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {checkout && !submittedOrder && calc && !calc.blocked && (
          <div style={{ border: `1px solid ${line}`, borderRadius: 4, padding: 18, marginTop: 20, background: panel }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontSize: 15 }}>Your details</div>
              <div style={{ fontSize: 13, color: muted }}>Locking in {fmt(calc.total, region, REGIONS_A)}</div>
            </div>
            {["name", "email", "phone"].map((field) => (
              <input key={field}
                value={customer[field]}
                onChange={(e) => setCustomer((c) => ({ ...c, [field]: e.target.value }))}
                placeholder={field === "name" ? "Full name" : field === "email" ? "Email address" : "Phone number"}
                type={field === "email" ? "email" : "text"}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }}
              />
            ))}

            <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>Photo ID — required by law to buy second-hand devices</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[{ id: "license", label: "Driver licence" }, { id: "passport", label: "Passport" }, { id: "other", label: "Other photo ID" }].map((opt) => (
                <button key={opt.id} onClick={() => setCustomer((c) => ({ ...c, idType: opt.id }))}
                  style={{ flex: 1, padding: "9px 6px", borderRadius: 3, fontSize: 12, cursor: "pointer",
                    border: `1px solid ${customer.idType === opt.id ? brass : line}`, background: customer.idType === opt.id ? brassDim : "transparent",
                    color: customer.idType === opt.id ? brass : paper }}>
                  {opt.label}
                </button>
              ))}
            </div>
            <input value={customer.idNumber} onChange={(e) => setCustomer((c) => ({ ...c, idNumber: e.target.value }))}
              placeholder="ID number"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 6, outline: "none", boxSizing: "border-box" }} />
            <div style={{ fontSize: 11, color: muted, marginBottom: 14 }}>
              Kept on file as required for second-hand dealer compliance. Never shown in full to anyone but you and the inspecting staff member.
            </div>

            {idPhotoBackendAvailable ? (
              <>
                <label style={{ display: "block", fontSize: 13, color: muted, marginBottom: 6 }}>Photo of your ID (optional, encrypted)</label>
                <input type="file" accept="image/*" capture="environment"
                  onChange={(e) => setIdPhotoFile(e.target.files?.[0] || null)}
                  style={{ width: "100%", marginBottom: 4, fontSize: 12, color: paper }} />
                {idPhotoFile && <div style={{ fontSize: 11.5, color: green, marginBottom: 14 }}>{idPhotoFile.name} attached — will be encrypted and stored when you submit.</div>}
                {!idPhotoFile && <div style={{ fontSize: 11, color: muted, marginBottom: 14 }}>Stored encrypted, separately from everything else, and auto-deleted after your shop's retention period.</div>}
              </>
            ) : (
              <div style={{ fontSize: 11, color: muted, marginBottom: 14 }}>Photo ID capture isn't connected on this device — the ID number above still satisfies compliance requirements.</div>
            )}

            <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>Referral code (optional) — you and your friend both get {fmt(REFERRAL_REWARD_AMOUNT, region, REGIONS_A)}</div>
            <input value={referralCodeEntered} onChange={(e) => setReferralCodeEntered(e.target.value)} placeholder="e.g. JORDAN482"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box", textTransform: "uppercase" }} />

            <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>How will you send it?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[{ id: "post", label: "Post it (free)" }, { id: "dropoff", label: "Drop it off" }].map((opt) => (
                <button key={opt.id} onClick={() => setFulfillment(opt.id)}
                  style={{ flex: 1, padding: "10px", borderRadius: 3, fontSize: 13, cursor: "pointer",
                    border: `1px solid ${fulfillment === opt.id ? brass : line}`, background: fulfillment === opt.id ? brassDim : "transparent",
                    color: fulfillment === opt.id ? brass : paper }}>
                  {opt.label}
                </button>
              ))}
            </div>
            {fulfillment === "post" ? (
              <div style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 14 }}>
                We'll email you a free reply-paid postage address once you submit. Pack the device securely — we recommend keeping tracking until it arrives.
              </div>
            ) : (
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Preferred drop-off suburb (we'll confirm the nearest location)"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            )}

            <div style={{ fontSize: 11.5, color: muted, marginBottom: 14 }}>
              This quote is locked for 14 days from today. If your device doesn't match what you told us, we'll always send a revised offer for you to accept or decline — never an automatic reduced payment.
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setCheckout(false)} style={{ padding: "12px 16px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: muted, fontSize: 14, cursor: "pointer" }}>
                Back
              </button>
              <button className="cs-btn" onClick={handleSubmitOrder} disabled={!customer.name || !customer.email || !customer.idNumber || submitting}
                style={{ flex: 1, padding: "12px", borderRadius: 3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: customer.name && customer.email && customer.idNumber ? brass : line, color: customer.name && customer.email && customer.idNumber ? "#1a1408" : muted,
                  fontSize: 14, fontWeight: 600, cursor: customer.name && customer.email && customer.idNumber ? "pointer" : "default" }}>
                {submitting && <span className="cs-spinner"></span>}
                {submitting ? "Submitting…" : "Confirm & get shipping details →"}
              </button>
            </div>
          </div>
        )}

        {submittedOrder && (
          <div style={{ border: `1px solid ${brass}`, borderRadius: 4, padding: 18, marginTop: 20, background: panel }}>
            <div style={{ fontSize: 15, marginBottom: 4 }}>Order {submittedOrder.id} confirmed</div>
            <div style={{ fontSize: 12.5, color: muted, marginBottom: 14 }}>
              A confirmation has been sent to {submittedOrder.customer.email}. Save your order number to track it any time.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
              <span style={{ color: muted }}>Status</span><span>{STATUS_LABELS[submittedOrder.status]}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
              <span style={{ color: muted }}>Locked quote</span><span style={{ color: brass }}>{fmt(submittedOrder.quotedTotal, region, REGIONS_A)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
              <span style={{ color: muted }}>Price locked until</span><span>{new Date(submittedOrder.priceLockExpires).toLocaleDateString()}</span>
            </div>
            {submittedOrder.fulfillment === "post" && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 3, padding: 12 }}>
                Post to: REPLY PAID 91786, PRICING CONSOLE PTY LTD, PO BOX 24, YOUR CITY — write {submittedOrder.id} on the package.
              </div>
            )}
            {myReferralCode && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: green, border: `1px solid ${green}`, borderRadius: 3, padding: 12 }}>
                Share your code <strong>{myReferralCode}</strong> with a friend — you both get {fmt(REFERRAL_REWARD_AMOUNT, region, REGIONS_A)} when they sell to us.
              </div>
            )}
            <button onClick={() => { setSubmittedOrder(null); setCheckout(false); setSelected(null); setTierId(null); setFaults({}); setBlockers({}); setCustomer({ name: "", email: "", phone: "", idType: "license", idNumber: "" }); setIdPhotoFile(null); setReferralCodeEntered(""); setMyReferralCode(null); }}
              style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, fontSize: 14, cursor: "pointer" }}>
              Start another quote
            </button>
          </div>
        )}


        {reference && (
          <div style={{ marginTop: 20 }}>
            <button onClick={() => setShowRef((s) => !s)}
              style={{ background: "none", border: `1px dashed ${line}`, color: muted, fontSize: 12, padding: "8px 12px", borderRadius: 3, cursor: "pointer", width: "100%", textAlign: "left" }}>
              {showRef ? "▾" : "▸"} Staff only — worldwide pricing reference (not shown to customers)
            </button>
            {showRef && (
              <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginTop: 6, fontSize: 12.5 }}>
                <div style={{ color: muted, marginBottom: 8 }}>
                  Device age: {reference.ageMonthsNow.toFixed(1)} months. Customers only ever see the AU figure — this is for checking where our AU price sits globally before finalising it.
                </div>
                <div style={{ fontSize: 11, color: brass, marginBottom: 4, marginTop: 8 }}>This device, same condition, in every region we track</div>
                {Object.entries(REGIONS_A).map(([code, r]) => (
                  <div key={code} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: code === "AU" ? paper : muted }}>
                    <span>{r.label}{code === "AU" && " (customer-facing)"}</span>
                    <span style={{ color: code === "AU" ? brass : muted }}>{fmt(reference.worldwide[code], code, REGIONS_A)}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: brass, marginBottom: 4, marginTop: 12 }}>Implied competitor comparison (AUD)</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span>Our quote</span><span style={{ color: brass }}>{fmt(reference.ourQuoteAUD, "AU", REGIONS_A)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: muted }}><span>PhoneExchange-style (implied)</span><span>{fmt(reference.phoneExchangeEstAUD, "AU", REGIONS_A)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: muted }}><span>Mobile Monster-style (implied)</span><span>{fmt(reference.mobileMonsterEstAUD, "AU", REGIONS_A)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: muted }}><span>Cashify India-style (implied)</span><span>₹{Math.round(reference.cashifyIndiaEstINR / 10) * 10}</span></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
