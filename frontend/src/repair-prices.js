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
      .slice(0, 20).map((r) => ({ name: r.name.trim().replace(/\s+/g, " "), from: Math.round(Number(r.from)) }));
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
