const test = require("node:test");
const assert = require("node:assert");
const { buildDailySummary } = require("../daily-summary.js");

// 2026-10-28 20:00 Sydney (AEDT, UTC+11) = 09:00 UTC
const now = new Date("2026-10-28T09:00:00Z");
const today = "2026-10-28T02:00:00Z", yesterday = "2026-10-26T02:00:00Z";

test("daily summary: takings and profit count only today's Sydney sales", () => {
  const s = buildDailySummary({
    now,
    sales: [
      { soldAt: today, salePrice: 900, costBasis: 600, brand: "Apple", model: "iPhone 14" },
      { soldAt: today, salePrice: 150, channel: "repair", itemId: "R-1" },
      { soldAt: today, salePrice: 40, brand: "Accessory" }, // no cost: takings only
      { soldAt: yesterday, salePrice: 5000, costBasis: 1 },
    ],
    tickets: [{ id: "R-1", status: "completed", completedAt: today, parts: [{ cost: 30 }], techPay: 40 }],
  });
  assert.equal(s.takings, 1090);
  assert.equal(s.profit, 300 + 80);
  assert.match(s.text, /1 sale with no cost recorded/);
  assert.match(s.text, /Repairs finished: 1/);
});

test("daily summary: waiting list skips empty lines and counts what's due", () => {
  const s = buildDailySummary({
    now,
    orders: [{ status: "received_inspecting", createdAt: today }, { status: "approved_paid", paidAt: today, quotedTotal: 500, inspection: { confirmedTotal: 450 } }],
    tickets: [{ id: "R-2", status: "ready_for_pickup" }, { id: "R-3", status: "in_repair", createdAt: "2026-10-20T00:00:00Z" }],
    inventory: [{ status: "listed", receivedAt: "2026-09-01T00:00:00Z", costBasis: 300 }],
    partsStock: [{ qtyOnHand: 1, lowStockThreshold: 2 }],
  });
  assert.deepEqual(s.waiting.map(([k]) => k), ["Trade-ins to inspect", "Repairs ready, not yet collected", "Repair jobs open more than 5 days", "Phones in stock over 30 days", "Repair parts at or below reorder level"]);
  assert.match(s.text, /1 new, 1 paid \(\$450 paid out\)/);
  assert.match(s.subject, /5 things waiting/);
});

test("daily summary: a quiet day says the queue is clear", () => {
  const s = buildDailySummary({ now });
  assert.equal(s.takings, 0);
  assert.match(s.text, /The queue is clear/);
});
