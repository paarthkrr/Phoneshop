import React, { useState, useEffect } from "react";

// Categories for POS
const CATEGORIES = [
  { id: "phones", name: "Phones", icon: "📱" },
  { id: "accessories", name: "Accessories", icon: "🎧" },
  { id: "repairs", name: "Repairs", icon: "🔧" },
  { id: "trade", name: "Trade-in", icon: "🔄" },
];

export default function POSRedesign({ inventory = [], onSale }) {
  const [category, setCategory] = useState("phones");
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");

  const filtered = inventory.filter(item => 
    item.category === category && 
    (item.name || "").toLowerCase().includes(search.toLowerCase())
  );

  function addToCart(item) {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { ...item, qty: 1 }]);
    }
  }

  function removeFromCart(id) {
    setCart(cart.filter(c => c.id !== id));
  }

  const total = cart.reduce((sum, c) => sum + (c.price || 0) * c.qty, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: "100vh", background: "#FAFAFA" }}>
      {/* Left: Products */}
      <div style={{ padding: 24, overflow: "auto" }}>
        {/* Categories */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              style={{
                padding: "10px 16px",
                border: "none",
                borderRadius: 8,
                background: category === cat.id ? "#7A1F2B" : "#fff",
                color: category === cat.id ? "#fff" : "#374151",
                fontWeight: 500,
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            fontSize: 14,
            marginBottom: 20,
          }}
        />

        {/* Products grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {filtered.map(item => (
            <div
              key={item.id}
              onClick={() => addToCart(item)}
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 16,
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                transition: "transform 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "none"}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>{item.icon || "📱"}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.name}</div>
              <div style={{ color: "#7A1F2B", fontWeight: 700 }}>${item.price}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Cart */}
      <div style={{ background: "#fff", borderLeft: "1px solid #E5E7EB", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E5E7EB" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Cart ({cart.length})</h2>
        </div>
        
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {cart.map(item => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>Qty: {item.qty}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontWeight: 600 }}>${(item.price || 0) * item.qty}</span>
                <button onClick={() => removeFromCart(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }}>✕</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 20, borderTop: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 18, fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ color: "#7A1F2B" }}>${total}</span>
          </div>
          <button
            onClick={() => onSale && onSale(cart, total)}
            disabled={cart.length === 0}
            style={{
              width: "100%",
              padding: "14px",
              background: cart.length ? "#7A1F2B" : "#D1D5DB",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 16,
              cursor: cart.length ? "pointer" : "not-allowed",
            }}
          >
            Complete Sale
          </button>
        </div>
      </div>
    </div>
  );
}
