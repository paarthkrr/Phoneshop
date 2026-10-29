// Times on a repair job: when it's promised, when the customer is coming, and how
// they read on the bench ("in 2 h", "late 40 min"). Inputs work in the shop's local time.
import React from "react";

const pad = (n) => String(n).padStart(2, "0");
// ISO -> value for <input type="datetime-local">
export function toLocalInput(iso) {
  const d = new Date(iso || "");
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T17:00` : v); // a bare date means "by close"
  return isNaN(d) ? null : d.toISOString();
}

export function whenText(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  const d = new Date(t), today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(now + 864e5).toDateString() === d.toDateString();
  const clock = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  return sameDay ? `today ${clock}` : tomorrow ? `tomorrow ${clock}` : `${d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} ${clock}`;
}
// "in 2 h" / "late 40 min"
export function untilText(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  const m = Math.round((t - now) / 60000), a = Math.abs(m);
  const span = a < 60 ? `${a} min` : a < 48 * 60 ? `${Math.round(a / 60)} h` : `${Math.round(a / 1440)} days`;
  return m < 0 ? `late ${span}` : `in ${span}`;
}

function quick(now = new Date()) {
  const at = (days, h) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  const plus = (mins) => { const d = new Date(now.getTime() + mins * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d; };
  return [["1 h", plus(60)], ["2 h", plus(120)], ["Today 5pm", at(0, 17)], ["Tomorrow 12pm", at(1, 12)], ["Tomorrow 5pm", at(1, 17)]]
    .filter(([, d]) => d > now);
}

// A time field with one-tap picks. value/onChange use ISO strings (or null).
export default function TimePick({ value, onChange, label, inputStyle }) {
  const chip = { padding: "5px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--mr-line)", background: "transparent", color: "var(--mr-text)" };
  return (
    <div style={{ fontSize: 12, color: "var(--mr-muted)" }}>
      {label}
      <input type="datetime-local" value={toLocalInput(value)} onChange={(e) => onChange(fromLocalInput(e.target.value))} aria-label={label} style={inputStyle} />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: -4, marginBottom: 10 }}>
        {quick().map(([l, d]) => <button key={l} type="button" style={chip} onClick={() => onChange(d.toISOString())}>{l}</button>)}
        {value && <button type="button" style={{ ...chip, color: "var(--mr-muted)" }} onClick={() => onChange(null)}>Clear</button>}
      </div>
    </div>
  );
}
