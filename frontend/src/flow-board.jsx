// A flow as a board: one column per step, how long each item has sat at its step
// (red once it's been there too long), and the next action on the card. Used for
// trade-ins, stock and web orders (the repair bench has its own, with job-specific steps).
import React, { useState } from "react";

const ago = (ms) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
};
export const lastTime = (...vals) => vals.map((v) => Date.parse(v || "")).filter((n) => !isNaN(n)).sort((a, b) => b - a)[0] || Date.now();

// columns: [{ id, label, lateDays? }]; colOf(item) -> column id or null (not shown);
// since(item) -> ms when it reached this step; card(item) -> { title, sub, right, chips: [[text, tone]],
// actions: [{ label, onClick, tone: "primary" | "ok" | "plain" }] }; onOpen(item) opens it.
export default function FlowBoard({ columns, items, colOf, since, card, onOpen, keyOf = (x) => x.id }) {
  const [busy, setBusy] = useState("");
  const tone = (t) => (t === "ok" ? { background: "var(--mr-ok)", color: "#fff", border: "none" }
    : t === "plain" ? { background: "transparent", color: "var(--mr-text)", border: "1px solid var(--mr-line)" }
      : { background: "var(--mr-brand-fill)", color: "#fff", border: "none" });
  const chipTone = { bad: "var(--mr-bad)", ok: "var(--mr-ok)", brand: "var(--mr-brand)", muted: "var(--mr-muted)" };
  return (
    <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(190px, 1fr)", gap: 10, overflowX: "auto", paddingBottom: 6, scrollSnapType: "x mandatory", marginBottom: 14 }}>
      {columns.map((c) => {
        const list = items.filter((x) => colOf(x) === c.id).sort((a, b) => since(a) - since(b));
        return (
          <div key={c.id} style={{ background: "var(--mr-surface-2)", borderRadius: 14, padding: 10, scrollSnapAlign: "start", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, margin: "2px 4px 8px" }}><span>{c.label}</span><span style={{ color: "var(--mr-muted)" }}>{list.length}</span></div>
            {list.length === 0 && <div style={{ fontSize: 12, color: "var(--mr-muted)", padding: "6px 4px" }}>Nothing here</div>}
            {list.map((x) => {
              const k = keyOf(x), d = card(x), t = since(x), late = c.lateDays != null && Date.now() - t > c.lateDays * 864e5;
              return (
                <div key={k} style={{ background: "var(--mr-surface)", border: "1px solid var(--mr-line)", borderRadius: 12, padding: 10, marginBottom: 8 }}>
                  <button type="button" onClick={() => onOpen(x)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 12, color: "var(--mr-muted)" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.right || k}</span>
                      <span style={{ color: late ? "var(--mr-bad)" : "var(--mr-muted)", fontWeight: late ? 700 : 400, whiteSpace: "nowrap" }} title="Time at this step">⏱ {ago(t)}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--mr-text)", margin: "3px 0 1px" }}>{d.title}</div>
                    {d.sub && <div style={{ fontSize: 12.5, color: "var(--mr-muted)" }}>{d.sub}</div>}
                    {d.chips && d.chips.length > 0 && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                        {d.chips.map(([txt, tn]) => <span key={txt} style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, border: `1px solid ${chipTone[tn] || chipTone.muted}`, color: chipTone[tn] || chipTone.muted }}>{txt}</span>)}
                      </div>
                    )}
                  </button>
                  {d.actions && d.actions.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {d.actions.map((a) => (
                        <button key={a.label} type="button" disabled={busy === k} onClick={async () => { setBusy(k); try { await a.onClick(); } finally { setBusy(""); } }}
                          style={{ flex: 1, padding: "7px 8px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...tone(a.tone) }}>{a.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// The numbers row above a board: [[label, value, sub]].
export function StatTiles({ tiles }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
      {tiles.map(([k, v, sub]) => (
        <div key={k} style={{ border: "1px solid var(--mr-line)", borderRadius: 12, padding: "12px 14px", background: "var(--mr-surface)" }}>
          <div style={{ fontSize: 12, color: "var(--mr-muted)" }}>{k}</div>
          <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums", margin: "2px 0" }}>{v}</div>
          {sub && <div style={{ fontSize: 11.5, color: "var(--mr-muted)" }}>{sub}</div>}
        </div>
      ))}
    </div>
  );
}

// Board / List switch, remembered per screen on this device.
export function useLayout(key, initial = "board") {
  const [v, setV] = useState(() => { try { return localStorage.getItem(key) || initial; } catch (e) { return initial; } });
  const set = (x) => { setV(x); try { localStorage.setItem(key, x); } catch (e) { /* this visit only */ } };
  return [v, set];
}
export function LayoutSwitch({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      {[["board", "▦ Board"], ["list", "☰ List"]].map(([k, lbl]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${value === k ? "var(--mr-brand)" : "var(--mr-line)"}`, background: value === k ? "var(--mr-brand-soft)" : "transparent", color: value === k ? "var(--mr-brand)" : "var(--mr-text)" }}>{lbl}</button>
      ))}
    </div>
  );
}
