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

test("anonymous visitors see only listed phones and no private stock fields", async () => {
  await put("inventory", [
    { id: "INV-L1", brand: "Apple", model: "iPhone 14", storage: "128GB", gradeId: "A", status: "listed", listedPrice: 700, currency: "$",
      imei: "356000000000001", costBasis: 410, sellerIdOwnerName: "Jane Citizen", sellerIdType: "licence", payMethod: "cash", staffHandled: "ravi",
      priceHistory: [{ price: 760, from: "2026-01-01T00:00:00.000Z", by: "ravi" }, { price: 700, from: "2026-02-01T00:00:00.000Z" }] },
    { id: "INV-S1", brand: "Apple", model: "iPhone 13", storage: "128GB", status: "in_stock", imei: "356000000000002", costBasis: 300, sellerIdOwnerName: "John Smith" },
  ], true);
  await put("accessories", [{ id: "ACC-1", name: "Case", sellPrice: 20, cost: 4, qtyOnHand: 3 }], true);
  const anon = async (key) => JSON.parse((await realFetch(`${base}/storage/${key}?shared=true`).then((r) => r.json())).value);
  const all = await anon("inventory");
  assert.ok(all.every((i) => i.status === "listed"), "only listed stock is public");
  const inv = all.filter((i) => i.id === "INV-L1" || i.id === "INV-S1");
  assert.deepEqual(inv.map((i) => i.id), ["INV-L1"], "unlisted stock is hidden");
  for (const k of ["imei", "costBasis", "sellerIdOwnerName", "sellerIdType", "payMethod", "staffHandled"]) assert.equal(inv[0][k], undefined, k);
  assert.equal(inv[0].listedPrice, 700);
  assert.deepEqual(inv[0].priceHistory[0], { price: 760, from: "2026-01-01T00:00:00.000Z" });
  const acc = await anon("accessories");
  assert.equal(acc[0].cost, undefined);
  assert.equal(acc[0].sellPrice, 20);
  // Staff still see everything.
  const staffInv = await getShared("inventory");
  assert.ok(staffInv.some((i) => i.id === "INV-S1"));
  assert.equal(staffInv.find((i) => i.id === "INV-L1").costBasis, 410);
});

test("'Was' prices only appear when the listing history backs them", async () => {
  const { wasPrice, pricePatch, publishPatch } = await import("../../frontend/src/price-history.js");
  const day = 864e5, t0 = Date.parse("2026-01-01T00:00:00Z");
  let item = { status: "in_stock", listedPrice: 800 };
  item = { ...item, ...publishPatch(item, new Date(t0)) };
  assert.equal(wasPrice(item, t0 + day), null, "no history, no was");
  const early = { ...item, ...pricePatch(item, 700, new Date(t0 + 5 * day)) };
  assert.equal(wasPrice(early, t0 + 6 * day), null, "old price was only live 5 days");
  item = { ...item, ...pricePatch(item, 700, new Date(t0 + 20 * day)) };
  assert.deepEqual(wasPrice(item, t0 + 21 * day), { was: 800, save: 100, pct: 13 });
  assert.equal(wasPrice(item, t0 + 90 * day), null, "drop older than 60 days");
  const up = { ...item, ...pricePatch(item, 900, new Date(t0 + 40 * day)) };
  assert.equal(wasPrice(up, t0 + 41 * day), null, "a price rise never shows a was");
  const legacy = { status: "listed", listedPrice: 800 };
  const cut = { ...legacy, ...pricePatch(legacy, 600, new Date(t0)) };
  assert.equal(wasPrice(cut, t0 + day), null, "listed before history: unknown start date");
  assert.deepEqual(pricePatch({ status: "in_stock", listedPrice: 800 }, 700), { listedPrice: 700 }, "unpublished changes keep no history");
});

test("customers can ask for a device we don't list, but can't read other requests", async () => {
  const req = { id: "DRQ-T1", createdAt: new Date().toISOString(), status: "open", brand: "Samsung", model: "Galaxy Z Fold9", storage: "512GB", name: "Sam", email: "sam@example.com" };
  process.env.DEVICE_REQUEST_COPY_EMAIL = "automation@example.com";
  const before = sent.length;
  const r = await put("device_requests", [req]);
  await settle();
  delete process.env.DEVICE_REQUEST_COPY_EMAIL;
  const mails = sent.slice(before).filter((m) => /Device request DRQ-T1: Samsung Galaxy Z Fold9 512GB/.test(m.subject));
  assert.deepEqual(mails.map((m) => m.to[0]).sort(), ["automation@example.com", "mobilerecellr@outlook.com"].sort(), "owner alert plus the optional copy");
  assert.equal(r.status, 200);
  assert.equal(r.body.submitted, 1);
  const anon = await realFetch(`${base}/storage/device_requests?shared=true`);
  assert.equal(anon.status, 401, "requests hold customer contact details");
  const list = await getShared("device_requests");
  assert.equal(list.find((x) => x.id === "DRQ-T1").model, "Galaxy Z Fold9");
});

test("an online phone order reserves the phone; a second order for it is refused", async () => {
  const inv = await getShared("inventory");
  await put("inventory", [...inv.filter((i) => !["INV-R1", "INV-R2"].includes(i.id)),
    { id: "INV-R1", brand: "Apple", model: "iPhone 15", storage: "128GB", gradeId: "A", status: "listed", listedPrice: 900, currency: "$" },
    { id: "INV-R2", brand: "Apple", model: "iPhone 12", storage: "64GB", gradeId: "B", status: "in_stock", listedPrice: 400, currency: "$" }], true);
  const order = (id, itemId) => ({ id, createdAt: new Date().toISOString(), itemId, price: 900, customer: { name: "Kim", email: `${id.toLowerCase()}@example.com` }, status: "pending_payment" });

  const first = await put("purchase_orders", [order("WEB-100001", "INV-R1")]);
  assert.equal(first.status, 200);
  const r1 = (await getShared("inventory")).find((i) => i.id === "INV-R1");
  assert.equal(r1.status, "reserved");
  assert.equal(r1.reservedByOrderId, "WEB-100001");

  const second = await put("purchase_orders", [order("WEB-100002", "INV-R1")]);
  assert.equal(second.status, 409, "already reserved");
  assert.equal(second.body.error, "item_unavailable");
  assert.equal((await put("purchase_orders", [order("WEB-100003", "INV-R2")])).status, 409, "not listed for sale");
  assert.equal((await put("purchase_orders", [order("WEB-100004", "INV-NOPE")])).status, 409, "doesn't exist");

  const orders = await getShared("purchase_orders");
  assert.ok(orders.some((o) => o.id === "WEB-100001"));
  assert.ok(!orders.some((o) => ["WEB-100002", "WEB-100003", "WEB-100004"].includes(o.id)), "refused orders are not saved");
  assert.equal((await getShared("inventory")).find((i) => i.id === "INV-R1").reservedByOrderId, "WEB-100001", "first buyer keeps it");
});

test("public inventory keeps real-photo 360 frames but drops junk entries", async () => {
  const good = Array.from({ length: 8 }, (_, k) => `https://example.com/public/product-images/f${k}`);
  await put("inventory", [{ id: "INV-SPIN", brand: "Apple", model: "iPhone 14", storage: "128GB", status: "listed", gradeId: "A", listedPrice: 700, costBasis: 400, imei: "356000000000009",
    spinUrls: [...good, "javascript:alert(1)", 5] }], true);
  const all = JSON.parse((await realFetch(`${base}/storage/inventory?shared=true`).then((r) => r.json())).value);
  const item = all.find((x) => x.id === "INV-SPIN");
  assert.equal(item.spinUrls.length, 8);
  assert.ok(item.spinUrls.every((u) => u.startsWith("https://")));
  assert.equal(item.costBasis, undefined);
  assert.equal(item.imei, undefined);
});

test("barcode lookup parses UPC results and maps our categories; junk is ignored", () => {
  const app = require("../server.js");
  const parse = app.__parseUpcLookup, mapCat = app.__mapBarcodeCategory;
  const r = parse({ items: [{ title: "Spigen Ultra Hybrid Case for iPhone 16", brand: "Spigen", category: "Electronics > Phone Cases", images: ["http://insecure/x.jpg", "https://cdn/y.jpg"] }] });
  assert.equal(r.found, true);
  assert.equal(r.brand, "Spigen");
  assert.equal(r.category, "Cases & covers", "category mapped to our own list");
  assert.equal(r.image, "https://cdn/y.jpg", "only https image kept");
  assert.equal(parse({ items: [] }).found, false);
  assert.equal(parse({}).found, false);
  assert.equal(mapCat("Tempered Glass Screen Protector"), "Screen protectors");
  assert.equal(mapCat("USB-C Wall Charger 20W"), "Chargers & cables");
  assert.equal(mapCat("Random thing"), "", "unknown category left blank, staff picks");
});
