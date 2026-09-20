import React, { useState, useEffect, useMemo } from "react";

/* =================================================================
   STOREFRONT
   The other half of the business the rest of this system never
   built: customers can only sell TO the shop (calculator) or buy
   IN PERSON (POS Sell tab). This is where they browse and buy
   remotely — reading the exact same "inventory" records POS already
   grades and lists, so there's one source of truth for what's
   actually for sale, not a separate catalog that can drift out of
   sync with what's physically on the shelf.
================================================================= */

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}

// Same fix as the calculator's tracking functions — window.storage.get()
// on purchase_orders is correctly staff-only on a real deployment (it
// holds every customer's shipping address), so a plain load-then-filter
// only ever sees an empty list for a real anonymous customer. This calls
// the backend's dedicated single-record lookup instead.
async function findPublicRecord(key, query, localList, fields = ["id", "customer.email", "customerEmail", "email"]) {
  const q = query.trim().toLowerCase();
  if (typeof window !== "undefined" && window.SHOP_API_BASE_URL) {
    for (const field of fields) {
      try {
        const res = await fetch(`${window.SHOP_API_BASE_URL}/public/find/${encodeURIComponent(key)}?field=${field}&value=${encodeURIComponent(q)}`);
        if (res.ok) return (await res.json()).record;
      } catch (e) { /* try the next field */ }
    }
    return null;
  }
  return (localList || []).find((r) => {
    return fields.some((field) => {
      const v = field.split(".").reduce((o, k) => (o ? o[k] : undefined), r);
      return typeof v === "string" && v.toLowerCase() === q;
    });
  }) || null;
}

async function loadJSON(key, shared) {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(key, shared);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function saveJSON(key, value, shared) {
  if (!storageAvailable()) return false;
  try { await window.storage.set(key, JSON.stringify(value), shared); return true; } catch (e) { return false; }
}
const genOrderId = () => "WEB-" + Math.floor(100000 + Math.random() * 900000);
const WARRANTY_MONTHS = 12;

const GRADE_LABELS = {
  A: { label: "Excellent", desc: "Looks and works like new — no visible wear." },
  B: { label: "Good", desc: "Fully functional with light, honest signs of use." },
  C: { label: "Fair", desc: "Works perfectly but shows more noticeable wear." },
  parts: { label: "For parts", desc: "Not fully functional — sold as-is, no warranty." },
};

const STATUS_LABELS = {
  pending_payment: "Awaiting payment",
  pending_pickup: "Awaiting pickup & payment",
  paid: "Paid — preparing your order",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Static reference prices for the public repair teaser section — matches
// the typical prices in repair-tickets.jsx's REPAIR_TYPES. Deliberately
// duplicated rather than shared: this is a low-risk, small piece of
// display-only data, and the two files serve different audiences (staff
// vs. public marketing copy), so keeping them independently editable is
// safer than forcing a shared source across a customer-facing and a
// staff-facing tool.
const REPAIR_PRICE_TEASERS = [
  { name: "Screen replacement", from: 150 },
  { name: "Battery replacement", from: 60 },
  { name: "Charging port", from: 80 },
  { name: "Camera repair", from: 90 },
];

function fmt(n, currency) {
  return `${currency || "$"}${Math.round(n || 0).toLocaleString()}`;
}

export default function Storefront() {
  const [inventory, setInventory] = useState(null);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [view, setView] = useState("browse"); // browse | detail | checkout | confirmed | track
  const [selectedItem, setSelectedItem] = useState(null);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("All");
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", address: "" });
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResult, setTrackResult] = useState(undefined);

  useEffect(() => {
    (async () => {
      const [inv, cfg] = await Promise.all([loadJSON("inventory", true), loadJSON("pricing-config", true)]);
      setInventory(inv);
      setBusinessSettings((cfg && cfg.businessSettings) || null);
    })();
  }, []);

  const listed = useMemo(() => (inventory || []).filter((i) => i.status === "listed"), [inventory]);
  const brands = useMemo(() => ["All", ...new Set(listed.map((i) => i.brand))], [listed]);
  const featured = useMemo(() => [...listed].sort((a, b) => b.listedPrice - a.listedPrice).slice(0, 3), [listed]);
  const filtered = listed.filter((i) => {
    const q = search.trim().toLowerCase();
    const brandOk = brandFilter === "All" || i.brand === brandFilter;
    const qOk = !q || `${i.brand} ${i.model}`.toLowerCase().includes(q);
    return brandOk && qOk;
  });

  async function handleCheckout() {
    if (!selectedItem || !customer.name || !customer.email || !customer.address) return;
    setSubmitting(true);
    setSubmitError("");
    // Re-check against the LIVE inventory record, not the stale one held in
    // component state — someone else may have bought this in the meantime.
    const liveInventory = await loadJSON("inventory", true);
    const liveItem = liveInventory.find((i) => i.id === selectedItem.id);
    if (!liveItem || liveItem.status !== "listed") {
      setSubmitError("Sorry — this item was just sold to someone else. Please pick another.");
      setSubmitting(false);
      setInventory(liveInventory);
      return;
    }

    const orderId = genOrderId();
    const warrantyExpiresAt = new Date(Date.now() + WARRANTY_MONTHS * 30 * 24 * 60 * 60 * 1000).toISOString();
    const order = {
      id: orderId, createdAt: new Date().toISOString(), itemId: liveItem.id,
      brand: liveItem.brand, model: liveItem.model, storage: liveItem.storage, gradeId: liveItem.gradeId,
      price: liveItem.listedPrice, currency: liveItem.currency || "$", region: liveItem.region,
      customer: { ...customer }, paymentMethod,
      status: paymentMethod === "cash_on_pickup" ? "pending_pickup" : "pending_payment",
      warrantyMonths: WARRANTY_MONTHS, warrantyExpiresAt,
    };

    const orders = await loadJSON("purchase_orders", true);
    await saveJSON("purchase_orders", [order, ...orders], true);
    // Reserve the item immediately so it can't be double-sold while payment is pending.
    const nextInventory = liveInventory.map((i) => i.id === liveItem.id ? { ...i, status: "reserved", reservedByOrderId: orderId } : i);
    await saveJSON("inventory", nextInventory, true);
    setInventory(nextInventory);
    setConfirmedOrder(order);
    setView("confirmed");
    setSubmitting(false);
  }

  async function handleTrack() {
    const q = trackQuery.trim();
    if (!q) return;
    const localList = window.SHOP_API_BASE_URL ? null : await loadJSON("purchase_orders", true);
    const found = await findPublicRecord("purchase_orders", q, localList);
    setTrackResult(found || null);
  }

  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#BE3F29", brassDim = "rgba(190,63,41,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

  if (inventory === null) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading available devices…</div>;

  const stats = [
    businessSettings?.yearsInBusiness && { label: "Years in business", value: `${businessSettings.yearsInBusiness}+` },
    businessSettings?.devicesSoldCount && { label: "Devices sold", value: `${businessSettings.devicesSoldCount}+` },
    businessSettings?.googleRating && { label: "Google rating", value: `${businessSettings.googleRating}★` },
  ].filter(Boolean);

  const categoryTiles = brands.filter((b) => b !== "All").slice(0, 6);

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>

      {view !== "confirmed" && view !== "checkout" && view !== "detail" && (
        <div style={{ background: paper, color: ink, textAlign: "center", padding: "8px 16px", fontSize: 12.5, fontWeight: 500 }}>
          ✓ {WARRANTY_MONTHS}-Month Warranty &nbsp;·&nbsp; ✓ Every Device Tested &amp; Graded &nbsp;·&nbsp; ✓ Fast, Secure Payment
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 16px 60px" }}>

        {view === "browse" && (
          <>
            <div style={{ padding: "44px 0 30px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 38, letterSpacing: "-0.01em", lineHeight: 1.05, marginBottom: 10 }}>
                Good Tech, Done Properly.
              </div>
              <div style={{ color: muted, fontSize: 15, maxWidth: 480, margin: "0 auto 22px" }}>
                Graded, tested, and backed by a real {WARRANTY_MONTHS}-month warranty — not just a "works fine when we packed it" promise.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <a href="#browse" className="cs-btn" style={{ padding: "12px 22px", background: brass, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Shop Refurbished</a>
                <a href="/" className="cs-btn" style={{ padding: "12px 22px", border: `2px solid ${line}`, color: paper, fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Get an Instant Quote</a>
              </div>
              {stats.length > 0 && (
                <div style={{ display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap", marginTop: 30 }}>
                  {stats.map((s) => (
                    <div key={s.label}>
                      <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, color: brass }}>{s.value}</div>
                      <div style={{ fontSize: 11.5, color: muted }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 30 }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 12 }}>Shop by Brand</div>
              {categoryTiles.length === 0 ? (
                <div style={{ border: `1px dashed ${line}`, borderRadius: 3, padding: 18, color: muted, fontSize: 13 }}>
                  Categories will appear here as soon as stock is listed.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(categoryTiles.length, 4)}, 1fr)`, gap: 10 }}>
                  {categoryTiles.map((b) => (
                    <button key={b} className="cs-tile" onClick={() => { setBrandFilter(b); document.getElementById("browse")?.scrollIntoView?.({ behavior: "smooth" }); }}
                      style={{ padding: "18px 10px", textAlign: "center", border: `2px solid ${line}`, borderRadius: 3, background: panel, color: paper, cursor: "pointer", fontWeight: 700, fontSize: 13.5 }}>
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 34 }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 12 }}>Featured Deals</div>
              {featured.length === 0 ? (
                <div style={{ border: `1px dashed ${line}`, borderRadius: 3, padding: 22, textAlign: "center", color: muted, fontSize: 13 }}>
                  Nothing listed yet — new stock goes up as devices are graded. Check back soon, or get an instant quote on your own device below.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                  {featured.map((item) => (
                    <button key={item.id} className="cs-card" onClick={() => { setSelectedItem(item); setView("detail"); setSubmitError(""); }}
                      style={{ textAlign: "left", padding: "16px", border: `2px solid ${line}`, borderRadius: 3, background: panel, color: paper, cursor: "pointer" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: brass, marginBottom: 6 }}>FEATURED</div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{item.brand} {item.model}</div>
                      <div style={{ fontSize: 11.5, color: muted, marginBottom: 8 }}>{item.storage} · Grade {item.gradeId}</div>
                      <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, color: brass }}>{fmt(item.listedPrice, item.currency)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div id="browse">
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 12 }}>Shop All Refurbished</div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search model"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {brands.map((b) => (
                <button key={b} onClick={() => setBrandFilter(b)}
                  style={{ padding: "6px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                    border: `1px solid ${brandFilter === b ? brass : line}`, background: brandFilter === b ? brassDim : "transparent", color: brandFilter === b ? brass : paper }}>
                  {b}
                </button>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ color: muted, fontSize: 13, border: `1px solid ${line}`, borderRadius: 3, padding: 20, textAlign: "center" }}>
                {listed.length === 0
                  ? "We don't have stock listed yet — this page updates automatically the moment devices are graded and published, so there's nothing to change here. Check back soon."
                  : "Nothing matching that filter right now — try a different brand or search term."}
              </div>
            )}
            {filtered.map((item) => (
              <button key={item.id} className="cs-card" onClick={() => { setSelectedItem(item); setView("detail"); setSubmitError(""); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "14px", marginBottom: 10, borderRadius: 3, border: `1px solid ${line}`, background: panel, color: paper, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14 }}>{item.brand} {item.model}</span>
                  <span style={{ fontSize: 16, color: brass, fontFamily: "'Archivo Black', sans-serif" }}>{fmt(item.listedPrice, item.currency)}</span>
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 3 }}>
                  {item.storage} · {GRADE_LABELS[item.gradeId]?.label || item.gradeId} condition
                </div>
              </button>
            ))}
            </div>

            <div style={{ marginTop: 50, paddingTop: 40, borderTop: `2px solid ${line}` }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, marginBottom: 14 }}>Our Grading, Explained</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 40 }}>
                {Object.entries(GRADE_LABELS).filter(([id]) => id !== "parts").map(([id, g]) => (
                  <div key={id} style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Grade {id} — {g.label}</div>
                    <div style={{ fontSize: 12.5, color: muted }}>{g.desc}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, marginBottom: 14 }}>Repairs, While You Wait</div>
              <div style={{ color: muted, fontSize: 13.5, marginBottom: 14 }}>Screen, battery, charging port and more — most done same day. Prices are a starting point; your exact quote depends on the model.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 40 }}>
                {REPAIR_PRICE_TEASERS.map((r) => (
                  <div key={r.name} style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: brass }}>From {fmt(r.from, "$")}</div>
                  </div>
                ))}
              </div>

              <div style={{ border: `2px solid ${brass}`, borderRadius: 3, padding: 24, textAlign: "center" }}>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20, marginBottom: 6 }}>Got an Old Phone?</div>
                <div style={{ color: muted, fontSize: 13.5, marginBottom: 14 }}>Turn it into cash, or credit toward one of the devices above.</div>
                <a href="/" className="cs-btn" style={{ display: "inline-block", padding: "12px 24px", background: brass, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3 }}>Get an Instant Quote →</a>
              </div>
            </div>
          </>
        )}

        {view === "detail" && selectedItem && (
          <div style={{ maxWidth: 640, margin: "30px auto 0" }}>
            <button onClick={() => setView("browse")} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>← Back to browsing</button>
            <div style={{ border: `1px solid ${line}`, borderRadius: 4, padding: 20 }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{selectedItem.brand} {selectedItem.model}</div>
              <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>{selectedItem.storage}</div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <div style={{ fontSize: 36, color: brass, fontFamily: "'Archivo Black', sans-serif" }}>{fmt(selectedItem.listedPrice, selectedItem.currency)}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: green }}>{WARRANTY_MONTHS}-month warranty included</div>
                </div>
              </div>

              <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>Grade {selectedItem.gradeId}: {GRADE_LABELS[selectedItem.gradeId]?.label}</div>
                <div style={{ fontSize: 12, color: muted }}>{GRADE_LABELS[selectedItem.gradeId]?.desc}</div>
              </div>

              <button className="cs-btn" onClick={() => setView("checkout")}
                style={{ width: "100%", padding: "13px", borderRadius: 3, border: "none", background: brass, color: "#1a1408", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Buy this device →
              </button>
            </div>
          </div>
        )}

        {view === "checkout" && selectedItem && (
          <div style={{ maxWidth: 640, margin: "30px auto 0" }}>
            <button onClick={() => setView("detail")} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>← Back</button>
            <div style={{ fontSize: 15, marginBottom: 4 }}>Checkout</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>{selectedItem.brand} {selectedItem.model} · {fmt(selectedItem.listedPrice, selectedItem.currency)}</div>

            {submitError && <div style={{ border: `1px solid ${red}`, borderRadius: 3, padding: 12, marginBottom: 14, color: red, fontSize: 13 }}>{submitError}</div>}

            {["name", "email", "phone"].map((field) => (
              <input key={field} value={customer[field]} onChange={(e) => setCustomer((c) => ({ ...c, [field]: e.target.value }))}
                placeholder={field === "name" ? "Full name" : field === "email" ? "Email address" : "Phone number"}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
            ))}
            <textarea value={customer.address} onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))} placeholder="Shipping address"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, minHeight: 60, boxSizing: "border-box" }} />

            <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>How will you pay?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[{ id: "bank_transfer", label: "Bank transfer" }, { id: "cash_on_pickup", label: "Cash on pickup" }].map((m) => (
                <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                  style={{ flex: 1, padding: "10px", borderRadius: 3, fontSize: 13, cursor: "pointer",
                    border: `1px solid ${paymentMethod === m.id ? brass : line}`, background: paymentMethod === m.id ? brassDim : "transparent", color: paymentMethod === m.id ? brass : paper }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: muted, marginBottom: 16 }}>
              No card payments are processed on this device yet — you'll get {paymentMethod === "bank_transfer" ? "our bank details" : "pickup instructions"} on the confirmation screen.
            </div>

            <button className="cs-btn" disabled={!customer.name || !customer.email || !customer.address || submitting} onClick={handleCheckout}
              style={{ width: "100%", padding: "13px", borderRadius: 3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: customer.name && customer.email && customer.address ? brass : line, color: customer.name && customer.email && customer.address ? "#1a1408" : muted,
                fontSize: 14, fontWeight: 600, cursor: customer.name && customer.email && customer.address ? "pointer" : "default" }}>
              {submitting && <span className="cs-spinner"></span>}
              {submitting ? "Placing order…" : "Place order"}
            </button>
          </div>
        )}

        {view === "confirmed" && confirmedOrder && (
          <div style={{ border: `1px solid ${brass}`, borderRadius: 4, padding: 20, maxWidth: 640, margin: "30px auto 0" }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>Order {confirmedOrder.id} confirmed</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>{confirmedOrder.brand} {confirmedOrder.model} · {fmt(confirmedOrder.price, confirmedOrder.currency)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
              <span style={{ color: muted }}>Status</span><span>{STATUS_LABELS[confirmedOrder.status]}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
              <span style={{ color: muted }}>Warranty until</span><span>{new Date(confirmedOrder.warrantyExpiresAt).toLocaleDateString()}</span>
            </div>
            {confirmedOrder.paymentMethod === "bank_transfer" ? (
              <div style={{ marginTop: 12, fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 3, padding: 12 }}>
                Transfer {fmt(confirmedOrder.price, confirmedOrder.currency)} to our account (details emailed to {confirmedOrder.customer.email}) — reference {confirmedOrder.id}. We'll ship once payment clears.
              </div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 12.5, color: muted, border: `1px solid ${line}`, borderRadius: 3, padding: 12 }}>
                Come by the shop with {fmt(confirmedOrder.price, confirmedOrder.currency)} cash and mention order {confirmedOrder.id} to collect it.
              </div>
            )}
            <button onClick={() => { setView("browse"); setConfirmedOrder(null); setSelectedItem(null); setCustomer({ name: "", email: "", phone: "", address: "" }); }}
              style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, fontSize: 14, cursor: "pointer" }}>
              Keep browsing
            </button>
          </div>
        )}

        {view !== "confirmed" && (
          <div style={{ marginTop: 24, maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
            <button onClick={() => { setView(view === "track" ? "browse" : "track"); setTrackResult(undefined); }}
              style={{ background: "none", border: "none", color: brass, fontSize: 12.5, padding: 0, cursor: "pointer", textDecoration: "underline" }}>
              {view === "track" ? "← Back to browsing" : "Track an order you already placed"}
            </button>
            {view === "track" && (
              <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} placeholder="Order number or email"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
                  <button onClick={handleTrack} style={{ padding: "10px 16px", borderRadius: 3, border: "none", background: brass, color: "#1a1408", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Find</button>
                </div>
                {trackResult === null && <div style={{ marginTop: 10, fontSize: 13, color: red }}>No order found with that number or email.</div>}
                {trackResult && (
                  <div style={{ marginTop: 12, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                      <span style={{ color: muted }}>{trackResult.brand} {trackResult.model}</span><span>{trackResult.id}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                      <span style={{ color: muted }}>Status</span><span>{STATUS_LABELS[trackResult.status]}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${line}` }}>
                      <span style={{ color: muted }}>Warranty until</span><span>{new Date(trackResult.warrantyExpiresAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
