import React, { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { sydneyDay, sydneyToday } from "./sydney-time.js";
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
.pd-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px;margin-bottom:16px}
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
@media (max-width:980px){ .pd{padding:16px 14px 28px} .pd-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} .pd-row{grid-template-columns:minmax(0,1fr)} .pd-quick{width:100%} .pd-quick a{flex:1;justify-content:center} }
@media (max-width:560px){ .pd-tools{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} .pd-tool{flex-direction:column;gap:10px;padding:14px 12px} .pd-tool span{font-size:12px} .pd-bars{gap:6px} .pd-bar b{font-size:10px} }
`;

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DailyDashboard() {
  const [data, setData] = useState(null);
  const location = useLocation();
  const role = currentRole();
  const can = (to) => canSeeScreen(to, role);
  const user = (() => { try { return window.shopAuth && window.shopAuth.currentUser(); } catch (e) { return null; } })();

  useEffect(() => {
    (async () => {
      const [orders, inventory, sales, tickets, till] = await Promise.all([
        loadJSON("orders", true), loadJSON("inventory", true), loadJSON("sales", true),
        loadJSON("repair_tickets", true), loadJSON("till_records", true),
      ]);
      setData({ orders, inventory, sales, tickets, till });
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
    const { orders, inventory, sales, tickets, till } = data;
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
      ...sales.map((s) => ({ icon: "pos", at: s.soldAt, text: `Sold ${s.brand || ""} ${s.model || ""} for ${fmt(s.salePrice)}` })),
      ...tickets.map((t) => ({ icon: "repairs", at: t.createdAt, text: `Repair job opened: ${t.device?.brand || ""} ${t.device?.model || ""}`, ref: t.id })),
    ].filter((f) => f.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

    return { ordersAwaitingInspection, ordersRevisedPending, ordersToReceive, ungraded, inStock, repairsReady, repairsOpen, repairsStale, todayTill, todayRevenue, todaySalesCount: todaySales.length, last7, weekRevenue, feed };
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
  ].filter((t) => t.n > 0);
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
        <Kpi hero to="/portal/crm" icon="crm" label="Today's revenue" value={fmt(s.todayRevenue)} sub={`${s.todaySalesCount} sale${s.todaySalesCount === 1 ? "" : "s"} · ${fmt(s.weekRevenue)} this week`} />
        <Kpi to="/portal/till" icon="till" label="Till" value={tillState} sub={s.todayTill ? (s.todayTill.closed ? "Counted and closed" : "Drawer is open") : "Open it before the first cash sale"} />
        <Kpi to="/portal/inspect" icon="inspect" label="To inspect" value={s.ordersAwaitingInspection.length} sub={s.ordersRevisedPending.length ? `${s.ordersRevisedPending.length} revised, waiting on customer` : "Trade-in orders"} />
        <Kpi to="/portal/repairs" icon="repairs" label="Repairs open" value={s.repairsOpen.length} sub={s.repairsReady.length ? `${s.repairsReady.length} ready for pickup` : `${s.inStock.length} phones in stock`} />
      </div>

      <div className="pd-row">
        <div className="pd-card">
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
        </div>
        <div className="pd-card">
          <h3>Needs your attention</h3>
          <div className="sub">Tap one to deal with it</div>
          {todos.length === 0
            ? <div className="pd-clear"><span className="pd-dot" style={{ background: "#EAF6EC", color: "#2F6B34" }}>✓</span>Nothing urgent. The queue is clear.</div>
            : todos.map((t) => can(t.to)
              ? <Link key={t.label} to={t.to} className="pd-todo"><span>{t.label}</span><em className={t.tone}>{t.n}</em></Link>
              : <div key={t.label} className="pd-todo"><span>{t.label}</span><em className={t.tone}>{t.n}</em></div>)}
        </div>
      </div>

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
        {s.feed.map((f, i) => (
          <div key={i} className="pd-feed">
            <span className="pd-dot"><PIcon k={f.icon} size={15} /></span>
            <div style={{ minWidth: 0 }}>{f.text}<small>{new Date(f.at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })}{f.ref ? ` · ${f.ref}` : ""}</small></div>
          </div>
        ))}
      </div>
    </div>
  );
}
