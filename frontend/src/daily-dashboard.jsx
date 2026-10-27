import React, { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { sydneyDay, sydneyToday, sydneyMonth } from "./sydney-time.js";
import { buildPnl, saleKind, KIND_LABELS } from "./pnl.js";
import { PORTAL_ITEMS, PORTAL_GROUPS, PIcon } from "./portal-nav.jsx";
import { canSeeScreen, currentRole } from "./roles.js";

/* =================================================================
   DAILY DASHBOARD (the portal's home)
   Every other tool owns one job. This owns none of the data — it
   just reads across till/orders/inventory/repairs/sales and answers
   the question a shop owner actually asks each morning: what needs
   doing today? Every number links to the screen that deals with it,
   and the tool grid below is the way into every other screen.
   Nothing here writes anything.
================================================================= */

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared) {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(key, shared);
    const v = r ? JSON.parse(r.value) : [];
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;
const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
// Sydney calendar day i days before today ("YYYY-MM-DD"); noon UTC keeps DST shifts from skipping a day.
const dayBefore = (today, i) => { const d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - i); return d.toISOString().slice(0, 10); };
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const prevMonthOf = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const pct = (n) => (n > 0 && n < 0.005 ? "<1%" : `${Math.round(n * 100)}%`);
const TODO_SHOWN = 6; // longer lists fold behind "Show all"
const AGED_DAYS = 30; // a phone in stock longer than this is tying up cash
const KIND_COLOURS = { phone: "#2150C8", repair: "#7A1F2B", accessory: "#0E9F6E" };

const CSS = `
.pd{max-width:1180px;margin:0 auto;padding:24px 28px 48px}
.pd-hello{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.pd-hello h2{font-family:'Archivo Black',sans-serif;font-weight:400;font-size:clamp(22px,3vw,28px);margin:0 0 4px;letter-spacing:-.01em}
.pd-hello p{margin:0;color:#5B6472;font-size:14px}
.pd-quick{display:flex;gap:8px;flex-wrap:wrap}
.pd-quick a{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 16px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none;background:#fff;color:#111827;border:1px solid #E3E7EF}
.pd-quick a.p{background:#2150C8;color:#fff;border-color:#2150C8;box-shadow:0 8px 18px rgba(33,80,200,.25)}
.pd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}
.pd-kpi{position:relative;display:block;background:#fff;border:1px solid #E3E7EF;border-radius:18px;padding:16px 16px 14px;text-decoration:none;color:inherit;transition:transform .15s ease,box-shadow .15s ease;min-width:0}
a.pd-kpi:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(15,22,38,.08)}
.pd-kpi.hero{background:linear-gradient(135deg,#2150C8,#1A3F9E);color:#fff;border-color:transparent}
.pd-kpi-ic{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:#F1F4FB;color:#2150C8;margin-bottom:12px}
.pd-kpi.hero .pd-kpi-ic{background:rgba(255,255,255,.16);color:#fff}
.pd-kpi-l{font-size:12.5px;color:#6B7280;font-weight:600}
.pd-kpi.hero .pd-kpi-l,.pd-kpi.hero .pd-kpi-s{color:rgba(255,255,255,.8)}
.pd-kpi-v{font-family:'Archivo Black',sans-serif;font-size:clamp(22px,2.6vw,28px);line-height:1.15;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-kpi-s{font-size:12px;color:#6B7280}
.pd-go{position:absolute;top:16px;right:14px;font-size:16px;color:#9AA3B2}
.pd-kpi.hero .pd-go{color:rgba(255,255,255,.7)}
.pd-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px;margin-bottom:16px;align-items:start}
.pd-showall{background:none;border:0;padding:10px 4px 0;color:#2150C8;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
.pd-card{background:#fff;border:1px solid #E3E7EF;border-radius:18px;padding:18px;min-width:0}
.pd-card h3{margin:0 0 2px;font-size:15.5px;font-weight:700}
.pd-card .sub{font-size:12.5px;color:#6B7280;margin-bottom:14px}
.pd-bars{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;align-items:end;height:150px}
.pd-bar{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;min-width:0}
.pd-bar i{display:block;width:100%;max-width:34px;border-radius:8px 8px 4px 4px;background:#DCE4F7;min-height:4px}
.pd-bar.today i{background:#2150C8}
.pd-bar b{font-size:11px;color:#111827;font-weight:700;white-space:nowrap}
.pd-bar span{font-size:11px;color:#6B7280}
.pd-todo{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 4px;border-top:1px solid #EEF1F6;text-decoration:none;color:#111827;font-size:14px}
.pd-todo:first-of-type{border-top:0}
.pd-todo em{font-style:normal;min-width:28px;height:28px;padding:0 8px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:13px;background:#EEF3FF;color:#2150C8}
.pd-todo em.r{background:#FDEEEE;color:#B42318}
.pd-todo em.g{background:#EAF6EC;color:#2F6B34}
.pd-clear{display:flex;align-items:center;gap:10px;color:#2F6B34;font-size:14px;padding:8px 0}
.pd-tools-h{display:flex;align-items:baseline;justify-content:space-between;margin:26px 0 12px;scroll-margin-top:80px}
.pd-tools-h h3{margin:0;font-family:'Archivo Black',sans-serif;font-weight:400;font-size:20px}
.pd-grp{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6B7893;margin:14px 0 8px}
.pd-tools{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.pd-tool{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #E3E7EF;border-radius:16px;padding:14px;text-decoration:none;color:#111827;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;min-width:0}
.pd-tool:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(15,22,38,.08);border-color:#C9D5F3}
.pd-tool-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#F1F4FB;color:#2150C8;flex:none}
.pd-tool b{display:flex;align-items:center;gap:8px;font-size:14.5px}
.pd-tool b em{font-style:normal;font-size:11.5px;font-weight:800;background:#2150C8;color:#fff;border-radius:999px;padding:1px 8px}
.pd-tool span{display:block;font-size:12.5px;color:#6B7280;margin-top:3px;line-height:1.4}
.pd-feed{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-top:1px solid #EEF1F6;font-size:13.5px}
.pd-feed:first-of-type{border-top:0}
.pd-dot{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none;background:#F1F4FB;color:#2150C8}
.pd-feed small{display:block;color:#6B7280;font-size:12px;margin-top:2px}
.pd-sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:26px 0 12px}
.pd-sec-h h3{margin:0;font-family:'Archivo Black',sans-serif;font-weight:400;font-size:20px}
.pd-sec-h span{font-size:13px;color:#6B7280}
.pd-mets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:14px}
.pd-met{background:#fff;border:1px solid #E3E7EF;border-radius:16px;padding:14px 16px;min-width:0}
.pd-met .l{font-size:12.5px;color:#6B7280;font-weight:600}
.pd-met .v{font-family:'Archivo Black',sans-serif;font-size:clamp(20px,2.3vw,25px);margin:4px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-met .d{font-size:12px;color:#6B7280}
.pd-up{color:#0E7A4F;font-weight:700}.pd-down{color:#B42318;font-weight:700}
.pd-split{display:flex;height:14px;border-radius:999px;overflow:hidden;background:#EEF1F6;margin:6px 0 14px}
.pd-split i{display:block;height:100%}
.pd-leg{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #EEF1F6;font-size:13.5px}
.pd-leg:first-of-type{border-top:0}
.pd-leg b{font-weight:700}
.pd-sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;vertical-align:-1px}
.pd-row3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px}
.pd-kv{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #EEF1F6;font-size:13.5px}
.pd-kv:first-of-type{border-top:0}
.pd-kv span{color:#5B6472}.pd-kv b{font-weight:700;text-align:right}
.pd-more{display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:#2150C8;text-decoration:none}
.pd-note{font-size:12px;color:#6B7280;margin-top:8px}
@media (max-width:1180px){ .pd-row3{grid-template-columns:repeat(2,minmax(0,1fr))} }
@media (max-width:980px){ .pd-mets{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} .pd-row3{grid-template-columns:minmax(0,1fr)} }
@media (max-width:980px){ .pd{padding:16px 14px 28px} .pd-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} .pd-row{grid-template-columns:minmax(0,1fr)} .pd-quick{width:100%} .pd-quick a{flex:1;justify-content:center} }
@media (max-width:560px){ .pd-tools{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} .pd-tool{flex-direction:column;gap:10px;padding:14px 12px} .pd-tool span{font-size:12px} .pd-bars{gap:6px} .pd-bar b{font-size:10px} }
`;

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DailyDashboard() {
  const [data, setData] = useState(null);
  const [allTodos, setAllTodos] = useState(false);
  const location = useLocation();
  const role = currentRole();
  const can = (to) => canSeeScreen(to, role);
  const user = (() => { try { return window.shopAuth && window.shopAuth.currentUser(); } catch (e) { return null; } })();

  useEffect(() => {
    (async () => {
      // A record this person's access doesn't cover just loads as empty; its numbers
      // then simply don't show (the sections below check access before rendering).
      const keys = ["orders", "inventory", "sales", "repair_tickets", "till_records", "expenses", "repair_requests", "purchase_orders",
        "accessory_orders", "price_match_requests", "support_queries", "bulk_quote_requests", "quote_leads", "parts_stock", "accessories"];
      const v = await Promise.all(keys.map((k) => loadJSON(k, true)));
      const [orders, inventory, sales, tickets, till, expenses, repairRequests, webOrders, accessoryOrders, priceMatches, support, bulk, leads, partsStock, accessories] = v;
      setData({ orders, inventory, sales, tickets, till, expenses, repairRequests, webOrders, accessoryOrders, priceMatches, support, bulk, leads, partsStock, accessories });
    })();
  }, []);

  // "All tools" (phone tab bar / top button) lands here with #tools.
  useEffect(() => {
    if (location.hash !== "#tools") return undefined;
    const t = setTimeout(() => { const el = document.getElementById("tools"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 120);
    return () => clearTimeout(t);
  }, [location.hash, location.key, data]);

  const summary = useMemo(() => {
    if (!data) return null;
    const { orders, inventory, sales, tickets, till, expenses, repairRequests, webOrders, accessoryOrders, priceMatches, support, bulk, leads, partsStock, accessories } = data;
    const today = sydneyToday();

    const ordersAwaitingInspection = orders.filter((o) => o.status === "received_inspecting" || o.status === "awaiting_shipment");
    const ordersRevisedPending = orders.filter((o) => o.status === "revised_pending_customer");
    const ordersToReceive = orders.filter((o) => o.status === "approved_paid" && !o.receivedToInventory);

    const ungraded = inventory.filter((i) => i.status === "in_stock" && !i.gradeId);
    const inStock = inventory.filter((i) => i.status === "in_stock" || i.status === "listed");

    const repairsReady = tickets.filter((t) => t.status === "ready_for_pickup");
    const repairsOpen = tickets.filter((t) => !["completed", "not_repairable"].includes(t.status));
    const repairsStale = repairsOpen.filter((t) => daysSince(t.createdAt) > 5);

    const todayTill = till.find((r) => r.date === today);
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const ds = dayBefore(today, i);
      const v = sales.filter((s) => sydneyDay(s.soldAt) === ds).reduce((a, s) => a + (s.salePrice || 0), 0);
      last7.push({ ds, v, label: WD[new Date(ds + "T12:00:00Z").getUTCDay()], today: i === 0 });
    }
    const todaySales = sales.filter((s) => sydneyDay(s.soldAt) === today);
    const todayRevenue = todaySales.reduce((s, x) => s + (x.salePrice || 0), 0);
    const weekRevenue = last7.reduce((a, d) => a + d.v, 0);

    const feed = [
      ...orders.map((o) => ({ icon: "inspect", at: o.createdAt, text: `Trade-in submitted: ${o.device?.brand || ""} ${o.device?.model || ""}`, ref: o.id })),
      ...sales.map((s) => ({ icon: "pos", at: s.soldAt, text: `Sold ${saleKind(s) === "accessory" ? "" : s.brand || ""} ${s.model || ""} for ${fmt(s.salePrice)}`.replace(/\s+/g, " ") })),
      ...tickets.map((t) => ({ icon: "repairs", at: t.createdAt, text: `Repair job opened: ${t.device?.brand || ""} ${t.device?.model || ""}`, ref: t.id })),
    ].filter((f) => f.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

    // ---- This month vs last month (Sydney calendar months) ----
    const month = sydneyMonth(today), prev = prevMonthOf(month);
    const inMonth = (iso, m = month) => !!iso && sydneyMonth(iso) === m;
    const pnl = buildPnl({ sales, tickets, expenses, inventory, tillRecords: till, month });
    const pnlPrev = buildPnl({ sales, tickets, expenses, inventory, tillRecords: till, month: prev });
    const takings = (m) => sales.filter((x) => inMonth(x.soldAt, m)).reduce((a, x) => a + (Number(x.salePrice) || 0), 0);
    const monthRevenue = takings(month), prevRevenue = takings(prev);
    const knownRevenue = Object.values(pnl.byKind).reduce((a, k) => a + k.revenue, 0);
    const split = Object.keys(KIND_LABELS).map((k) => ({ k, label: KIND_LABELS[k], v: pnl.byKind[k].revenue + pnl.byKind[k].unknownRevenue, n: pnl.byKind[k].count }));
    const top = new Map();
    sales.filter((x) => inMonth(x.soldAt) && saleKind(x) === "phone").forEach((x) => {
      const key = `${x.brand || ""} ${x.model || ""}`.trim() || "Unknown model";
      const t = top.get(key) || { name: key, n: 0, v: 0 }; t.n += 1; t.v += Number(x.salePrice) || 0; top.set(key, t);
    });
    const topSellers = [...top.values()].sort((a, b) => b.n - a.n || b.v - a.v).slice(0, 5);
    const techOwed = pnl.technicians.reduce((a, t) => a + t.owed, 0);

    // ---- Stock ----
    const stockDays = inStock.map((i) => (i.receivedAt ? daysSince(i.receivedAt) : null)).filter((d) => d != null);
    const stock = {
      count: inStock.length,
      cost: inStock.reduce((a, i) => a + (Number(i.costBasis) || 0), 0),
      listed: inStock.reduce((a, i) => a + (Number(i.listedPrice) || 0), 0),
      unpriced: inStock.filter((i) => !i.listedPrice).length,
      avgDays: stockDays.length ? stockDays.reduce((a, d) => a + d, 0) / stockDays.length : null,
      aged: inStock.filter((i) => i.receivedAt && daysSince(i.receivedAt) > AGED_DAYS),
    };

    // ---- Buying: trade-ins this month, and how many quotes became orders ----
    const tradeinsMonth = orders.filter((o) => inMonth(o.createdAt));
    const paidMonth = orders.filter((o) => o.status === "approved_paid" && inMonth(o.paidAt || o.approvedAt || o.createdAt));
    const paidOut = paidMonth.reduce((a, o) => a + (Number(o.inspection?.confirmedTotal ?? o.quotedTotal) || 0), 0);
    const leadsMonth = leads.filter((l) => inMonth(l.createdAt)).length;
    const conversion = tradeinsMonth.length + leadsMonth ? tradeinsMonth.length / (tradeinsMonth.length + leadsMonth) : null;

    // ---- Repairs this month ----
    const doneMonth = tickets.filter((t) => t.status === "completed" && inMonth(t.completedAt));
    const turn = doneMonth.filter((t) => t.createdAt).map((t) => (new Date(t.completedAt) - new Date(t.createdAt)) / 864e5);
    const repairs = {
      done: doneMonth.length,
      avgDays: turn.length ? turn.reduce((a, d) => a + d, 0) / turn.length : null,
      comebacks: tickets.filter((t) => t.warrantyOf && inMonth(t.createdAt)).length,
      revenue: pnl.byKind.repair.revenue + pnl.byKind.repair.unknownRevenue,
    };

    // ---- More things waiting on someone ----
    const waiting = {
      repairBookings: repairRequests.filter((r) => r.status === "new").length,
      webOrders: webOrders.filter((o) => ["pending_payment", "pending_pickup", "paid"].includes(o.status)).length,
      accessoryOrders: accessoryOrders.filter((o) => o.status === "new").length,
      priceMatches: priceMatches.filter((r) => r.status === "pending").length,
      support: support.filter((q) => q.status === "open").length,
      bulk: bulk.filter((b) => b.status === "new").length,
      leads: leads.filter((l) => !l.contacted && (!l.priceHeldUntil || new Date(l.priceHeldUntil) > new Date())).length,
      lowParts: partsStock.filter((x) => (Number(x.qtyOnHand) || 0) <= (Number(x.lowStockThreshold) || 0)).length,
      lowAccessories: accessories.filter((a) => a.showOnline !== false && (Number(a.qtyOnHand) || 0) <= 2).length,
    };

    return { month, monthRevenue, prevRevenue, pnl, pnlPrev, knownRevenue, split, topSellers, techOwed, stock, tradeinsMonth, paidMonth, paidOut, leadsMonth, conversion, repairs, waiting,
      ordersAwaitingInspection, ordersRevisedPending, ordersToReceive, ungraded, inStock, repairsReady, repairsOpen, repairsStale, todayTill, todayRevenue, todaySalesCount: todaySales.length, last7, weekRevenue, feed };
  }, [data]);

  if (!summary) return <div style={{ padding: 40, color: "#5B6472", fontFamily: "'Archivo', sans-serif" }}>Loading today's view…</div>;

  const s = summary;
  const tillState = s.todayTill ? (s.todayTill.closed ? "Closed" : "Open") : "Not opened";
  const max = Math.max(...s.last7.map((d) => d.v), 1);
  const badge = { "/portal/inspect": s.ordersAwaitingInspection.length, "/portal/repairs": s.repairsOpen.length, "/portal/pos": s.ordersToReceive.length + s.ungraded.length };

  // A card links to its screen only when this person can open that screen.
  const Kpi = ({ to, icon, label, value, sub, hero }) => {
    const inner = <><div className="pd-kpi-ic"><PIcon k={icon} size={19} /></div><div className="pd-kpi-l">{label}</div><div className="pd-kpi-v">{value}</div>{sub && <div className="pd-kpi-s">{sub}</div>}</>;
    return can(to)
      ? <Link to={to} className={`pd-kpi${hero ? " hero" : ""}`}>{inner}<span className="pd-go" aria-hidden="true">→</span></Link>
      : <div className={`pd-kpi${hero ? " hero" : ""}`}>{inner}</div>;
  };
  const todos = [
    { to: "/portal/inspect", label: "Trade-ins awaiting inspection", n: s.ordersAwaitingInspection.length, tone: "" },
    { to: "/portal/inspect", label: "Revised offers waiting on the customer", n: s.ordersRevisedPending.length, tone: "r" },
    { to: "/portal/pos", label: "Approved trade-ins not yet in stock", n: s.ordersToReceive.length, tone: "" },
    { to: "/portal/pos", label: "Stock waiting to be graded", n: s.ungraded.length, tone: "" },
    { to: "/portal/repairs", label: "Repairs ready for pickup", n: s.repairsReady.length, tone: "g" },
    { to: "/portal/repairs", label: "Repair jobs open more than 5 days", n: s.repairsStale.length, tone: "r" },
    { to: "/portal/repairs", label: "New online repair bookings to call back", n: s.waiting.repairBookings, tone: "" },
    { to: "/portal/inspect", label: "Rejected trade-ins to hand back", n: data.orders.filter((o) => o.status === "rejected" && !o.archived).length, tone: "r" },
    { to: "/portal/pos", label: "Online phone orders to fulfil", n: s.waiting.webOrders, tone: "" },
    { to: "/portal/pos", label: "Accessory orders to pack or hand over", n: s.waiting.accessoryOrders, tone: "" },
    { to: "/portal/pricing", label: "Price match requests to answer", n: s.waiting.priceMatches, tone: "" },
    { to: "/portal/crm", label: "Customer questions still open", n: s.waiting.support, tone: "r" },
    { to: "/portal/crm", label: "Business quote requests to reply to", n: s.waiting.bulk, tone: "" },
    { to: "/portal/crm", label: "Quotes not followed up (price still held)", n: s.waiting.leads, tone: "" },
    { to: "/portal/pos", label: `Phones in stock over ${AGED_DAYS} days`, n: s.stock.aged.length, tone: "r" },
    { to: "/portal/repairs", label: "Repair parts at or below reorder level", n: s.waiting.lowParts, tone: "r" },
    { to: "/portal/products", label: "Accessories almost sold out (2 or fewer)", n: s.waiting.lowAccessories, tone: "r" },
  ].filter((t) => t.n > 0 && can(t.to));
  const money = can("/portal/crm"); // takings, profit and quote leads
  const tools = PORTAL_ITEMS.filter((it) => it.to !== "/portal" && can(it.to));
  const name = user && user.username ? user.username : "";

  return (
    <div className="pd">
      <style>{CSS}</style>
      <div className="pd-hello">
        <div>
          <h2>{greeting()}{name ? `, ${name}` : ""}</h2>
          <p>{new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="pd-quick">
          {can("/portal/pos") && <Link to="/portal/pos" className="p"><PIcon k="pos" size={17} />New sale or buy</Link>}
          {can("/portal/repairs") && <Link to="/portal/repairs"><PIcon k="repairs" size={17} />New repair</Link>}
        </div>
      </div>

      <div className="pd-kpis">
        {/* Takings are for people with reports access; everyone else gets their own queue up top. */}
        {money
          ? <Kpi hero to="/portal/crm" icon="crm" label="Today's revenue" value={fmt(s.todayRevenue)} sub={`${s.todaySalesCount} sale${s.todaySalesCount === 1 ? "" : "s"} · ${fmt(s.weekRevenue)} this week`} />
          : <Kpi hero to="/portal/repairs" icon="repairs" label="Ready for pickup" value={s.repairsReady.length} sub="Repairs waiting for the customer" />}
        {can("/portal/till")
          ? <Kpi to="/portal/till" icon="till" label="Till" value={tillState} sub={s.todayTill ? (s.todayTill.closed ? "Counted and closed" : "Drawer is open") : "Open it before the first cash sale"} />
          : <Kpi to="/portal/repairs" icon="repairs" label="Over 5 days" value={s.repairsStale.length} sub="Open repair jobs running late" />}
        <Kpi to="/portal/inspect" icon="inspect" label="To inspect" value={s.ordersAwaitingInspection.length} sub={s.ordersRevisedPending.length ? `${s.ordersRevisedPending.length} revised, waiting on customer` : "Trade-in orders"} />
        <Kpi to="/portal/repairs" icon="repairs" label="Repairs open" value={s.repairsOpen.length} sub={s.repairsReady.length ? `${s.repairsReady.length} ready for pickup` : `${s.inStock.length} phones in stock`} />
      </div>

      <div className="pd-row" style={money ? undefined : { gridTemplateColumns: "minmax(0,1fr)" }}>
        {money && <div className="pd-card">
          <h3>Sales, last 7 days</h3>
          <div className="sub">{fmt(s.weekRevenue)} total{s.weekRevenue === 0 ? " · nothing sold yet this week" : ""}</div>
          <div className="pd-bars" role="img" aria-label={`Sales for the last 7 days: ${s.last7.map((d) => `${d.label} ${fmt(d.v)}`).join(", ")}`}>
            {s.last7.map((d) => (
              <div key={d.ds} className={`pd-bar${d.today ? " today" : ""}`}>
                {d.v > 0 && <b>{fmt(d.v)}</b>}
                <i style={{ height: `${Math.max(3, (d.v / max) * 100)}%` }} />
                <span>{d.today ? "Today" : d.label}</span>
              </div>
            ))}
          </div>
        </div>}
        <div className="pd-card">
          <h3>Needs your attention</h3>
          <div className="sub">Tap one to deal with it</div>
          {todos.length === 0
            ? <div className="pd-clear"><span className="pd-dot" style={{ background: "#EAF6EC", color: "#2F6B34" }}>✓</span>Nothing urgent. The queue is clear.</div>
            : (allTodos ? todos : todos.slice(0, TODO_SHOWN)).map((t) => can(t.to)
              ? <Link key={t.label} to={t.to} className="pd-todo"><span>{t.label}</span><em className={t.tone}>{t.n}</em></Link>
              : <div key={t.label} className="pd-todo"><span>{t.label}</span><em className={t.tone}>{t.n}</em></div>)}
          {todos.length > TODO_SHOWN && <button type="button" className="pd-showall" onClick={() => setAllTodos((v) => !v)}>{allTodos ? "Show fewer" : `Show all ${todos.length}`}</button>}
        </div>
      </div>

      {money && (() => {
        const monthName = new Date(s.month + "-15T12:00:00Z").toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
        const Delta = ({ now, before }) => before > 0
          ? <span className={now >= before ? "pd-up" : "pd-down"}>{now >= before ? "▲" : "▼"} {pct(Math.abs(now - before) / before)}</span>
          : <span>no sales last month to compare</span>;
        const margin = s.knownRevenue > 0 ? s.pnl.grossProfit / s.knownRevenue : null;
        const totalSplit = s.split.reduce((a, x) => a + x.v, 0);
        return (
          <>
            <div className="pd-sec-h"><h3>This month</h3><span>{monthName}, so far</span></div>
            <div className="pd-mets">
              <div className="pd-met"><div className="l">Takings</div><div className="v">{fmt(s.monthRevenue)}</div><div className="d"><Delta now={s.monthRevenue} before={s.prevRevenue} /> vs last month</div></div>
              <div className="pd-met"><div className="l">Gross profit</div><div className="v">{fmt(s.pnl.grossProfit)}</div><div className="d">{margin == null ? "No costed sales yet" : `${pct(margin)} margin`}</div></div>
              <div className="pd-met"><div className="l">Net profit</div><div className="v" style={{ color: s.pnl.netProfit < 0 ? "#B42318" : undefined }}>{fmt(s.pnl.netProfit)}</div><div className="d">after expenses, write-offs and till</div></div>
              <div className="pd-met"><div className="l">Expenses</div><div className="v">{fmt(s.pnl.totalExpenses)}</div><div className="d">{s.pnlPrev.totalExpenses > 0 ? `${fmt(s.pnlPrev.totalExpenses)} last month` : "logged in Customers & reports"}</div></div>
            </div>
            <div className="pd-row">
              <div className="pd-card">
                <h3>Where the money came from</h3>
                <div className="sub">Takings this month by type of sale</div>
                <div className="pd-split" role="img" aria-label={s.split.map((x) => `${x.label} ${fmt(x.v)}`).join(", ")}>
                  {totalSplit > 0 && s.split.map((x) => <i key={x.k} style={{ width: `${(x.v / totalSplit) * 100}%`, background: KIND_COLOURS[x.k] }} />)}
                </div>
                {s.split.map((x) => (
                  <div key={x.k} className="pd-leg"><span><i className="pd-sw" style={{ background: KIND_COLOURS[x.k] }} />{x.label} · {x.n} sale{x.n === 1 ? "" : "s"}</span><b>{fmt(x.v)}{totalSplit > 0 ? ` · ${pct(x.v / totalSplit)}` : ""}</b></div>
                ))}
                {s.pnl.unknownCount > 0 && <div className="pd-note">{s.pnl.unknownCount} sale{s.pnl.unknownCount === 1 ? " has" : "s have"} no cost price, so {s.pnl.unknownCount === 1 ? "it isn't" : "they aren't"} in the profit figures.</div>}
                <Link to="/portal/crm" className="pd-more">Full profit & loss →</Link>
              </div>
              <div className="pd-card">
                <h3>Best-selling phones</h3>
                <div className="sub">Most sold this month</div>
                {s.topSellers.length === 0 && <div style={{ color: "#6B7280", fontSize: 13.5 }}>No phones sold yet this month.</div>}
                {s.topSellers.map((t, i) => (
                  <div key={t.name} className="pd-leg"><span><b style={{ color: "#9AA3B2", marginRight: 8 }}>{i + 1}</b>{t.name}</span><b>{t.n} · {fmt(t.v)}</b></div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {(can("/portal/pos") || can("/portal/inspect") || can("/portal/repairs")) && (
        <div className="pd-row3">
          {can("/portal/pos") && (
            <div className="pd-card">
              <h3>Stock</h3>
              <div className="sub">Phones in stock or listed for sale</div>
              <div className="pd-kv"><span>Phones in stock</span><b>{s.stock.count}</b></div>
              <div className="pd-kv"><span>Paid for them</span><b>{fmt(s.stock.cost)}</b></div>
              <div className="pd-kv"><span>Listed to sell for</span><b>{fmt(s.stock.listed)}{s.stock.unpriced ? ` (${s.stock.unpriced} not priced)` : ""}</b></div>
              <div className="pd-kv"><span>Average time in stock</span><b>{s.stock.avgDays == null ? "—" : `${Math.round(s.stock.avgDays)} days`}</b></div>
              <div className="pd-kv"><span>In stock over {AGED_DAYS} days</span><b style={{ color: s.stock.aged.length ? "#B42318" : undefined }}>{s.stock.aged.length}</b></div>
              <Link to="/portal/pos" className="pd-more">Open stock →</Link>
            </div>
          )}
          {can("/portal/inspect") && (
            <div className="pd-card">
              <h3>Buying</h3>
              <div className="sub">Trade-ins this month</div>
              <div className="pd-kv"><span>Trade-in orders</span><b>{s.tradeinsMonth.length}</b></div>
              <div className="pd-kv"><span>Paid out</span><b>{fmt(s.paidOut)}{s.paidMonth.length ? ` · ${s.paidMonth.length}` : ""}</b></div>
              <div className="pd-kv"><span>Average paid</span><b>{s.paidMonth.length ? fmt(s.paidOut / s.paidMonth.length) : "—"}</b></div>
              {money && <div className="pd-kv"><span>Quotes that became orders</span><b>{s.conversion == null ? "—" : `${pct(s.conversion)} of ${s.tradeinsMonth.length + s.leadsMonth}`}</b></div>}
              <Link to="/portal/inspect" className="pd-more">Open inspection →</Link>
            </div>
          )}
          {can("/portal/repairs") && (
            <div className="pd-card">
              <h3>Repairs</h3>
              <div className="sub">Jobs finished this month</div>
              <div className="pd-kv"><span>Completed</span><b>{s.repairs.done}</b></div>
              <div className="pd-kv"><span>Average turnaround</span><b>{s.repairs.avgDays == null ? "—" : s.repairs.avgDays < 1 ? "same day" : `${s.repairs.avgDays.toFixed(1)} days`}</b></div>
              <div className="pd-kv"><span>Warranty comebacks</span><b style={{ color: s.repairs.comebacks ? "#B42318" : undefined }}>{s.repairs.comebacks}</b></div>
              {money && <div className="pd-kv"><span>Repair takings</span><b>{fmt(s.repairs.revenue)}</b></div>}
              {money && s.techOwed > 0 && <div className="pd-kv"><span>Technician pay owed</span><b style={{ color: "#B42318" }}>{fmt(s.techOwed)}</b></div>}
              <Link to="/portal/repairs" className="pd-more">Open repairs →</Link>
            </div>
          )}
        </div>
      )}

      <div className="pd-tools-h" id="tools"><h3>All tools</h3></div>
      {PORTAL_GROUPS.map((g) => {
        const list = tools.filter((it) => it.group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <div className="pd-grp">{g}</div>
            <div className="pd-tools">
              {list.map((it) => (
                <Link key={it.to} to={it.to} className="pd-tool">
                  <span className="pd-tool-ic"><PIcon k={it.icon} size={21} /></span>
                  <div style={{ minWidth: 0 }}><b>{it.label}{badge[it.to] > 0 && <em>{badge[it.to]}</em>}</b><span>{it.desc}</span></div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      <div className="pd-card" style={{ marginTop: 18 }}>
        <h3>Recent activity</h3>
        <div className="sub">Trade-ins, sales and repair jobs as they come in</div>
        {s.feed.length === 0 && <div style={{ color: "#6B7280", fontSize: 13.5 }}>Nothing recorded yet.</div>}
        {s.feed.filter((f) => money || f.icon !== "pos").map((f, i) => (
          <div key={i} className="pd-feed">
            <span className="pd-dot"><PIcon k={f.icon} size={15} /></span>
            <div style={{ minWidth: 0 }}>{f.text}<small>{new Date(f.at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })}{f.ref ? ` · ${f.ref}` : ""}</small></div>
          </div>
        ))}
      </div>
    </div>
  );
}
