import { DEFAULT_CATALOG, mergeCatalog } from "./device-catalog.js";
import { DEFAULT_RETENTION_POINTS, retentionAt, DEFAULT_BRAND_FACTOR, ageMonths, CATEGORY_FACTOR, DEFAULT_REGIONS, DEFAULT_TIERS, ACCESSORY_BONUS_PCT, DEFAULT_HOLDING_COST_PCT, baseBuybackAUD } from "./pricing.js";
import DeviceArt, { inferDeviceType } from "./device-art.jsx";
import InspectionSignature from "./inspection-signature.jsx";
// Friendly validation shared by the customer forms
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());
const digits = (v) => (v || "").replace(/[\s-]/g, "");
const isBsb = (v) => /^\d{6}$/.test(digits(v));
const isAccount = (v) => /^\d{6,10}$/.test(digits(v));

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


/* =================================================================
   CATALOG — original AU launch retail price per storage (AUD).
   This is the only thing that needs updating when a new phone
   launches; the buyback price is computed, never typed by hand.
================================================================= */
// Device catalogue now lives in device-catalog.js (shared by every tool).

/* Category factor — different product types hold value differently.
   Phones are the calibrated baseline (1.00). MacBooks are famous for
   strong resale value; tablets are close behind phones; watches
   depreciate fastest (fashion-driven upgrade cycle, strap/battery
   wear). These are reasoned, not independently verified the way the
   phone retention curve is — worth checking against a real watch/
   tablet/laptop buyback listing before trusting them with real money. */
const CATEGORIES = ["All", "phone", "tablet", "laptop", "watch"];
const CATEGORY_LABEL = { phone: "Phones", tablet: "Tablets", laptop: "Laptops", watch: "Watches" };

const BRANDS = ["All", "Apple", "Samsung", "Google", "OnePlus", "Xiaomi", "Oppo", "Vivo", "Motorola", "Nothing"];


/* Tier factors are now the average of two real, live Mobile Monster
   ladders (iPhone 15 Pro Max 256GB: 100/96/92/8, iPhone 13 128GB:
   100/93/86/10). Their platform barely discounts for cosmetic wear
   alone — the itemized fault checklist below does the real pricing
   work, not the tier. That's the fix: previously "Good" was docked
   22%, when real-world buyback only docks ~11% for cosmetic-only
   wear and lets faults do the rest. */

const PHONE_FAULT_GROUPS = [
  { group: "Display", cosmetic: true, faults: [
    { id: "screen_scratch", label: "Minor scratches on screen", pct: 0.05 },
    { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
    { id: "screen_crack_severe", label: "Screen glass missing pieces / unusable", pct: 0.40 },
    { id: "dead_pixels", label: "Dead pixels or lines on display", pct: 0.15 },
    { id: "burn_in", label: "Screen burn-in (OLED)", pct: 0.15 },
    { id: "discoloration", label: "Screen discoloration / tint", pct: 0.10 },
    { id: "true_tone", label: "True Tone / auto-brightness not working", pct: 0.04 },
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
    { id: "flash", label: "Flash / torch not working", pct: 0.03 },
  ]},
  { group: "Buttons & Ports", cosmetic: false, faults: [
    { id: "btn_power", label: "Power button faulty", pct: 0.10 },
    { id: "btn_volume", label: "Volume button faulty", pct: 0.05 },
    { id: "port_charge", label: "Charging port faulty", pct: 0.10 },
    { id: "port_headphone", label: "Headphone jack faulty", pct: 0.04 },
  ]},
  { group: "Audio & Sensors", cosmetic: false, faults: [
    { id: "speaker", label: "Speaker not working", pct: 0.08 },
    { id: "earpiece", label: "Earpiece (call speaker) not working", pct: 0.06 },
    { id: "mic", label: "Microphone not working", pct: 0.08 },
    { id: "biometric", label: "Face ID / fingerprint sensor not working", pct: 0.10 },
    { id: "sensor", label: "Proximity / other sensor issue", pct: 0.05 },
    { id: "vibration", label: "Vibration / haptic motor not working", pct: 0.04 },
  ]},
  { group: "Connectivity & Wireless", cosmetic: false, faults: [
    { id: "nfc", label: "NFC / tap-to-pay not working", pct: 0.04 },
    { id: "wireless_charge", label: "Wireless charging not working", pct: 0.06 },
    { id: "wifi", label: "Wi-Fi not working", pct: 0.1 },
    { id: "bluetooth", label: "Bluetooth not working", pct: 0.06 },
    { id: "gps", label: "GPS / location not working", pct: 0.04 },
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

const STEPS = ["Device", "Storage", "Condition", "Quote"];

// One rounding rule for both display and storage, so the amount saved on an
// order is always exactly the amount the customer was shown.
function roundMoney(n, region, regionsMap) {
  const r = (regionsMap || DEFAULT_REGIONS)[region];
  return r.round >= 10 ? Math.round(n / r.round) * r.round : Math.round(n);
}
function fmt(n, region, regionsMap) {
  const r = (regionsMap || DEFAULT_REGIONS)[region];
  const val = roundMoney(n, region, regionsMap);
  return `${r.symbol}${val.toLocaleString()}`;
}


const CONFIG_KEY = "pricing-config";

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
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
  // Pre-filled from links like /quote?q=iPhone%2015%20Pro (homepage shortcuts)
  const [search, setSearch] = useState(() => { try { return new URLSearchParams(window.location.search).get("q") || ""; } catch (e) { return ""; } });
  const [selected, setSelected] = useState(null);
  const [tierId, setTierId] = useState(null);
  const [faults, setFaults] = useState({});
  const [blockers, setBlockers] = useState({});
  const [hasAccessories, setHasAccessories] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", idOwnerName: "", payoutMethod: "bank", bankBsb: "", bankAccountNumber: "", bankAccountName: "", paypalEmail: "" });
  const [referralCodeEntered, setReferralCodeEntered] = useState("");
  const [myReferralCode, setMyReferralCode] = useState(null);
  const [fulfillment, setFulfillment] = useState("post");
  // Cash is only possible face to face (home collection or drop-off).
  useEffect(() => { if (fulfillment === "post") setCustomer((c) => (c.payoutMethod === "cash" ? { ...c, payoutMethod: "bank" } : c)); }, [fulfillment]);
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState(null);
  const [trackMode, setTrackMode] = useState(false);
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResult, setTrackResult] = useState(undefined); // undefined = not searched, null = not found
  const [respondSubmitting, setRespondSubmitting] = useState(false);
  const [respondError, setRespondError] = useState("");
  const [respondEmail, setRespondEmail] = useState("");
  const [submitError, setSubmitError] = useState("");
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
  const [bulkTrackOpen, setBulkTrackOpen] = useState(false);
  const [bulkTrackQuery, setBulkTrackQuery] = useState("");
  const [bulkTrackResult, setBulkTrackResult] = useState(undefined);

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
  const CATALOG_A = mergeCatalog(live?.catalog);
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
    const payoutValid = (customer.payoutMethod === "cash" ? fulfillment !== "post" : customer.payoutMethod === "bank" ? (isBsb(customer.bankBsb) && isAccount(customer.bankAccountNumber)) : isEmail(customer.paypalEmail));
    if (!calc || calc.blocked || !customer.name || !isEmail(customer.email) || !customer.idOwnerName || !payoutValid) return;
    setSubmitting(true);
    setSubmitError("");
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
      quotedTotal: roundMoney(calc.total, region, REGIONS_A),
      brandNewBase: calc.baseRegion,
      customer: { ...customer },
      fulfillment, address: fulfillment === "post" ? "" : address,
      status: "awaiting_shipment",
      inspection: null,
      referralCode: newCode,
    };
    if (!(await saveOrder(order))) {
      setSubmitError("We couldn't submit your order. Please check your connection and try again.");
      setSubmitting(false);
      return;
    }

    // If they came in on someone else's referral code, record the reward
    // for both sides — nothing is auto-credited (no payment rails
    // connected yet), staff honor it manually, same pattern as everywhere else.
    const enteredCode = referralCodeEntered.trim().toUpperCase();
    if (enteredCode) {
      const referral = {
        id: "REF-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(),
        code: enteredCode, referredEmail: customer.email, referredName: customer.name, referredOrderId: order.id,
        rewardAmount: REFERRAL_REWARD_AMOUNT, currency: REGIONS_A[region].currency,
        referrerPaid: false, referredPaid: false,
      };
      if (window.SHOP_API_BASE_URL) {
        // The server matches the code to its owner (and drops self-referrals),
        // so the public site never looks up another customer's order.
        await saveReferral(referral);
      } else {
        const referrerOrder = await findPublicRecord("orders", enteredCode, await loadOrders(), ["referralCode"]);
        if (referrerOrder && referrerOrder.customer.email.toLowerCase() !== customer.email.toLowerCase()) {
          await saveReferral({ ...referral, referrerEmail: referrerOrder.customer.email, referrerName: referrerOrder.customer.name });
        }
      }
    }

    await queueNotification({
      type: "order_confirmation", channel: "email", recipientEmail: customer.email, recipientName: customer.name,
      subject: `Order ${order.id} received`,
      message: `Thanks for sending us your ${selected.brand} ${selected.model} trade-in. We've received it (order ${order.id}) with a quote of ${fmt(calc.total, region, REGIONS_A)}, subject to inspecting the device.`,
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

  // Lets a customer accept or decline a revised offer themselves, no
  // waiting on staff to record it after a phone call. On a real backend
  // this calls the dedicated, narrow public endpoint (see server.js —
  // it can only move an order that's already awaiting a response, and
  // only if the caller knows the order's email). In the Claude.ai
  // preview (no real backend), storage isn't privacy-restricted, so this
  // falls back to a direct read-modify-write, matching every other
  // preview-mode fallback in this file.
  async function handleOrderRespond(decision) {
    if (!trackResult) return;
    // Lookups no longer return the customer's email, so the customer confirms it here.
    const email = isEmail(trackQuery) ? trackQuery.trim() : respondEmail.trim();
    if (window.SHOP_API_BASE_URL && !isEmail(email)) { setRespondError("Enter the email address you used for this order."); return; }
    setRespondSubmitting(true);
    setRespondError("");
    try {
      if (window.SHOP_API_BASE_URL) {
        const res = await fetch(`${window.SHOP_API_BASE_URL}/public/orders/${encodeURIComponent(trackResult.id)}/respond`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, decision }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Something went wrong — please try again.");
        setTrackResult({ ...trackResult, status: body.status });
      } else {
        const list = await loadOrders();
        const idx = list.findIndex((o) => o.id === trackResult.id);
        if (idx === -1) throw new Error("Order not found.");
        const updated = { ...list[idx], status: decision === "accept" ? "approved_paid" : "returned",
          inspection: { ...list[idx].inspection, customerRespondedAt: new Date().toISOString(), customerDecision: decision } };
        list[idx] = updated;
        await window.storage.set(ORDERS_KEY, JSON.stringify(list), true);
        setTrackResult(updated);
      }
    } catch (e) {
      setRespondError(e.message);
    } finally {
      setRespondSubmitting(false);
    }
  }

  async function handlePriceMatchSubmit() {
    if (!calc || !pmCompetitor.trim() || !pmPrice) return;
    const request = {
      id: genPriceMatchId(),
      createdAt: new Date().toISOString(),
      device: selected ? { brand: selected.brand, model: selected.model, storage: selected.storage } : null,
      ourQuote: roundMoney(calc.total, region, REGIONS_A), region, currency: REGIONS_A[region].currency,
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
      tierLabel: tier.label, quotedTotal: roundMoney(calc.total, region, REGIONS_A), region, currency: REGIONS_A[region].currency,
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
      type: "bulk_quote_request", channel: "email", recipientEmail: bulkBusiness.email, recipientName: bulkBusiness.contactName,
      subject: `Bulk trade-in request ${request.id} received`,
      message: `We've received your request for ${bulkItems.length} device(s), estimated at ${fmt(total, region, REGIONS_A)} total. A team member will follow up within 1-2 business days with a firm offer.`,
      relatedId: request.id,
    });
    setBulkSubmitted(request);
  }

  async function handleBulkTrackSearch() {
    const q = bulkTrackQuery.trim();
    if (!q) return;
    const localList = window.SHOP_API_BASE_URL ? null : await loadBulkRequests();
    const found = await findPublicRecord(BULK_KEY, q, localList, ["id", "business.email"]);
    setBulkTrackResult(found || null);
  }

  // Mobile Recellr palette — bold Australian retail: warm paper background,
  // heritage signage red as the single brand accent, bold black structure.
  const ink = "#FFFFFF", panel = "#FFFFFF", panel2 = "#F4F6F9", paper = "#111827", muted = "#5B6472",
    brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#E2E6EC";

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');
        @keyframes mv-pop { 0% { transform: scale(0.82); opacity: 0.4; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
        .mv-pop { display: inline-block; animation: mv-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; transform-origin: right center; }
        @media (prefers-reduced-motion: reduce) { .mv-pop { animation: none; } }
      `}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 130px" }}>

        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.01em', marginBottom: 4 }}>
          Instant Valuation
        </div>
        <div style={{ color: muted, fontSize: 14, marginBottom: 14 }}>
          Prices recalculate from age and condition every time you open this — not a static list.
        </div>
        <div style={{ fontSize: 12.5, color: source === "admin console" ? green : muted, marginBottom: 14 }}>
          {source === "admin console" ? "● Live pricing from admin console" : "○ Using built-in defaults — admin console not connected"}
        </div>

        <button onClick={() => setBulkMode((s) => !s)} style={{ background: "none", border: "none", color: brass, fontSize: 12.5, padding: 0, marginBottom: 10, cursor: "pointer", textDecoration: "underline" }}>
          {bulkMode ? "← Back to single device" : "Selling multiple devices? Get a bulk / business quote"}
        </button>
        <br />
        <button onClick={() => { setBulkTrackOpen((o) => !o); setBulkTrackResult(undefined); }} style={{ background: "none", border: "none", color: muted, fontSize: 12, padding: 0, marginBottom: 14, cursor: "pointer", textDecoration: "underline" }}>
          {bulkTrackOpen ? "← Hide tracking" : "Already submitted a bulk request? Track it"}
        </button>

        {bulkTrackOpen && (
          <div style={{ border: `1px solid ${line}`, borderRadius: 4, padding: 14, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={bulkTrackQuery} onChange={(e) => setBulkTrackQuery(e.target.value)} placeholder="Request number or business email" aria-label="Request number or business email to track your bulk quote"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13.5, outline: "none", boxSizing: "border-box" }} />
              <button onClick={handleBulkTrackSearch} className="cs-btn" style={{ padding: "0 16px", borderRadius: 3, border: "none", background: brass, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Find</button>
            </div>
            {bulkTrackResult === null && <div style={{ fontSize: 13, color: red }}>No request found with that number or email.</div>}
            {bulkTrackResult && (
              <div style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4 }}>{bulkTrackResult.itemCount} device(s) · estimated {fmt(bulkTrackResult.estimatedTotal, bulkTrackResult.region, REGIONS_A)}</div>
                <div>Status: <strong>{bulkTrackResult.status === "new" ? "Received — a team member will follow up within 1-2 business days" : "We've been in touch with you"}</strong></div>
              </div>
            )}
          </div>
        )}

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
          {live?.businessSettings?.dealerLicence && <span>✓ Licensed dealer</span>}
          <span>✓ Home collection across Sydney</span>
          <span>✓ 49-point check</span>
          <span>✓ Price held 14 days</span>
          <span>✓ Paid in cash, bank transfer or PayPal</span>
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
              <input value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} placeholder="Order number or email" aria-label="Order number or email to track your order"
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
                {trackResult.status === "revised_pending_customer" && (
                  <div style={{ marginTop: 12, border: `1px solid ${brass}`, borderRadius: 3, padding: 12 }}>
                    <div style={{ fontSize: 12.5, marginBottom: 10 }}>We found something different once we inspected your device. You can accept the revised amount above, or decline and we'll arrange getting your device back to you.</div>
                    {window.SHOP_API_BASE_URL && !isEmail(trackQuery) && (
                      <input value={respondEmail} onChange={(e) => setRespondEmail(e.target.value)} placeholder="Email you used for this order" aria-label="Email you used for this order" type="email"
                        style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, fontSize: 13, marginBottom: 8, fontFamily: "inherit" }} />
                    )}
                    {respondError && <div style={{ color: red, fontSize: 12, marginBottom: 8 }}>{respondError}</div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="cs-btn" disabled={respondSubmitting} onClick={() => handleOrderRespond("accept")}
                        style={{ flex: 1, padding: "9px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        Accept revised offer
                      </button>
                      <button className="cs-btn" disabled={respondSubmitting} onClick={() => handleOrderRespond("decline")}
                        style={{ flex: 1, padding: "9px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        Decline — return my device
                      </button>
                    </div>
                  </div>
                )}
                {trackResult.status === "returned" && (
                  <div style={{ marginTop: 12, color: muted, fontSize: 12.5 }}>You declined the revised offer — we'll be in touch about getting your device back to you.</div>
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
              <input value={pmTrackQuery} onChange={(e) => setPmTrackQuery(e.target.value)} placeholder="Request number or email" aria-label="Request number or email to track your price match request"
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
              <div style={{ fontSize: 12.5, color: i <= stepIndex ? brass : muted }}>{s}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: muted, marginBottom: 22 }}>
          All prices in AUD. Your quote updates instantly as you answer — no sign-up needed.
        </div>

        {!bulkMode && (() => {
          const stepsList = ["Device", "Condition", "Your details", "Done"];
          const current = submittedOrder ? 3 : checkout ? 2 : selected ? 1 : 0;
          return (
            <ol aria-label="Quote progress" style={{ display: "flex", listStyle: "none", padding: 0, margin: "0 0 24px", gap: 6 }}>
              {stepsList.map((label, i) => {
                const doneStep = i < current, active = i === current;
                return (
                  <li key={label} aria-current={active ? "step" : undefined} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ height: 5, borderRadius: 3, background: doneStep || active ? brass : "#E4DED2", transition: "background-color 0.35s ease", marginBottom: 6 }} />
                    <div style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? brass : doneStep ? paper : muted }}>
                      {doneStep ? "✓ " : ""}{label}
                    </div>
                  </li>
                );
              })}
            </ol>
          );
        })()}

        {!selected && (
          <>
            {(() => {
              const browsing = brandFilter !== "All" || categoryFilter !== "All" || search.trim();
              const label = brandFilter === "Apple" && categoryFilter === "phone" ? "iPhone" : brandFilter === "Google" ? "Google Pixel" : brandFilter !== "All" ? brandFilter : categoryFilter !== "All" ? CATEGORY_LABEL[categoryFilter].replace(/s$/, "") : "";
              const TILES = [["📱", "iPhone", "Apple", "phone"], ["📲", "Samsung", "Samsung", "All"], ["🔵", "Google Pixel", "Google", "All"], ["📋", "iPad / Tablet", "All", "tablet"], ["⌚", "Smartwatch", "All", "watch"], ["💻", "Laptop", "All", "laptop"]];
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", color: muted, marginBottom: 6 }}>STEP 1 — FIND YOUR DEVICE</div>
                  <h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(24px, 4.5vw, 32px)", margin: "0 0 4px", lineHeight: 1.15 }}>{browsing && label ? `Which ${label} model?` : "What are you selling?"}</h2>
                  <div style={{ color: muted, fontSize: 14.5, marginBottom: 12 }}>{browsing ? "Prices shown are the most we pay for each model." : "Pick a type or search for your model."}</div>
                  {!browsing && (
                    <div className="mv-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 6 }}>
                      {TILES.map(([icon, name, b, c]) => (
                        <button key={name} onClick={() => { setBrandFilter(b); setCategoryFilter(c); }} className="cs-card"
                          style={{ display: "grid", justifyItems: "center", gap: 6, padding: "18px 10px", borderRadius: 16, border: `1.5px solid ${line}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", color: paper }}>
                          <span style={{ fontSize: 30 }} aria-hidden="true">{icon}</span><span style={{ fontWeight: 800, fontSize: 15.5 }}>{name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {browsing && <button onClick={() => { setBrandFilter("All"); setCategoryFilter("All"); setSearch(""); }} style={{ background: "none", border: "none", color: brass, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 14, fontFamily: "inherit" }}>‹ Back to all types</button>}
                </div>
              );
            })()}
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search model, e.g. iPhone 15 Pro Max" aria-label="Search for your device model"
              style={{ width: "100%", padding: "13px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel, color: paper,
                fontSize: 15, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            <div style={{ border: `1px solid ${line}`, borderRadius: 16, overflow: "hidden", background: "#fff", display: (brandFilter !== "All" || categoryFilter !== "All" || search.trim()) ? "block" : "none" }}>
              {filtered.length > 20 && <div style={{ fontSize: 12, color: "#5B6472", margin: "0 0 8px" }}>Showing 20 of {filtered.length} matches — keep typing (e.g. add the model number) to narrow it down.</div>}
              {filtered.slice(0, 20).map((d, di) => {
                const mult = REGIONS_A[region].mult;
                const sizes = Object.keys(d.retail);
                const upTo = Math.max(...sizes.map((sz) => baseBuybackAUD(d, sz, RETENTION_A, BRAND_FACTOR_A) * mult * (1 - HOLDING_COST_A)));
                const pick = (sz) => { setSelected({ ...d, storage: sz }); setTierId(null); setFaults({}); setBlockers({}); };
                return (
                  <div key={d.brand + d.model} className="mvq-model" style={{ borderTop: di === 0 ? "none" : `1px solid ${line}`, padding: "12px 12px 10px" }}>
                    <div role="button" tabIndex={0} onClick={() => pick(sizes[0])} onKeyDown={(e) => { if (e.key === "Enter") pick(sizes[0]); }}
                      style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} aria-label={`${d.brand} ${d.model}, up to ${fmt(upTo, region, REGIONS_A)}`}>
                      <div style={{ width: 62, height: 62, borderRadius: 14, background: "#F4F6F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                        <DeviceArt type={inferDeviceType(d.model, d.category)} size={46} brand={d.brand} model={d.model} imageUrl={d.imageUrl} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{d.brand === "Apple" ? d.model : `${d.brand} ${d.model}`}</div>
                        <div style={{ fontSize: 12.5, color: muted }}>{Math.round(ageMonths(d.release))} months old · {sizes.length} size{sizes.length === 1 ? "" : "s"}</div>
                      </div>
                      <div style={{ color: brass, fontWeight: 800, fontSize: 15, whiteSpace: "nowrap", textAlign: "right" }}>Up to<br />{fmt(upTo, region, REGIONS_A)}</div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9, paddingLeft: 76 }}>
                      {sizes.map((sz) => (
                        <button key={sz} onClick={() => pick(sz)}
                          style={{ padding: "6px 11px", borderRadius: 10, fontSize: 12.5, cursor: "pointer", border: `1px solid ${line}`, background: "#fff", color: paper, fontFamily: "inherit" }}>
                          {sz} <span style={{ color: brass }}>· up to {fmt(baseBuybackAUD(d, sz, RETENTION_A, BRAND_FACTOR_A) * mult * (1 - HOLDING_COST_A), region, REGIONS_A)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <div style={{ padding: 14, color: muted, fontSize: 14 }}>No matches — try another brand or model.</div>}
            </div>
          </>
        )}

        {selected && (() => {
          // Product-page layout (inspired by PhoneExchange): photo + specs on the left,
          // live price, storage and condition pills on the right.
          const mult = REGIONS_A[region].mult;
          // Same basis as the final offer (after holding cost), so "up to" never promises more than we pay.
          const sealed = baseBuybackAUD(selected, selected.storage, RETENTION_A, BRAND_FACTOR_A) * mult * (1 - HOLDING_COST_A);
          const DOT = { new: "#F59E0B", asnew: "#0EA5E9", good: "#10B981", fair: "#F97316", parts: "#9CA3AF" };
          const released = new Date(selected.release);
          const specs = [
            ["Model", `${selected.brand} ${selected.model}`], ["Storage", selected.storage],
            ["Launched", isNaN(released) ? "—" : released.toLocaleDateString("en-AU", { month: "long", year: "numeric" })],
            ["Device age", `${Math.round(ageMonths(selected.release))} months`],
            ["Collection", "Free from your door, anywhere in Sydney"], ["Payment", "Cash, bank transfer or PayPal"], ["Price held", "14 days"],
          ];
          const pill = (on) => ({ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer",
            border: `2px solid ${on ? brass : line}`, background: on ? "rgba(33,80,200,0.07)" : "#fff", color: on ? brass : paper, fontFamily: "inherit" });
          return (
            <div className="mvq-product" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 18, marginBottom: 24, alignItems: "start" }}>
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ border: `1px solid ${line}`, borderRadius: 18, background: "linear-gradient(180deg,#F7F9FC,#EEF2F8)", display: "flex", alignItems: "center", justifyContent: "center", padding: "26px 10px", minHeight: 280 }}>
                  <DeviceArt type={inferDeviceType(selected.model, selected.category)} size={220} brand={selected.brand} model={selected.model} imageUrl={selected.imageUrl} label={`${selected.brand} ${selected.model}`} />
                </div>
                <div style={{ border: `1px solid ${line}`, borderRadius: 18, padding: "16px 18px", background: "#fff" }}>
                  <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 17, marginBottom: 8 }}>Specifications</div>
                  {specs.map(([k, v], i) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${line}` : "none", fontSize: 14 }}>
                      <span style={{ fontWeight: 700 }}>{k}</span><span style={{ color: muted }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ border: `1px solid ${line}`, borderRadius: 18, padding: "20px 20px 22px", background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(24px, 4vw, 32px)", lineHeight: 1.12, margin: 0 }}>{selected.brand} {selected.model}</h2>
                  <button onClick={() => { setSelected(null); setSearch(""); setTierId(null); }} style={{ background: "none", border: "none", color: brass, fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>Change</button>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13.5, margin: "8px 0 14px" }}>
                  <span style={{ color: brass, fontWeight: 700 }}>✓ 49-point check</span>
                  <span style={{ color: "#047857", fontWeight: 700 }}>● We're buying this model</span>
                </div>
                <div style={{ fontSize: 13, color: muted }}>{tier ? `Your offer · ${tier.label}` : "Up to (sealed, best condition)"}</div>
                <div className="mv-pop" aria-live="polite" key={tier ? Math.round(calc.total) : Math.round(sealed)} style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(34px, 6vw, 46px)", lineHeight: 1.1, color: paper }}>
                  {fmt(tier ? calc.total : sealed, region, REGIONS_A)}
                </div>
                <div style={{ fontSize: 13.5, color: muted, margin: "6px 0 16px" }}>Paid in <strong style={{ color: paper }}>cash</strong> at collection, or by bank transfer / PayPal.</div>
                <div style={{ borderTop: `1px solid ${line}`, paddingTop: 16 }}>
                  <div style={{ fontSize: 15, marginBottom: 10 }}><strong>Storage:</strong> <span style={{ color: muted }}>{selected.storage}</span></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }} role="radiogroup" aria-label="Storage">
                    {Object.keys(selected.retail).map((sz) => (
                      <button key={sz} role="radio" aria-checked={selected.storage === sz} onClick={() => setSelected({ ...selected, storage: sz })} style={pill(selected.storage === sz)}>{sz}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 15, marginBottom: 10 }}><strong>Condition:</strong> <span style={{ color: muted }}>{tier ? tier.label : "choose one"}</span></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="radiogroup" aria-label="Condition">
                    {TIERS_A.map((t) => (
                      <button key={t.id} role="radio" aria-checked={tierId === t.id} onClick={() => { setTierId(t.id); setFaults({}); setBlockers({}); }} style={pill(tierId === t.id)}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: DOT[t.id] || brass, display: "inline-block" }} />{t.label}
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: muted }}>up to {fmt(sealed * t.factor, region, REGIONS_A)}</span>
                      </button>
                    ))}
                  </div>
                  {tier && (
                    <div style={{ marginTop: 12, fontSize: 13.5, color: muted, background: "#F4F6F9", borderRadius: 10, padding: "10px 12px" }}>
                      <strong style={{ color: paper }}>{tier.label}:</strong> {tier.sub}. Up to {fmt(sealed * tier.factor, region, REGIONS_A)} before any issues below.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

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
          <div style={{ position: "sticky", bottom: 12, background: panel, border: `1px solid ${brass}`, boxShadow: "0 8px 28px rgba(32,28,24,0.16)", borderRadius: 4, padding: 18, marginTop: 20 }}>
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
                  <div key={Math.round(calc.total)} className="mv-pop" aria-live="polite" style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 36, color: brass }}>{fmt(calc.total, region, REGIONS_A)}</div>
                </div>
                {/* Live "device signature": the inspection ring turns amber where a fault is declared */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0 12px" }}>
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <InspectionSignature size={120} scanning={false}
                      groups={[...FAULT_GROUPS_A.map((g) => ({ name: g.group || g.title || g.name, faults: g.faults })), { name: "Security & lock checks", faults: BLOCKERS.map((b) => ({ id: b.id, label: b.label })) }]}
                      faulty={Object.keys(faults).filter((k) => faults[k])} title="Your device signature" />
                  </div>
                  <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
                    <strong style={{ color: paper }}>Your device signature.</strong> Each arc is part of our 49-point check; anything you flag turns amber. We confirm every point in person before paying.
                  </div>
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
                aria-label={field === "name" ? "Full name" : field === "email" ? "Email address" : "Phone number"}
                type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                autoComplete={field === "name" ? "name" : field === "email" ? "email" : "tel"}
                inputMode={field === "email" ? "email" : field === "phone" ? "tel" : undefined}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }}
              />
            ))}

            <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>Name on your photo ID</div>
            <input value={customer.idOwnerName} onChange={(e) => setCustomer((c) => ({ ...c, idOwnerName: e.target.value }))}
              placeholder="Full name (as it appears on your ID)" aria-label="Full name as it appears on your ID"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 6, outline: "none", boxSizing: "border-box" }} />
            <div style={{ fontSize: 12.5, color: muted, marginBottom: 14 }}>
              No need to upload anything. We check your photo ID in person before we pay you, as second-hand dealer rules require.
            </div>

            <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>Referral code (optional) — you and your friend both get {fmt(REFERRAL_REWARD_AMOUNT, region, REGIONS_A)}</div>
            <input value={referralCodeEntered} onChange={(e) => setReferralCodeEntered(e.target.value)} placeholder="e.g. JORDAN482"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box", textTransform: "uppercase" }} />

            <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }}>How will you send it?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[{ id: "post", label: "Post it to us" }, { id: "dropoff", label: "Drop it off in store" }, { id: "pickup", label: "Home collection" }].map((opt) => (
                <button key={opt.id} onClick={() => setFulfillment(opt.id)}
                  style={{ flex: 1, padding: "10px", borderRadius: 3, fontSize: 13, cursor: "pointer",
                    border: `1px solid ${fulfillment === opt.id ? brass : line}`, background: fulfillment === opt.id ? brassDim : "transparent",
                    color: fulfillment === opt.id ? brass : paper }}>
                  {opt.label}
                </button>
              ))}
            </div>
            {fulfillment === "post" && (
              <div style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 14 }}>
                {live?.businessSettings?.tradeInPostalAddress
                  ? <>You'll post it to: <strong style={{ color: paper }}>{live.businessSettings.tradeInPostalAddress}</strong>. Pack it securely and keep your tracking number.</>
                  : <>We'll email you the postage address and packing instructions within 1 business day. Pack it securely and keep your tracking number.</>}
                <div style={{ marginTop: 8 }}>📮 Drop your parcel at any <strong style={{ color: paper }}>Australia Post</strong> outlet or Parcel Locker — <a href="https://auspost.com.au/locate" target="_blank" rel="noopener" style={{ color: brass }}>find one near you</a>.</div>
              </div>
            )}
            {fulfillment === "dropoff" && (live?.businessSettings?.address ? (
              <div style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 14 }}>
                Drop it off at <strong style={{ color: paper }}>{live.businessSettings.address}</strong>{live.businessSettings.hours ? <> — {live.businessSettings.hours}</> : null}. Bring photo ID.
              </div>
            ) : (
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Your suburb (we'll confirm the nearest drop-off point)" aria-label="Your suburb"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            ))}
            {fulfillment === "pickup" && (
              <>
                <div style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 10 }}>
                  We collect from <strong style={{ color: paper }}>{live?.businessSettings?.pickupArea || "anywhere in Sydney"}</strong>. We'll call or email to book a time, run our 49-point check on the spot, check your photo ID, and pay you — cash if you like. <a href="/terms#pickup" target="_blank" rel="noopener" style={{ color: brass }}>Conditions apply</a>.
                </div>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Pickup address" aria-label="Pickup address" autoComplete="street-address"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
              </>
            )}

            <div style={{ fontSize: 13, color: muted, margin: "14px 0 8px" }} id="payout-method-label">How should we pay you?</div>
            <div role="group" aria-labelledby="payout-method-label" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[{ id: "bank", label: "Bank transfer" }, { id: "paypal", label: "PayPal" }, ...(fulfillment !== "post" ? [{ id: "cash", label: "Cash" }] : [])].map((opt) => (
                <button key={opt.id} onClick={() => setCustomer((c) => ({ ...c, payoutMethod: opt.id }))} aria-pressed={customer.payoutMethod === opt.id}
                  style={{ flex: 1, padding: "9px 6px", borderRadius: 3, fontSize: 12.5, cursor: "pointer",
                    border: `1px solid ${customer.payoutMethod === opt.id ? brass : line}`, background: customer.payoutMethod === opt.id ? brassDim : "transparent",
                    color: customer.payoutMethod === opt.id ? brass : paper }}>
                  {opt.label}
                </button>
              ))}
            </div>
            {customer.payoutMethod === "cash" ? (
              <div style={{ fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 14 }}>
                💵 We'll pay you <strong style={{ color: paper }}>in cash</strong> {fulfillment === "pickup" ? "when we collect your device" : "when you drop it off"}, after our 49-point check and a quick photo ID check.
              </div>
            ) : customer.payoutMethod === "bank" ? (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input value={customer.bankBsb} onChange={(e) => setCustomer((c) => ({ ...c, bankBsb: e.target.value }))} placeholder="BSB" aria-label="Bank BSB" inputMode="numeric" autoComplete="off" maxLength={7}
                  style={{ width: 90, padding: "12px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                <input value={customer.bankAccountNumber} onChange={(e) => setCustomer((c) => ({ ...c, bankAccountNumber: e.target.value }))} placeholder="Account number" aria-label="Bank account number" inputMode="numeric" autoComplete="off" maxLength={12}
                  style={{ flex: 1, padding: "12px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
            ) : (
              <input value={customer.paypalEmail} onChange={(e) => setCustomer((c) => ({ ...c, paypalEmail: e.target.value }))} placeholder="PayPal email" aria-label="PayPal email" autoComplete="email" inputMode="email" type="email"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            )}

            {customer.email && !isEmail(customer.email) && <div role="alert" style={{ fontSize: 12, color: "#8B2E2E", margin: "-4px 0 10px" }}>That email address doesn't look right — we'll need it to send your confirmation.</div>}
            {customer.payoutMethod === "bank" && customer.bankBsb && !isBsb(customer.bankBsb) && <div role="alert" style={{ fontSize: 12, color: "#8B2E2E", margin: "-4px 0 10px" }}>A BSB is 6 digits, e.g. 062-000.</div>}
            {customer.payoutMethod === "bank" && customer.bankAccountNumber && !isAccount(customer.bankAccountNumber) && <div role="alert" style={{ fontSize: 12, color: "#8B2E2E", margin: "-4px 0 10px" }}>Account numbers are usually 6–10 digits.</div>}
            {customer.payoutMethod === "paypal" && customer.paypalEmail && !isEmail(customer.paypalEmail) && <div role="alert" style={{ fontSize: 12, color: "#8B2E2E", margin: "-4px 0 10px" }}>That PayPal email doesn't look right.</div>}
            <div style={{ fontSize: 12.5, color: muted, marginBottom: 10 }}>
              By continuing you agree to our <a href="/terms" target="_blank" rel="noopener" style={{ color: brass }}>Terms</a> and <a href="/privacy" target="_blank" rel="noopener" style={{ color: brass }}>Privacy Policy</a>. Your details are only used to process this order and pay you.
            </div>
            <div style={{ fontSize: 12.5, color: muted, marginBottom: 14 }}>
              This quote is locked for 14 days from today. If your device doesn't match what you told us, we'll always send a revised offer for you to accept or decline — never an automatic reduced payment.
            </div>

            {submitError && <div role="alert" style={{ color: red, fontSize: 13, marginBottom: 10 }}>{submitError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setCheckout(false)} style={{ padding: "12px 16px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: muted, fontSize: 14, cursor: "pointer" }}>
                Back
              </button>
              {(() => {
                const canSubmit = customer.name && isEmail(customer.email) && customer.idOwnerName &&
                  (customer.payoutMethod === "cash" ? fulfillment !== "post" : customer.payoutMethod === "bank" ? (isBsb(customer.bankBsb) && isAccount(customer.bankAccountNumber)) : isEmail(customer.paypalEmail));
                return (
                  <button className="cs-btn" onClick={handleSubmitOrder} disabled={!canSubmit || submitting}
                    style={{ flex: 1, padding: "12px", borderRadius: 3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      background: canSubmit ? brass : line, color: canSubmit ? "#1a1408" : muted,
                      fontSize: 14, fontWeight: 600, cursor: canSubmit ? "pointer" : "default" }}>
                    {submitting && <span className="cs-spinner"></span>}
                    {submitting ? "Submitting…" : "Confirm & get shipping details →"}
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {submittedOrder && (
          <div style={{ border: `1px solid ${brass}`, borderRadius: 4, padding: 18, marginTop: 20, background: panel }}>
            {(() => {
              const rawFirst = String(submittedOrder.customer.name || "").trim().split(/\s+/)[0];
              const first = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1) : "";
              const days = Math.max(1, Math.round((new Date(submittedOrder.priceLockExpires) - new Date()) / 86400000));
              const post = submittedOrder.fulfillment === "post";
              const steps = [
                ["Check your inbox", `We're emailing a confirmation to ${submittedOrder.customer.email}.`],
                [post ? "Pop it in the post" : "Bring it to us", post ? "Send your phone to us using the details below." : "We'll be in touch to arrange a time that suits you."],
                ["Inspect, ID check, get paid", "We check the phone with you, see your photo ID in person, then pay you the way you chose."],
              ];
              return (
                <div style={{ textAlign: "center", paddingBottom: 6 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: brass, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, color: paper }}>
                    {first ? `Thank you, ${first}!` : "Thank you!"}
                  </div>
                  <div style={{ fontSize: 15, marginTop: 6, color: paper }}>
                    Your old phone is about to get a second life.
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: 6, color: muted, lineHeight: 1.6 }}>
                    Your quote of <strong style={{ color: brass }}>{fmt(submittedOrder.quotedTotal, region, REGIONS_A)}</strong> is held for {days} day{days === 1 ? "" : "s"}. The final amount is confirmed when we inspect the phone.
                  </div>
                  <div style={{ textAlign: "left", margin: "18px 0 6px" }}>
                    {steps.map(([title, text], i) => (
                      <div key={title} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: i ? `1px solid ${line}` : "none" }}>
                        <div style={{ flex: "0 0 26px", height: 26, borderRadius: "50%", border: `1.5px solid ${brass}`, color: brass, fontSize: 13, fontWeight: 700, textAlign: "center", lineHeight: "23px" }}>{i + 1}</div>
                        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: paper }}><strong>{title}</strong><br /><span style={{ color: muted }}>{text}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div style={{ fontSize: 13, margin: "14px 0 4px", color: muted }}>Your order number</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: paper }}>{submittedOrder.id}</div>
            <div style={{ fontSize: 12.5, color: muted, marginBottom: 14 }}>
              Save it to track your order any time. Questions? Just reply to our email or message us on WhatsApp.
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
                {live?.businessSettings?.tradeInPostalAddress
                  ? <>Post to: <strong>{live.businessSettings.tradeInPostalAddress}</strong> — write {submittedOrder.id} on the package.</>
                  : <>We'll email you the postage address within 1 business day. Write {submittedOrder.id} on the package.</>}
              </div>
            )}
            {myReferralCode && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: green, border: `1px solid ${green}`, borderRadius: 3, padding: 12 }}>
                Share your code <strong>{myReferralCode}</strong> with a friend — you both get {fmt(REFERRAL_REWARD_AMOUNT, region, REGIONS_A)} when they sell to us.
              </div>
            )}
            <div style={{ border: `1px solid ${line}`, borderRadius: 10, padding: 14, marginTop: 16, textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Before you send it — 2 minutes of prep</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.75, color: paper }}>
                <li><strong>Back it up</strong> (iCloud, Google or your computer).</li>
                <li><strong>Turn off Find My / sign out</strong> of your Apple, Google or Samsung account — locked phones can't be paid for.</li>
                <li><strong>Erase it</strong> (Settings → General → Transfer or Reset on iPhone; Factory reset on Android).</li>
                <li><strong>Remove your SIM</strong> and any memory card.</li>
              </ol>
            </div>
            <button onClick={() => { setSubmittedOrder(null); setCheckout(false); setSelected(null); setTierId(null); setFaults({}); setBlockers({}); setCustomer({ name: "", email: "", phone: "", idOwnerName: "", payoutMethod: "bank", bankBsb: "", bankAccountNumber: "", bankAccountName: "", paypalEmail: "" }); setReferralCodeEntered(""); setMyReferralCode(null); }}
              style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, fontSize: 14, cursor: "pointer" }}>
              Start another quote
            </button>

            <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/shop" style={{ flex: 1, minWidth: 160, border: `1px solid ${line}`, borderRadius: 3, padding: 12, textDecoration: "none", color: paper, fontSize: 12.5, textAlign: "center" }}>Browse refurbished stock →</a>
              <a href="/repairs" style={{ flex: 1, minWidth: 160, border: `1px solid ${line}`, borderRadius: 3, padding: 12, textDecoration: "none", color: paper, fontSize: 12.5, textAlign: "center" }}>Need a repair too? →</a>
            </div>
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
                <div style={{ fontSize: 12.5, color: brass, marginBottom: 4, marginTop: 8 }}>This device, same condition, in every region we track</div>
                {Object.entries(REGIONS_A).map(([code, r]) => (
                  <div key={code} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: code === "AU" ? paper : muted }}>
                    <span>{r.label}{code === "AU" && " (customer-facing)"}</span>
                    <span style={{ color: code === "AU" ? brass : muted }}>{fmt(reference.worldwide[code], code, REGIONS_A)}</span>
                  </div>
                ))}
                <div style={{ fontSize: 12.5, color: brass, marginBottom: 4, marginTop: 12 }}>Implied competitor comparison (AUD)</div>
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

// Shared with the Sell-by-brand pages so their "up to" figures use the exact same formula.
export { baseBuybackAUD, DEFAULT_RETENTION_POINTS, DEFAULT_BRAND_FACTOR, DEFAULT_HOLDING_COST_PCT, PHONE_FAULT_GROUPS, BLOCKERS, FAULT_GROUPS_BY_CATEGORY };
