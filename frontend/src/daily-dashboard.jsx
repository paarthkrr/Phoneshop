import React, { useState, useEffect, useMemo } from "react";

/* =================================================================
   DAILY DASHBOARD
   Every other tool owns one job. This owns none of the data — it
   just reads across till/orders/inventory/repairs/sales and answers
   the question a shop owner actually asks each morning: what needs
   doing today? Nothing here writes anything.
================================================================= */

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
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;
const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);

export default function DailyDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const [orders, inventory, sales, tickets, till] = await Promise.all([
        loadJSON("orders", true), loadJSON("inventory", true), loadJSON("sales", true),
        loadJSON("repair_tickets", true), loadJSON("till_records", true),
      ]);
      setData({ orders, inventory, sales, tickets, till });
    })();
  }, []);

  const summary = useMemo(() => {
    if (!data) return null;
    const { orders, inventory, sales, tickets, till } = data;
    const today = todayStr();

    const ordersAwaitingInspection = orders.filter((o) => o.status === "received_inspecting" || o.status === "awaiting_shipment");
    const ordersRevisedPending = orders.filter((o) => o.status === "revised_pending_customer");
    const ordersToReceive = orders.filter((o) => o.status === "approved_paid" && !o.receivedToInventory);

    const ungraded = inventory.filter((i) => i.status === "in_stock" && !i.gradeId);
    const listedNotSold = inventory.filter((i) => i.status === "listed");

    const repairsReady = tickets.filter((t) => t.status === "ready_for_pickup");
    const repairsOpen = tickets.filter((t) => !["completed", "not_repairable"].includes(t.status));
    const repairsStale = repairsOpen.filter((t) => daysSince(t.createdAt) > 5);

    const todayTill = till.find((r) => r.date === today);
    const todaySales = sales.filter((s) => s.soldAt?.slice(0, 10) === today);
    const todayRevenue = todaySales.reduce((s, x) => s + x.salePrice, 0);

    // Merge a recent activity feed across everything
    const feed = [
      ...orders.map((o) => ({ type: "order", at: o.createdAt, text: `Trade-in submitted: ${o.device.brand} ${o.device.model} (${o.id})` })),
      ...sales.map((s) => ({ type: "sale", at: s.soldAt, text: `Sold ${s.brand} ${s.model} for ${fmt(s.salePrice)}` })),
      ...tickets.map((t) => ({ type: "repair", at: t.createdAt, text: `Repair job opened: ${t.device.brand} ${t.device.model} (${t.id})` })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);

    return { ordersAwaitingInspection, ordersRevisedPending, ordersToReceive, ungraded, listedNotSold, repairsReady, repairsOpen, repairsStale, todayTill, todayRevenue, todaySalesCount: todaySales.length, feed };
  }, [data]);

  const ink = "#F7F4EC", panel = "#FFFFFF", paper = "#201C18", muted = "#6B6560",
    brass = "#2150C8", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

  if (!summary) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading today's view…</div>;

  const Card = ({ title, value, tone, sub }) => (
    <div style={{ flex: 1, minWidth: 140, border: `1px solid ${line}`, borderRadius: 3, padding: 14 }}>
      <div style={{ fontSize: 11.5, color: muted, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 24, color: tone, fontFamily: "'Archivo Black', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const ActionRow = ({ label, count, tone }) => count > 0 && (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
      <span>{label}</span><span style={{ color: tone }}>{count}</span>
    </div>
  );

  const nothingUrgent = summary.ordersAwaitingInspection.length === 0 && summary.ordersRevisedPending.length === 0 &&
    summary.ordersToReceive.length === 0 && summary.ungraded.length === 0 && summary.repairsReady.length === 0 && summary.repairsStale.length === 0;

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: '-0.01em', marginBottom: 4 }}>Today</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>{new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          <Card title="Till" value={summary.todayTill ? (summary.todayTill.closed ? "Closed" : "Open") : "Not opened"}
            tone={summary.todayTill?.closed ? muted : summary.todayTill ? green : red} />
          <Card title="Today's revenue" value={fmt(summary.todayRevenue)} tone={brass} sub={`${summary.todaySalesCount} sale${summary.todaySalesCount === 1 ? "" : "s"}`} />
          <Card title="Repairs open" value={summary.repairsOpen.length} tone={summary.repairsOpen.length > 0 ? brass : muted} />
        </div>

        <div style={{ fontSize: 14, marginBottom: 10 }}>Needs your attention</div>
        {nothingUrgent && <div style={{ color: green, fontSize: 13, marginBottom: 20 }}>Nothing urgent — queue is clear.</div>}
        {!nothingUrgent && (
          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: "4px 14px", marginBottom: 24 }}>
            <ActionRow label="Trade-in orders awaiting inspection" count={summary.ordersAwaitingInspection.length} tone={brass} />
            <ActionRow label="Revised offers awaiting customer response" count={summary.ordersRevisedPending.length} tone={red} />
            <ActionRow label="Approved orders not yet added to inventory" count={summary.ordersToReceive.length} tone={brass} />
            <ActionRow label="Inventory sitting ungraded" count={summary.ungraded.length} tone={brass} />
            <ActionRow label="Repairs ready for customer pickup" count={summary.repairsReady.length} tone={green} />
            <ActionRow label="Repair jobs open more than 5 days" count={summary.repairsStale.length} tone={red} />
          </div>
        )}

        <div style={{ fontSize: 14, marginBottom: 10 }}>Recent activity</div>
        {summary.feed.length === 0 && <div style={{ color: muted, fontSize: 13 }}>Nothing recorded yet.</div>}
        {summary.feed.map((f, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 13 }}>
            <span>{f.text}</span>
            <span style={{ color: muted, fontSize: 11 }}>{new Date(f.at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
