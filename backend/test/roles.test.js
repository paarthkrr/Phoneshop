// Staff roles are enforced by the server.
// Run with: DATABASE_URL=postgres://... npm test   (drops all tables first)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

let app, server, base;
const tok = {};
const call = async (method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, body: json };
};
const put = (key, list, token) => call("PUT", `/storage/${key}`, token, { value: JSON.stringify(list), shared: true });
const get = (key, token) => call("GET", `/storage/${key}?shared=true`, token);
const login = async (u) => (await call("POST", "/auth/login", null, { username: u, password: `${u}-password-1` })).body.token;

const ORDER = { id: "ORD-1", status: "awaiting_shipment", customer: { name: "Jane", email: "j@example.com", bankBsb: "062000", bankAccountNumber: "12345678", paypalEmail: "jane@pay.example" } };

before(async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts");
  await pool.end();
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await call("POST", "/auth/register", null, { username: "owner", password: "owner-password-1" });
  tok.owner = await login("owner");
  for (const [u, role] of [["manager", "manager"], ["counter", "staff"], ["tech", "technician"]]) {
    const r = await call("POST", "/auth/register", tok.owner, { username: u, password: `${u}-password-1`, role });
    assert.equal(r.body.role, role);
    tok[u] = await login(u);
  }
  await put("orders", [ORDER], tok.owner);
});
after(async () => { server.close(); await app.__db.end(); });

test("only Owner and Manager see full bank details", async () => {
  for (const u of ["owner", "manager"]) assert.equal(JSON.parse((await get("orders", tok[u])).body.value)[0].customer.bankAccountNumber, "12345678", u);
  for (const u of ["counter", "tech"]) {
    const c = JSON.parse((await get("orders", tok[u])).body.value)[0].customer;
    assert.equal(c.bankAccountNumber, "•••678", u);
    assert.equal(c.bankBsb, "•••000", u);
    assert.equal(c.paypalEmail, "•••ple", u);
    assert.equal(c.name, "Jane", "other fields untouched");
  }
});

test("a Counter save can't overwrite the real bank details, and its response stays masked", async () => {
  const masked = JSON.parse((await get("orders", tok.counter)).body.value);
  const r = await put("orders", masked.map((o) => ({ ...o, status: "received_inspecting" })), tok.counter);
  assert.equal(r.status, 200);
  assert.ok(!r.body.value.includes("12345678"), "response masked");
  const stored = JSON.parse((await get("orders", tok.owner)).body.value)[0];
  assert.equal(stored.status, "received_inspecting", "the Counter's change is saved");
  assert.equal(stored.customer.bankAccountNumber, "12345678", "real number kept");
  assert.equal(stored.customer.bankBsb, "062000");
});

test("what each role can open and change", async () => {
  const cases = [
    // [user, method, key, expected status]
    ["tech", "PUT", "orders", 403],
    ["tech", "PUT", "pricing-config", 200],
    ["counter", "PUT", "pricing-config", 403],
    ["counter", "PUT", "inventory", 200],
    ["tech", "PUT", "inventory", 403],
    ["tech", "PUT", "repair_tickets", 200],
    ["tech", "GET", "till_records", 403],
    ["counter", "GET", "expenses", 403],
    ["counter", "PUT", "expenses", 403],
    ["manager", "PUT", "expenses", 200],
    ["tech", "GET", "quote_leads", 403],
    ["manager", "PUT", "quote_leads", 200],
    ["counter", "PUT", "some_new_list", 403],
    ["manager", "PUT", "some_new_list", 200],
  ];
  for (const [u, method, key, want] of cases) {
    const r = method === "PUT" ? await put(key, [{ id: "x1" }], tok[u]) : await get(key, tok[u]);
    assert.equal(r.status, want, `${u} ${method} ${key}`);
  }
  assert.equal((await call("GET", "/auth/users", tok.manager)).status, 403, "team list is Owner only");
  assert.equal((await call("DELETE", "/storage/inventory?shared=true", tok.manager)).status, 403, "wiping a list is Owner only");
});

test("changing a role signs the person out; only the Owner can do it; one Owner always remains", async () => {
  assert.equal((await call("POST", "/auth/users/tech/role", tok.manager, { role: "manager" })).status, 403);
  assert.equal((await call("POST", "/auth/users/tech/role", tok.owner, { role: "superuser" })).status, 400);
  assert.equal((await call("POST", "/auth/users/tech/role", tok.owner, { role: "manager" })).status, 200);
  assert.equal((await get("repair_tickets", tok.tech)).status, 401, "old sign-in ended");
  const fresh = await login("tech");
  assert.equal(JSON.parse((await get("orders", fresh)).body.value)[0].customer.bankAccountNumber, "12345678", "now a Manager");
  assert.equal((await call("POST", "/auth/users/owner/role", tok.owner, { role: "staff" })).status, 400, "last Owner stays");
});
