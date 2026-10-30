// Starting ("from") repair prices. Shown on /repairs and used by the chat assistant.
// backend/chat-knowledge.js repeats these numbers for the AI; a backend test checks they match.
export const REPAIRS_BY_DEVICE = {
  Phone: [
    { name: "Screen replacement", from: 85 },
    { name: "Battery replacement", from: 59 },
    { name: "Charging port", from: 55 },
    { name: "Camera repair", from: 75 },
    { name: "Water damage diagnosis", from: 50 },
  ],
  Tablet: [
    { name: "Screen replacement", from: 170 },
    { name: "Battery replacement", from: 90 },
    { name: "Charging port", from: 90 },
  ],
  Laptop: [
    { name: "Screen replacement", from: 180 },
    { name: "Keyboard replacement", from: 120 },
    { name: "Battery replacement", from: 110 },
    { name: "Charging port", from: 100 },
  ],
  Watch: [
    { name: "Screen replacement", from: 90 },
    { name: "Battery replacement", from: 70 },
  ],
};

// Prices the owner set in the Pricing Console (pricing-config.repairPrices) replace the
// defaults above, device by device, if they're well formed. The AI chat uses the same
// rule (backend/chat-knowledge.js repairPricesFrom), so everyone quotes the same price.
export function repairPricesFrom(custom) {
  if (!custom || typeof custom !== "object") return REPAIRS_BY_DEVICE;
  const out = {};
  for (const [dev, rows] of Object.entries(custom)) {
    if (!/^[A-Za-z ]{2,20}$/.test(dev) || !Array.isArray(rows)) continue;
    const ok = rows.filter((r) => r && typeof r.name === "string" && r.name.trim() && r.name.length <= 60 && Number(r.from) > 0 && Number(r.from) < 100000)
      .slice(0, 20).map((r) => {
        const models = r.models && typeof r.models === "object" ? Object.fromEntries(Object.entries(r.models)
          .filter(([m, p]) => typeof m === "string" && m.trim() && m.length <= 40 && Number(p) > 0 && Number(p) < 100000).slice(0, 80).map(([m, p]) => [m.trim(), Math.round(Number(p))])) : null;
        return { name: r.name.trim().replace(/\s+/g, " "), from: Math.round(Number(r.from)), ...(models && Object.keys(models).length ? { models } : {}) };
      });
    if (ok.length) out[dev] = ok;
  }
  return { ...REPAIRS_BY_DEVICE, ...out }; // a device left out keeps its default prices
}

// The live prices, loaded once per page view and shared by every component that asks.
let loading = null;
export function loadRepairPrices() {
  if (!loading) {
    loading = (async () => {
      try {
        if (typeof window === "undefined" || !window.storage) return REPAIRS_BY_DEVICE;
        const r = await window.storage.get("pricing-config", true);
        return repairPricesFrom(r ? JSON.parse(r.value).repairPrices : null);
      } catch (e) { return REPAIRS_BY_DEVICE; }
    })();
  }
  return loading;
}

// The exact price for a typed model, when the shop set one ("iPhone 13" matches "iphone 13 pro"
// only if no longer name matches first). null = only the "from" price is known.
export function exactPrice(row, model) {
  const m = String(model || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!row || !row.models || m.length < 3) return null;
  const hit = Object.keys(row.models).sort((a, b) => b.length - a.length).find((k) => m.includes(k.toLowerCase()));
  return hit ? { model: hit, price: row.models[hit] } : null;
}
