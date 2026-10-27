// Technician pay: what each technician is owed, job by job, paying it in one go
// (cash or bank, with a reference), and every past payment. Pay per job is set on
// the repair job; this screen only settles it. A payment is a "pay run": one
// record of who was paid, how much, how, for which jobs.
import React, { useMemo, useState } from "react";
import { sydneyMonth, sydneyToday } from "./sydney-time.js";

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—");
const METHODS = ["Cash", "Bank transfer", "Other"];

export default function TechPayTab({ tickets = [], runs = [], onPay }) {
  const [sel, setSel] = useState({}); // jobId -> true (unticked jobs are left for next time)
  const [via, setVia] = useState({});  // tech -> method
  const [ref, setRef] = useState({});  // tech -> reference
  const [busy, setBusy] = useState("");
  const month = sydneyMonth(sydneyToday());

  const techs = useMemo(() => {
    const m = new Map();
    const t = (name) => { if (!m.has(name)) m.set(name, { name, owed: [], waiting: [], doneMonth: 0, earnedMonth: 0, minutes: 0, timed: 0 }); return m.get(name); };
    for (const j of tickets) {
      if (!j || !j.assignedTo) continue;
      const x = t(j.assignedTo), pay = Number(j.techPay) || 0;
      if (j.status === "completed" && j.completedAt && sydneyMonth(j.completedAt) === month) {
        x.doneMonth += 1; x.earnedMonth += pay;
        if (Number(j.timeSpentMins) > 0) { x.minutes += Number(j.timeSpentMins); x.timed += 1; }
      }
      if (pay > 0 && !j.techPaidAt) (j.status === "completed" ? x.owed : x.waiting).push(j);
    }
    for (const r of runs) t(r.technician);
    return [...m.values()].map((x) => ({ ...x, paidMonth: runs.filter((r) => r.technician === x.name && sydneyMonth(r.at) === month).reduce((s, r) => s + (Number(r.amount) || 0), 0) }))
      .sort((a, b) => b.owed.reduce((s, j) => s + Number(j.techPay), 0) - a.owed.reduce((s, j) => s + Number(j.techPay), 0));
  }, [tickets, runs, month]);

  const isOn = (j) => sel[j.id] !== false;
  const card = { background: "#fff", border: "1px solid #E3E7EF", borderRadius: 16, padding: 16, marginBottom: 14 };
  const chip = (on) => ({ padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${on ? "#2150C8" : "#E3E7EF"}`, background: on ? "rgba(33,80,200,.08)" : "#fff", color: on ? "#2150C8" : "#111827", fontFamily: "inherit" });

  if (!techs.length) return <div style={{ ...card, color: "#6B7280", fontSize: 14 }}>No technicians yet. Assign a repair job to someone and set their pay on the job; it shows up here to be paid.</div>;

  return (
    <div>
      <div style={{ fontSize: 13.5, color: "#5B6472", marginBottom: 14 }}>Pay is set on each repair job. Finished jobs that haven't been paid show here; tick the ones you're paying now.</div>
      {techs.map((x) => {
        const chosen = x.owed.filter(isOn);
        const total = chosen.reduce((s, j) => s + (Number(j.techPay) || 0), 0);
        const method = via[x.name] || "Cash";
        return (
          <div key={x.name} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20 }}>🔧 {x.name}</div>
              <div style={{ fontSize: 13, color: "#5B6472" }}>
                This month: <b>{x.doneMonth}</b> jobs · earned <b>{money(x.earnedMonth)}</b> · paid <b>{money(x.paidMonth)}</b>{x.timed ? ` · avg ${Math.round(x.minutes / x.timed)} min/job` : ""}
              </div>
            </div>
            {x.owed.length === 0 && <div style={{ fontSize: 13.5, color: "#0E7A4F", marginTop: 10 }}>✓ Nothing owed for finished jobs.</div>}
            {x.owed.length > 0 && (
              <>
                <div style={{ marginTop: 10 }}>
                  {x.owed.map((j) => (
                    <label key={j.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid #EEF1F6", fontSize: 13.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={isOn(j)} onChange={(e) => setSel((s) => ({ ...s, [j.id]: e.target.checked }))} />
                      <span style={{ flex: 1, minWidth: 0 }}>{j.id} · {j.device?.brand} {j.device?.model}{j.jobType === "shop" ? " (shop phone)" : ""}<span style={{ color: "#6B7280" }}> · done {day(j.completedAt)}</span></span>
                      <b>{money(j.techPay)}</b>
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                  {METHODS.map((m) => <button key={m} type="button" onClick={() => setVia((v) => ({ ...v, [x.name]: m }))} style={chip(method === m)}>{m}</button>)}
                  <input value={ref[x.name] || ""} onChange={(e) => setRef((r) => ({ ...r, [x.name]: e.target.value }))} placeholder={method === "Bank transfer" ? "Transfer reference" : "Note (optional)"}
                    style={{ flex: "1 1 160px", padding: "9px 12px", border: "1px solid #E3E7EF", fontSize: 13.5 }} />
                  <button disabled={!chosen.length || busy === x.name} onClick={async () => {
                    setBusy(x.name);
                    await onPay({ technician: x.name, jobIds: chosen.map((j) => j.id), amount: total, via: method, ref: (ref[x.name] || "").trim() });
                    setRef((r) => ({ ...r, [x.name]: "" })); setBusy("");
                  }} style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: chosen.length ? "#0E7A4F" : "#E5E7EB", color: chosen.length ? "#fff" : "#9AA3B2", fontWeight: 700, fontSize: 14, cursor: chosen.length ? "pointer" : "default", fontFamily: "inherit" }}>
                    Pay {money(total)} ({chosen.length} job{chosen.length === 1 ? "" : "s"})
                  </button>
                </div>
              </>
            )}
            {x.waiting.length > 0 && <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 10 }}>Not finished yet: {x.waiting.map((j) => `${j.id} (${money(j.techPay)})`).join(", ")} — payable once the job is done.</div>}
          </div>
        );
      })}

      <div style={card}>
        <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8 }}>Past payments</div>
        {runs.length === 0 && <div style={{ fontSize: 13.5, color: "#6B7280" }}>No payments recorded yet.</div>}
        {[...runs].sort((a, b) => String(b.at).localeCompare(String(a.at))).map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid #EEF1F6", fontSize: 13.5, flexWrap: "wrap" }}>
            <span>{new Date(r.at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} · <b>{r.technician}</b> · {r.jobIds.length} job{r.jobIds.length === 1 ? "" : "s"} · {r.via}{r.ref ? ` (${r.ref})` : ""}<span style={{ color: "#6B7280" }}>{r.by ? ` · by ${r.by}` : ""}</span></span>
            <b>{money(r.amount)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
