// /approve/<job>?k=<key>: the customer sees the repair price staff sent and approves or
// declines it in one tap. The key in the link is what lets them in (backend checks it).
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const paper = "var(--mr-text)", muted = "var(--mr-muted)", line = "var(--mr-line)", panel = "var(--mr-surface)";

export default function RepairApproval() {
  const { id } = useParams();
  const k = new URLSearchParams(window.location.search).get("k") || "";
  const [job, setJob] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = "Approve your repair | Mobile Recellr";
    const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex"; document.head.appendChild(m);
    return () => m.remove();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        if (!window.SHOP_API_BASE_URL) throw new Error("This link works on the live site.");
        const r = await fetch(`${window.SHOP_API_BASE_URL}/public/repair-approval/${encodeURIComponent(id)}?k=${encodeURIComponent(k)}`);
        if (r.status === 404) throw new Error("This link isn't valid any more. Please message us and we'll send a new one.");
        if (!r.ok) throw new Error("Couldn't load your repair. Please try again in a minute.");
        setJob(await r.json());
      } catch (e) { setErr(e.message); }
    })();
  }, [id, k]);

  const answer = async (decision) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${window.SHOP_API_BASE_URL}/public/repair-approval/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k, decision }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error === "this job is already closed" ? "This job is already finished." : "Couldn't save your answer. Please try again or message us.");
      setJob(j);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const btn = (bg, fg, border) => ({ flex: "1 1 160px", minHeight: 52, borderRadius: 14, border: border || "none", background: bg, color: fg, fontWeight: 700, fontSize: 16, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 });
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 16px 80px", color: paper, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: 28, margin: "0 0 18px" }}>Your repair price</h1>
      {!job && !err && <p style={{ color: muted }}>Loading…</p>}
      {err && <p role="alert" style={{ color: "var(--mr-bad)", fontSize: 15 }}>{err}</p>}
      {job && (
        <div style={{ border: `1px solid ${line}`, borderRadius: 16, padding: 20, background: panel }}>
          <div style={{ fontSize: 13, color: muted }}>Job {job.id}</div>
          <div style={{ fontSize: 19, fontWeight: 700, margin: "4px 0 6px" }}>{job.device}</div>
          {job.issue && <div style={{ fontSize: 15, color: muted, lineHeight: 1.5 }}>{job.issue}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${line}`, marginTop: 16, paddingTop: 14 }}>
            <span style={{ fontSize: 15 }}>Repair price</span>
            <span style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>${Number(job.price).toLocaleString()}</span>
          </div>
          {job.deposit > 0 && <div style={{ fontSize: 13.5, color: muted, textAlign: "right" }}>${job.deposit} deposit already paid, ${Math.max(0, job.price - job.deposit).toLocaleString()} left to pay on collection</div>}
          {job.decision === "approve" && <p style={{ color: "var(--mr-ok)", fontWeight: 700, fontSize: 16, marginBottom: 0 }}>✓ Approved. Thanks! We'll start the repair and message you when it's ready.</p>}
          {job.decision === "decline" && <p style={{ fontWeight: 600, fontSize: 15.5, marginBottom: 0 }}>You've declined this price. We won't do the repair; you can collect your device any time, or message us if you change your mind.</p>}
          {!job.decision && job.closed && <p style={{ color: muted, marginBottom: 0 }}>This job is already finished.</p>}
          {!job.decision && !job.closed && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <button type="button" disabled={busy} onClick={() => answer("approve")} style={btn("var(--mr-ok)", "#fff")}>Approve ${Number(job.price).toLocaleString()}</button>
                <button type="button" disabled={busy} onClick={() => answer("decline")} style={btn("transparent", paper, `1.5px solid ${line}`)}>Decline</button>
              </div>
              <p style={{ fontSize: 13, color: muted, marginBottom: 0 }}>Approving lets us start the work. You pay when you collect it. The repair has a 90-day warranty.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
