// A customer approves (or declines) a repair price from the link staff send them.
// Run with: DATABASE_URL=postgres://... npm test   (drops all tables first)
process.env.TWO_STEP_ROLES = "";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

let app, server, base, owner;
const call = async (method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, body: json };
};
const KEY = "a3f9c2e81b7d4f60a3f9c2e81b7d4f60";
const JOB = { id: "R-501", status: "diagnosing", issue: "Cracked screen", deposit: 20, customer: { name: "Sam", phone: "0400000001", email: "sam@example.com" },
  device: { brand: "Apple", model: "iPhone 13", storage: "128GB", imei: "356938035643809" }, quotedPrice: 189,
  approvalRequest: { key: KEY, price: 189, sentAt: "2026-10-28T01:00:00.000Z" } };

before(async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts, login_log, known_devices, activity_log");
  await pool.end();
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await call("POST", "/auth/register", null, { username: "owner", password: "owner-password-1" });
  owner = (await call("POST", "/auth/login", null, { username: "owner", password: "owner-password-1" })).body.token;
  await call("PUT", "/storage/repair_tickets", owner, { value: JSON.stringify([JOB]), shared: true });
});
after(async () => { server.close(); await app.__db.end(); });

test("repair approval: the link shows only the device, issue and price, and only with the right key", async () => {
  assert.equal((await call("GET", "/public/repair-approval/R-501")).status, 404);
  assert.equal((await call("GET", "/public/repair-approval/R-501?k=" + KEY.replace("a", "b"))).status, 404);
  const r = await call("GET", "/public/repair-approval/R-501?k=" + KEY);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { id: "R-501", device: "Apple iPhone 13 128GB", issue: "Cracked screen", price: 189, deposit: 20, sentAt: JOB.approvalRequest.sentAt, decision: null, closed: false });
  assert.ok(!JSON.stringify(r.body).includes("0400000001") && !JSON.stringify(r.body).includes("356938"), "no phone number or IMEI");
});

test("repair approval: the customer approves, and a stale staff save can't wipe it", async () => {
  assert.equal((await call("POST", "/public/repair-approval/R-501", null, { k: KEY, decision: "maybe" })).status, 400);
  assert.equal((await call("POST", "/public/repair-approval/R-501", null, { k: "x".repeat(32), decision: "approve" })).status, 404);
  const r = await call("POST", "/public/repair-approval/R-501", null, { k: KEY, decision: "approve" });
  assert.equal(r.status, 200);
  assert.equal(r.body.decision, "approve");
  // A staff screen opened before the answer saves its old copy (assigning a technician).
  await call("PUT", "/storage/repair_tickets", owner, { value: JSON.stringify([{ ...JOB, assignedTo: "dev" }]), shared: true });
  const saved = JSON.parse((await call("GET", "/storage/repair_tickets?shared=true", owner)).body.value)[0];
  assert.equal(saved.assignedTo, "dev");
  assert.equal(saved.customerApproval.decision, "approve");
  assert.equal(saved.customerApproval.price, 189);
  // A new price sent after that starts over.
  const resent = { ...saved, approvalRequest: { key: KEY, price: 229, sentAt: new Date(Date.now() + 1000).toISOString() } };
  delete resent.customerApproval;
  await call("PUT", "/storage/repair_tickets", owner, { value: JSON.stringify([resent]), shared: true });
  const again = await call("GET", "/public/repair-approval/R-501?k=" + KEY);
  assert.equal(again.body.price, 229);
  assert.equal(again.body.decision, null);
});

test("repair approval: a closed job can't be answered", async () => {
  const list = JSON.parse((await call("GET", "/storage/repair_tickets?shared=true", owner)).body.value);
  await call("PUT", "/storage/repair_tickets", owner, { value: JSON.stringify([{ ...list[0], status: "completed" }]), shared: true });
  assert.equal((await call("POST", "/public/repair-approval/R-501", null, { k: KEY, decision: "decline" })).status, 409);
});
