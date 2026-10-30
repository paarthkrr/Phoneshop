// Reports for a repair shop: how each technician is doing, what breaks most, where the
// parts money goes, who comes back, and how often we're late on what we promised.
import React, { useEffect, useMemo, useState } from "react";
import { buildCustomers } from "./customers.js";

async function load(key) { try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) || [] : []; } catch (e) { return []; } }
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const DAY = 864e5;
const TYPE = { screen: "Screen", battery: "Battery", charge_port: "Charging port", back_glass: "Back glass", camera: "Camera", speaker_mic: "Speaker / mic", water_damage: "Water damage", software: "Software", other: "Other" };

export function repairStats({ tickets, partsStock, since }) {
  const live = tickets.filter((t) => t && !t.deleted);
  const done = live.filter((t) => t.status === "completed" && Date.parse(t.completedAt) >= since);
  const stockById = new Map((partsStock || []).map((p) => [p.id, p]));
  // Technicians
  const tech = {};
  for (const t of done) {
    const k = t.assignedTo || "Not assigned";
    const r = tech[k] || (tech[k] = { name: k, jobs: 0, mins: 0, timed: 0, revenue: 0, pay: 0, late: 0, promised: 0, comebacks: 0 });
    r.jobs += 1; r.revenue += Number(t.finalPrice ?? t.quotedPrice) || 0; r.pay += Number(t.techPay) || 0;
    if (Number(t.timeSpentMins) > 0) { r.mins += Number(t.timeSpentMins); r.timed += 1; }
    if (t.dueAt) { r.promised += 1; if (Date.parse(t.completedAt) > Date.parse(t.dueAt)) r.late += 1; }
  }
  for (const w of live.filter((t) => t.warrantyOf && Date.parse(t.createdAt) >= since)) {
    const orig = live.find((t) => t.id === w.warrantyOf); const k = (orig && orig.assignedTo) || "Not assigned";
    (tech[k] || (tech[k] = { name: k, jobs: 0, mins: 0, timed: 0, revenue: 0, pay: 0, late: 0, promised: 0, comebacks: 0 })).comebacks += 1;
  }
  // What breaks
  const count = (arr, key) => { const m = {}; arr.forEach((t) => { const k = key(t); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const inPeriod = live.filter((t) => Date.parse(t.createdAt) >= since && t.jobType !== "shop");
  const models = count(inPeriod, (t) => `${(t.device && t.device.brand) || ""} ${(t.device && t.device.model) || ""}`.trim()).slice(0, 10);
  const types = count(inPeriod, (t) => TYPE[t.repairTypeId] || t.repairTypeId).slice(0, 10);
  // Parts money by supplier
  const sup = {};
  for (const t of live.filter((x) => Date.parse(x.completedAt || x.createdAt) >= since)) {
    for (const p of t.parts || []) {
      const st = p.stockItemId && stockById.get(p.stockItemId);
      const k = (st && st.supplier) || p.supplier || "Supplier not recorded";
      const r = sup[k] || (sup[k] = { name: k, parts: 0, spend: 0 }); r.parts += 1; r.spend += Number(p.cost) || 0;
    }
  }
  // Promised vs actual
  const promised = done.filter((t) => t.dueAt);
  const lateJobs = promised.filter((t) => Date.parse(t.completedAt) > Date.parse(t.dueAt));
  const avgLateH = lateJobs.length ? lateJobs.reduce((a, t) => a + (Date.parse(t.completedAt) - Date.parse(t.dueAt)) / 3600e3, 0) / lateJobs.length : 0;
  const turn = done.filter((t) => t.createdAt).map((t) => (Date.parse(t.completedAt) - Date.parse(t.createdAt)) / 3600e3);
  return { done: done.length, tech: Object.values(tech).sort((a, b) => b.jobs - a.jobs), models, types, suppliers: Object.values(sup).sort((a, b) => b.spend - a.spend),
    promised: promised.length, late: lateJobs.length, avgLateH, avgTurnH: turn.length ? turn.reduce((a, b) => a + b, 0) / turn.length : 0 };
}

export default function RepairReports({ colors }) {
  const { line, muted, paper } = colors;
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  useEffect(() => { (async () => {
    const [tickets, partsStock, requests, orders, sales, webOrders, accessoryOrders, profiles] = await Promise.all(["repair_tickets", "parts_stock", "repair_requests", "orders", "sales", "purchase_orders", "accessory_orders", "customers"].map(load));
    setD({ tickets, partsStock, requests, orders, sales, webOrders, accessoryOrders, profiles });
  })(); }, []);
  const since = Date.now() - days * DAY;
  const s = useMemo(() => (d ? repairStats({ tickets: d.tickets, partsStock: d.partsStock, since }) : null), [d, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const cust = useMemo(() => {
    if (!d) return null;
    const all = buildCustomers({ tickets: d.tickets, requests: d.requests, orders: d.orders, sales: d.sales, webOrders: d.webOrders, accessoryOrders: d.accessoryOrders }, d.profiles);
    const active = all.filter((c) => Date.parse(c.lastActivity) >= since);
    return { active: active.length, fresh: active.filter((c) => Date.parse(c.firstSeen) >= since).length, repeat: active.filter((c) => c.visits > 1).length,
      lapsed: all.filter((c) => c.lastActivity && Date.now() - Date.parse(c.lastActivity) > 182 * DAY).length, total: all.length };
  }, [d, days]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <div style={{ color: muted, fontSize: 13, marginBottom: 16 }}>Loading repair reports…</div>;
  const card = { border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 14 };
  const th = { textAlign: "left", fontSize: 11.5, color: muted, fontWeight: 600, padding: "4px 8px" }, td = { padding: "5px 8px", fontSize: 13, borderTop: `1px solid ${line}`, fontVariantNumeric: "tabular-nums" };
  const bar = (n, max) => <div style={{ height: 6, borderRadius: 3, background: "var(--mr-brand-fill)", width: `${Math.max(4, (n / max) * 100)}%` }} />;
  return (
    <div>
      <AskData colors={colors} />
      <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14, marginRight: 6 }}>Repairs</b>
        {[[30, "30 days"], [90, "90 days"], [365, "12 months"]].map(([k, l]) => <button key={k} type="button" aria-pressed={days === k} onClick={() => setDays(k)}
          style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${days === k ? "var(--mr-brand)" : line}`, background: days === k ? "var(--mr-brand-soft)" : "transparent", color: days === k ? "var(--mr-brand)" : paper }}>{l}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
        {[["Repairs finished", s.done], ["Average turnaround", s.avgTurnH ? (s.avgTurnH < 24 ? `${Math.round(s.avgTurnH)} h` : `${(s.avgTurnH / 24).toFixed(1)} days`) : "—"],
          ["On time", s.promised ? `${Math.round(((s.promised - s.late) / s.promised) * 100)}%` : "—"], ["Late by (average)", s.late ? `${Math.round(s.avgLateH)} h` : "—"]].map(([k, v]) => (
          <div key={k} style={{ border: `1px solid ${line}`, borderRadius: 3, padding: "10px 12px" }}><div style={{ fontSize: 11.5, color: muted }}>{k}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div></div>
        ))}
      </div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Technicians</div>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>{["", "Jobs", "Avg time", "Revenue", "Pay", "On time", "Comebacks"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{s.tech.length ? s.tech.map((t) => <tr key={t.name}><td style={td}>{t.name}</td><td style={td}>{t.jobs}</td><td style={td}>{t.timed ? `${Math.round(t.mins / t.timed)} min` : "—"}</td><td style={td}>{money(t.revenue)}</td><td style={td}>{money(t.pay)}</td>
            <td style={td}>{t.promised ? `${Math.round(((t.promised - t.late) / t.promised) * 100)}%` : "—"}</td><td style={{ ...td, color: t.comebacks ? "var(--mr-bad)" : paper }}>{t.comebacks}</td></tr>)
            : <tr><td style={td} colSpan={7}>No finished repairs in this period.</td></tr>}</tbody>
        </table></div>
        <div style={{ fontSize: 11.5, color: muted, marginTop: 6 }}>Comebacks are warranty jobs on a repair that person did.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {[["Most repaired models", s.models], ["Most common repairs", s.types]].map(([title, rows]) => (
          <div key={title} style={card}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{title}</div>
            {rows.length ? rows.map(([k, n]) => <div key={k} style={{ fontSize: 13, marginBottom: 6 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{k}</span><b>{n}</b></div>{bar(n, rows[0][1])}</div>) : <div style={{ fontSize: 13, color: muted }}>Nothing yet.</div>}
          </div>
        ))}
        <div style={card}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Parts spend by supplier</div>
          {s.suppliers.length ? s.suppliers.map((x) => <div key={x.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span>{x.name} <span style={{ color: muted }}>· {x.parts} parts</span></span><b>{money(x.spend)}</b></div>) : <div style={{ fontSize: 13, color: muted }}>No parts used yet.</div>}
        </div>
        {cust && <div style={card}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Customers</div>
          {[["Seen in this period", cust.active], ["New", cust.fresh], ["Came back (repeat)", cust.repeat], ["Not seen 6+ months", cust.lapsed], ["On record", cust.total]].map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span>{k}</span><b>{v}</b></div>)}
        </div>}
      </div>
    </div>
  );
}

// "Ask your data": a question in plain words (English or Hinglish), answered by the assistant
// from the shop's totals (backend/ai.js /ai/ask). No customer details leave the server.
const ASK_EXAMPLES = ["How did this month compare with last month?", "Which repairs make us the most money?", "Is the shop profitable after expenses this month?", "Kaunsa model sabse zyada repair hota hai?"];
function AskData({ colors }) {
  const { line, muted } = colors;
  const [q, setQ] = useState(""); const [a, setA] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const ask = async (question) => {
    const text = (question || q).trim(); if (!text) return;
    setQ(text); setBusy(true); setErr(""); setA("");
    try {
      const t = window.shopAuth && window.shopAuth.authToken();
      const r = await fetch(`${window.SHOP_API_BASE_URL || ""}/ai/ask`, { method: "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ question: text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The assistant isn't available right now.");
      setA(j.answer);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 14, marginBottom: 16, background: "linear-gradient(135deg, var(--mr-brand-soft), transparent)" }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>✨ Ask your data</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ask anything about sales, repairs, stock or costs" aria-label="Ask your data"
          style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: `1px solid ${line}`, background: "var(--mr-surface)", color: "var(--mr-text)", fontSize: 14, fontFamily: "inherit" }} />
        <button type="button" onClick={() => ask()} disabled={busy} style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: "var(--mr-brand-fill)", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "…" : "Ask"}</button>
      </div>
      {!a && !busy && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{ASK_EXAMPLES.map((x) => <button key={x} type="button" onClick={() => ask(x)} style={{ padding: "4px 10px", borderRadius: 999, border: `1px solid ${line}`, background: "transparent", color: muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{x}</button>)}</div>}
      {err && <div style={{ color: "var(--mr-bad)", fontSize: 13, marginTop: 8 }}>{err}</div>}
      {a && <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{a}</div>}
    </div>
  );
}
