import React, { useState, useEffect, useMemo } from "react";

/* =================================================================
   TILL RECONCILIATION
   The point of this isn't the math — it's making cash discrepancies
   visible same-day, while anyone can still remember what happened,
   instead of discovering a shortfall weeks later with no trail.
   Reads the same sales/inventory records everything else writes;
   the only new data this owns is the daily open/close record itself.
================================================================= */

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
const TILL_KEY = "till_records";
const STAFF_KEY = "staff_on_shift"; // same private key POS/Repair use — one name typed, shared across all three in this browser
function getAuthedUser() {
  try {
    return (typeof window !== "undefined" && window.shopAuth && typeof window.shopAuth.currentUser === "function")
      ? window.shopAuth.currentUser() : null;
  } catch (e) {
    return null;
  }
}
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => `$${(Math.round((n || 0) * 100) / 100).toLocaleString()}`;

export default function TillReconciliation() {
  const [sales, setSales] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [records, setRecords] = useState(null);
  const [openingInput, setOpeningInput] = useState("");
  const [otherIn, setOtherIn] = useState("");
  const [otherInNote, setOtherInNote] = useState("");
  const [otherOut, setOtherOut] = useState("");
  const [otherOutNote, setOtherOutNote] = useState("");
  const [actualCount, setActualCount] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [view, setView] = useState("today"); // today | history
  const [staffName, setStaffName] = useState("");
  const [authedUser, setAuthedUser] = useState(null);

  useEffect(() => {
    (async () => {
      const [s, inv, r, staff] = await Promise.all([loadJSON("sales", true), loadJSON("inventory", true), loadJSON(TILL_KEY, true), loadJSON(STAFF_KEY, false)]);
      setSales(s || []); setInventory(inv || []); setRecords(r || []);
      const authed = getAuthedUser();
      if (authed) { setAuthedUser(authed); setStaffName(authed.username); }
      else if (staff) setStaffName(staff);
    })();
  }, []);
  async function persistStaffName(name) { setStaffName(name); await saveJSON(STAFF_KEY, name, false); }

  const today = todayStr();
  const todayRecord = records?.find((r) => r.date === today);

  const cashSalesToday = useMemo(() => (sales || [])
    .filter((s) => s.soldAt?.slice(0, 10) === today && s.payMethod === "cash")
    .reduce((sum, s) => sum + s.salePrice, 0), [sales, today]);

  const cashBuysToday = useMemo(() => (inventory || [])
    .filter((i) => i.receivedAt?.slice(0, 10) === today && i.sourceOrderId === null && i.payMethod === "cash")
    .reduce((sum, i) => sum + i.costBasis, 0), [inventory, today]);

  const opening = todayRecord?.openingFloat ?? 0;
  const extraIn = todayRecord?.otherIn ?? 0;
  const extraOut = todayRecord?.otherOut ?? 0;
  const expectedClosing = opening + cashSalesToday - cashBuysToday + extraIn - extraOut;

  async function persist(next) { await saveJSON(TILL_KEY, next, true); setRecords(next); }

  async function openDay() {
    const rec = { date: today, openingFloat: parseFloat(openingInput) || 0, otherIn: 0, otherOut: 0, otherNotes: [], closed: false, openedBy: staffName || "unattributed" };
    await persist([rec, ...(records || [])]);
  }

  async function addAdjustment(type) {
    const amt = type === "in" ? parseFloat(otherIn) : parseFloat(otherOut);
    const note = type === "in" ? otherInNote : otherOutNote;
    if (!amt) return;
    const next = (records || []).map((r) => {
      if (r.date !== today) return r;
      const updated = { ...r };
      if (type === "in") updated.otherIn = (r.otherIn || 0) + amt;
      else updated.otherOut = (r.otherOut || 0) + amt;
      updated.otherNotes = [...(r.otherNotes || []), { type, amt, note, at: new Date().toISOString() }];
      return updated;
    });
    await persist(next);
    if (type === "in") { setOtherIn(""); setOtherInNote(""); } else { setOtherOut(""); setOtherOutNote(""); }
  }

  async function closeDay() {
    const actual = parseFloat(actualCount);
    if (isNaN(actual)) return;
    const discrepancy = actual - expectedClosing;
    const next = (records || []).map((r) => r.date === today
      ? { ...r, closed: true, actualClosing: actual, expectedClosing, discrepancy, closingNotes, closedAt: new Date().toISOString(), closedBy: staffName || "unattributed" }
      : r);
    await persist(next);
  }

  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

  if (sales === null) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading till…</div>;

  const inputStyle = { flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" };

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: '-0.01em', marginBottom: 4 }}>Till</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 18 }}>{today} — cash reconciliation, not card or bank transfers.</div>

        {authedUser ? (
          <div style={{ fontSize: 12.5, color: green, marginBottom: 18, border: `1px solid ${line}`, borderRadius: 3, padding: "8px 12px" }}>
            ✓ Logged in as <strong>{authedUser.username}</strong> ({authedUser.role}) — attributed automatically, not editable here.
          </div>
        ) : (
          <input value={staffName} onChange={(e) => persistStaffName(e.target.value)} placeholder="Your name (recorded as who opened/closed the till)"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 12.5, marginBottom: 18, outline: "none", boxSizing: "border-box" }} />
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: `1px solid ${line}`, paddingBottom: 14 }}>
          {[{ id: "today", label: "Today" }, { id: "history", label: "History" }].map((v) => (
            <button key={v.id} onClick={() => setView(v.id)}
              style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                border: `1px solid ${view === v.id ? brass : line}`, background: view === v.id ? brassDim : "transparent", color: view === v.id ? brass : paper }}>
              {v.label}
            </button>
          ))}
        </div>

        {view === "today" && !todayRecord && (
          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 16 }}>
            <div style={{ fontSize: 14, marginBottom: 10 }}>Open today's till</div>
            <div style={{ fontSize: 12.5, color: muted, marginBottom: 10 }}>Count the float in the drawer before serving anyone.</div>
            <input value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} placeholder="Opening float amount" type="number"
              style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            <button disabled={openingInput === ""} onClick={openDay}
              style={{ width: "100%", padding: "12px", borderRadius: 3, border: "none", background: openingInput !== "" ? brass : line, color: openingInput !== "" ? "#1a1408" : muted, fontSize: 14, fontWeight: 600, cursor: openingInput !== "" ? "pointer" : "default" }}>
              Open till
            </button>
          </div>
        )}

        {view === "today" && todayRecord && !todayRecord.closed && (
          <div>
            <div style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Running total</div>
              {[
                ["Opening float", opening, muted],
                ["Cash sales today (phones + accessories + repairs)", cashSalesToday, green],
                ["Cash buys today", -cashBuysToday, red],
                ["Other cash in", extraIn, green],
                ["Other cash out", -extraOut, red],
              ].map(([label, amt, color]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span>{label}</span><span style={{ color }}>{amt >= 0 ? "" : "−"}{fmt(Math.abs(amt))}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, paddingTop: 8, marginTop: 6, borderTop: `1px solid ${line}` }}>
                <span>Expected in drawer</span><span style={{ color: brass }}>{fmt(expectedClosing)}</span>
              </div>
            </div>

            <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>
              Manual adjustment for cash flows nothing else captures automatically — e.g. till-out for supplies, an owner's cash draw, or petty cash reimbursement.
              <span style={{ color: brass }}> Repair job cash payments are already included in "Cash sales today" above automatically — don't re-enter them here, or they'll be counted twice.</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input value={otherIn} onChange={(e) => setOtherIn(e.target.value)} placeholder="Cash in" type="number" style={inputStyle} />
              <input value={otherInNote} onChange={(e) => setOtherInNote(e.target.value)} placeholder="Note" style={{ ...inputStyle, flex: 2 }} />
              <button onClick={() => addAdjustment("in")} disabled={!otherIn} style={{ padding: "9px 12px", borderRadius: 3, border: "none", background: otherIn ? green : line, color: otherIn ? "#0c1a12" : muted, fontSize: 12.5, cursor: otherIn ? "pointer" : "default" }}>Add</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <input value={otherOut} onChange={(e) => setOtherOut(e.target.value)} placeholder="Cash out" type="number" style={inputStyle} />
              <input value={otherOutNote} onChange={(e) => setOtherOutNote(e.target.value)} placeholder="Note" style={{ ...inputStyle, flex: 2 }} />
              <button onClick={() => addAdjustment("out")} disabled={!otherOut} style={{ padding: "9px 12px", borderRadius: 3, border: "none", background: otherOut ? red : line, color: otherOut ? "#fff" : muted, fontSize: 12.5, cursor: otherOut ? "pointer" : "default" }}>Add</button>
            </div>

            <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 16 }}>
              <div style={{ fontSize: 14, marginBottom: 10 }}>Close out the day</div>
              <input value={actualCount} onChange={(e) => setActualCount(e.target.value)} placeholder="Actual cash counted in drawer" type="number"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
              {actualCount !== "" && (
                <div style={{ fontSize: 13, marginBottom: 10, color: Math.abs(parseFloat(actualCount) - expectedClosing) < 0.01 ? green : red }}>
                  {parseFloat(actualCount) === expectedClosing ? "Matches exactly." :
                    `${parseFloat(actualCount) > expectedClosing ? "Over" : "Short"} by ${fmt(Math.abs(parseFloat(actualCount) - expectedClosing))}`}
                </div>
              )}
              <textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder="Notes on any discrepancy (optional)"
                style={{ width: "100%", minHeight: 50, padding: 10, borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }} />
              <button disabled={actualCount === ""} onClick={closeDay}
                style={{ width: "100%", padding: "12px", borderRadius: 3, border: "none", background: actualCount !== "" ? brass : line, color: actualCount !== "" ? "#1a1408" : muted, fontSize: 14, fontWeight: 600, cursor: actualCount !== "" ? "pointer" : "default" }}>
                Close till for today
              </button>
            </div>
          </div>
        )}

        {view === "today" && todayRecord?.closed && (
          <div style={{ border: `1px solid ${Math.abs(todayRecord.discrepancy) < 0.01 ? green : red}`, borderRadius: 3, padding: 16 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Today's till is closed.</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 4 }}>Expected {fmt(todayRecord.expectedClosing)} · Counted {fmt(todayRecord.actualClosing)}</div>
            <div style={{ fontSize: 11.5, color: muted, marginBottom: 4 }}>Opened by {todayRecord.openedBy || "unattributed"} · Closed by {todayRecord.closedBy || "unattributed"}</div>
            <div style={{ fontSize: 15, color: Math.abs(todayRecord.discrepancy) < 0.01 ? green : red }}>
              {Math.abs(todayRecord.discrepancy) < 0.01 ? "Balanced" : `${todayRecord.discrepancy > 0 ? "Over" : "Short"} by ${fmt(Math.abs(todayRecord.discrepancy))}`}
            </div>
            {todayRecord.closingNotes && <div style={{ fontSize: 12.5, color: muted, marginTop: 8 }}>Note: {todayRecord.closingNotes}</div>}
          </div>
        )}

        {view === "history" && (
          <div>
            {(records || []).filter((r) => r.closed).length === 0 && <div style={{ color: muted, fontSize: 13 }}>No closed days yet.</div>}
            {(records || []).filter((r) => r.closed).map((r) => (
              <div key={r.date} style={{ border: `1px solid ${line}`, borderLeft: `3px solid ${Math.abs(r.discrepancy) < 0.01 ? green : red}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{r.date}</span>
                  <span style={{ color: Math.abs(r.discrepancy) < 0.01 ? green : red }}>
                    {Math.abs(r.discrepancy) < 0.01 ? "Balanced" : `${r.discrepancy > 0 ? "+" : "−"}${fmt(Math.abs(r.discrepancy))}`}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Expected {fmt(r.expectedClosing)} · Counted {fmt(r.actualClosing)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
