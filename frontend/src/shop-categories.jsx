import React, { useState, useMemo } from "react";

// Shop categories based on stock
// Groups inventory by brand > model series for easy browsing

export function ShopCategories({ inventory = [], onSelect }) {
  const [brand, setBrand] = useState("");
  const [series, setSeries] = useState("");

  const grouped = useMemo(() => {
    const g = {};
    inventory.filter(i => i.status === "in_stock" || i.qty > 0).forEach(item => {
      const b = item.brand || "Other";
      const m = item.model || "Unknown";
      const seriesKey = m.replace(/\d+GB|\d+TB|Pro Max|Pro|Plus|Mini/gi, "").trim().split(" ").slice(0, 2).join(" ");
      if (!g[b]) g[b] = {};
      if (!g[b][seriesKey]) g[b][seriesKey] = [];
      g[b][seriesKey].push(item);
    });
    return g;
  }, [inventory]);

  const brands = Object.keys(grouped).sort();
  const seriesList = brand ? Object.keys(grouped[brand] || {}).sort() : [];
  const items = brand && series ? (grouped[brand]?.[series] || []) : [];

  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <select value={brand} onChange={e => { setBrand(e.target.value); setSeries(""); }}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--mr-line)", fontSize: 15 }}>
          <option value="">All Brands</option>
          {brands.map(b => <option key={b} value={b}>{b} ({Object.values(grouped[b]).flat().length})</option>)}
        </select>
        {brand && (
          <select value={series} onChange={e => setSeries(e.target.value)}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--mr-line)", fontSize: 15 }}>
            <option value="">All Models</option>
            {seriesList.map(s => <option key={s} value={s}>{s} ({grouped[brand][s].length})</option>)}
          </select>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        {items.map(item => (
          <div key={item.id} onClick={() => onSelect?.(item)}
            style={{ background: "var(--mr-surface)", borderRadius: 12, padding: 12, border: "1px solid var(--mr-line)", cursor: "pointer" }}>
            {item.photoUrl && <img src={item.photoUrl} alt={item.model} style={{ width: "100%", height: 140, objectFit: "contain", marginBottom: 8 }} />}
            <div style={{ fontWeight: 700, fontSize: 14 }}>{item.model}</div>
            <div style={{ color: "var(--mr-muted)", fontSize: 13 }}>{item.storage} · {item.condition}</div>
            <div style={{ color: "#8B3A4C", fontWeight: 700, marginTop: 6 }}>${item.price?.toLocaleString()}</div>
          </div>
        ))}
      </div>
      {!items.length && brand && <div style={{ color: "var(--mr-muted)", padding: 20 }}>No stock in this category</div>}
    </div>
  );
}

export function generateBarcodeForItem(item) {
  if (item.barcode) return item.barcode;
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `MR-${(item.brand || "X").slice(0, 2).toUpperCase()}-${ts}-${rand}`;
}
