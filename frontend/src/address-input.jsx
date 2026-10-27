// Address box with suggestions as you type (Google Places when the shop has a key,
// OpenStreetMap otherwise; both through our own server, /public/address). Picking a
// suggestion fills the whole address and hands back suburb, postcode and state.
// Typing a full address by hand still works exactly as before.
import React, { useEffect, useRef, useState } from "react";

const newSession = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function AddressInput({ value, onChange, onPick, placeholder = "Start typing your address", ariaLabel = "Address", style, autoComplete = "street-address" }) {
  const [items, setItems] = useState([]);
  const [provider, setProvider] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const session = useRef(newSession());
  const lastQ = useRef("");
  const picked = useRef(false);
  const listId = useRef("addr-" + Math.random().toString(36).slice(2, 8)).current;

  useEffect(() => {
    const q = String(value || "").trim();
    if (picked.current) { picked.current = false; return undefined; }
    if (q.length < 3) { setItems([]); setOpen(false); return undefined; }
    const t = setTimeout(async () => {
      lastQ.current = q;
      try {
        const base = window.SHOP_API_BASE_URL || "";
        const r = await fetch(`${base}/public/address?q=${encodeURIComponent(q)}&session=${session.current}`);
        const j = r.ok ? await r.json() : { suggestions: [] };
        if (lastQ.current !== q) return; // an older answer arriving late
        setItems(j.suggestions || []); setProvider(j.provider || null); setActive(-1); setOpen((j.suggestions || []).length > 0);
      } catch (e) { setItems([]); setOpen(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  async function choose(s) {
    setOpen(false); setItems([]);
    let picked_ = s.address ? { address: s.address, suburb: s.suburb || "", postcode: s.postcode || "", state: s.state || "" } : null;
    if (!picked_ && s.id) {
      setBusy(true);
      try {
        const base = window.SHOP_API_BASE_URL || "";
        const r = await fetch(`${base}/public/address/details?id=${encodeURIComponent(s.id)}&session=${session.current}`);
        if (r.ok) picked_ = await r.json();
      } catch (e) { /* fall back to the suggestion's own text */ }
      setBusy(false);
    }
    if (!picked_) picked_ = { address: s.label, suburb: "", postcode: (s.label.match(/\b(\d{4})\b/) || [])[1] || "", state: "" };
    picked.current = true;
    onChange(picked_.address);
    onPick && onPick(picked_);
    session.current = newSession(); // Google bills one session per search ending in a pick
  }

  function onKeyDown(e) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={placeholder} aria-label={ariaLabel} autoComplete={autoComplete}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        style={style} />
      {busy && <span style={{ position: "absolute", right: 12, top: 14, fontSize: 12, color: "var(--mr-muted)" }}>…</span>}
      {open && (
        <ul id={listId} role="listbox" style={{ position: "absolute", zIndex: 60, left: 0, right: 0, top: "calc(100% - 10px)", margin: 0, padding: "6px 0", listStyle: "none",
          background: "var(--mr-surface)", border: "1px solid var(--mr-line)", borderRadius: 12, boxShadow: "0 14px 34px rgba(15,22,38,.14)", maxHeight: 300, overflowY: "auto" }}>
          {items.map((s, i) => (
            <li key={s.id || s.label} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }} onMouseEnter={() => setActive(i)}
              style={{ padding: "10px 14px", cursor: "pointer", background: i === active ? "var(--mr-surface-2)" : "transparent", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span aria-hidden="true" style={{ color: "var(--mr-brand)", marginTop: 1 }}>📍</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--mr-text)" }}>{s.main || s.label}</span>
                {s.secondary && <span style={{ display: "block", fontSize: 12.5, color: "var(--mr-muted)" }}>{s.secondary}</span>}
              </span>
            </li>
          ))}
          <li aria-hidden="true" style={{ padding: "6px 14px 2px", fontSize: 10.5, color: "var(--mr-muted)", textAlign: "right" }}>
            {provider === "google" ? "powered by Google" : "© OpenStreetMap contributors"}
          </li>
        </ul>
      )}
    </div>
  );
}
