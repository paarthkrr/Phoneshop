import React, { useState, useEffect } from "react";

// Activity: every change staff make in the portal (Owner only). Important
// changes are also emailed to the owner, bundled every couple of minutes.
const paper = "#111827", muted = "#5B6472", brass = "#2150C8", red = "#8B2E2E", line = "#E2E6EC", panel2 = "#F4F6F9";
const ROLE = { admin: "Owner", manager: "Manager", staff: "Counter", technician: "Technician" };
const VERB = { added: "Added", changed: "Changed", removed: "Deleted", note: "" };

async function api(path) {
  const res = await fetch(`${window.SHOP_API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${window.shopAuth.authToken()}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong");
  return body;
}

export default function Activity() {
  const live = typeof window !== "undefined" && window.shopAuth && window.SHOP_API_BASE_URL;
  const [filters, setFilters] = useState({ user: "", area: "", important: false });
  const [rows, setRows] = useState(null);
  const [areas, setAreas] = useState({});
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");

  const query = (before) => {
    const q = new URLSearchParams();
    if (filters.user.trim()) q.set("user", filters.user.trim());
    if (filters.area) q.set("area", filters.area);
    if (filters.important) q.set("important", "1");
    if (before) q.set("before", before);
    return `/activity?${q}`;
  };
  async function load(before) {
    setErr("");
    try {
      const r = await api(query(before));
      setAreas(r.areas || {});
      setRows((cur) => (before ? [...(cur || []), ...r.entries] : r.entries));
      setMore(r.entries.length === 100);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (live) load(); }, [filters.area, filters.important]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!live) return <Wrap><div style={{ color: muted }}>The activity log needs the live server.</div></Wrap>;
  const sel = { padding: "11px 12px", borderRadius: 10, border: `1px solid ${line}`, background: panel2, fontSize: 15, fontFamily: "inherit", color: paper };
  return (
    <Wrap>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input style={{ ...sel, flex: "1 1 160px" }} placeholder="Person (username)" aria-label="Filter by person" value={filters.user}
          onChange={(e) => setFilters({ ...filters, user: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") load(); }} onBlur={() => load()} />
        <select style={{ ...sel, flex: "1 1 180px" }} aria-label="Filter by area" value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })}>
          <option value="">Everything</option>
          {Object.entries(areas).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, cursor: "pointer" }}>
          <input type="checkbox" checked={filters.important} onChange={(e) => setFilters({ ...filters, important: e.target.checked })} style={{ width: 18, height: 18 }} /> Important only
        </label>
      </div>
      {err && <div role="alert" style={{ color: red, marginBottom: 12 }}>{err}</div>}
      {!rows ? <div style={{ color: muted }}>Loading…</div> : !rows.length ? <div style={{ color: muted }}>Nothing yet. Changes appear here as the team works.</div> : (
        <div>
          {rows.map((r) => <Entry key={r.id} r={r} area={areas[r.area] || r.area} />)}
          {more && <button onClick={() => load(rows[rows.length - 1].id)} style={{ padding: "12px 18px", borderRadius: 10, border: `1px solid ${line}`, background: "#fff", color: brass, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>Show older</button>}
        </div>
      )}
    </Wrap>
  );
}

function Entry({ r, area }) {
  const changes = Array.isArray(r.changes) ? r.changes : [];
  return (
    <div style={{ borderTop: `1px solid ${line}`, padding: "12px 0", ...(r.important ? { borderLeft: `3px solid ${red}`, paddingLeft: 10 } : {}) }}>
      <div style={{ fontSize: 13, color: muted, marginBottom: 3 }}>
        {new Date(r.at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} · <strong style={{ color: paper }}>{r.username}</strong> ({ROLE[r.role] || r.role}) · {area}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{[VERB[r.action] ?? r.action, r.summary].filter(Boolean).join(" ")}</div>
      {r.important && <div style={{ fontSize: 13.5, color: red, fontWeight: 700, marginTop: 2 }}>⚑ {r.important} (emailed to owner)</div>}
      {changes.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13.5, color: paper, lineHeight: 1.6 }}>
          {changes.map((c, i) => <li key={i}><code style={{ fontSize: 12.5 }}>{c.field}</code>: {c.hidden ? <em>changed (hidden for privacy)</em> : <>{c.from} → <strong>{c.to}</strong></>}</li>)}
        </ul>
      )}
    </div>
  );
}

function Wrap({ children }) {
  return (
    <div style={{ background: "#fff", color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, marginBottom: 6 }}>Activity</div>
        <div style={{ color: muted, fontSize: 15, marginBottom: 20, lineHeight: 1.6 }}>Every change the team makes in the portal. Important ones (payouts, prices, deletions, bank details, expenses, write-offs, team changes) are also emailed to you. Bank and ID details are never shown here.</div>
        {children}
      </div>
    </div>
  );
}
