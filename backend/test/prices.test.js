// Prices on anonymous orders are set or checked by the server.
// Run with: DATABASE_URL=postgres://... npm test   (drops all tables first)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

process.env.TWO_STEP_ROLES = ""; // two-step sign-in has its own tests (auth.test.js)
process.env.RESEND_API_KEY = "test-key";
process.env.PUBLIC_WRITE_MAX = "1000";
const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://api.resend.com")) { sent.push(JSON.parse(opts.body)); return new Response("{}", { status: 200 }); }
  return realFetch(url, opts);
};
const settle = () => new Promise((r) => setTimeout(r, 100));

let app, server, base, token, pricing, device, storage;
const put = (key, list, auth) => realFetch(`${base}/storage/${key}`, { method: "PUT",
  headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ value: JSON.stringify(list), shared: true }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const getShared = async (key) => JSON.parse((await realFetch(`${base}/storage/${key}?shared=true`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())).value);

before(async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts, login_log, known_devices, activity_log");
  await pool.end();
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => realFetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  await post("/auth/register", { username: "owner", password: "owner-pass-2026" });
  token = (await post("/auth/login", { username: "owner", password: "owner-pass-2026" })).token;
  pricing = await import("../../frontend/src/pricing.js");
  const { DEFAULT_CATALOG } = await import("../../frontend/src/device-catalog.js");
  device = DEFAULT_CATALOG.find((d) => d.brand === "Apple" && d.retail);
  storage = Object.keys(device.retail)[0];
});
after(async () => { server.close(); await app.__db.end(); });

const tradeIn = (id, extra) => ({ id, createdAt: new Date().toISOString(), region: "AU", currency: "AUD",
  device: { brand: device.brand, model: device.model, storage }, tierId: "good", status: "awaiting_shipment",
  customer: { name: "Pat", email: `${id}@example.com` }, ...extra });

test("an honest trade-in quote is accepted and marked verified", async () => {
  const b = pricing.brandNewBase({}, { brand: device.brand, model: device.model, storage, region: "AU" });
  await put("orders", [tradeIn("ORD-100001", { brandNewBase: b, quotedTotal: Math.round(b * 0.89 * 0.98) })]);
  const o = (await getShared("orders")).find((x) => x.id === "ORD-100001");
  assert.deepEqual(o.priceCheck, { verified: true });
  assert.ok(Math.abs(o.brandNewBase - b) < 1);
});

test("an inflated trade-in is flagged and staff re-assessment uses the shop's price", async () => {
  const b = pricing.brandNewBase({}, { brand: device.brand, model: device.model, storage, region: "AU" });
  await put("orders", [tradeIn("ORD-100002", { brandNewBase: b * 10, quotedTotal: Math.round(b * 10) })]);
  await put("notification_queue", [{ id: "NTF-P1", type: "order_confirmation", relatedId: "ORD-100002" }]);
  await settle();
  const o = (await getShared("orders")).find((x) => x.id === "ORD-100002");
  assert.ok(Math.abs(o.brandNewBase - b) < 1, "base replaced with the shop's price");
  assert.equal(o.priceCheck.verified, false);
  assert.equal(o.priceCheck.quoteTooHigh, true);
  const mail = sent.find((m) => m.to[0] === "ORD-100002@example.com");
  assert.ok(mail && !/\$\d/.test(mail.text), "confirmation email doesn't repeat the unverified amount");
});

test("a device that isn't in the price list is flagged", async () => {
  await put("orders", [tradeIn("ORD-100003", { device: { brand: "Apple", model: "iPhone 99", storage: "1TB" }, brandNewBase: 5000, quotedTotal: 4000 })]);
  const o = (await getShared("orders")).find((x) => x.id === "ORD-100003");
  assert.equal(o.priceCheck.verified, false);
  assert.match(o.priceCheck.reason, /not in the price list/);
});

test("a phone purchase uses the listed inventory price", async () => {
  await put("inventory", [{ id: "INV-1", brand: "Apple", model: "iPhone 14", storage: "128GB", status: "listed", listedPrice: 650 }], true);
  await put("purchase_orders", [{ id: "PO-1", createdAt: "2026-10-07T00:00:00Z", itemId: "INV-1", brand: "Apple", model: "iPhone 14", price: 1, customer: { email: "b@example.com" } }]);
  const o = (await getShared("purchase_orders")).find((x) => x.id === "PO-1");
  assert.equal(o.price, 650);
  assert.equal(o.priceCheck.verified, false);
});

test("an accessories order uses catalogue prices and the shop's shipping rule", async () => {
  await put("accessories", [{ id: "ACC-CASE", name: "Clear case", category: "Cases", sellPrice: 20, qtyOnHand: 10 }], true);
  await put("accessory_orders", [{ id: "ACC-1", createdAt: "2026-10-07T00:00:00Z", fulfilment: "delivery", status: "new",
    items: [{ id: "ACC-CASE", name: "Clear case", price: 0.01, qty: 2 }], subtotal: 0.02, shipping: 0, total: 0.02, customer: { email: "c@example.com" } }]);
  const o = (await getShared("accessory_orders")).find((x) => x.id === "ACC-1");
  assert.equal(o.items[0].price, 20);
  assert.equal(o.subtotal, 40);
  assert.equal(o.shipping, 9.95);
  assert.equal(o.total, 49.95);
  assert.equal(o.priceCheck.verified, false);
});
