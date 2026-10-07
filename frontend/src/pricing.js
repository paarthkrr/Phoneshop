// Trade-in pricing formula, shared by the quote calculator (browser) and the
// backend (which re-checks the price of every order a customer submits).
// Plain JavaScript only: the server imports this file directly.
import { mergeCatalog } from "./device-catalog.js";

export const DEFAULT_RETENTION_POINTS = [
  { m: 0, r: 0.66 }, { m: 12, r: 0.58 }, { m: 24, r: 0.51 },
  { m: 36, r: 0.37 },  // recalibrated 28 Sep 2026 vs live Mobile Monster Brand New prices: 16 Pro 910/1799, 15 Pro 670/1849, 14 460/1399
  { m: 48, r: 0.33 }, { m: 60, r: 0.233 },  // older ages scaled by the same ~0.75 the 4-yr point moved
  { m: 72, r: 0.165 }, { m: 84, r: 0.113 }, { m: 96, r: 0.075 },
  { m: 120, r: 0.045 },
];

export function retentionAt(months, points) {
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

export const DEFAULT_BRAND_FACTOR = {
  Apple: 1.00, Samsung: 0.88, Google: 0.80, OnePlus: 0.72,
  Xiaomi: 0.60, Oppo: 0.68, Vivo: 0.65, Motorola: 0.62, Nothing: 0.58,
};

export function ageMonths(releaseDate, now = Date.now()) {
  const ms = now - new Date(releaseDate).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30));
}

export const CATEGORY_FACTOR = { phone: 1.00, tablet: 1.05, laptop: 1.15, watch: 0.70 };

export const DEFAULT_REGIONS = {
  AU: { label: "Australia", currency: "AUD", symbol: "A$", mult: 1.00, round: 1 },
  US: { label: "United States", currency: "USD", symbol: "$", mult: 0.70, round: 1 },
  UK: { label: "United Kingdom", currency: "GBP", symbol: "£", mult: 0.46, round: 1 },
  IN: { label: "India", currency: "INR", symbol: "₹", mult: 37, round: 10 },
  AE: { label: "UAE", currency: "AED", symbol: "AED ", mult: 2.35, round: 1 },
};

export const DEFAULT_TIERS = [
  { id: "new", label: "Brand New", sub: "Sealed, unopened box", icon: "📦", factor: 1.00, mode: "sealed" },
  { id: "asnew", label: "Like New", sub: "Used, no visible wear", icon: "✨", factor: 0.94, mode: "functional-only" },
  { id: "good", label: "Good", sub: "Visible wear, fully working", icon: "👍", factor: 0.89, mode: "full" },
  { id: "fair", label: "Fair", sub: "Noticeable damage, still usable", icon: "⚠️", factor: 0.75, mode: "full" },
  { id: "parts", label: "Faulty / For Parts", sub: "Won't turn on or major damage", icon: "🔧", factor: 0.09, mode: "parts" },
];

export const ACCESSORY_BONUS_PCT = 0.02;

export const DEFAULT_HOLDING_COST_PCT = 0.02; // flat refurb/overhead cost — age is already priced in via the curve

export function baseBuybackAUD(device, storage, retentionPoints, brandFactors, now = Date.now()) {
  const retail = device.retail[storage];
  const months = ageMonths(device.release, now);
  const brandF = (brandFactors || DEFAULT_BRAND_FACTOR)[device.brand] ?? 0.65;
  const categoryF = CATEGORY_FACTOR[device.category] ?? 1.00;
  // Per-model market correction set by staff in the Pricing Console
  // (e.g. -8 when a model trades below what its age predicts). Clamped so a
  // typo can't produce a wildly wrong quote.
  const adj = Math.max(-60, Math.min(30, Number(device.marketAdjPct) || 0));
  return retail * retentionAt(months, retentionPoints) * brandF * categoryF * (1 + adj / 100);
}

// "Brand New" buyback price for one device in one region, using the live
// Pricing Console settings (or the defaults). This is the number every trade-in
// quote and every staff re-assessment is built from.
export function brandNewBase(config, { brand, model, storage, region }, now = Date.now()) {
  const device = mergeCatalog(config && config.catalog).find((d) => d.brand === brand && d.model === model);
  if (!device || !device.retail || device.retail[storage] == null) return null;
  const regions = { ...DEFAULT_REGIONS[region], ...((config && config.regions && config.regions[region]) || {}) };
  if (!DEFAULT_REGIONS[region] || !Number.isFinite(regions.mult)) return null;
  const retention = (config && config.retentionPoints) || DEFAULT_RETENTION_POINTS;
  const brandFactors = { ...DEFAULT_BRAND_FACTOR, ...((config && config.brandFactors) || {}) };
  return baseBuybackAUD(device, storage, retention, brandFactors, now) * regions.mult;
}
