// One phone's whole story on one screen: where it came from and who sold it to us,
// every repair (technician, parts, labour, paid or not), what it cost us in total,
// the price our standard says it should sell for, what it's listed or sold at, the
// profit, and how many days it took to get ready and to sell.
import React, { useEffect, useState } from "react";
import { phoneStory, GRADES } from "./device-flow.js";
import DeviceArt, { inferDeviceType } from "./device-art.jsx";

async function load(key) {
  try { const r = await window.storage.get(key, true); const v = r ? JSON.parse(r.value) : []; return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
const money = (n) => (n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`);
const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—");
const ICON = { bought: "🛒", repair: "🔧", graded: "🏷️", listed: "🌐", price: "↘", sold: "✅", writeoff: "✖" };

export default function PhonePassport({ item, onClose, photo }) {
  const [lists, setLists] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all([load("repair_tickets"), load("sales"), load("orders")]).then(([tickets, sales, orders]) => { if (alive) setLists({ tickets, sales, orders }); });
    return () => { alive = false; };
  }, [item.id]);
  if (!lists) return <div style={{ padding: 20, color: "var(--mr-muted)" }}>Loading this phone's history…</div>;

  const st = phoneStory(item, lists);
  const grade = GRADES.find((g) => g.id === item.gradeId);
  const card = { background: "var(--mr-surface)", border: "1px solid var(--mr-line)", borderRadius: 16, padding: 16, marginBottom: 14 };
  const stat = (label, value, sub, tone) => (
    <div style={{ ...card, marginBottom: 0, padding: 14 }}>
      <div style={{ fontSize: 12.5, color: "var(--mr-muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, margin: "3px 0 2px", color: tone || "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--mr-muted)" }}>{sub}</div>}
    </div>
  );
  const priceLabel = st.soldFor != null ? "Sold for" : st.askingFor != null ? "Asking" : "Price";
  return (
    <div style={{ fontFamily: "'Archivo', system-ui, sans-serif", color: "var(--mr-text)" }}>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--mr-brand)", fontSize: 14, fontWeight: 700, marginBottom: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>← Back to stock</button>
      <div style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <DeviceArt type={inferDeviceType(item.model, item.category)} size={76} brand={item.brand} model={item.model} imageUrl={photo} />
          <div>
          <div style={{ fontSize: 13, color: "var(--mr-muted)", fontWeight: 600 }}>{item.id}{item.imei ? ` · IMEI ${item.imei}` : ""}</div>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24 }}>{item.brand} {item.model}</div>
          <div style={{ fontSize: 13.5, color: "var(--mr-muted)" }}>{[item.storage, item.colour || item.color, grade ? grade.label : "Not graded yet", item.status.replace("_", " ")].filter(Boolean).join(" · ")}</div>
          {Array.isArray(item.faults) && item.faults.length > 0 && <div style={{ fontSize: 13, color: "#B42318", marginTop: 4 }}>Faults when bought: {item.faults.join(", ")}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 13.5 }}>
          <div><b>From:</b> {st.source}{st.order ? ` (${st.order.id})` : ""}</div>
          {(item.sellerName || item.sellerIdOwnerName || st.order?.customer?.name) && <div><b>Seller:</b> {item.sellerName || item.sellerIdOwnerName || st.order.customer.name}{item.sellerPhone ? ` · ${item.sellerPhone}` : ""}</div>}
          {item.staffHandled && <div style={{ color: "var(--mr-muted)" }}>Bought by {item.staffHandled}</div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        {stat("Paid for it", money(st.bought), when(item.receivedAt))}
        {stat("Repairs", money(st.repairCost), `${st.repairs.length} job${st.repairs.length === 1 ? "" : "s"}`)}
        {stat("Total cost", money(st.totalCost), "bought + parts + labour")}
        {stat("Standard price", st.target != null ? money(st.target) : "—", grade ? `${grade.id} × ${grade.markup} on total cost` : "grade it to see")}
        {stat(priceLabel, money(st.soldFor ?? st.askingFor), st.belowStandard ? "below the standard" : st.sale ? when(st.sale.soldAt) : "", st.belowStandard ? "#B54708" : undefined)}
        {stat("Profit", money(st.profit), st.margin != null ? `${Math.round(st.margin * 100)}% margin${st.soldFor == null ? " if sold at asking" : ""}` : "", st.profit != null && st.profit < 0 ? "#B42318" : st.profit != null ? "#0E7A4F" : undefined)}
        {stat("Days to get ready", st.daysToReady != null ? st.daysToReady : "—", "bought → ready / listed")}
        {stat(st.sale ? "Days in the shop" : "Days so far", st.daysInShop != null ? st.daysInShop : "—", st.sale ? "bought → sold" : "since it was bought")}
      </div>

      <div style={card}>
        <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 10 }}>Repairs</div>
        {st.repairs.length === 0 && <div style={{ fontSize: 13.5, color: "var(--mr-muted)" }}>No repairs on this phone.</div>}
        {st.repairs.map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid var(--mr-line)", padding: "10px 0", fontSize: 13.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{r.id} · {r.issue || "Fix up"}</b><span style={{ color: "var(--mr-muted)" }}>{when(r.opened)} → {r.finished ? when(r.finished) : "still open"}</span>
            </div>
            <div style={{ color: "var(--mr-muted)", marginTop: 3 }}>
              Technician: <b style={{ color: "var(--mr-text)" }}>{r.technician || "not assigned"}</b> · labour {money(r.labour)} {r.labour > 0 ? (r.labourPaid ? "(paid)" : "(not paid yet)") : ""}{r.minutes ? ` · ${r.minutes} min` : ""}
            </div>
            <div style={{ color: "var(--mr-muted)" }}>Parts: {r.parts.length ? r.parts.map((p) => `${p.name} ${money(p.cost)}`).join(", ") : "none"} · total {money(r.partsCost + r.labour)}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 10 }}>Timeline</div>
        {st.events.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderTop: i ? "1px solid #EEF1F6" : 0, fontSize: 13.5 }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--mr-surface-2)", display: "grid", placeItems: "center", flex: "none" }} aria-hidden="true">{ICON[e.kind] || "•"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>{e.text}<div style={{ fontSize: 12, color: "var(--mr-muted)" }}>{new Date(e.at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</div></div>
            {e.amount != null && e.amount !== 0 && <b style={{ color: e.amount < 0 ? "#B42318" : "#0E7A4F", whiteSpace: "nowrap" }}>{e.amount < 0 ? "−" : "+"}${Math.abs(Math.round(e.amount)).toLocaleString()}</b>}
          </div>
        ))}
      </div>
    </div>
  );
}
