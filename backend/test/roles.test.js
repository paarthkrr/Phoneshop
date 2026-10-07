// Staff roles are enforced by the server.
// Run with: DATABASE_URL=postgres://... npm test   (drops all tables first)
process.env.TWO_STEP_ROLES = "";
process.env.ACTIVITY_EMAIL_DELAY_MS = "50"; // two-step sign-in has its own tests (auth.test.js)
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
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts, login_log, known_devices, activity_log");
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

test("technician pay: only Owner/Manager-level access can set it or mark it paid", async () => {
  const job = { id: "RPR-9", status: "in_repair", assignedTo: "tech", device: { brand: "Apple", model: "iPhone 12" } };
  await put("repair_tickets", [{ ...job, techPay: 50 }], tok.manager);
  await put("repair_tickets", [{ ...job, techPay: 500, techPaidAt: "2026-10-01T00:00:00Z", timeSpentMins: 90 }], tok.tech);
  let saved = JSON.parse((await get("repair_tickets", tok.owner)).body.value).find((t) => t.id === "RPR-9");
  assert.equal(saved.techPay, 50, "technician can't raise their own pay");
  assert.equal(saved.techPaidAt, undefined, "or mark it paid");
  assert.equal(saved.timeSpentMins, 90, "but can log their time");
  await put("repair_tickets", [{ ...saved, techPaidAt: "2026-10-08T00:00:00Z" }], tok.owner);
  saved = JSON.parse((await get("repair_tickets", tok.owner)).body.value).find((t) => t.id === "RPR-9");
  assert.equal(saved.techPaidAt, "2026-10-08T00:00:00Z");
  const team = (await call("GET", "/auth/team", tok.tech)).body.team;
  assert.deepEqual(team.map((u) => u.username).sort(), ["counter", "manager", "owner", "tech"]);
  assert.ok(team.every((u) => Object.keys(u).sort().join() === "role,username"), "names and roles only");
});

test("the Owner can add or remove access for one person, live, without a sign-out", async () => {
  const access = (u, areas, t = tok.owner) => call("POST", `/auth/users/${u}/access`, t, { areas });
  assert.equal((await get("expenses", tok.counter)).status, 403);
  assert.equal((await access("counter", ["register", "reports"], tok.manager)).status, 403, "Owner only");
  assert.equal((await access("counter", ["register", "everything"])).status, 400);
  assert.equal((await access("owner", ["register"])).status, 400, "Owner always has full access");

  const r = await access("counter", ["register", "reports"]);
  assert.deepEqual(r.body.areas, ["register", "reports"]);
  assert.equal((await get("expenses", tok.counter)).status, 200, "granted, same sign-in");
  assert.deepEqual((await call("GET", "/auth/me", tok.counter)).body.areas, ["register", "reports"]);
  assert.match(JSON.parse((await get("orders", tok.counter)).body.value)[0].customer.bankAccountNumber, /^•••/, "bank still masked");

  await access("counter", ["reports"]);   // take the register away
  assert.equal((await put("inventory", [{ id: "x2" }], tok.counter)).status, 403);
  assert.equal((await get("till_records", tok.counter)).status, 403);

  const users = (await call("GET", "/auth/users", tok.owner)).body.users;
  const c = users.find((u) => u.username === "counter");
  assert.deepEqual(c.areas, ["reports"]);
  assert.deepEqual(c.roleAreas, ["register"]);

  await access("counter", ["register"]);  // back to the role's defaults = no custom access stored
  assert.equal(users.length, 4);
  assert.equal((await call("GET", "/auth/users", tok.owner)).body.users.find((u) => u.username === "counter").access, null);
  assert.equal((await get("expenses", tok.counter)).status, 403);

  const log = (await call("GET", "/activity?area=team", tok.owner)).body.entries;
  assert.ok(log.some((e) => /counter's access: \+ Customers, reports & expenses/.test(e.summary) && e.important === "access changed"));
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
