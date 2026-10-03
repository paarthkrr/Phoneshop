import React, { useState, useEffect, useMemo } from "react";
import Photo from "./photo.jsx";

function storageAvailable() { return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function"; }
async function loadJSON(key, shared) { if (!storageAvailable()) return null; try { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : null; } catch (e) { return null; } }
async function saveJSON(key, value, shared) { if (!storageAvailable()) return false; try { await window.storage.set(key, JSON.stringify(value), shared); return true; } catch (e) { return false; } }
async function findPublicRecord(key, query, localList, fields = ["id", "customer.email"]) {
  const q = query.trim().toLowerCase();
  if (typeof window !== "undefined" && window.SHOP_API_BASE_URL) {
    for (const field of fields) {
      try { const res = await fetch(`${window.SHOP_API_BASE_URL}/public/find/${encodeURIComponent(key)}?field=${field}&value=${encodeURIComponent(q)}`); if (res.ok) return (await res.json()).record; } catch (e) {}
    }
    return null;
  }
  return (localList || []).find((r) => fields.some((f) => { const v = f.split(".").reduce((o, k) => (o ? o[k] : undefined), r); return typeof v === "string" && v.toLowerCase() === q; })) || null;
}
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());
function fmt(n) { return "$" + Number(n || 0).toFixed(2); }
const genId = () => "ACC-" + Math.floor(100000 + Math.random() * 900000);

// Delivery pricing — change these to suit your postage costs.
const SHIPPING_FLAT = 9.95;
const FREE_SHIPPING_OVER = 60;
const CART_KEY = "mv_cart";
const ICONS = [[/case|cover/i, "📱"], [/protector|glass/i, "🛡️"], [/charg|cable|power/i, "🔌"], [/kit|diy|tool|part/i, "🧰"], [/audio|ear|head/i, "🎧"]];
const iconFor = (cat) => (ICONS.find(([re]) => re.test(cat || "")) || [null, "✨"])[1];

const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
  brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";
const input = { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const primary = (on = true) => ({ padding: "12px 20px", borderRadius: 10, border: "none", background: on ? brass : "#C9C3B8", color: "#fff", fontSize: 14, fontWeight: 700, cursor: on ? "pointer" : "default", fontFamily: "inherit" });

export default function Parts() {
  const [accessories, setAccessories] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { return []; } });
  const [view, setView] = useState("shop"); // shop | checkout | done | track
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", address: "" });
  const [fulfilment, setFulfilment] = useState("collect");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState(null);
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResult, setTrackResult] = useState(undefined);

  useEffect(() => { (async () => { setAccessories((await loadJSON("accessories", true)) || []); })(); }, []);
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }, [cart]);

  const inStock = useMemo(() => (accessories || []).filter((a) => a.qtyOnHand > 0 && a.showOnline !== false), [accessories]);
  const categories = ["All", ...new Set(inStock.map((a) => a.category).filter(Boolean))];
  const q = search.trim().toLowerCase();
  const filtered = inStock.filter((a) => (categoryFilter === "All" || a.category === categoryFilter) &&
    (!q || `${a.name} ${a.category} ${a.compatibleWith || ""}`.toLowerCase().includes(q)));

  // Cart lines always re-read live stock and price, so a stale cart can't oversell or undercharge.
  const lines = cart.map((c) => { const item = (accessories || []).find((a) => a.id === c.id); return item ? { ...item, qty: Math.min(c.qty, item.qtyOnHand) } : null; }).filter((l) => l && l.qty > 0);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.qty * l.sellPrice, 0);
  const shipping = fulfilment === "delivery" && subtotal < FREE_SHIPPING_OVER ? SHIPPING_FLAT : 0;
  const total = subtotal + shipping;
  const qtyInCart = (id) => (cart.find((c) => c.id === id) || {}).qty || 0;
  const setQty = (item, qty) => setCart((c) => {
    const n = Math.max(0, Math.min(qty, item.qtyOnHand));
    const rest = c.filter((x) => x.id !== item.id);
    return n ? [...rest, { id: item.id, qty: n }] : rest;
  });

  async function placeOrder() {
    if (!lines.length || !customer.name.trim() || !isEmail(customer.email) || (fulfilment === "delivery" && !customer.address.trim())) return;
    setSubmitting(true); setError("");
    try {
      const order = {
        id: genId(), createdAt: new Date().toISOString(), status: "new", fulfilment,
        items: lines.map((l) => ({ id: l.id, name: l.name, category: l.category, price: l.sellPrice, qty: l.qty })),
        subtotal: +subtotal.toFixed(2), shipping: +shipping.toFixed(2), total: +total.toFixed(2),
        customer: { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim(), address: fulfilment === "delivery" ? customer.address.trim() : "" },
      };
      const list = (await loadJSON("accessory_orders", true)) || [];
      if (!(await saveJSON("accessory_orders", [order, ...list], true))) throw new Error("Couldn't place your order — check your connection and try again.");
      const q2 = (await loadJSON("notification_queue", true)) || [];
      q2.unshift({ id: "NTF-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), status: "pending", type: "accessory_order",
        channel: "email", recipientEmail: order.customer.email, subject: `Order ${order.id} received`, relatedId: order.id,
        message: `Thanks for your order (${count} item${count === 1 ? "" : "s"}, ${fmt(order.total)}). ${fulfilment === "collect" ? "We'll let you know when it's ready to collect — pay when you pick it up." : "We'll email you a secure payment link, then post it out."}` });
      await saveJSON("notification_queue", q2, true);
      setPlaced(order); setCart([]); setView("done");
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  }

  if (accessories === null) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading…</div>;

  const Header = (
    <>
      <Photo name="repairMat" height={200} eager style={{ marginBottom: 26 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em" }}>Parts &amp; accessories</div>
        {view === "shop" && count > 0 && (
          <button className="cs-btn" onClick={() => setView("checkout")} style={primary()}>🛒 Cart ({count}) · {fmt(subtotal)} →</button>
        )}
      </div>
      <div style={{ color: muted, fontSize: 14, marginBottom: 18 }}>Cases, screen protectors, chargers, and DIY repair kits — in stock, ready today, with a 6-month warranty. Free click &amp; collect, or delivery ({fmt(SHIPPING_FLAT)}, free over {fmt(FREE_SHIPPING_OVER)}). 30-day returns on unopened items — <a href="/terms#returns" target="_blank" rel="noopener" style={{ color: brass }}>conditions apply</a>.</div>
    </>
  );
  const CrossLinks = (
    <>
      <div style={{ marginTop: 40, border: `2px solid ${line}`, borderRadius: 14, padding: 22, textAlign: "center", background: panel }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 6 }}>Upgrading? Trade in your old device</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 14 }}>Get an instant quote — no obligation to sell.</div>
        <a href="/quote" className="cs-btn" style={{ ...primary(), textDecoration: "none", display: "inline-block" }}>Get an Instant Quote</a>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a href="/shop" className="cs-card" style={{ flex: 1, minWidth: 200, border: `2px solid ${line}`, padding: 16, textDecoration: "none", color: paper, background: panel }}><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Need a whole device?</div><div style={{ fontSize: 12.5, color: muted }}>Browse graded refurbished stock →</div></a>
        <a href="/repairs" className="cs-card" style={{ flex: 1, minWidth: 200, border: `2px solid ${line}`, padding: 16, textDecoration: "none", color: paper, background: panel }}><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Prefer we fit it for you?</div><div style={{ fontSize: 12.5, color: muted }}>Book a repair →</div></a>
      </div>
    </>
  );
  const wrap = (children) => (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 16px 80px" }}>{children}</div>
    </div>
  );

  if (view === "done" && placed) return wrap(<>
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
      <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, marginBottom: 8 }}>Order {placed.id} placed</div>
      <div style={{ color: muted, fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
        {placed.fulfilment === "collect" ? "We'll email you when it's ready to collect. Pay when you pick it up." : "We'll email you a secure payment link, then post your order."}<br />Confirmation sent to {placed.customer.email}. Total {fmt(placed.total)}.
      </div>
      <button className="cs-btn" onClick={() => { setPlaced(null); setView("shop"); }} style={primary()}>Keep shopping</button>
    </div>
  </>);

  if (view === "checkout") {
    const canPlace = lines.length && customer.name.trim() && isEmail(customer.email) && (fulfilment === "collect" || customer.address.trim()) && !submitting;
    return wrap(<>
      <button onClick={() => setView("shop")} style={{ background: "none", border: "none", color: brass, fontSize: 13.5, cursor: "pointer", padding: 0, marginBottom: 16 }}>← Keep shopping</button>
      <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, marginBottom: 16 }}>Your cart</div>
      {lines.length === 0 ? <div style={{ color: muted }}>Your cart is empty.</div> : <>
        <div style={{ background: panel, border: `1px solid rgba(32,28,24,0.14)`, borderRadius: 14, padding: "6px 16px", marginBottom: 18 }}>
          {lines.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid rgba(32,28,24,0.08)" }}>
              <div style={{ fontSize: 22 }} aria-hidden="true">{iconFor(l.category)}</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</div><div style={{ fontSize: 12, color: muted }}>{fmt(l.sellPrice)} each</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button aria-label={`One fewer ${l.name}`} onClick={() => setQty(l, l.qty - 1)} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${line}`, background: "#fff", cursor: "pointer" }}>−</button>
                <span style={{ minWidth: 20, textAlign: "center" }}>{l.qty}</span>
                <button aria-label={`One more ${l.name}`} disabled={l.qty >= l.qtyOnHand} onClick={() => setQty(l, l.qty + 1)} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${line}`, background: "#fff", cursor: "pointer" }}>+</button>
              </div>
              <div style={{ width: 70, textAlign: "right", fontWeight: 700 }}>{fmt(l.qty * l.sellPrice)}</div>
            </div>
          ))}
        </div>

        <div role="group" aria-label="Delivery method" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["collect", "Click & collect — free"], ["delivery", subtotal >= FREE_SHIPPING_OVER ? "Delivery — free" : `Delivery — ${fmt(SHIPPING_FLAT)}`]].map(([k, lbl]) => (
            <button key={k} aria-pressed={fulfilment === k} onClick={() => setFulfilment(k)} style={{ flex: 1, padding: 12, borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 600,
              border: `1.5px solid ${fulfilment === k ? brass : line}`, background: fulfilment === k ? brassDim : "transparent", color: fulfilment === k ? brass : paper }}>{lbl}</button>
          ))}
        </div>

        <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Full name" aria-label="Full name" autoComplete="name" style={input} />
        <input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="Email address" aria-label="Email address" type="email" autoComplete="email" inputMode="email" style={input} />
        {customer.email && !isEmail(customer.email) && <div role="alert" style={{ fontSize: 12, color: red, margin: "-4px 0 10px" }}>That email address doesn't look right — we'll need it for your order updates.</div>}
        <input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Phone (optional)" aria-label="Phone" type="tel" autoComplete="tel" inputMode="tel" style={input} />
        {fulfilment === "delivery" && <textarea value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="Delivery address" aria-label="Delivery address" autoComplete="street-address" rows={3} style={{ ...input, resize: "vertical" }} />}

        <div style={{ background: panel, borderRadius: 14, padding: 16, margin: "8px 0 14px", fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: muted }}><span>{fulfilment === "collect" ? "Click & collect" : "Delivery"}</span><span>{shipping ? fmt(shipping) : "Free"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 17, borderTop: "1px solid rgba(32,28,24,0.1)", paddingTop: 8 }}><span>Total (incl. GST)</span><span>{fmt(total)}</span></div>
        </div>
        <div style={{ fontSize: 12, color: muted, marginBottom: 12, lineHeight: 1.5 }}>
          {fulfilment === "collect" ? "Pay by card or cash when you collect." : "We'll email you a secure payment link, then post your order."} By placing an order you agree to our <a href="/terms" target="_blank" rel="noopener" style={{ color: brass }}>Terms</a> and <a href="/privacy" target="_blank" rel="noopener" style={{ color: brass }}>Privacy Policy</a>.
        </div>
        {error && <div style={{ color: red, fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <button className="cs-btn" disabled={!canPlace} onClick={placeOrder} style={{ ...primary(!!canPlace), width: "100%", padding: 14, fontSize: 15 }}>{submitting ? "Placing order…" : `Place order · ${fmt(total)}`}</button>
      </>}
    </>);
  }

  if (view === "track") return wrap(<>
    <button onClick={() => { setView("shop"); setTrackResult(undefined); }} style={{ background: "none", border: "none", color: brass, fontSize: 13.5, cursor: "pointer", padding: 0, marginBottom: 16 }}>← Back to the shop</button>
    <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, marginBottom: 14 }}>Track an accessories order</div>
    <div style={{ display: "flex", gap: 8 }}>
      <input value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} placeholder="Order number or email" aria-label="Order number or email" style={{ ...input, marginBottom: 0 }} />
      <button className="cs-btn" onClick={async () => { const local = window.SHOP_API_BASE_URL ? null : await loadJSON("accessory_orders", true); setTrackResult((await findPublicRecord("accessory_orders", trackQuery, local)) || null); }} style={primary()}>Find</button>
    </div>
    {trackResult === null && <div style={{ color: red, fontSize: 13, marginTop: 12 }}>No order found with that number or email.</div>}
    {trackResult && <div style={{ background: panel, borderRadius: 14, padding: 16, marginTop: 14, fontSize: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{trackResult.id} · {fmt(trackResult.total)}</div>
      <div style={{ color: muted, marginBottom: 8 }}>{trackResult.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</div>
      <div>Status: <strong>{{ new: "Received — we're getting it ready", ready: trackResult.fulfilment === "collect" ? "Ready to collect" : "Sent — on its way", completed: "Completed", cancelled: "Cancelled" }[trackResult.status] || trackResult.status}</strong></div>
    </div>}
  </>);

  return wrap(<>
    {Header}
    {inStock.length === 0 ? (<>
      <div style={{ border: `2px solid ${line}`, borderRadius: 14, padding: 30, textAlign: "center", background: panel }}>
        <div style={{ fontSize: 15, marginBottom: 10 }}>Nothing listed online just yet</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 18 }}>We carry a range of parts and accessories in-store — get in touch and we'll check what's available.</div>
        <a href="/contact" className="cs-btn" style={{ ...primary(), textDecoration: "none", display: "inline-block" }}>Contact Us</a>
      </div>
      {CrossLinks}
    </>) : (<>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search, or type your phone (e.g. iPhone 15) to see what fits" aria-label="Search accessories or your phone model" style={input} />
      <div role="group" aria-label="Filter by category" style={{ display: "flex", gap: 8, margin: "4px 0 18px", flexWrap: "wrap" }}>
        {categories.map((c) => (
          <button key={c} onClick={() => setCategoryFilter(c)} aria-pressed={categoryFilter === c}
            style={{ padding: "9px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", minHeight: 40,
              border: `1.5px solid ${categoryFilter === c ? brass : "rgba(32,28,24,0.2)"}`, background: categoryFilter === c ? brassDim : "#fff", color: categoryFilter === c ? brass : paper }}>
            {c === "All" ? "All" : `${iconFor(c)} ${c}`}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <div style={{ color: muted, fontSize: 14, marginBottom: 20 }}>No matches. Try a different search, or <a href="/help" style={{ color: brass }}>ask us</a> — we may have it in store.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {filtered.map((a) => {
          const low = a.qtyOnHand <= 2, inCart = qtyInCart(a.id);
          return (
            <div key={a.id} className="cs-card" style={{ border: `2px solid ${line}`, padding: 14, background: panel, display: "flex", flexDirection: "column" }}>
              <div style={{ height: 110, borderRadius: 10, background: "#F4F1EA", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, overflow: "hidden" }}>
                {a.imageUrl ? <img src={a.imageUrl} alt={a.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  : <span style={{ fontSize: 40 }} aria-hidden="true">{iconFor(a.category)}</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{a.name}</div>
              <div style={{ fontSize: 11.5, color: muted, marginBottom: 6 }}>{a.category}{a.compatibleWith ? ` · Fits ${a.compatibleWith}` : ""}</div>
              <div style={{ fontSize: 17, color: brass, fontWeight: 700, marginBottom: 2 }}>{fmt(a.sellPrice)}</div>
              <div style={{ fontSize: 11.5, color: low ? red : green, marginBottom: 10 }}>{low ? `Only ${a.qtyOnHand} left` : "In stock"}</div>
              <div style={{ marginTop: "auto" }}>
                {inCart ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <button aria-label={`One fewer ${a.name}`} onClick={() => setQty(a, inCart - 1)} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${line}`, background: "#fff", cursor: "pointer", fontSize: 16 }}>−</button>
                    <span style={{ fontWeight: 700 }}>{inCart} in cart</span>
                    <button aria-label={`One more ${a.name}`} disabled={inCart >= a.qtyOnHand} onClick={() => setQty(a, inCart + 1)} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${line}`, background: "#fff", cursor: "pointer", fontSize: 16 }}>+</button>
                  </div>
                ) : (
                  <button className="cs-btn" onClick={() => setQty(a, 1)} style={{ ...primary(), width: "100%" }}>Add to cart</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {count > 0 && <button className="cs-btn" onClick={() => setView("checkout")} style={{ ...primary(), width: "100%", marginTop: 20, padding: 14, fontSize: 15 }}>Checkout · {count} item{count === 1 ? "" : "s"} · {fmt(subtotal)}</button>}
      <div style={{ marginTop: 18, textAlign: "center" }}>
        <button onClick={() => setView("track")} style={{ background: "none", border: "none", color: brass, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>Already ordered? Track it here</button>
      </div>
      {CrossLinks}
    </>)}
  </>);
}
