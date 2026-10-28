// Counts a step of the website funnel on our own server (backend/analytics.js): no
// cookies, nothing personal, just "someone did this on this page". Never blocks or fails.
const seen = new Set();
export function track(e, { once = false } = {}) {
  try {
    if (typeof window === "undefined" || !window.SHOP_API_BASE_URL) return;
    const p = window.location.pathname;
    if (once) { const k = `${e}|${p}`; if (seen.has(k)) return; seen.add(k); }
    fetch(`${window.SHOP_API_BASE_URL}/public/track`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ e, p }) }).catch(() => {});
  } catch (err) { /* counting is optional */ }
}
