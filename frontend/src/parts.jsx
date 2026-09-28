import React, { useState, useEffect } from "react";

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared) {
  if (!storageAvailable()) return null;
  try {
    const r = await window.storage.get(key, shared);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
function fmt(n) { return "$" + Number(n || 0).toFixed(2); }

const ink = "#F7F4EC", panel = "#FFFFFF", paper = "#201C18", muted = "#6B6560",
  brass = "#2150C8", red = "#8B2E2E", line = "#201C18";

export default function Parts() {
  const [accessories, setAccessories] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All");

  useEffect(() => {
    (async () => {
      const list = await loadJSON("accessories", true);
      setAccessories(list || []);
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading…</div>;

  const inStock = accessories.filter((a) => a.qtyOnHand > 0);
  const categories = ["All", ...new Set(inStock.map((a) => a.category).filter(Boolean))];
  const filtered = categoryFilter === "All" ? inStock : inStock.filter((a) => a.category === categoryFilter);

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px 80px" }}>

        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em", marginBottom: 8 }}>Parts &amp; accessories</div>
        <div style={{ color: muted, fontSize: 14, marginBottom: 28 }}>Cases, chargers, cables, and genuine replacement parts — in stock, ready today.</div>

        {inStock.length === 0 ? (
          <>
          <div style={{ border: `2px solid ${line}`, borderRadius: 3, padding: 30, textAlign: "center", background: panel }}>
            <div style={{ fontSize: 15, marginBottom: 10 }}>Nothing listed online just yet</div>
            <div style={{ color: muted, fontSize: 13, marginBottom: 18 }}>We carry a range of parts and accessories in-store — get in touch and we'll check what's available.</div>
            <a href="/contact" className="cs-btn" style={{ padding: "11px 20px", background: brass, color: "#fff", fontSize: 13.5, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Contact Us</a>
          </div>

          <div style={{ marginTop: 20, border: `2px solid ${line}`, borderRadius: 3, padding: 22, textAlign: "center", background: panel }}>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 6 }}>Upgrading? Trade in your old device</div>
            <div style={{ color: muted, fontSize: 13, marginBottom: 14 }}>Get an instant quote — no obligation to sell.</div>
            <a href="/quote" className="cs-btn" style={{ padding: "11px 20px", background: brass, color: "#fff", fontSize: 13.5, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Get an Instant Quote</a>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="/shop" style={{ flex: 1, minWidth: 200, border: `2px solid ${line}`, borderRadius: 3, padding: 16, textDecoration: "none", color: paper, background: panel }} className="cs-card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Need a whole device?</div>
              <div style={{ fontSize: 12.5, color: muted }}>Browse graded refurbished stock →</div>
            </a>
            <a href="/repairs" style={{ flex: 1, minWidth: 200, border: `2px solid ${line}`, borderRadius: 3, padding: 16, textDecoration: "none", color: paper, background: panel }} className="cs-card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Prefer we fit it for you?</div>
              <div style={{ fontSize: 12.5, color: muted }}>Book a repair →</div>
            </a>
          </div>
          </>
        ) : (
          <>
            <div role="group" aria-label="Filter by category" style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {categories.map((c) => (
                <button key={c} onClick={() => setCategoryFilter(c)} aria-pressed={categoryFilter === c}
                  style={{ padding: "8px 14px", borderRadius: 3, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${categoryFilter === c ? brass : line}`, background: categoryFilter === c ? "rgba(33,80,200,0.10)" : "transparent", color: categoryFilter === c ? brass : paper }}>
                  {c}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {filtered.map((a) => {
                const low = a.qtyOnHand <= 2;
                return (
                  <div key={a.id} className="cs-card" style={{ border: `2px solid ${line}`, borderRadius: 3, padding: 14, background: panel }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>{a.category}</div>
                    <div style={{ fontSize: 15, color: brass, fontWeight: 700, marginBottom: 4 }}>{fmt(a.sellPrice)}</div>
                    <div style={{ fontSize: 11, color: low ? red : muted }}>{low ? `Only ${a.qtyOnHand} left` : "In stock"}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 30, color: muted, fontSize: 12.5, textAlign: "center" }}>
              Want to grab one? <a href="/contact" style={{ color: brass }}>Contact us</a> or visit in person — stock shown here is what's actually on the shelf.
            </div>

            <div style={{ marginTop: 40, border: `2px solid ${line}`, borderRadius: 3, padding: 22, textAlign: "center", background: panel }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 6 }}>Upgrading? Trade in your old device</div>
              <div style={{ color: muted, fontSize: 13, marginBottom: 14 }}>Get an instant quote — no obligation to sell.</div>
              <a href="/quote" className="cs-btn" style={{ padding: "11px 20px", background: brass, color: "#fff", fontSize: 13.5, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Get an Instant Quote</a>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="/shop" style={{ flex: 1, minWidth: 200, border: `2px solid ${line}`, borderRadius: 3, padding: 16, textDecoration: "none", color: paper, background: panel }} className="cs-card">
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Need a whole device?</div>
                <div style={{ fontSize: 12.5, color: muted }}>Browse graded refurbished stock →</div>
              </a>
              <a href="/repairs" style={{ flex: 1, minWidth: 200, border: `2px solid ${line}`, borderRadius: 3, padding: 16, textDecoration: "none", color: paper, background: panel }} className="cs-card">
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Prefer we fit it for you?</div>
                <div style={{ fontSize: 12.5, color: muted }}>Book a repair →</div>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
