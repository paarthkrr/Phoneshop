// Compatibility engine: when staff add a product for one phone, suggest the
// other phones it fits. Built from research (Oct 2026) across case makers,
// screen-protector compatibility charts and connector specs. Sources often
// disagree, so every rule has a confidence level:
//   "same"   — widely agreed (identical dimensions/front); added in one tap
//   "likely" — most sources agree; staff should confirm with the product
//   "check"  — brand-dependent; only add after trying it on the phone
// Repair parts are model-specific unless listed. Rules are one-directional
// where the fit only works one way (e.g. a 14 Pro Max case may fit a 13 Pro
// Max, but a 13 Pro Max case will NOT fit a 14 Pro Max).

export const PART_CATEGORIES = ["Screens & displays", "Batteries", "Back glass & housings", "Charging ports & flex", "Cameras & lenses", "Other parts"];
export const ACCESSORY_CATEGORIES = ["Cases & covers", "Screen protectors", "Chargers & cables", "Power banks", "Audio", "Watch bands", "DIY repair kits", "Other"];
export const departmentOf = (category) => (PART_CATEGORIES.includes(category) ? "parts" : "accessories");

export function typeOf(category) {
  if (category === "Cases & covers") return "case";
  if (category === "Screen protectors") return "glass";
  if (category === "Chargers & cables" || category === "Power banks") return "charge";
  if (PART_CATEGORIES.includes(category)) return "part";
  return null;
}

// Symmetric groups: every model in a group fits the others' products.
const GROUPS = {
  case: [
    { level: "same", models: ["iPhone 12", "iPhone 12 Pro"], note: "Identical body dimensions" },
    { level: "same", models: ["iPhone 7", "iPhone 8", "iPhone SE (2020)", "iPhone SE (2022)"], note: "Same body" },
    { level: "same", models: ["iPhone X", "iPhone XS"], note: "Same body (XS camera slightly larger)" },
  ],
  glass: [
    { level: "same", models: ["iPhone 12", "iPhone 12 Pro"], note: "Identical front" },
    { level: "same", models: ["iPhone 13", "iPhone 13 Pro"], note: "Identical 6.1\" notch display" },
    { level: "likely", models: ["iPhone 13", "iPhone 13 Pro", "iPhone 14", "iPhone 16e"], note: "Same 6.1\" notch display — most charts agree" },
    { level: "same", models: ["iPhone 13 Pro Max", "iPhone 14 Plus"], note: "Same 6.7\" notch display" },
    { level: "likely", models: ["iPhone 12 Pro Max", "iPhone 13 Pro Max", "iPhone 14 Plus"], note: "6.7\" notch display" },
    { level: "same", models: ["iPhone X", "iPhone XS", "iPhone 11 Pro"], note: "Same 5.8\" display" },
    { level: "same", models: ["iPhone XR", "iPhone 11"], note: "Same 6.1\" LCD" },
    { level: "same", models: ["iPhone XS Max", "iPhone 11 Pro Max"], note: "Same 6.5\" display" },
    { level: "same", models: ["iPhone 7", "iPhone 8", "iPhone SE (2020)", "iPhone SE (2022)"], note: "Same 4.7\" display" },
    { level: "likely", models: ["iPhone 15", "iPhone 16"], note: "Same 6.1\" Dynamic Island display — most charts agree" },
    { level: "check", models: ["iPhone 15", "iPhone 15 Pro"], note: "Sources disagree — some 15 protectors fit the 15 Pro, many don't" },
    { level: "likely", models: ["iPhone 15 Plus", "iPhone 16 Plus"], note: "Same 6.7\" Dynamic Island display" },
    { level: "check", models: ["iPhone 15 Plus", "iPhone 15 Pro Max"], note: "Some protectors are sold for both — confirm on the box" },
    { level: "likely", models: ["iPhone 16 Pro", "iPhone 17"], note: "Same 6.3\" display — most charts agree" },
    { level: "check", models: ["iPhone 17", "iPhone 17 Pro"], note: "Some protectors are sold for both — confirm on the box" },
    { level: "likely", models: ["iPhone 16 Pro Max", "iPhone 17 Pro Max"], note: "Same 6.9\" display — most charts agree" },
  ],
  part: [
    { level: "same", models: ["iPhone 12", "iPhone 12 Pro"], note: "Same display and battery (back glass and cameras differ)" },
  ],
};
// One-way rules: a product made for `from` may also fit `to`.
const ONE_WAY = {
  case: [
    { level: "check", from: "iPhone 14 Pro Max", to: ["iPhone 13 Pro Max"], note: "Many 14 Pro Max cases fit the 13 Pro Max with a small gap at the camera — brand-dependent. (A 13 Pro Max case will NOT fit a 14 Pro Max.)" },
    { level: "check", from: "iPhone 14", to: ["iPhone 13"], note: "Some 14 cases fit the 13 (camera cut-out slightly larger). A 13 case usually won't fit a 14." },
    { level: "check", from: "iPhone 17", to: ["iPhone 16"], note: "Sources report partial fit only — try it first" },
  ],
};

// Connectors (high confidence, from specs). Built from the catalogue so new
// models are covered automatically.
const LIGHTNING_RE = /^iPhone (?:[5-9]|1[0-4]|X|XR|XS|SE)(?:\b| |$)/;
export function connectorOf(d) {
  if (d.brand !== "Apple") return d.category === "phone" || d.category === "tablet" ? "usb-c" : null;
  if (d.category === "phone") return LIGHTNING_RE.test(d.model) && !/^iPhone (1[5-9]|Air)/.test(d.model) ? "lightning" : "usb-c";
  if (d.category === "tablet") return /iPad \(9th|iPad mini \(5th|iPad Air \(3rd/.test(d.model) ? "lightning" : "usb-c";
  return null;
}
export const hasMagSafe = (d) => d.brand === "Apple" && d.category === "phone" && /^iPhone (1[2-9]|Air)/.test(d.model) && !/16e/.test(d.model);

// Main entry: given a category and the models already picked, return other
// models the product probably fits, best matches first. Never returns models
// already selected.
export function suggestCompatible(category, selected, catalog) {
  const t = typeOf(category); const sel = new Set(selected); const out = new Map();
  const add = (model, level, note) => {
    if (sel.has(model)) return;
    const rank = { same: 0, likely: 1, check: 2 };
    const prev = out.get(model);
    if (!prev || rank[level] < rank[prev.level]) out.set(model, { model, level, note });
  };
  if (!t) return [];
  for (const g of GROUPS[t] || []) if (g.models.some((m) => sel.has(m))) g.models.forEach((m) => add(m, g.level, g.note));
  for (const r of ONE_WAY[t] || []) if (sel.has(r.from)) r.to.forEach((m) => add(m, r.level, r.note));
  if (t === "charge" && catalog) {
    const picked = catalog.filter((d) => sel.has(d.model));
    const conns = new Set(picked.map(connectorOf).filter(Boolean));
    for (const c of conns) catalog.filter((d) => connectorOf(d) === c).forEach((d) =>
      add(d.model, "likely", c === "usb-c" ? "Also USB-C — fits if this is a USB-C cable/charger" : "Also Lightning — fits if this is a Lightning cable/charger"));
    if (picked.length && picked.every(hasMagSafe)) catalog.filter(hasMagSafe).forEach((d) => add(d.model, "check", "MagSafe iPhone — fits if this is a MagSafe charger/accessory"));
  }
  const rank = { same: 0, likely: 1, check: 2 };
  return [...out.values()].sort((a, b) => rank[a.level] - rank[b.level] || a.model.localeCompare(b.model));
}
