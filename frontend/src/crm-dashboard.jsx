import React, { useState, useEffect, useMemo } from "react";

/* =================================================================
   CRM + REPORTING
   Reads the same shared orders/sales/inventory records everything
   else writes to. No separate "CRM database" — a customer's history
   here is a live view over the same transactions, not a copy that
   can drift out of sync.
================================================================= */

const REGIONS = {
  AU: { symbol: "A$", round: 1 }, US: { symbol: "$", round: 1 }, UK: { symbol: "£", round: 1 },
  IN: { symbol: "₹", round: 10 }, AE: { symbol: "AED ", round: 1 },
};
function fmt(n, regionCode) {
  const r = REGIONS[regionCode] || REGIONS.AU;
  const val = r.round >= 10 ? Math.round(n / r.round) * r.round : Math.round(n || 0);
  return `${r.symbol}${val.toLocaleString()}`;
}
function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared) {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(key, shared);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function saveJSON(key, value, shared) {
  if (!storageAvailable()) return false;
  try { await window.storage.set(key, JSON.stringify(value), shared); return true; } catch (e) { return false; }
}

const ORDER_STATUSES = ["awaiting_shipment", "received_inspecting", "revised_pending_customer", "approved_paid", "returned"];
const TABS = ["Customers", "Reports", "Expenses", "Leads & Notifications"];
const EXPENSE_CATEGORIES = ["Rent", "Wages", "Utilities", "Supplies", "Marketing", "Insurance", "Other"];

export default function CRMDashboard() {
  const [orders, setOrders] = useState(null);
  const [sales, setSales] = useState(null);
  const [leads, setLeads] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [bulkRequests, setBulkRequests] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [tillRecords, setTillRecords] = useState([]);
  const [tab, setTab] = useState("Customers");
  const [search, setSearch] = useState("");
  const [openCustomer, setOpenCustomer] = useState(null);

  useEffect(() => {
    (async () => {
      const [o, s, l, n, e, inv, bulk, ref, till] = await Promise.all([loadJSON("orders", true), loadJSON("sales", true), loadJSON("quote_leads", true), loadJSON("notification_queue", true), loadJSON("expenses", true), loadJSON("inventory", true), loadJSON("bulk_quote_requests", true), loadJSON("referrals", true), loadJSON("till_records", true)]);
      setOrders(o); setSales(s); setLeads(l); setNotifications(n); setExpenses(e); setInventory(inv); setBulkRequests(bulk); setReferrals(ref); setTillRecords(till);
    })();
  }, []);
  async function addExpense(exp) {
    const next = [{ id: "EXP-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), ...exp }, ...expenses];
    await saveJSON("expenses", next, true); setExpenses(next);
  }
  async function deleteExpense(id) {
    const next = expenses.filter((e) => e.id !== id);
    await saveJSON("expenses", next, true); setExpenses(next);
  }

  const customers = useMemo(() => {
    if (!orders || !sales) return [];
    const map = new Map();
    const keyFor = (email, name) => (email && email.trim() ? email.trim().toLowerCase() : "name:" + (name || "unknown").trim().toLowerCase());

    orders.forEach((o) => {
      const key = keyFor(o.customer?.email, o.customer?.name);
      if (!map.has(key)) map.set(key, { key, name: o.customer?.name || "Unknown", email: o.customer?.email || "", phone: o.customer?.phone || "", timeline: [], paidToThem: 0, paidByThem: 0 });
      const c = map.get(key);
      const amount = o.status === "approved_paid" ? (o.inspection?.confirmedTotal ?? o.quotedTotal) : null;
      if (amount != null) c.paidToThem += amount;
      c.timeline.push({ type: "sold_to_us", date: o.createdAt, amount: o.inspection?.confirmedTotal ?? o.quotedTotal, device: `${o.device.brand} ${o.device.model} ${o.device.storage}`, status: o.status, ref: o.id, region: o.region });
    });

    sales.forEach((s) => {
      const key = keyFor(s.customerEmail, s.customerName);
      if (!map.has(key)) map.set(key, { key, name: s.customerName || "Unknown", email: s.customerEmail || "", phone: "", timeline: [], paidToThem: 0, paidByThem: 0 });
      const c = map.get(key);
      c.paidByThem += s.salePrice || 0;
      c.timeline.push({ type: "bought_from_us", date: s.soldAt, amount: s.salePrice, device: `${s.brand} ${s.model} ${s.storage}`, status: "completed", ref: s.id, region: s.region });
    });

    const list = [...map.values()].map((c) => {
      c.timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
      c.lastActivity = c.timeline[0]?.date;
      c.transactionCount = c.timeline.length;
      c.repeat = c.transactionCount > 1;
      return c;
    });
    list.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    return list;
  }, [orders, sales]);

  const filteredCustomers = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  const report = useMemo(() => {
    if (!orders || !sales) return null;

    // Revenue vs payouts, grouped by month (YYYY-MM)
    const months = new Map();
    const bump = (map, key, field, amt) => {
      if (!map.has(key)) map.set(key, { payouts: 0, revenue: 0 });
      map.get(key)[field] += amt;
    };
    orders.filter((o) => o.status === "approved_paid").forEach((o) => {
      const m = (o.inspection?.inspectedAt || o.createdAt).slice(0, 7);
      bump(months, m, "payouts", o.inspection?.confirmedTotal ?? o.quotedTotal);
    });
    sales.forEach((s) => { bump(months, s.soldAt.slice(0, 7), "revenue", s.salePrice); });
    const monthly = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, ...v }));

    // Realized margin from sales that carry a costBasis
    const withCost = sales.filter((s) => typeof s.costBasis === "number");
    const totalRevenue = withCost.reduce((sum, s) => sum + s.salePrice, 0);
    const totalCost = withCost.reduce((sum, s) => sum + s.costBasis, 0);
    const marginPct = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : null;

    // True P&L: gross profit (revenue - cost of goods) minus real operating
    // expenses. This is the number that actually answers "did we make
    // money," as opposed to margin, which only looks at per-device profit.
    const grossProfit = totalRevenue - totalCost;
    const totalExpenses = (expenses || []).reduce((sum, e) => sum + e.amount, 0);
    const writtenOffLoss = (inventory || []).filter((i) => i.status === "written_off").reduce((sum, i) => sum + (i.costBasis || 0), 0);
    // Standard bookkeeping treatment: cash "over and short" nets both ways —
    // a shortfall is a real loss, an overage is real (if unexplained) extra
    // cash. Summing signed discrepancies gives the correct net effect either way.
    const tillVariance = (tillRecords || []).filter((r) => r.closed).reduce((sum, r) => sum + (r.discrepancy || 0), 0);
    const netProfit = grossProfit - totalExpenses - writtenOffLoss + tillVariance;

    // Inspection accuracy: how far off were quotes from confirmed inspection totals
    const inspected = orders.filter((o) => o.inspection && typeof o.inspection.confirmedTotal === "number");
    const deltas = inspected.map((o) => (o.inspection.confirmedTotal - o.quotedTotal) / (o.quotedTotal || 1));
    const avgDeltaPct = deltas.length ? (deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100 : null;
    const exactMatches = deltas.filter((d) => Math.abs(d) < 0.001).length;

    // Order status funnel
    const funnel = ORDER_STATUSES.map((s) => ({ status: s, count: orders.filter((o) => o.status === s).length }));

    // Top models by combined volume
    const modelCounts = new Map();
    orders.forEach((o) => { const k = `${o.device.brand} ${o.device.model}`; modelCounts.set(k, (modelCounts.get(k) || 0) + 1); });
    sales.forEach((s) => { const k = `${s.brand} ${s.model}`; modelCounts.set(k, (modelCounts.get(k) || 0) + 1); });
    const topModels = [...modelCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 6);

    return { monthly, totalRevenue, totalCost, marginPct, grossProfit, totalExpenses, writtenOffLoss, tillVariance, netProfit, inspected: inspected.length, avgDeltaPct, exactMatches, funnel, topModels };
  }, [orders, sales, expenses, inventory, tillRecords]);

  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

  if (orders === null) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading customer records…</div>;

  const Bar = ({ pct, color }) => (
    <div style={{ height: 6, background: line, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: "100%", background: color }} />
    </div>
  );

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: '-0.01em', marginBottom: 4 }}>Customers & Reports</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 18 }}>{customers.length} customer{customers.length === 1 ? "" : "s"} on record, built from every trade-in and sale.</div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: `1px solid ${line}`, paddingBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => { setTab(t); setOpenCustomer(null); }}
              style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                border: `1px solid ${tab === t ? brass : line}`, background: tab === t ? brassDim : "transparent", color: tab === t ? brass : paper }}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Customers" && !openCustomer && (
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            {filteredCustomers.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No customers yet — they'll show up here once orders or sales exist.</div>}
            {filteredCustomers.map((c) => (
              <button key={c.key} onClick={() => setOpenCustomer(c)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 3, border: `1px solid ${line}`, background: panel, color: paper, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14 }}>{c.name} {c.repeat && <span style={{ color: brass, fontSize: 11 }}>· repeat</span>}</span>
                  <span style={{ fontSize: 12, color: muted }}>{c.transactionCount} transaction{c.transactionCount === 1 ? "" : "s"}</span>
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{c.email || "no email on file"}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {c.paidToThem > 0 && <span style={{ color: red, marginRight: 12 }}>paid them {fmt(c.paidToThem, c.timeline[0]?.region)}</span>}
                  {c.paidByThem > 0 && <span style={{ color: green }}>paid us {fmt(c.paidByThem, c.timeline[0]?.region)}</span>}
                </div>
              </button>
            ))}
          </>
        )}

        {openCustomer && (
          <div>
            <button onClick={() => setOpenCustomer(null)} style={{ background: "none", border: "none", color: brass, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>← Back to customers</button>
            <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 16 }}>{openCustomer.name}</div>
              <div style={{ fontSize: 13, color: muted }}>{openCustomer.email || "no email"} {openCustomer.phone && `· ${openCustomer.phone}`}</div>
              <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
                <div><div style={{ fontSize: 11, color: muted }}>We've paid them</div><div style={{ color: red, fontSize: 16 }}>{fmt(openCustomer.paidToThem)}</div></div>
                <div><div style={{ fontSize: 11, color: muted }}>They've paid us</div><div style={{ color: green, fontSize: 16 }}>{fmt(openCustomer.paidByThem)}</div></div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Full history</div>
            {openCustomer.timeline.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div>
                  <div style={{ fontSize: 13 }}>{t.type === "sold_to_us" ? "Sold us" : "Bought"} — {t.device}</div>
                  <div style={{ fontSize: 11, color: muted }}>{new Date(t.date).toLocaleDateString()} · {t.ref} · {t.status.replace(/_/g, " ")}</div>
                </div>
                <div style={{ fontSize: 13, color: t.type === "sold_to_us" ? red : green }}>{fmt(t.amount, t.region)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "Reports" && report && (
          <div>
            <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Revenue vs. payouts by month</div>
              {report.monthly.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No transactions yet.</div>}
              {report.monthly.map((m) => {
                const max = Math.max(...report.monthly.map((x) => Math.max(x.revenue, x.payouts)), 1);
                return (
                  <div key={m.month} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: muted, marginBottom: 3 }}>{m.month}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: green }}>revenue {fmt(m.revenue)}</span>
                    </div>
                    <Bar pct={(m.revenue / max) * 100} color={green} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, margin: "4px 0 2px" }}>
                      <span style={{ color: red }}>payouts {fmt(m.payouts)}</span>
                    </div>
                    <Bar pct={(m.payouts / max) * 100} color={red} />
                  </div>
                );
              })}
            </div>

            <div style={{ border: `1px solid ${report.netProfit >= 0 ? green : red}`, borderRadius: 3, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Net profit (gross profit − operating expenses)</div>
              <div style={{ fontSize: 28, color: report.netProfit >= 0 ? green : red, fontFamily: "'Archivo Black', sans-serif" }}>{fmt(report.netProfit)}</div>
              <div style={{ fontSize: 11.5, color: muted, marginTop: 4 }}>
                {fmt(report.grossProfit)} gross profit − {fmt(report.totalExpenses)} expenses{report.writtenOffLoss > 0 && ` − ${fmt(report.writtenOffLoss)} written-off inventory`}{report.tillVariance !== 0 && ` ${report.tillVariance > 0 ? "+" : "−"} ${fmt(Math.abs(report.tillVariance))} till ${report.tillVariance > 0 ? "overage" : "shortfall"}`}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, border: `1px solid ${line}`, borderRadius: 3, padding: 14 }}>
                <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Realized margin</div>
                <div style={{ fontSize: 22, color: brass, fontFamily: "'Archivo Black', sans-serif" }}>{report.marginPct != null ? `${report.marginPct.toFixed(1)}%` : "—"}</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{fmt(report.totalRevenue - report.totalCost)} profit across {fmt(report.totalCost)} cost</div>
              </div>
              <div style={{ flex: 1, border: `1px solid ${line}`, borderRadius: 3, padding: 14 }}>
                <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Inspection accuracy</div>
                <div style={{ fontSize: 22, color: report.avgDeltaPct == null ? muted : Math.abs(report.avgDeltaPct) < 3 ? green : red, fontFamily: "'Archivo Black', sans-serif" }}>
                  {report.avgDeltaPct != null ? `${report.avgDeltaPct > 0 ? "+" : ""}${report.avgDeltaPct.toFixed(1)}%` : "—"}
                </div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                  avg gap, {report.exactMatches}/{report.inspected} matched exactly
                </div>
              </div>
            </div>

            <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Order funnel</div>
              {report.funnel.map((f) => {
                const max = Math.max(...report.funnel.map((x) => x.count), 1);
                return (
                  <div key={f.status} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: paper }}>{f.status.replace(/_/g, " ")}</span><span style={{ color: muted }}>{f.count}</span>
                    </div>
                    <Bar pct={(f.count / max) * 100} color={brass} />
                  </div>
                );
              })}
            </div>

            <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 16 }}>
              <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Top models by volume</div>
              {report.topModels.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No transactions yet.</div>}
              {report.topModels.map(([model, count]) => {
                const max = report.topModels[0]?.[1] || 1;
                return (
                  <div key={model} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span>{model}</span><span style={{ color: muted }}>{count}</span>
                    </div>
                    <Bar pct={(count / max) * 100} color={green} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "Expenses" && (
          <ExpensesTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            expenses={expenses} onAdd={addExpense} onDelete={deleteExpense} fmt={fmt} />
        )}

        {tab === "Leads & Notifications" && (
          <div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>Bulk / business quote requests ({bulkRequests.filter((b) => b.status === "new").length} awaiting a firm offer)</div>
            {bulkRequests.length === 0 && <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>No bulk requests yet.</div>}
            {bulkRequests.map((b) => (
              <div key={b.id} style={{ border: `1px solid ${b.status === "new" ? brass : line}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{b.business.businessName}</span>
                  <span style={{ fontSize: 13, color: brass }}>{fmt(b.estimatedTotal, b.region)}</span>
                </div>
                <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>{b.itemCount} device(s) · {b.business.contactName} · {b.business.email} · {b.business.phone}</div>
                {b.business.note && <div style={{ fontSize: 12, color: muted, marginBottom: 8, fontStyle: "italic" }}>"{b.business.note}"</div>}
                <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>{b.items.map((i) => `${i.device.brand} ${i.device.model}`).join(", ")}</div>
                {b.status === "new" ? (
                  <button onClick={async () => {
                      const next = bulkRequests.map((x) => x.id === b.id ? { ...x, status: "contacted" } : x);
                      await saveJSON("bulk_quote_requests", next, true); setBulkRequests(next);
                    }} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12, border: `1px solid ${brass}`, background: "transparent", color: brass, cursor: "pointer" }}>
                    Mark as contacted
                  </button>
                ) : <span style={{ fontSize: 12, color: green }}>✓ Contacted</span>}
              </div>
            ))}

            <div style={{ fontSize: 13, marginBottom: 8, marginTop: 24 }}>
              Referral rewards — {referrals.reduce((n, r) => n + (r.referrerPaid ? 0 : 1) + (r.referredPaid ? 0 : 1), 0)} payout{referrals.reduce((n, r) => n + (r.referrerPaid ? 0 : 1) + (r.referredPaid ? 0 : 1), 0) === 1 ? "" : "s"} outstanding
            </div>
            {referrals.length === 0 && <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>No referrals yet.</div>}
            {referrals.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>{r.referrerName} referred {r.referredName}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: `1px solid ${line}`, fontSize: 12.5 }}>
                  <span style={{ color: muted }}>{r.referrerEmail} (referrer)</span>
                  {r.referrerPaid ? <span style={{ color: green }}>✓ Paid {fmt(r.rewardAmount)}</span> : (
                    <button onClick={async () => {
                        const next = referrals.map((x) => x.id === r.id ? { ...x, referrerPaid: true } : x);
                        await saveJSON("referrals", next, true); setReferrals(next);
                        await addExpense({ category: "Marketing", description: `Referral reward — ${r.referrerName} (referred ${r.referredName})`, amount: r.rewardAmount, date: new Date().toISOString().slice(0, 10) });
                      }} style={{ padding: "5px 10px", borderRadius: 2, fontSize: 11.5, border: `1px solid ${brass}`, background: "transparent", color: brass, cursor: "pointer" }}>
                      Mark {fmt(r.rewardAmount)} paid
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: `1px solid ${line}`, fontSize: 12.5 }}>
                  <span style={{ color: muted }}>{r.referredEmail} (referred)</span>
                  {r.referredPaid ? <span style={{ color: green }}>✓ Paid {fmt(r.rewardAmount)}</span> : (
                    <button onClick={async () => {
                        const next = referrals.map((x) => x.id === r.id ? { ...x, referredPaid: true } : x);
                        await saveJSON("referrals", next, true); setReferrals(next);
                        await addExpense({ category: "Marketing", description: `Referral reward — ${r.referredName} (referred by ${r.referrerName})`, amount: r.rewardAmount, date: new Date().toISOString().slice(0, 10) });
                      }} style={{ padding: "5px 10px", borderRadius: 2, fontSize: 11.5, border: `1px solid ${brass}`, background: "transparent", color: brass, cursor: "pointer" }}>
                      Mark {fmt(r.rewardAmount)} paid
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div style={{ fontSize: 13, marginBottom: 8, marginTop: 24 }}>Abandoned quotes — customers who got a price but didn't sell ({leads.filter((l) => !l.contacted).length} not yet followed up)</div>
            {leads.length === 0 && <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>No leads captured yet.</div>}
            {leads.map((l, i) => (
              <div key={l.id} style={{ border: `1px solid ${l.contacted ? line : brass}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{l.device.brand} {l.device.model} · {l.device.storage}</span>
                  <span style={{ fontSize: 13, color: brass }}>{fmt(l.quotedTotal, l.region)}</span>
                </div>
                <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>{l.email} · price held until {new Date(l.priceHeldUntil).toLocaleDateString()}</div>
                {!l.contacted && (
                  <button onClick={async () => {
                      const next = leads.map((x) => x.id === l.id ? { ...x, contacted: true } : x);
                      await saveJSON("quote_leads", next, true); setLeads(next);
                    }} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12, border: `1px solid ${brass}`, background: "transparent", color: brass, cursor: "pointer" }}>
                    Mark as followed up
                  </button>
                )}
                {l.contacted && <span style={{ fontSize: 12, color: green }}>✓ Followed up</span>}
              </div>
            ))}

            <div style={{ fontSize: 13, marginBottom: 8, marginTop: 24 }}>
              Notification queue — {notifications.filter((n) => n.status === "pending").length} pending
            </div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 12 }}>
              These represent emails/texts the system wants to send. Nothing is actually sent yet — no provider is
              connected. Once you connect one, it just needs to poll this queue and mark each as sent; for now,
              handle them manually and mark them off here.
            </div>
            {notifications.filter((n) => n.status === "pending").length === 0 && <div style={{ color: muted, fontSize: 13 }}>Queue is empty.</div>}
            {notifications.filter((n) => n.status === "pending").map((n) => (
              <div key={n.id} style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{n.subject}</span>
                  <span style={{ fontSize: 11, color: muted }}>{n.channel} → {n.recipientEmail || n.recipientPhone}</span>
                </div>
                <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>{n.message}</div>
                <button onClick={async () => {
                    const next = notifications.map((x) => x.id === n.id ? { ...x, status: "sent", sentAt: new Date().toISOString() } : x);
                    await saveJSON("notification_queue", next, true); setNotifications(next);
                  }} style={{ padding: "6px 12px", borderRadius: 2, fontSize: 12, border: `1px solid ${green}`, background: "transparent", color: green, cursor: "pointer" }}>
                  Mark sent
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpensesTab({ colors, expenses, onAdd, onDelete, fmt }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, line } = colors;
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({ category: c, total: expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter((c) => c.total > 0);

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
        Real operating costs — rent, wages, utilities — so the P&L in Reports reflects actual profit, not just device margin.
      </div>

      <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 13, marginBottom: 10 }}>Log an expense</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13 }}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13 }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
            style={{ flex: 2, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" type="number"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
        </div>
        <button disabled={!description.trim() || !amount} onClick={() => {
            onAdd({ category, description: description.trim(), amount: parseFloat(amount), date });
            setDescription(""); setAmount("");
          }} style={{ width: "100%", padding: "10px", borderRadius: 3, border: "none", background: description.trim() && amount ? brass : line, color: description.trim() && amount ? "#1a1408" : muted, fontSize: 13, fontWeight: 600, cursor: description.trim() && amount ? "pointer" : "default" }}>
          Add expense
        </button>
      </div>

      <div style={{ fontSize: 13, marginBottom: 8 }}>Total recorded: <span style={{ color: red }}>{fmt(total)}</span></div>

      {byCategory.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {byCategory.map((c) => (
            <div key={c.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}>
              <span style={{ color: muted }}>{c.category}</span><span>{fmt(c.total)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13, marginBottom: 8 }}>All expenses ({expenses.length})</div>
      {expenses.length === 0 && <div style={{ color: muted, fontSize: 13 }}>Nothing logged yet.</div>}
      {expenses.map((e) => (
        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
          <div>
            <div>{e.description} <span style={{ color: muted, fontSize: 11 }}>· {e.category}</span></div>
            <div style={{ fontSize: 11, color: muted }}>{e.date}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: red }}>{fmt(e.amount)}</span>
            <button onClick={() => onDelete(e.id)} style={{ background: "none", border: "none", color: muted, fontSize: 12, cursor: "pointer" }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
