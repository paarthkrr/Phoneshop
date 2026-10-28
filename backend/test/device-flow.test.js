const { test } = require("node:test");
const assert = require("node:assert/strict");
// One phone's journey (frontend/src/device-flow.js), checked against hand-worked numbers.
const d = (n) => new Date(Date.UTC(2026, 9, n)).toISOString();

test("phone story: bought on Marketplace, two repairs (one still open), listed, re-priced, sold", async () => {
  const { phoneStory, shopPrice } = await import("../../frontend/src/device-flow.js");
  // Paid 500. Repair R1 finished: parts 60 + labour 40, already added to cost (costBasis 600).
  // Repair R2 still open: parts 20, not in costBasis yet. Graded A, listed 949, dropped to 899, sold 899.
  const item = { id: "INV-1", source: "Facebook Marketplace", sellerName: "Tom", costBasis: 600, refurbJobs: [{ jobId: "R1", cost: 100 }],
    receivedAt: d(1), gradeId: "A", listedAt: d(6), listedPrice: 899, priceHistory: [{ price: 949, from: d(6) }, { price: 899, from: d(20) }], status: "sold" };
  const tickets = [
    { id: "R1", inventoryItemId: "INV-1", createdAt: d(2), completedAt: d(4), assignedTo: "Dev", techPay: 40, parts: [{ name: "Screen", cost: 60 }] },
    { id: "R2", inventoryItemId: "INV-1", createdAt: d(5), parts: [{ name: "Battery", cost: 20 }] },
    { id: "R9", inventoryItemId: "INV-other", createdAt: d(5), techPay: 999 },
  ];
  const sales = [{ id: "S1", itemId: "INV-1", salePrice: 899, soldAt: d(25), customerName: "Ann" }];
  const st = phoneStory(item, { tickets, sales });
  assert.equal(st.source, "Facebook Marketplace");
  assert.equal(st.bought, 500);
  assert.equal(st.repairCost, 120);
  assert.equal(st.totalCost, 620);
  assert.equal(st.soldFor, 899);
  assert.equal(st.profit, 279);
  assert.equal(st.daysToReady, 5);
  assert.equal(st.daysInShop, 24);
  assert.equal(st.target, shopPrice(620 * 1.35));
  assert.equal(st.belowStandard, false);
  assert.deepEqual(st.events.map((e) => e.kind), ["bought", "repair", "repair", "repair", "listed", "price", "sold"]);
});

test("phone story: unsold phone counts days to today and compares the asking price with the standard", async () => {
  const { phoneStory } = await import("../../frontend/src/device-flow.js");
  const item = { id: "INV-2", sourceOrderId: "ORD-1", costBasis: 400, receivedAt: d(1), gradeId: "B", listedPrice: 450, status: "listed", listedAt: d(3) };
  const st = phoneStory(item, { orders: [{ id: "ORD-1" }] }, new Date(d(11)));
  assert.equal(st.source, "Online trade-in");
  assert.equal(st.daysInShop, 10);
  assert.equal(st.target, 479); // 400 × 1.20 = 480 → shop price 479
  assert.equal(st.belowStandard, true);
  assert.equal(st.profit, 50);
});

test("IMEI check digit and shop prices", async () => {
  const { imeiProblem, targetPrice, shopPrice } = await import("../../frontend/src/device-flow.js");
  assert.equal(imeiProblem("490154203237518"), "");
  assert.equal(imeiProblem("4901 5420 3237 518"), "");
  assert.ok(imeiProblem("490154203237519"));
  assert.ok(imeiProblem("12345"));
  assert.equal(shopPrice(742), 749);
  assert.equal(shopPrice(1000), 999);
  assert.equal(targetPrice(0, "A"), null);
  assert.equal(targetPrice(100, "nope"), null);
});

test("aged stock: suggests ~5% off ending in 9, never under cost, only after 30 days", async () => {
  const { agedDrop } = await import("../../frontend/src/device-flow.js");
  const now = new Date(Date.UTC(2026, 9, 28));
  const item = (o) => ({ status: "listed", listedPrice: 949, costBasis: 600, listedAt: d(1), ...o });
  assert.equal(agedDrop(item({ listedAt: d(10) }), now), null); // 18 days: not aged
  assert.deepEqual(agedDrop(item({ listedAt: new Date(Date.UTC(2026, 8, 1)).toISOString() }), now), { days: 57, suggested: 899 });
  assert.equal(agedDrop(item({ listedAt: new Date(Date.UTC(2026, 8, 1)).toISOString(), costBasis: 900 }), now), null); // would go under cost
  assert.equal(agedDrop(item({ status: "sold", listedAt: new Date(Date.UTC(2026, 8, 1)).toISOString() }), now), null);
});

test("marketplace listing: title, price and a link to the phone", async () => {
  const { marketplaceListing } = await import("../../frontend/src/device-flow.js");
  const l = marketplaceListing({ id: "INV-7", brand: "Apple", model: "iPhone 14", storage: "128GB", gradeId: "A", listedPrice: 899 });
  assert.equal(l.title, "Apple iPhone 14 128GB - Excellent - 12 month warranty");
  assert.equal(l.price, 899);
  assert.match(l.text, /shop\?item=INV-7/);
  assert.match(l.text, /^Apple iPhone 14 128GB - Excellent - 12 month warranty\n\$899\n/);
});
