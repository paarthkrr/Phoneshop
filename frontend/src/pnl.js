// Profit & loss from the shop's own records. Pure functions (no storage), so
// the numbers can be tested. Sources:
//   sales          every sale: phones (costBasis = what the shop paid), accessories
//                  (costBasis = unit cost), repairs (channel "repair")
//   repair_tickets parts used (cost each) and technician pay (techPay), read live,
//                  so a pay or part added after the job was completed still counts
//   expenses       rent, wages, ... (date or createdAt)
//   inventory      written-off stock (costBasis, writeOffAt)
//   till_records   closed tills: over (+) / short (−)

export const saleKind = (s) => (s.channel === "repair" ? "repair" : s.brand === "Accessory" ? "accessory" : "phone");
export const KIND_LABELS = { phone: "Phones", repair: "Repairs", accessory: "Accessories" };
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const monthOf = (iso) => (typeof iso === "string" ? iso.slice(0, 7) : "");
export const partsCostOf = (t) => (t && Array.isArray(t.parts) ? t.parts.reduce((s, p) => s + (num(p && p.cost) || 0), 0) : 0);

export function monthsIn({ sales = [], expenses = [], tickets = [] }) {
  const m = new Set();
  sales.forEach((s) => s && s.soldAt && m.add(monthOf(s.soldAt)));
  expenses.forEach((e) => e && m.add(monthOf(e.date || e.createdAt)));
  tickets.forEach((t) => t && t.completedAt && m.add(monthOf(t.completedAt)));
  m.delete("");
  return [...m].sort().reverse();
}

// month: "YYYY-MM", or "all"
export function buildPnl({ sales = [], tickets = [], expenses = [], inventory = [], tillRecords = [], month = "all" }) {
  const inPeriod = (iso) => month === "all" || monthOf(iso) === month;
  const ticketById = new Map(tickets.filter((t) => t && t.id).map((t) => [t.id, t]));

  const rows = sales.filter((s) => s && inPeriod(s.soldAt)).map((s) => {
    const kind = saleKind(s);
    const sold = num(s.salePrice) || 0;
    let cost = num(s.costBasis), labour = 0, technician = "";
    if (kind === "repair") {
      const t = ticketById.get(s.itemId);
      cost = t ? partsCostOf(t) : num(s.partsCost) ?? cost;
      labour = t ? num(t.techPay) || 0 : num(s.labourCost) || 0;
      technician = (t && t.assignedTo) || s.technician || "";
    }
    return {
      id: s.id, date: s.soldAt, kind, item: [s.brand !== "Accessory" ? s.brand : "", s.model, kind === "phone" ? s.storage : ""].filter(Boolean).join(" "),
      customer: s.customerName || "", sold, cost, labour, technician,
      profit: cost == null ? null : sold - cost - labour,
    };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const byKind = {};
  for (const k of Object.keys(KIND_LABELS)) byKind[k] = { count: 0, revenue: 0, cost: 0, labour: 0, profit: 0, unknownCost: 0, unknownRevenue: 0 };
  for (const r of rows) {
    const k = byKind[r.kind];
    k.count += 1;
    if (r.profit == null) { k.unknownCost += 1; k.unknownRevenue += r.sold; continue; }
    k.revenue += r.sold; k.cost += r.cost; k.labour += r.labour; k.profit += r.profit;
  }
  const grossProfit = Object.values(byKind).reduce((s, k) => s + k.profit, 0);

  const expenseByCategory = {};
  let totalExpenses = 0;
  for (const e of expenses) {
    if (!e || !inPeriod(e.date || e.createdAt)) continue;
    const a = num(e.amount) || 0;
    expenseByCategory[e.category || "Other"] = (expenseByCategory[e.category || "Other"] || 0) + a;
    totalExpenses += a;
  }
  const writeOffs = inventory.filter((i) => i && i.status === "written_off" && inPeriod(i.writeOffAt || i.receivedAt)).reduce((s, i) => s + (num(i.costBasis) || 0), 0);
  const tillVariance = tillRecords.filter((r) => r && r.closed && inPeriod(r.closedAt || r.date)).reduce((s, r) => s + (num(r.discrepancy) || 0), 0);
  const netProfit = grossProfit - totalExpenses - writeOffs + tillVariance;

  // Technicians: jobs completed in the period, time, pay; plus pay still owed (any period).
  const techs = new Map();
  const tech = (name) => { if (!techs.has(name)) techs.set(name, { name, jobs: 0, minutes: 0, pay: 0, owed: 0, owedJobs: [] }); return techs.get(name); };
  for (const t of tickets) {
    if (!t || t.status !== "completed") continue;
    const name = t.assignedTo || "Not assigned";
    const pay = num(t.techPay) || 0;
    if (inPeriod(t.completedAt)) { const x = tech(name); x.jobs += 1; x.minutes += num(t.timeSpentMins) || 0; x.pay += pay; }
    if (pay > 0 && !t.techPaidAt) { const x = tech(name); x.owed += pay; x.owedJobs.push(t.id); }
  }
  const technicians = [...techs.values()].sort((a, b) => b.pay + b.owed - (a.pay + a.owed));

  return { rows, byKind, grossProfit, expenseByCategory, totalExpenses, writeOffs, tillVariance, netProfit, technicians,
    unknownCount: Object.values(byKind).reduce((s, k) => s + k.unknownCost, 0) };
}

export function toCsv(rows) {
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Date", "Type", "Item", "Customer", "Sold for", "Cost (phone / parts / item)", "Technician pay", "Technician", "Profit"];
  return [head, ...rows.map((r) => [String(r.date || "").slice(0, 10), KIND_LABELS[r.kind], r.item, r.customer, r.sold, r.cost ?? "unknown", r.labour || "", r.technician, r.profit ?? "unknown"])]
    .map((line) => line.map(esc).join(",")).join("\n");
}
