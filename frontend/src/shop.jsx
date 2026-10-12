import React, { useState, useEffect, useMemo } from "react";
import { DEFAULT_CATALOG, mergeCatalog } from "./device-catalog.js";

const INVENTORY_KEY = "inventory";

async function loadInventory() {
  if (typeof window === "undefined" || !window.storage) return [];
  try {
    const r = await window.storage.get(INVENTORY_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}

export function Shop({ onSelect }) {
  const [inventory, setInventory] = useState([]);
  const [brand, setBrand] = useState("Apple");
  const [search, setSearch] = useState("");

  useEffect(() => { loadInventory().then(setInventory); }, []);

  const stockByModel = useMemo(() => {
    const map = {};
    inventory.filter(i => i.status !== "sold").forEach(item => {
      const key = item.model;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [inventory]);

  const brands = [...new Set(DEFAULT_CATALOG.map(d => d.brand))];
  const models = DEFAULT_CATALOG
    .filter(d => d.brand === brand && d.category === "phone")
    .filter(d => !search || d.model.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.release.localeCompare(a.release));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Shop Refurbished</h1>
      <p style={{ color: "#5B6472", marginBottom: 20 }}>All models listed. In-stock items available for purchase.</p>
      
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {brands.map(b => (
          <button key={b} onClick={() => setBrand(b)}
            style={{ padding: "8px 16px", borderRadius: 20, border: brand === b ? "none" : "1px solid #E2E6EC",
              background: brand === b ? "#8B3A4C" : "#fff", color: brand === b ? "#fff" : "#111", fontWeight: 600, cursor: "pointer" }}>
            {b}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search model..."
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E2E6EC", marginLeft: "auto" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {models.map(m => {
          const stock = stockByModel[m.model] || [];
          const inStock = stock.length > 0;
          const minPrice = inStock ? Math.min(...stock.map(s => s.price || 9999)) : null;
          return (
            <div key={m.model} onClick={() => inStock && onSelect?.(stock[0])}
              style={{ background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #E2E6EC",
                opacity: inStock ? 1 : 0.6, cursor: inStock ? "pointer" : "default" }}>
              <div style={{ fontSize: 13, color: "#5B6472", marginBottom: 4 }}>{m.brand}</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{m.model}</div>
              {inStock ? (
                <>
                  <div style={{ color: "#3F6B34", fontSize: 13, fontWeight: 600 }}>{stock.length} in stock</div>
                  <div style={{ color: "#8B3A4C", fontWeight: 700, fontSize: 18, marginTop: 6 }}>From ${minPrice?.toLocaleString()}</div>
                </>
              ) : (
                <div style={{ color: "#8B2E2E", fontSize: 13, fontWeight: 600 }}>Sold out</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Shop;
