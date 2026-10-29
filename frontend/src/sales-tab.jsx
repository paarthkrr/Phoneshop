// Register > Sales: every sale, newest first, with search and a date range. A sale can be
// refunded (all or part, how the money went back, why, and whether the item goes back on the
// shelf), and the owner or a manager can undo a sale entered by mistake. A refund is saved as
// its own minus entry linked to the sale, so the till, profit and reports adjust by themselves.
import React, { useState } from "react";
import { saleKind, KIND_LABELS } from "./pnl.js";

const money = (n) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const RANGES = [["today", "Today"], ["7", "7 days"], ["30", "30 days"], ["all", "All"]];
const REASONS = ["Faulty / not working", "Changed their mind", "Price adjustment", "Wrong item", "Repair didn't fix it", "Other"];

export default function SalesTab({ colors, sales, canUndo, onRefund }) {
  const { panel, panel2, paper, muted, brass, red, green, line } = colors;
  const [q, setQ] = useState("");
  const [range, setRange] = useState("7");
  const [open, setOpen] = useState(null);
  const now = Date.now();
  const inRange = (iso) => { const t = Date.parse(iso || ""); if (isNaN(t)) return range === "all";
    return range === "all" || (range === "today" ? new Date(t).toDateString() === new Date().toDateString() : now - t <= Number(range) * 864e5); };
  const needle = q.trim().toLowerCase();
  const list = (sales || []).filter((s) => s && inRange(s.soldAt))
    .filter((s) => !needle || `${s.id} ${s.customerName || ""} ${s.brand || ""} ${s.model || ""} ${s.itemId || ""}`.toLowerCase().includes(needle))
    .sort((a, b) => String(b.soldAt).localeCompare(String(a.soldAt)));
  const total = list.reduce((a, s) => a + (Number(s.salePrice) || 0), 0);
  const refunds = list.filter((s) => s.refundOf);
  const chip = (on) => ({ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? brass : line}`, background: on ? "var(--mr-brand-soft)" : "transparent", color: on ? brass : paper });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, model, sale or job number" aria-label="Search sales"
          style={{ flex: "1 1 240px", padding: "10px 12px", border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, borderRadius: 3 }} />
        {RANGES.map(([k, l]) => <button key={k} type="button" aria-pressed={range === k} onClick={() => setRange(k)} style={chip(range === k)}>{l}</button>)}
      </div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>{list.length - refunds.length} sale{list.length - refunds.length === 1 ? "" : "s"}{refunds.length ? `, ${refunds.length} refund${refunds.length === 1 ? "" : "s"}` : ""} · net {money(total)}</div>
      {list.length === 0 && <div style={{ fontSize: 13, color: muted }}>No sales in this range.</div>}
      {list.slice(0, 150).map((s) => {
        const refunded = Number(s.refundedAmount) || 0;
        const left = Math.max(0, (Number(s.salePrice) || 0) - refunded);
        return (
          <div key={s.id} style={{ border: `1px solid ${s.refundOf ? red : line}`, borderRadius: 3, padding: "10px 12px", marginBottom: 8, background: panel }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.refundOf ? `Refund on ${s.refundOf}` : `${KIND_LABELS[saleKind(s)] ? KIND_LABELS[saleKind(s)].replace(/s$/, "") : "Sale"}: ${[s.brand !== "Accessory" ? s.brand : "", s.model, saleKind(s) === "phone" ? s.storage : ""].filter(Boolean).join(" ")}`}</div>
                <div style={{ fontSize: 12, color: muted }}>{new Date(s.soldAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {s.id} · {s.customerName || "Walk-in"} · {s.payMethod || "?"}{s.staffHandled ? ` · ${s.staffHandled}` : ""}</div>
                {s.refundReason && <div style={{ fontSize: 12, color: red }}>{s.refundReason}{s.restocked ? " · back in stock" : ""}</div>}
                {refunded > 0 && <div style={{ fontSize: 12, color: red }}>{money(refunded)} refunded{s.voided ? " (sale undone)" : ""}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.refundOf ? red : paper }}>{money(s.salePrice)}</span>
                {!s.refundOf && left > 0 && <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} style={{ padding: "6px 10px", borderRadius: 3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${line}`, background: "transparent", color: paper }}>Refund…</button>}
              </div>
            </div>
            {open === s.id && <RefundForm sale={s} left={left} colors={colors} canUndo={canUndo} onCancel={() => setOpen(null)}
              onDone={async (r) => { await onRefund(s, r); setOpen(null); }} />}
          </div>
        );
      })}
    </div>
  );
}

function RefundForm({ sale, left, colors, canUndo, onCancel, onDone }) {
  const { panel2, paper, muted, brass, red, line } = colors;
  const kind = saleKind(sale);
  const [amount, setAmount] = useState(String(left));
  const [method, setMethod] = useState(sale.payMethod === "card" ? "card" : sale.payMethod === "bank" ? "bank" : "cash");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(kind !== "repair");
  const [busy, setBusy] = useState(false);
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const ok = amt > 0 && amt <= left + 0.001;
  const sb = (on, c) => ({ padding: "5px 10px", borderRadius: 3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? (c || brass) : line}`, background: "transparent", color: on ? (c || brass) : paper });
  const go = async (undo) => {
    if (busy) return; setBusy(true);
    try { await onDone(undo ? { amount: left, method: sale.payMethod || method, reason: "Sale entered by mistake", restock: kind !== "repair", undo: true }
      : { amount: amt, method, reason: note.trim() ? `${reason}: ${note.trim()}` : reason, restock: restock && amt >= left - 0.001 }); } finally { setBusy(false); }
  };
  return (
    <div style={{ borderTop: `1px solid ${line}`, marginTop: 10, paddingTop: 10, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: muted }}>
        Refund $<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" aria-label="Refund amount"
          style={{ width: 90, padding: "6px 8px", borderRadius: 3, border: `1px solid ${ok ? line : red}`, background: panel2, color: paper }} />
        of {`$${left}`} · paid back by
        {["cash", "card", "bank"].map((m) => <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} style={sb(method === m)}>{m}</button>)}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{REASONS.map((r) => <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} style={sb(reason === r, red)}>{r}</button>)}</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Refund note" style={{ padding: "7px 9px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, fontFamily: "inherit" }} />
      {kind !== "repair" && <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={restock && amt >= left - 0.001} disabled={amt < left - 0.001} onChange={(e) => setRestock(e.target.checked)} />
        Put it back in stock{amt < left - 0.001 ? " (only with a full refund)" : ""}</label>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={!ok || busy} onClick={() => go(false)} style={{ padding: "8px 14px", borderRadius: 3, border: "none", background: red, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Refund ${amt || 0}</button>
        <button type="button" onClick={onCancel} style={{ padding: "8px 14px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        {canUndo && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Undo ${sale.id}? Use this only for a sale entered by mistake: it's reversed in full${kind !== "repair" ? " and the item goes back in stock" : ""}.`)) go(true); }}
          style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: muted, cursor: "pointer", fontFamily: "inherit" }}>Undo sale (entered by mistake)</button>}
      </div>
    </div>
  );
}
