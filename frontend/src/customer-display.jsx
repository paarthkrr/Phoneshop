import React, { useState, useEffect } from "react";

// Customer-facing display for 2nd screen
export default function CustomerDisplay() {
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // Only the shop's own pages may update this screen; a message from any other site is ignored.
    const handler = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "cart-update") {
        setCart(e.data.items || []);
        setTotal(e.data.total || 0);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div style={{ background: "#111827", color: "#fff", minHeight: "100vh", padding: 40, fontFamily: "system-ui" }}>
      <div style={{ fontSize: 14, color: "#9CA3AF", marginBottom: 20, letterSpacing: "0.1em" }}>YOUR ORDER</div>
      {cart.length === 0 ? (
        <div style={{ fontSize: 24, color: "#6B7280", marginTop: 100, textAlign: "center" }}>Waiting for items...</div>
      ) : (
        <>
          {cart.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid #374151" }}>
              <span style={{ fontSize: 20 }}>{item.name}</span>
              <span style={{ fontSize: 20, fontWeight: 600 }}>${item.price}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "2px solid #7A1F2B" }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>Total</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#7A1F2B" }}>${total}</span>
          </div>
        </>
      )}
    </div>
  );
}
