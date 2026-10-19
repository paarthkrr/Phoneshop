import React, { useState, useEffect } from "react";

// Pricing Console → Market: what Mobile Monster and Phone Exchange pay for the
// same phones, and suggested changes to each model's "market adj %".
// The server (backend/market.js) does the check weekly, or on "Check now".
// Nothing changes until someone accepts a suggestion here.
const SOURCE_LABEL = { mobilemonster: "Mobile Monster", phoneexchange: "Phone Exchange", cashconverters: "Cash Converters" };
const COND_LABEL = { new: "Sealed", asnew: "Like new", good: "Good" };

async function api(path, opts = {}) {
  const res = await fetch(`${window.SHOP_API_BASE_URL}${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${window.shopAuth.authToken()}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong");
  return body;
}
async function loadShared(key) {
  try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : null; } catch (e) { return null; }
}

// onApply(changes) -> Promise<bool>; changes = [{ brand, model, from, to, note }]
// onPosition(pct) -> Promise<bool> saves "pay X% vs competitors" in the price list
export default function MarketTab({ colors, position = 0, onApply, onPosition }) {
  const { panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const live = typeof window !== "undefined" && window.SHOP_API_BASE_URL && window.shopAuth;
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [pos, setPos] = useState(String(position));
  const [open, setOpen] = useState(null);
  const [excluded, setExcluded] = useState([]);

  useEffect(() => { (async () => setCheck((await loadShared("market_check")) || false))(); }, []);
  useEffect(() => { setPos(String(position)); }, [position]);

  async function runCheck() {
    setBusy("check"); setMsg("");
    try { setCheck(await api("/market/check", { method: "POST", body: "{}" })); }
    catch (e) { setMsg(e.message); }
    setBusy("");
  }
  async function record(items, decision) {
    const list = (await loadShared("market_decisions")) || [];
    const at = new Date().toISOString();
    const add = items.map((s) => ({ id: `MKD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at, brand: s.brand, model: s.model, from: s.current, suggested: s.suggested, decision }));
    try { await window.storage.set("market_decisions", JSON.stringify([...add, ...list].slice(0, 500)), true); } catch (e) { /* the decision itself still applies */ }
  }
  async function dropFromCheck(ids) {
    const next = { ...check, suggestions: check.suggestions.filter((s) => !ids.includes(s.id)) };
    setCheck(next);
    try { await window.storage.set("market_check", JSON.stringify(next), true); } catch (e) { /* refreshed on the next check */ }
  }
  async function accept(items) {
    if (!items.length) return;
    setBusy("apply"); setMsg("");
    const ok = await onApply(items.map((s) => ({ brand: s.brand, model: s.model, from: s.current, to: s.suggested,
      note: `market check: competitors ${s.sources.map((x) => `${SOURCE_LABEL[x.id] || x.id} ${x.pct > 0 ? "+" : ""}${x.pct}%`).join(", ")}` })));
    if (ok) { await record(items, "accepted"); await dropFromCheck(items.map((s) => s.id)); setMsg(`✓ Updated ${items.length} model${items.length === 1 ? "" : "s"}. Quotes use the new prices straight away.`); }
    else setMsg("Couldn't save the price list. Check your connection and try again.");
    setBusy("");
  }
  async function ignore(s) { await record([s], "ignored"); await dropFromCheck([s.id]); }

  if (!live) return <div style={{ color: muted, fontSize: 13 }}>The market check needs the live server.</div>;
  if (check === null) return <div style={{ color: muted, fontSize: 13 }}>Loading…</div>;

  const suggestions = (check && check.suggestions) || [];
  const safe = suggestions.filter((s) => s.safe);
  const btn = (bg, fg, border) => ({ padding: "8px 12px", borderRadius: 3, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${border || bg}`, background: bg, color: fg, fontFamily: "inherit" });
  const money = (n) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, lineHeight: 1.6, marginBottom: 14, padding: 10, border: `1px dashed ${line}`, borderRadius: 3 }}>
        Every week the server reads what <strong>Mobile Monster</strong> and <strong>Phone Exchange</strong> pay for the same phones (sealed, like new and good)
        and compares it with your own quotes. Suggestions change a model's <em>market adj %</em>, at most 10% per check, so a big gap closes over a few weeks.
        <strong> Safe</strong> means both competitors agree. Nothing changes until you accept.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <button onClick={runCheck} disabled={!!busy} style={btn("transparent", brass, brass)}>{busy === "check" ? "Checking…" : "Check now"}</button>
        <button onClick={async () => { setBusy("all"); setMsg("Checking all devices..."); try { const r = await api("/market/check-all", { method: "POST", body: "{}" }); setCheck(r); setMsg(`✓ Checked ${r.checked || 0} devices`); } catch(e) { setMsg(e.message); } setBusy(""); }} disabled={!!busy} style={btn("transparent", paper, line)}>{busy === "all" ? "Checking all…" : "Check all devices"}</button>
        <span style={{ fontSize: 12.5, color: muted }}>
          {check ? <>Last checked {new Date(check.checkedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}{check.by ? ` (${check.by})` : ""}</> : "Not checked yet"}
        </span>
        <label style={{ marginLeft: "auto", fontSize: 12.5, color: muted, display: "flex", gap: 6, alignItems: "center" }}>
          Pay
          <input type="number" value={pos} onChange={(e) => setPos(e.target.value)} style={{ width: 64, padding: "6px 8px", border: `1px solid ${line}`, borderRadius: 3, background: panel2, color: paper }} aria-label="Percent versus competitors" />
          % vs competitors
          <button onClick={async () => { setBusy("pos"); const ok = await onPosition(Math.max(-20, Math.min(20, Number(pos) || 0))); setBusy(""); setMsg(ok ? "Saved. Run “Check now” to see suggestions with it." : "Couldn't save."); }}
            disabled={!!busy || Number(pos) === Number(position)} style={btn("transparent", paper, line)}>Save</button>
        </label>
      </div>

      {check && check.sources && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {check.sources.map((s) => (
            <a key={s.id} href={s.site} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: "4px 9px", borderRadius: 999, textDecoration: "none", border: `1px solid ${s.ok ? green : red}`, color: s.ok ? green : red }}>
              {s.ok ? "✓" : "✗"} {s.name}{s.ok ? ` · ${s.count} prices${s.fromSnapshot ? " (backup file)" : ""}` : ` · ${s.error || "unavailable"}`}
            </a>
          ))}
          {check.inLine > 0 && <span style={{ fontSize: 12, color: muted, padding: "4px 0" }}>{check.inLine} already in line</span>}
          {check.notFound > 0 && <span style={{ fontSize: 12, color: muted, padding: "4px 0" }}>· {check.notFound} not priced by these competitors</span>}
        </div>
      )}

      {msg && <div role="status" style={{ fontSize: 13, marginBottom: 12, color: msg.startsWith("✓") ? green : red }}>{msg}</div>}

      {check && suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12, padding: 10, background: brassDim, borderRadius: 3 }}>
          <span style={{ fontSize: 13 }}><strong>{suggestions.length}</strong> suggestion{suggestions.length === 1 ? "" : "s"} · <strong>{safe.length}</strong> safe</span>
          <button disabled={!!busy || !safe.length} onClick={() => { if (window.confirm(`Apply all ${safe.length} safe suggestions? Each model moves at most 10%. Flagged ones are left for you to check one by one.`)) accept(safe); }}
            style={{ ...btn(brass, "#fff"), opacity: safe.length ? 1 : 0.5 }}>{busy === "apply" ? "Applying…" : `Apply all safe (${safe.length})`}</button>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {["mobilemonster", "phoneexchange", "cashconverters"].map(src => (
              <label key={src} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <input type="checkbox" checked={!excluded.includes(src)} onChange={e => setExcluded(e.target.checked ? excluded.filter(x => x !== src) : [...excluded, src])} />
                {SOURCE_LABEL[src]}
              </label>
            ))}
            <button disabled={!!busy || !suggestions.length} onClick={async () => { 
              const included = ["mobilemonster", "phoneexchange", "cashconverters"].filter(s => !excluded.includes(s));
              if (!included.length) return alert("Select at least one competitor");
              if (window.confirm(`Apply average of ${included.map(s => SOURCE_LABEL[s]).join(", ")} to ${suggestions.length} models?`)) { 
                setBusy("avg"); 
                const avgChanges = suggestions.map(s => {
                  const sources = s.sources.filter(x => !excluded.includes(x.id));
                  if (!sources.length) return null;
                  const avgRatio = sources.reduce((a, x) => a + (x.ratio || 1), 0) / sources.length;
                  const suggested = Math.round((avgRatio - 1) * 100);
                  return { brand: s.brand, model: s.model, from: s.current, to: Math.max(-60, Math.min(30, suggested)), note: `average of ${included.join(", ")}` };
                }).filter(Boolean); 
                const ok = await onApply(avgChanges); 
                setBusy(""); 
                setMsg(ok ? `✓ Applied average to ${avgChanges.length} models` : "Couldn't apply"); 
              } 
            }}
              style={{ ...btn(green, "#fff"), opacity: suggestions.length ? 1 : 0.5 }}>{busy === "avg" ? "Applying…" : `Apply average (${suggestions.length})`}</button>
          </div>
          <button disabled={!!busy || !suggestions.length} onClick={async () => { if (window.confirm(`Apply ALL ${suggestions.length} suggestions? This will update all models at once.`)) { setBusy("all"); const allChanges = suggestions.map(s => ({ brand: s.brand, model: s.model, from: s.current, to: s.suggested, note: "applied all" })); const ok = await onApply(allChanges); setBusy(""); setMsg(ok ? `✓ Applied all ${allChanges.length} suggestions` : "Couldn't apply"); } }}
            style={{ ...btn(red, "#fff"), opacity: suggestions.length ? 1 : 0.5 }}>{busy === "all" ? "Applying…" : `Apply ALL (${suggestions.length})`}</button>
        </div>
      )}
      {check && !suggestions.length && <div style={{ fontSize: 13, color: muted }}>No suggestions right now: your prices are in line with the market, or you've already dealt with them.</div>}

      {suggestions.map((s) => {
        const ex = s.rows && s.rows[0];
        const isOpen = open === s.id;
        return (
          <div key={s.id} style={{ border: `1px solid ${s.safe ? line : red}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: "1 1 220px" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.brand} {s.model} {s.safe ? <span style={{ fontSize: 11, color: green, border: `1px solid ${green}`, borderRadius: 999, padding: "1px 7px", marginLeft: 4 }}>safe</span> : <span style={{ fontSize: 11, color: red, border: `1px solid ${red}`, borderRadius: 999, padding: "1px 7px", marginLeft: 4 }}>check</span>}</div>
                <div style={{ fontSize: 12.5, color: muted }}>
                  Market {s.gapPct > 0 ? `pays ${s.gapPct}% more` : `pays ${-s.gapPct}% less`} than you ·
                  {" "}{s.sources.map((x) => `${SOURCE_LABEL[x.id] || x.id} ${x.pct > 0 ? "+" : ""}${x.pct}%`).join(" · ")}
                </div>
                {!s.safe && s.reasons.length > 0 && <div style={{ fontSize: 12, color: red }}>{s.reasons.join(" · ")}</div>}
              </div>
              <div style={{ fontSize: 13 }}>market adj <strong>{s.current}%</strong> → <strong style={{ color: s.suggested > s.current ? green : red }}>{s.suggested}%</strong></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setOpen(isOpen ? null : s.id)} style={btn("transparent", muted, line)}>{isOpen ? "Hide" : "Prices"}</button>
                <button disabled={!!busy} onClick={() => ignore(s)} style={btn("transparent", muted, line)}>Ignore</button>
                <button disabled={!!busy} onClick={() => accept([s])} style={btn(green, "#fff")}>Accept</button>
              </div>
            </div>
            {isOpen && ex && (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 360 }}>
                  <thead><tr style={{ color: muted, textAlign: "right" }}><th style={{ textAlign: "left", padding: "4px 10px 4px 0" }}>Storage</th><th style={{ padding: "4px 8px", textAlign: "left" }}>Condition</th><th style={{ padding: "4px 8px" }}>You pay</th>{Object.keys(SOURCE_LABEL).map((id) => <th key={id} style={{ padding: "4px 8px" }}>{SOURCE_LABEL[id]}</th>)}</tr></thead>
                  <tbody>
                    {s.rows.flatMap((r) => Object.keys(COND_LABEL).map((c, i) => (
                      <tr key={r.storage + c} style={{ borderTop: i === 0 ? `1px solid ${line}` : "none" }}>
                        <td style={{ padding: "3px 10px 3px 0" }}>{i === 0 ? r.storage : ""}</td>
                        <td style={{ padding: "3px 8px", color: muted }}>{COND_LABEL[c]}</td>
                        <td style={{ padding: "3px 8px", textAlign: "right", fontWeight: 600 }}>{money(r.ours[c])}</td>
                        {Object.keys(SOURCE_LABEL).map((id) => <td key={id} style={{ padding: "3px 8px", textAlign: "right" }}>{money(r.theirs[id] && r.theirs[id][c])}</td>)}
                      </tr>
                    )))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11.5, color: muted, marginTop: 4 }}>"You pay" is your quote with no faults, before the box-and-charger bonus.</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
