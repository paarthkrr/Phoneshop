import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import DeviceArt, { inferDeviceType } from "./device-art.jsx";
import { mergeCatalog } from "./device-catalog.js";
import { baseBuybackAUD, DEFAULT_RETENTION_POINTS, DEFAULT_BRAND_FACTOR, DEFAULT_HOLDING_COST_PCT } from "./instant-quote-calculator.jsx";

// "Sell your iPhone / Samsung / Pixel" landing pages (Cashify-style).
// Each model shows "Get up to $X" using the SAME formula as the quote tool
// (the Brand New / sealed price for its largest storage), so the headline
// figure is never higher than what the customer can actually be quoted.
export const SELL_BRANDS = { apple: "Apple", samsung: "Samsung", google: "Google", oppo: "Oppo", motorola: "Motorola", xiaomi: "Xiaomi", oneplus: "OnePlus", nothing: "Nothing", vivo: "Vivo" };

const ink = "#FFFFFF", panel = "#FFFFFF", paper = "#111827", muted = "#5B6472", brass = "#2150C8";

async function loadConfig() {
  try { if (!window.storage) return null; const r = await window.storage.get("pricing-config", true); return r ? JSON.parse(r.value) : null; } catch (e) { return null; }
}

export default function SellBrand() {
  const { brand: slug } = useParams();
  const brand = SELL_BRANDS[(slug || "").toLowerCase()];
  const [cfg, setCfg] = useState(undefined);
  const [q, setQ] = useState("");
  useEffect(() => { (async () => setCfg(await loadConfig()))(); }, []);
  useEffect(() => { if (brand) document.title = `Sell Your ${brand === "Apple" ? "iPhone" : brand} — Instant Quote | Mobile Recellr`; }, [brand]);

  const models = useMemo(() => {
    if (!brand || cfg === undefined) return [];
    const catalog = mergeCatalog(cfg && cfg.catalog);
    const points = (cfg && cfg.retentionPoints) || DEFAULT_RETENTION_POINTS;
    const factors = { ...DEFAULT_BRAND_FACTOR, ...((cfg && cfg.brandFactors) || {}) };
    // Same holding-cost deduction the quote tool applies, so "up to" = the real sealed quote.
    const holding = (cfg && cfg.holdingCostPct) ?? DEFAULT_HOLDING_COST_PCT;
    return catalog.filter((d) => d.brand === brand)
      .map((d) => {
        const sizes = Object.keys(d.retail || {});
        const best = Math.max(...sizes.map((s) => baseBuybackAUD(d, s, points, factors) || 0)) * (1 - holding);
        return { ...d, upTo: Math.floor(best) };
      })
      .filter((d) => d.upTo > 0)
      .sort((a, b) => String(b.release).localeCompare(String(a.release)));
  }, [brand, cfg]);

  if (!brand) return (
    <div style={{ background: ink, color: paper, padding: 60, textAlign: "center", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>We couldn't find that brand.</div>
      <a href="/quote" style={{ color: brass }}>Search all devices →</a>
    </div>
  );
  const shown = models.filter((d) => !q.trim() || d.model.toLowerCase().includes(q.trim().toLowerCase()));
  const label = brand === "Apple" ? "iPhone" : brand;

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ background: "linear-gradient(135deg, #2150C8 0%, #16348a 100%)", color: "#fff", padding: "44px 16px 40px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}><a href="/" style={{ color: "#fff" }}>Home</a> › <a href="/quote" style={{ color: "#fff" }}>Sell</a> › {brand}</div>
          <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(28px, 5vw, 42px)", lineHeight: 1.1, margin: "0 0 10px" }}>Sell your {label}</h1>
          <div style={{ fontSize: 16, opacity: 0.92, maxWidth: 620, lineHeight: 1.6 }}>Pick your model for an instant quote. Any condition, price held 14 days, paid by bank transfer or PayPal.</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label} models`} aria-label={`Search ${label} models`}
            style={{ marginTop: 20, width: "100%", maxWidth: 460, padding: "14px 16px", borderRadius: 12, border: "none", fontSize: 15, boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
      </div>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 70px" }}>
        {cfg === undefined ? <div style={{ color: muted }}>Loading models…</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14 }}>
            {shown.map((d) => (
              <a key={d.model} href={`/quote?q=${encodeURIComponent(d.model)}`} className="cs-card"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", border: "1px solid #E2E6EC", background: panel, padding: "18px 12px", color: paper, textDecoration: "none" }}>
                <DeviceArt type={inferDeviceType(d.model, d.category)} size={58} brand={d.brand} model={d.model} imageUrl={d.imageUrl} label={`${d.brand} ${d.model}`} />
                <div style={{ fontWeight: 700, fontSize: 14.5, margin: "12px 0 4px" }}>{d.model}</div>
                <div style={{ fontSize: 12.5, color: muted }}>Get up to</div>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, color: brass }}>${d.upTo.toLocaleString()}</div>
              </a>
            ))}
          </div>
        )}
        {cfg !== undefined && shown.length === 0 && <div style={{ color: muted }}>No models match. <a href="/quote" style={{ color: brass }}>Search all devices →</a></div>}
        <div style={{ fontSize: 12.5, color: muted, marginTop: 22, lineHeight: 1.6 }}>
          "Up to" is the price for a sealed, brand-new device in its largest storage size. Your quote depends on model, storage and condition. Don't see your model? <a href="/quote" style={{ color: brass }}>Search every device</a> or <a href="/help" style={{ color: brass }}>ask us</a>.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 22 }}>
          {Object.entries(SELL_BRANDS).filter(([, b]) => b !== brand).map(([s, b]) => (
            <a key={s} href={`/sell/${s}`} className="mv-chip" style={{ display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 14px", borderRadius: 999, background: "#fff", border: "1px solid rgba(32,28,24,0.16)", color: paper, textDecoration: "none", fontSize: 13.5, fontWeight: 600 }}>
              Sell {b === "Apple" ? "iPhone" : b}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
