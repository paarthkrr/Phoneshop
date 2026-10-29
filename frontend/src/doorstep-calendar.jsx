// "At your door" visits as a calendar: one day at a time, a column per technician,
// a row per time window, plus a week grid of who has how many. Staff assign the
// technician, move the visit, message the customer and mark it done right here.
import React, { useState } from "react";
import { DOORSTEP, zoneForPostcode, doorstepFee, ymd } from "./doorstep.js";
import { waLink } from "./business-info.js";

const ROWS = [{ id: "express", label: "Express (within about 2 h)" }, ...DOORSTEP.windows.map((w) => ({ id: w.id, label: `${w.label}, ${w.range}` }))];
const UNASSIGNED = "";

// Where a visit sits: staff's booked day and window win over what the customer asked for.
export function visitSlot(r) {
  const win = r.visitWindow || (r.express === true ? "express" : (DOORSTEP.windows.find((w) => w.range === r.slotWindow) || {}).id) || "am";
  const day = r.visitDate || r.slotDate || (r.createdAt ? ymd(new Date(r.createdAt)) : ymd(new Date()));
  return { day, win };
}
const isOpen = (r) => r.method === "doorstep" && !["done", "cancelled"].includes(r.visitStatus);

export default function DoorstepCalendar({ requests, team, onUpdate, onStartTicket }) {
  const today = ymd(new Date());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return { date: ymd(d), label: d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) }; });
  const visits = requests.filter(isOpen);
  const overdue = visits.filter((r) => visitSlot(r).day < today);
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState(null);
  const techs = [...new Set([...(team || []).filter((u) => u.role === "technician").map((u) => u.username), ...visits.map((r) => r.assignedTo).filter(Boolean)])];
  const everyone = [...new Set([...techs, ...(team || []).map((u) => u.username)])];
  const cols = [UNASSIGNED, ...techs];
  const onDay = (d) => visits.filter((r) => visitSlot(r).day === d);
  const shown = day === "overdue" ? overdue : onDay(day);
  const clash = (r) => r.assignedTo && shown.filter((x) => x.assignedTo === r.assignedTo && visitSlot(x).win === visitSlot(r).win && visitSlot(x).day === visitSlot(r).day).length > 1;

  const chip = (on, bad) => ({ padding: "7px 11px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
    border: `1.5px solid ${bad ? "var(--mr-bad)" : on ? "var(--mr-brand)" : "var(--mr-line)"}`, background: on ? "var(--mr-brand-soft)" : "transparent", color: bad ? "var(--mr-bad)" : on ? "var(--mr-brand)" : "var(--mr-text)" });
  const sel = { padding: "6px 8px", borderRadius: 8, border: "1px solid var(--mr-line)", background: "var(--mr-surface-2)", color: "var(--mr-text)", fontSize: 12.5, fontFamily: "inherit", width: "100%" };
  const btn = (primary) => ({ flex: "1 1 auto", padding: "6px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "center", textDecoration: "none",
    border: primary ? "none" : "1px solid var(--mr-line)", background: primary ? "var(--mr-brand-fill)" : "transparent", color: primary ? "#fff" : "var(--mr-text)" });

  function card(r) {
    const { day: d, win } = visitSlot(r);
    const zone = zoneForPostcode(r.postcode), fee = doorstepFee(zone, r.express === true);
    const winLabel = win === "express" ? "express" : (DOORSTEP.windows.find((w) => w.id === win) || {}).range;
    const dayLabel = new Date(d + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
    const confirm = `Hi ${(r.name || "").split(" ")[0]}, this is Mobile Recellr confirming your at-your-door repair for your ${r.model || "device"}: ${dayLabel}, ${winLabel}. ${r.assignedTo ? `${r.assignedTo} is coming.` : ""} ${fee != null ? `Travel fee $${fee}, taken off the repair if you go ahead.` : ""} Reply here if that time doesn't suit.`.replace(/\s+/g, " ").trim();
    const map = r.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.address} ${r.postcode || ""} NSW`)}` : "";
    return (
      <div key={r.id} style={{ background: "var(--mr-surface)", border: `${clash(r) || r.express === true ? 2 : 1}px solid ${clash(r) || r.express === true ? "var(--mr-bad)" : "var(--mr-line)"}`, borderRadius: 12, padding: 10, marginBottom: 8, fontSize: 12.5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, color: "var(--mr-muted)" }}>
          <span>{r.id}</span>
          <span>{r.visitStatus === "booked" ? <b style={{ color: "var(--mr-ok)" }}>✓ Confirmed</b> : "Not confirmed"}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, margin: "3px 0 1px" }}>{r.name}: {r.model}</div>
        <div style={{ color: "var(--mr-muted)" }}>{r.issue}</div>
        <div style={{ marginTop: 4 }}>{r.address || "No address"} {r.postcode || ""}{map && <> · <a href={map} target="_blank" rel="noopener noreferrer" style={{ color: "var(--mr-brand)" }}>Map</a></>}</div>
        <div style={{ color: zone === "A" || zone === "B" ? "var(--mr-muted)" : "var(--mr-bad)" }}>{zone === "A" || zone === "B" ? `${DOORSTEP.zones[zone].label}, $${fee} travel fee` : "Outside our usual area: check before booking"}</div>
        {r.visitNote && <div style={{ marginTop: 4, padding: "4px 8px", borderRadius: 6, background: "var(--mr-surface-2)" }}>📝 {r.visitNote}</div>}
        {editing === r.id ? <VisitEdit r={r} onCancel={() => setEditing(null)} onSave={(patch) => { onUpdate(r.id, patch); setEditing(null); }} />
          : <button type="button" onClick={() => setEditing(r.id)} style={{ all: "unset", cursor: "pointer", color: "var(--mr-brand)", fontWeight: 700, fontSize: 12, marginTop: 4 }}>Edit address / note</button>}
        {clash(r) && <div style={{ color: "var(--mr-bad)", fontWeight: 700, marginTop: 4 }}>{r.assignedTo} has another visit in this window</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
          <select aria-label="Technician" value={r.assignedTo || ""} onChange={(e) => onUpdate(r.id, { assignedTo: e.target.value || null })} style={sel}>
            <option value="">No one yet</option>
            {everyone.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select aria-label="Day" value={d} onChange={(e) => onUpdate(r.id, { visitDate: e.target.value })} style={sel}>
            {[...new Set([d, ...days.map((x) => x.date)])].map((x) => <option key={x} value={x}>{new Date(x + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</option>)}
          </select>
          <select aria-label="Time" value={win} onChange={(e) => onUpdate(r.id, { visitWindow: e.target.value })} style={sel}>
            {ROWS.map((w) => <option key={w.id} value={w.id}>{w.id === "express" ? "Express" : DOORSTEP.windows.find((x) => x.id === w.id).range}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {r.phone && <a href={waLink(r.phone, confirm)} target="_blank" rel="noopener noreferrer" style={btn(false)}
            onClick={() => onUpdate(r.id, { visitStatus: "booked", status: r.status === "new" ? "contacted" : r.status })}>Confirm on WhatsApp</a>}
          {r.phone && <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} style={btn(false)}>Call</a>}
          <button type="button" style={btn(true)} onClick={() => onStartTicket(r)}>Book in the job →</button>
          <button type="button" style={btn(false)} onClick={() => onUpdate(r.id, { visitStatus: "done", status: "contacted" })}>Done, no job</button>
          <button type="button" style={btn(false)} onClick={() => { if (window.confirm(`Cancel the visit for ${r.name}?`)) onUpdate(r.id, { visitStatus: "cancelled" }); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 10 }}>
        {overdue.length > 0 && <button type="button" onClick={() => setDay("overdue")} style={chip(day === "overdue", true)}>Missed / not closed ({overdue.length})</button>}
        {days.map((d) => <button key={d.date} type="button" onClick={() => setDay(d.date)} style={chip(day === d.date)}>{d.date === today ? "Today" : d.label} ({onDay(d.date).length})</button>)}
      </div>

      {techs.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 14 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: "100%" }}>
            <thead><tr><th style={{ textAlign: "left", padding: "4px 8px", color: "var(--mr-muted)", fontWeight: 600 }}>Visits this week</th>{days.map((d) => <th key={d.date} style={{ padding: "4px 6px", color: "var(--mr-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{d.label.split(" ")[0].replace(",", "")}</th>)}</tr></thead>
            <tbody>
              {cols.map((t) => (
                <tr key={t || "none"} style={{ borderTop: "1px solid var(--mr-line)" }}>
                  <td style={{ padding: "4px 8px", whiteSpace: "nowrap", color: t ? "var(--mr-text)" : "var(--mr-bad)" }}>{t || "Not assigned"}</td>
                  {days.map((d) => { const n = onDay(d.date).filter((r) => (r.assignedTo || "") === t).length; return <td key={d.date} style={{ textAlign: "center", padding: "4px 6px", fontWeight: n ? 700 : 400, color: n ? (t ? "var(--mr-text)" : "var(--mr-bad)") : "var(--mr-muted)" }}>{n || "·"}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length === 0 ? <div style={{ fontSize: 13, color: "var(--mr-muted)", padding: "12px 4px" }}>No visits on this day.</div> : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `110px repeat(${cols.length}, minmax(230px, 1fr))`, gap: 8, minWidth: 0 }}>
            <div />
            {cols.map((t) => <div key={t || "none"} style={{ fontSize: 13, fontWeight: 700, padding: "2px 4px", color: t ? "var(--mr-text)" : "var(--mr-bad)" }}>{t ? `🔧 ${t}` : "Not assigned"} <span style={{ color: "var(--mr-muted)", fontWeight: 400 }}>{shown.filter((r) => (r.assignedTo || "") === t).length}</span></div>)}
            {ROWS.filter((w) => w.id !== "express" || shown.some((r) => visitSlot(r).win === "express")).map((w) => (
              <React.Fragment key={w.id}>
                <div style={{ fontSize: 12, color: "var(--mr-muted)", paddingTop: 8 }}>{w.label}</div>
                {cols.map((t) => (
                  <div key={t || "none"} style={{ background: "var(--mr-surface-2)", borderRadius: 12, padding: 8, minHeight: 40 }}>
                    {shown.filter((r) => visitSlot(r).win === w.id && (r.assignedTo || "") === t).map(card)}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Fix what the customer typed (address, postcode, phone) and leave a note for the technician.
function VisitEdit({ r, onCancel, onSave }) {
  const [f, setF] = useState({ address: r.address || "", postcode: r.postcode || "", phone: r.phone || "", visitNote: r.visitNote || "" });
  const inp = { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 8, border: "1px solid var(--mr-line)", background: "var(--mr-surface-2)", color: "var(--mr-text)", fontSize: 12.5, fontFamily: "inherit", marginTop: 4 };
  const set = (k) => (e) => setF({ ...f, [k]: k === "postcode" ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value });
  return (
    <div style={{ marginTop: 6 }}>
      <input value={f.address} onChange={set("address")} placeholder="Street address" aria-label="Address" style={inp} />
      <div style={{ display: "flex", gap: 6 }}>
        <input value={f.postcode} onChange={set("postcode")} placeholder="Postcode" aria-label="Postcode" inputMode="numeric" style={{ ...inp, width: 90 }} />
        <input value={f.phone} onChange={set("phone")} placeholder="Phone" aria-label="Phone" type="tel" style={inp} />
      </div>
      <input value={f.visitNote} onChange={set("visitNote")} placeholder="Note for the technician (gate code, parking, unit no.)" aria-label="Note for the technician" style={inp} />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button type="button" onClick={() => onSave({ address: f.address.trim(), postcode: f.postcode, phone: f.phone.trim(), visitNote: f.visitNote.trim() })} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "var(--mr-brand-fill)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
        <button type="button" onClick={onCancel} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--mr-line)", background: "transparent", color: "var(--mr-text)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}
