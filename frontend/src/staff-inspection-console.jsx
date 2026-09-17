import React, { useState, useEffect, useMemo } from "react";

/* =================================================================
   STAFF INSPECTION CONSOLE
   Where a submitted order actually gets turned into a payout.
   Pulls the same shared pricing-config the calculator and admin
   console use, so a re-assessment here uses identical math to the
   customer's original quote — no separate "staff formula" to drift
   out of sync.
================================================================= */

const CONFIG_KEY = "pricing-config";
const ORDERS_KEY = "orders";

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
async function saveJSON(key, value, shared) {
  if (!storageAvailable()) return false;
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch (e) {
    return false;
  }
}

const RETENTION_POINTS = [
  { m: 0, r: 0.80 }, { m: 12, r: 0.68 }, { m: 24, r: 0.63 },
  { m: 36, r: 0.566 }, { m: 48, r: 0.44 }, { m: 60, r: 0.311 },
  { m: 72, r: 0.22 }, { m: 84, r: 0.15 }, { m: 96, r: 0.10 }, { m: 120, r: 0.06 },
];
const BRAND_FACTOR = { Apple: 1.00, Samsung: 0.88, Google: 0.80, OnePlus: 0.72, Xiaomi: 0.60, Oppo: 0.68, Vivo: 0.65, Honor: 0.65, Motorola: 0.62, Sony: 0.68 };
const TIERS = [
  { id: "new", label: "Brand New", factor: 1.00 },
  { id: "asnew", label: "Like New", factor: 0.94 },
  { id: "good", label: "Good", factor: 0.89 },
  { id: "fair", label: "Fair", factor: 0.75 },
  { id: "parts", label: "Faulty / For Parts", factor: 0.09 },
];
const REGIONS = {
  AU: { symbol: "A$", mult: 1.00, round: 1 }, US: { symbol: "$", mult: 0.70, round: 1 },
  UK: { symbol: "£", mult: 0.46, round: 1 }, IN: { symbol: "₹", mult: 37, round: 10 }, AE: { symbol: "AED ", mult: 2.35, round: 1 },
};
const HOLDING_COST_PCT = 0.02;
// Fallback fault list so the console still has something to re-assess against
// even if the admin console's shared config hasn't been created yet.
const DEFAULT_FAULT_GROUPS = [
  { group: "Display", faults: [
    { id: "screen_scratch", label: "Minor scratches on screen", pct: 0.05 },
    { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
    { id: "screen_crack_severe", label: "Screen glass missing pieces", pct: 0.40 },
    { id: "dead_pixels", label: "Dead pixels or lines", pct: 0.15 },
    { id: "touch_dead", label: "Touch completely unresponsive", pct: 0.35 },
  ]},
  { group: "Body & Battery", faults: [
    { id: "back_crack", label: "Cracked back glass", pct: 0.10 },
    { id: "bent", label: "Bent chassis", pct: 0.20 },
    { id: "batt_below80", label: "Battery health below 80%", pct: 0.12 },
    { id: "batt_swollen", label: "Battery swollen", pct: 0.25 },
  ]},
  { group: "Functional", faults: [
    { id: "cam_rear", label: "Rear camera not working", pct: 0.12 },
    { id: "port_charge", label: "Charging port faulty", pct: 0.10 },
    { id: "speaker", label: "Speaker not working", pct: 0.08 },
    { id: "biometric", label: "Face ID / fingerprint not working", pct: 0.10 },
  ]},
];

function retentionAt(months, points) {
  const pts = points || RETENTION_POINTS;
  if (months <= pts[0].m) return pts[0].r;
  for (let i = 0; i < pts.length - 1; i++) {
    if (months <= pts[i + 1].m) {
      const t = (months - pts[i].m) / (pts[i + 1].m - pts[i].m);
      return pts[i].r + t * (pts[i + 1].r - pts[i].r);
    }
  }
  const last = pts[pts.length - 1];
  return Math.max(0.04, last.r - (months - last.m) * 0.0015);
}
function ageMonths(releaseDate) {
  return Math.max(0, (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30));
}
function fmt(n, regionCode, regionsMap) {
  const r = (regionsMap || REGIONS)[regionCode] || REGIONS.AU;
  const val = r.round >= 10 ? Math.round(n / r.round) * r.round : Math.round(n);
  return `${r.symbol}${val.toLocaleString()}`;
}

const STATUS_LABELS = {
  awaiting_shipment: "Awaiting device",
  received_inspecting: "Inspecting",
  revised_pending_customer: "Revised — awaiting customer",
  approved_paid: "Approved — payment sent",
  returned: "Returned to customer",
};
const STATUS_COLOR = (s, brass, muted, red, green) => ({
  awaiting_shipment: muted, received_inspecting: brass, revised_pending_customer: red,
  approved_paid: green, returned: muted,
}[s] || muted);

export default function StaffInspectionConsole() {
  const [orders, setOrders] = useState(null);
  const [config, setConfig] = useState(null);
  const [priceMatches, setPriceMatches] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [reassessFaults, setReassessFaults] = useState({});
  const [reassessTier, setReassessTier] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const [o, c, pm] = await Promise.all([loadJSON(ORDERS_KEY, true), loadJSON(CONFIG_KEY, true), loadJSON("price_match_requests", true)]);
      setOrders(o || []);
      setConfig(c);
      setPriceMatches(pm || []);
    })();
  }, []);

  const retentionPts = config?.retentionPoints || RETENTION_POINTS;
  const brandFactors = { ...BRAND_FACTOR, ...(config?.brandFactors || {}) };
  const tiers = TIERS.map((t) => ({ ...t, factor: config?.tiers?.find((x) => x.id === t.id)?.factor ?? t.factor }));
  const regions = useMemo(() => {
    const m = {};
    Object.keys(REGIONS).forEach((c) => { m[c] = { ...REGIONS[c], ...(config?.regions?.[c] || {}) }; });
    return m;
  }, [config]);
  const faultList = useMemo(() => {
    const groups = config?.faultGroups?.length ? config.faultGroups : DEFAULT_FAULT_GROUPS;
    const list = [];
    groups.forEach((g) => g.faults.forEach((f) => list.push(f)));
    return list;
  }, [config]);
  const faultPctById = useMemo(() => Object.fromEntries(faultList.map((f) => [f.id, f.pct])), [faultList]);
  const holdingPct = config?.holdingCostPct ?? HOLDING_COST_PCT;

  const open = orders?.find((o) => o.id === openId);

  const reassessed = useMemo(() => {
    if (!open) return null;
    const tier = tiers.find((t) => t.id === (reassessTier || open.tierId)) || tiers[0];
    // The order carries the exact Brand-New-tier base computed at quote time
    // (brandNewBase), so re-assessment uses precisely the same numbers the
    // customer saw — no reconstruction, no drift.
    const tierBase = (open.brandNewBase ?? open.quotedTotal) * tier.factor;
    let total = tierBase;
    const lines = [];
    Object.keys(reassessFaults).forEach((fid) => {
      if (reassessFaults[fid] && faultPctById[fid] != null) {
        const amt = tierBase * faultPctById[fid];
        total -= amt;
        lines.push({ id: fid, amt });
      }
    });
    total -= tierBase * holdingPct;
    total = Math.max(total, tierBase * 0.05);
    return { tier, tierBase, total, lines };
  }, [open, reassessFaults, reassessTier, tiers, faultPctById, holdingPct]);

  // A customer may have gotten an approved price-match promise before or
  // after this order was submitted — look it up independently by email +
  // device rather than relying on it having been linked at approval time,
  // so the order arriving in either order still gets caught.
  const matchedPriceMatch = useMemo(() => {
    if (!open) return null;
    return priceMatches.find((pm) =>
      pm.status === "approved" &&
      pm.customerEmail?.toLowerCase() === open.customer.email?.toLowerCase() &&
      pm.device?.brand === open.device.brand && pm.device?.model === open.device.model
    ) || null;
  }, [open, priceMatches]);

  async function handleHonorPriceMatch() {
    if (!open || !matchedPriceMatch) return;
    await updateOrder(open.id, {
      status: "approved_paid",
      inspection: { confirmedTotal: matchedPriceMatch.approvedPrice, staffNote: `Price match honored (${matchedPriceMatch.id}, vs ${matchedPriceMatch.competitorName})`, inspectedAt: new Date().toISOString(), tierId: open.tierId, priceMatchId: matchedPriceMatch.id },
    });
    setOpenId(null);
  }

  function openOrder(o) {
    setOpenId(o.id);
    setReassessTier(o.tierId);
    setReassessFaults({});
    setNote("");
  }

  async function updateOrder(id, patch) {
    setSaving(true);
    const list = await loadJSON(ORDERS_KEY, true) || orders || [];
    const next = list.map((o) => (o.id === id ? { ...o, ...patch } : o));
    await saveJSON(ORDERS_KEY, next, true);
    setOrders(next);
    setSaving(false);
  }

  async function handleApprove() {
    if (!open || !reassessed) return;
    await updateOrder(open.id, {
      status: "approved_paid",
      inspection: { confirmedTotal: reassessed.total, staffNote: note, inspectedAt: new Date().toISOString(), tierId: reassessed.tier.id },
    });
    setOpenId(null);
  }
  async function handleRevise() {
    if (!open || !reassessed) return;
    await updateOrder(open.id, {
      status: "revised_pending_customer",
      inspection: { confirmedTotal: reassessed.total, staffNote: note, inspectedAt: new Date().toISOString(), tierId: reassessed.tier.id },
    });
    setOpenId(null);
  }
  async function handleReturn() {
    if (!open) return;
    await updateOrder(open.id, { status: "returned" });
    setOpenId(null);
  }
  async function handleMarkReceived() {
    if (!open) return;
    await updateOrder(open.id, { status: "received_inspecting" });
  }

  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#BE3F29", brassDim = "rgba(190,63,41,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

  const filtered = (orders || []).filter((o) => filter === "all" || o.status === filter);

  if (orders === null) {
    return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading orders…</div>;
  }

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: '-0.01em', marginBottom: 4 }}>Inspection Queue</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 18 }}>
          {orders.length} order{orders.length === 1 ? "" : "s"} total. Open one to confirm the condition and release payment.
        </div>

        {!open && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {["all", "awaiting_shipment", "received_inspecting", "revised_pending_customer", "approved_paid", "returned"].map((s) => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12.5, cursor: "pointer",
                    border: `1px solid ${filter === s ? brass : line}`, background: filter === s ? brassDim : "transparent",
                    color: filter === s ? brass : paper }}>
                  {s === "all" ? "All" : STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {filtered.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No orders in this view yet.</div>}
            {filtered.map((o) => (
              <button key={o.id} onClick={() => openOrder(o)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8,
                  border: `1px solid ${line}`, borderLeft: `3px solid ${STATUS_COLOR(o.status, brass, muted, red, green)}`,
                  borderRadius: 3, background: panel, color: paper, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13 }}>{o.id}</span>
                  <span style={{ fontSize: 12, color: STATUS_COLOR(o.status, brass, muted, red, green) }}>{STATUS_LABELS[o.status]}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{o.device.brand} {o.device.model} · {o.device.storage}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{o.customer.name} · {fmt(o.quotedTotal, o.region, regions)}</div>
              </button>
            ))}
          </>
        )}

        {open && (
          <div>
            <button onClick={() => setOpenId(null)} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
              ← Back to queue
            </button>

            <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 15, marginBottom: 4 }}>{open.id}</div>
              <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>
                {open.device.brand} {open.device.model} · {open.device.storage} · submitted as "{open.tierLabel}"
              </div>
              <div style={{ fontSize: 13 }}>{open.customer.name} · {open.customer.email} · {open.customer.phone}</div>
              <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                ID on file: {open.customer.idType ? open.customer.idType.replace(/^\w/, (c) => c.toUpperCase()) : "not captured"}
                {open.customer.idNumber && ` ending ${open.customer.idNumber.slice(-4).padStart(open.customer.idNumber.length, "•")}`}
              </div>
              <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>
                Customer originally declared: {open.faultLabels?.length ? open.faultLabels.join(", ") : "no faults, plus accessories: " + (open.hasAccessories ? "yes" : "no")}
              </div>
              {open.fulfillment === "post" && open.status === "awaiting_shipment" && (
                <ShippingTrackingField order={open} onSave={(shipping) => updateOrder(open.id, { shipping })} colors={{ paper, muted, brass, panel2, line }} />
              )}
              {open.status === "awaiting_shipment" && (
                <button onClick={handleMarkReceived} style={{ marginTop: 10, padding: "8px 14px", borderRadius: 3, border: `1px solid ${brass}`, background: "transparent", color: brass, fontSize: 12.5, cursor: "pointer" }}>
                  Mark as received — start inspection
                </button>
              )}
            </div>

            {(open.status === "received_inspecting" || open.status === "awaiting_shipment") && (
              <>
                <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Re-assess condition</div>
                <div style={{ marginBottom: 14 }}>
                  {tiers.map((t) => (
                    <button key={t.id} onClick={() => setReassessTier(t.id)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", marginBottom: 6, cursor: "pointer",
                        background: (reassessTier || open.tierId) === t.id ? brassDim : panel, border: "none",
                        borderLeft: `3px solid ${(reassessTier || open.tierId) === t.id ? brass : "transparent"}`, borderRadius: 3, color: paper, fontSize: 13 }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Faults found on inspection</div>
                <div style={{ border: `1px solid ${line}`, borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
                  {faultList.map((f, i) => (
                    <label key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px",
                      borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 12.5, cursor: "pointer" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={!!reassessFaults[f.id]} onChange={(e) => setReassessFaults((s) => ({ ...s, [f.id]: e.target.checked }))} />
                        {f.label}
                      </span>
                      <span style={{ color: red }}>−{Math.round(f.pct * 100)}%</span>
                    </label>
                  ))}
                </div>

                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the customer (required if revising the offer)"
                  style={{ width: "100%", minHeight: 60, padding: 12, borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }} />

                {reassessed && (
                  <div style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 14, marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: muted }}>Originally quoted</span>
                      <span style={{ fontSize: 13 }}>{fmt(open.quotedTotal, open.region, regions)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: muted }}>Confirmed on inspection</span>
                      <span style={{ fontSize: 18, color: brass }}>{fmt(reassessed.total, open.region, regions)}</span>
                    </div>
                  </div>
                )}

                {matchedPriceMatch && (
                  <div style={{ border: `1px solid ${green}`, borderRadius: 3, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>⚠ This customer has an APPROVED price match on file</div>
                    <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
                      {matchedPriceMatch.id} — approved to match {matchedPriceMatch.competitorName}'s quote. They were promised {fmt(matchedPriceMatch.approvedPrice, open.region, regions)}, not the standard inspection amount above.
                    </div>
                    <button onClick={handleHonorPriceMatch} disabled={saving}
                      style={{ width: "100%", padding: "11px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Honor price match — approve & pay {fmt(matchedPriceMatch.approvedPrice, open.region, regions)}
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleApprove} disabled={saving}
                    style={{ flex: 1, padding: "12px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                    Matches — approve & pay
                  </button>
                  <button onClick={handleRevise} disabled={saving || !note.trim()}
                    style={{ flex: 1, padding: "12px", borderRadius: 3, border: `1px solid ${red}`, background: "transparent", color: red, fontSize: 13.5, cursor: note.trim() ? "pointer" : "default", opacity: note.trim() ? 1 : 0.5 }}>
                    Send revised offer
                  </button>
                </div>
              </>
            )}

            {open.status === "revised_pending_customer" && (
              <div style={{ border: `1px solid ${red}`, borderRadius: 3, padding: 14 }}>
                <div style={{ fontSize: 13, marginBottom: 8 }}>Awaiting the customer's response to the revised offer.</div>
                <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>Revised: {fmt(open.inspection?.confirmedTotal, open.region, regions)} — "{open.inspection?.staffNote}"</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleApprove} style={{ flex: 1, padding: "10px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 13, cursor: "pointer" }}>Customer accepted — pay</button>
                  <button onClick={handleReturn} style={{ flex: 1, padding: "10px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: muted, fontSize: 13, cursor: "pointer" }}>Customer declined — return</button>
                </div>
              </div>
            )}

            {(open.status === "approved_paid" || open.status === "returned") && (
              <div style={{ color: muted, fontSize: 13 }}>This order is closed: {STATUS_LABELS[open.status]}.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Real carrier API integration (Australia Post eParcel/MyPost Business,
// or an aggregator like Sendle/Starshipit) needs an actual business
// shipping contract this system can't create for you — so this doesn't
// pretend to auto-generate a label. What it does instead: once you've
// created the real label through whatever carrier account you set up,
// paste the real tracking number here so the customer can actually
// follow their parcel, instead of just knowing an address to write on
// a box. Wiring this to auto-fill from a real carrier API later is a
// backend-only change — this field doesn't need to know how it got filled.
function ShippingTrackingField({ order, onSave, colors }) {
  const { paper, muted, brass, panel2, line } = colors;
  const [trackingNumber, setTrackingNumber] = useState(order.shipping?.trackingNumber || "");
  const [carrier, setCarrier] = useState(order.shipping?.carrier || "Australia Post");
  const [saved, setSaved] = useState(!!order.shipping?.trackingNumber);

  return (
    <div style={{ marginTop: 10, padding: 10, border: `1px dashed ${line}`, borderRadius: 3 }}>
      <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>
        {saved ? "Tracking number on file — customer can see this when they check their order." : "Once you've booked the shipment (AusPost MyPost Business, Sendle, etc.), record the real tracking number here."}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={trackingNumber} onChange={(e) => { setTrackingNumber(e.target.value); setSaved(false); }} placeholder="Tracking number"
          style={{ flex: 1, padding: "7px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 12.5, outline: "none" }} />
        <select value={carrier} onChange={(e) => { setCarrier(e.target.value); setSaved(false); }}
          style={{ padding: "7px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 12.5 }}>
          <option>Australia Post</option>
          <option>Sendle</option>
          <option>StarTrack</option>
          <option>Other</option>
        </select>
        <button disabled={!trackingNumber.trim() || saved} onClick={() => { onSave({ trackingNumber: trackingNumber.trim(), carrier, issuedAt: new Date().toISOString() }); setSaved(true); }}
          style={{ padding: "7px 12px", borderRadius: 3, border: "none", background: trackingNumber.trim() && !saved ? brass : line, color: trackingNumber.trim() && !saved ? "#1a1408" : muted, fontSize: 12, cursor: trackingNumber.trim() && !saved ? "pointer" : "default" }}>
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
