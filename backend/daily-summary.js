// End-of-day email to the owner: today's takings and profit, what got done, and what
// is waiting for tomorrow. Sent once a day after 7pm Sydney time (checked every 15
// minutes, so a server that sleeps or restarts still sends it). Needs RESEND_API_KEY;
// the owner can switch it off in the Pricing Console (businessSettings.dailySummary).
// buildDailySummary is pure, so the numbers are tested.

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" });
const HOUR = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" });
const sydneyDay = (v) => { const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? "" : DAY.format(d); };
const num = (v) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : 0);
const money = (n) => `$${Math.round(n).toLocaleString("en-AU")}`;
const SEND_AFTER_HOUR = 19;
const AGED_DAYS = 30; // same as the dashboard

function buildDailySummary({ sales = [], tickets = [], orders = [], inventory = [], partsStock = [], webOrders = [], repairRequests = [], now = new Date() }) {
  const today = sydneyDay(now);
  const isToday = (iso) => !!iso && sydneyDay(iso) === today;
  const ticketById = new Map(tickets.filter(Boolean).map((t) => [t.id, t]));

  // Takings and profit: what we sold today, minus what it cost us (phones: what we paid;
  // repairs: parts and technician pay). Sales with no known cost count in takings only.
  const todays = sales.filter((s) => s && isToday(s.soldAt));
  let takings = 0, profit = 0, unknownCost = 0;
  const kinds = { phone: 0, repair: 0, accessory: 0 };
  for (const s of todays) {
    const ch = s.channel === "refund" ? s.refundChannel : s.channel; // a refund counts against what it refunds
    const sold = num(s.salePrice), kind = ch === "repair" ? "repair" : s.brand === "Accessory" ? "accessory" : "phone";
    takings += sold; kinds[kind] += sold;
    let cost = s.costBasis == null || s.costBasis === "" ? null : num(s.costBasis);
    if (kind === "repair" && !s.refundOf) {
      const t = ticketById.get(s.itemId);
      cost = t ? (t.parts || []).reduce((a, p) => a + num(p && p.cost), 0) + num(t.techPay) : cost;
    }
    if (cost == null) unknownCost += 1; else profit += sold - cost;
  }

  const paidToday = orders.filter((o) => o && o.status === "approved_paid" && isToday(o.paidAt));
  const paidOut = paidToday.reduce((a, o) => a + num(o.inspection?.confirmedTotal ?? o.quotedTotal), 0);
  const newTradeIns = orders.filter((o) => o && isToday(o.createdAt)).length;
  const repairsDone = tickets.filter((t) => t && t.status === "completed" && isToday(t.completedAt));
  const daysSince = (iso) => (now - new Date(iso)) / 864e5;
  const inStock = inventory.filter((i) => i && ["in_stock", "listed"].includes(i.status));

  const waiting = [
    ["Trade-ins to inspect", orders.filter((o) => o && o.status === "received_inspecting").length],
    ["Repair prices approved by customers, to start", tickets.filter((t) => t && t.approvalRequest && t.customerApproval && t.customerApproval.decision === "approve" && Date.parse(t.customerApproval.at) >= Date.parse(t.approvalRequest.sentAt) && ["dropped_off", "diagnosing"].includes(t.status)).length],
    ["Repairs ready, not yet collected", tickets.filter((t) => t && t.status === "ready_for_pickup").length],
    ["Repair jobs open more than 5 days", tickets.filter((t) => t && !["completed", "not_repairable", "cancelled", "ready_for_pickup"].includes(t.status) && t.createdAt && daysSince(t.createdAt) > 5).length],
    ["New repair bookings to call back", repairRequests.filter((r) => r && r.status === "new").length],
    ["Online phone orders to fulfil", webOrders.filter((o) => o && ["pending_payment", "pending_pickup", "paid"].includes(o.status)).length],
    [`Phones in stock over ${AGED_DAYS} days`, inStock.filter((i) => i.receivedAt && daysSince(i.receivedAt) > AGED_DAYS).length],
    ["Repair parts at or below reorder level", partsStock.filter((p) => p && !p.deleted && num(p.qtyOnHand) <= num(p.lowStockThreshold)).length],
    ["Customers to ask for a Google review", tickets.filter((t) => t && t.status === "completed" && t.jobType !== "shop" && t.completedAt && daysSince(t.completedAt) <= 7 && !(t.contactLog || []).some((c) => c.template === "review")).length],
  ].filter(([, n]) => n > 0);

  const lines = [
    `Takings today: ${money(takings)} from ${todays.length} sale${todays.length === 1 ? "" : "s"}` +
      (todays.length ? ` (phones ${money(kinds.phone)}, repairs ${money(kinds.repair)}, accessories ${money(kinds.accessory)})` : "") + ".",
    `Profit on today's sales: ${money(profit)}${unknownCost ? ` (${unknownCost} sale${unknownCost === 1 ? "" : "s"} with no cost recorded, left out)` : ""}.`,
    `Trade-ins: ${newTradeIns} new, ${paidToday.length} paid (${money(paidOut)} paid out).`,
    `Repairs finished: ${repairsDone.length}.`,
    `Stock: ${inStock.length} phone${inStock.length === 1 ? "" : "s"}, ${money(inStock.reduce((a, i) => a + num(i.costBasis), 0))} at cost.`,
    waiting.length ? `Waiting for tomorrow:\n${waiting.map(([k, n]) => `• ${k}: ${n}`).join("\n")}` : "Nothing waiting. The queue is clear.",
    "Open the dashboard for details: https://mobilerecellr.com.au/portal",
  ];
  return { day: today, subject: `Today at Mobile Recellr: ${money(takings)} taken, ${waiting.reduce((a, [, n]) => a + n, 0)} things waiting`, text: lines.join("\n\n"), takings, profit, waiting };
}

// Wires the scheduler. deps: { pool, loadSharedList, loadSharedValue, sendEmail, ownerEmail }
function start({ pool, loadSharedList, loadSharedValue, sendEmail, ownerEmail, everyMs = 15 * 60 * 1000 }) {
  const run = async () => {
    try {
      if (!process.env.RESEND_API_KEY) return;
      const now = new Date();
      if (Number(HOUR.format(now)) < SEND_AFTER_HOUR) return;
      const cfg = (await loadSharedValue("pricing-config")) || {};
      if (cfg.businessSettings && cfg.businessSettings.dailySummary === false) return;
      const day = sydneyDay(now);
      // Claim today's send in the database first, so two servers (or a restart) never send twice.
      const claim = await pool.query(
        `INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ('system', 'daily_summary_sent', $1, NOW(), 'system')
         ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW() WHERE storage.value <> EXCLUDED.value RETURNING key`, [day]);
      if (!claim.rowCount) return;
      const keys = ["sales", "repair_tickets", "orders", "inventory", "parts_stock", "purchase_orders", "repair_requests"];
      const [sales, tickets, orders, inventory, partsStock, webOrders, repairRequests] = await Promise.all(keys.map((k) => loadSharedList(k)));
      const s = buildDailySummary({ sales, tickets: tickets.filter((t) => t && !t.deleted), orders, inventory, partsStock, webOrders, repairRequests, now });
      await sendEmail({ to: ownerEmail(), subject: s.subject, text: s.text, kind: "daily summary" });
    } catch (e) { console.error("daily summary:", e.message); }
  };
  setTimeout(run, 90 * 1000).unref();
  setInterval(run, everyMs).unref();
  return run;
}

module.exports = { buildDailySummary, start, sydneyDay };
