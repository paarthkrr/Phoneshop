// Reports › Website: how many people looked, started, saw a price and sent it, from our
// own counts (backend/analytics.js). Each bar is a share of the step before it, so the
// leakiest step stands out.
import React, { useEffect, useState } from "react";

const PERIODS = [7, 30, 90];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export default function WebsiteFunnel({ colors }) {
  const { line, muted, brass, paper } = colors;
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        if (!window.SHOP_API_BASE_URL || !window.shopAuth) { setErr("Website counts show on the live site."); return; }
        const r = await fetch(`${window.SHOP_API_BASE_URL}/analytics/funnel?days=${days}`, { headers: { Authorization: `Bearer ${window.shopAuth.authToken()}` } });
        if (!r.ok) throw new Error(r.status === 403 ? "Only the owner and managers can see this." : "Couldn't load the website counts.");
        const j = await r.json(); if (on) { setData(j); setErr(""); }
      } catch (e) { if (on) setErr(e.message); }
    })();
    return () => { on = false; };
  }, [days]);

  const box = { border: `1px solid ${line}`, borderRadius: 3, padding: 16, marginBottom: 16 };
  const Funnel = ({ title, steps }) => {
    const top = Math.max(1, data.totals[steps[0]]);
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{title}</div>
        {steps.map((k, i) => {
          const n = data.totals[k], prev = i ? data.totals[steps[i - 1]] : null;
          return (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr auto", gap: 10, alignItems: "center", fontSize: 13, marginBottom: 5 }}>
              <span>{data.labels[k]}</span>
              <span style={{ height: 12, borderRadius: 999, background: "var(--mr-surface-2)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.max(2, (n / top) * 100)}%`, background: "var(--mr-brand-fill)", borderRadius: 999 }} />
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}><b>{n.toLocaleString()}</b>{prev != null && <span style={{ color: muted }}> · {pct(n, prev)}%</span>}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: muted }}>Website, last {days} days (our own counts, no cookies)</div>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIODS.map((d) => <button key={d} type="button" onClick={() => setDays(d)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", border: `1px solid ${d === days ? brass : line}`, background: d === days ? "var(--mr-brand-soft)" : "transparent", color: d === days ? brass : paper }}>{d} days</button>)}
        </div>
      </div>
      {err && <div style={{ fontSize: 13, color: muted }}>{err}</div>}
      {!err && !data && <div style={{ fontSize: 13, color: muted }}>Loading…</div>}
      {data && (
        <>
          <div style={{ fontSize: 13, marginBottom: 12 }}><b>{data.totals.view.toLocaleString()}</b> page views · <b>{data.totals.repair_submit.toLocaleString()}</b> repair bookings</div>
          <Funnel title="Selling to us" steps={data.funnels.sell} />
          <Funnel title="Buying a phone" steps={data.funnels.buy} />
          {data.pages.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0" }}>Most viewed pages</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.pages.map((p) => <span key={p.path} style={{ fontSize: 12.5, padding: "4px 10px", border: `1px solid ${line}`, borderRadius: 999 }}>{p.path} <b>{p.n}</b></span>)}
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: muted, marginTop: 10 }}>Counting started when this was switched on, so early numbers are small. The % is the share of the step before.</div>
        </>
      )}
    </div>
  );
}
