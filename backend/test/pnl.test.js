const { test } = require("node:test");
const assert = require("node:assert/strict");
// Profit & loss maths (frontend/src/pnl.js), checked against hand-worked numbers.
test("profit and loss: phones, accessories, repairs (live parts + technician pay), expenses, write-offs, till", async () => {
const { buildPnl, toCsv, monthsIn } = await import("../../frontend/src/pnl.js");
const sales = [
  { id: "S1", soldAt: "2026-10-03T01:00:00Z", brand: "Apple", model: "iPhone 13", storage: "128GB", salePrice: 650, costBasis: 420 },
  { id: "S2", soldAt: "2026-10-04T01:00:00Z", brand: "Accessory", model: "Case", storage: "Cases", salePrice: 30, costBasis: 8 },
  { id: "S3", soldAt: "2026-10-05T01:00:00Z", brand: "Apple", model: "iPhone 12", storage: "repair", salePrice: 189, costBasis: 60, channel: "repair", itemId: "RPR-1" },
  { id: "S4", soldAt: "2026-10-06T01:00:00Z", brand: "Samsung", model: "S21", salePrice: 400 },           // no cost recorded
  { id: "S5", soldAt: "2026-09-06T01:00:00Z", brand: "Samsung", model: "S20", salePrice: 300, costBasis: 200 },
];
const tickets = [{ id: "RPR-1", status: "completed", completedAt: "2026-10-05T01:00:00Z", parts: [{ cost: 60 }, { cost: 5 }], techPay: 40, timeSpentMins: 75, assignedTo: "ravi" },
  { id: "RPR-2", status: "completed", completedAt: "2026-09-01T01:00:00Z", parts: [], techPay: 25, assignedTo: "ravi", techPaidAt: null }];
const p = buildPnl({ sales, tickets, month: "2026-10", expenses: [{ category: "Rent", amount: 1000, date: "2026-10-01" }, { category: "Rent", amount: 999, date: "2026-09-01" }],
  inventory: [{ status: "written_off", costBasis: 50, writeOffAt: "2026-10-09T00:00:00Z" }], tillRecords: [{ closed: true, discrepancy: -5, closedAt: "2026-10-02T09:00:00Z" }] });
assert.equal(p.byKind.phone.profit, 230); assert.equal(p.byKind.phone.unknownCost, 1);
assert.equal(p.byKind.accessory.profit, 22);
assert.equal(p.byKind.repair.cost, 65); assert.equal(p.byKind.repair.labour, 40); assert.equal(p.byKind.repair.profit, 84);
assert.equal(p.grossProfit, 336); assert.equal(p.totalExpenses, 1000); assert.equal(p.writeOffs, 50); assert.equal(p.tillVariance, -5);
assert.equal(p.netProfit, 336 - 1000 - 50 - 5);
const ravi = p.technicians.find((t) => t.name === "ravi");
assert.deepEqual([ravi.jobs, ravi.minutes, ravi.pay, ravi.owed], [1, 75, 40, 65]);
assert.deepEqual(ravi.byType.customer, { jobs: 1, timed: 1, minutes: 75, pay: 40, revenue: 0, parts: 65 });
// Shop phones and counter repairs are counted apart; warranty comebacks count against the original technician.
const t2 = [
  { id: "J1", status: "completed", completedAt: "2026-10-02T00:00:00Z", assignedTo: "ravi", techPay: 30, timeSpentMins: 60, finalPrice: 150, parts: [{ cost: 40 }] },
  { id: "J2", status: "completed", completedAt: "2026-10-03T00:00:00Z", assignedTo: "ravi", jobType: "shop", techPay: 20, timeSpentMins: 30, parts: [{ cost: 25 }] },
  { id: "J3", status: "diagnosing", createdAt: "2026-10-04T00:00:00Z", warrantyOf: "J1", assignedTo: "sam" },
];
const r2 = buildPnl({ sales: [], tickets: t2, month: "2026-10" }).technicians.find((t) => t.name === "ravi");
assert.deepEqual(r2.byType.customer, { jobs: 1, timed: 1, minutes: 60, pay: 30, revenue: 150, parts: 40 });
assert.deepEqual(r2.byType.shop, { jobs: 1, timed: 1, minutes: 30, pay: 20, revenue: 0, parts: 25 });
assert.equal(r2.rework, 1);
assert.deepEqual([r2.jobs, r2.pay], [2, 50]);
assert.equal(buildPnl({ sales, tickets, month: "all" }).rows.length, 5);
assert.deepEqual(monthsIn({ sales, tickets }), ["2026-10", "2026-09"]);
assert.match(toCsv(p.rows), /2026-10-06,Phones,Samsung S21,,400,unknown,,,unknown/);
});
