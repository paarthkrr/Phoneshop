// Activity log: staff changes are recorded (without bank/ID values), the owner
// is emailed one bundle for important changes, and only the Owner can read it.
// Drops all tables first — never point at a real database.
process.env.TWO_STEP_ROLES = "";
process.env.RESEND_API_KEY = "test-key";
process.env.OWNER_EMAIL = "owner@example.com";
process.env.ACTIVITY_EMAIL_DELAY_MS = "150";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { diffSave } = require("../activity.js");

const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://api.resend.com")) { sent.push(JSON.parse(opts.body)); return new Response("{}", { status: 200 }); }
  return realFetch(url, opts);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let app, server, base;
const tok = {};
async function call(method, path, token, body) {
  const res = await realFetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, body: json };
}
const put = (key, value, token) => call("PUT", `/storage/${key}`, token, { value: JSON.stringify(value), shared: true });
const log = async (q = "") => (await call("GET", `/activity${q}`, tok.owner)).body.entries;

const ORDER = { id: "ORD-1", status: "received", quotedTotal: 300, customer: { name: "Jane", email: "j@example.com", bankBsb: "062000", bankAccountNumber: "12345678" } };

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
  tok.owner = (await call("POST", "/auth/login", null, { username: "owner", password: "owner-password-1" })).body.token;
  await call("POST", "/auth/register", tok.owner, { username: "sam", password: "sam-counter-pass", role: "staff" });
  tok.sam = (await call("POST", "/auth/login", null, { username: "sam", password: "sam-counter-pass" })).body.token;
  await wait(300); sent.length = 0;
});
after(async () => { server.close(); await app.__db.end(); });

test("diff: added, changed fields, removed; sensitive values never stored", () => {
  const ev = diffSave("orders", JSON.stringify([ORDER, { id: "ORD-2", status: "x" }]),
    JSON.stringify([{ ...ORDER, status: "approved_paid", inspection: { confirmedTotal: 280 }, customer: { ...ORDER.customer, bankAccountNumber: "99999999" } }, { id: "ORD-3" }]));
  const changed = ev.find((e) => e.recordId === "ORD-1");
  assert.equal(changed.action, "changed");
  assert.deepEqual(changed.changes.find((c) => c.field === "status"), { field: "status", from: "received", to: "approved_paid" });
  assert.deepEqual(changed.changes.find((c) => c.field === "customer.bankAccountNumber"), { field: "customer.bankAccountNumber", hidden: true });
  assert.ok(!JSON.stringify(ev).includes("99999999") && !JSON.stringify(ev).includes("12345678"));
  assert.match(changed.important, /payout approved \$280/);
  assert.equal(ev.find((e) => e.recordId === "ORD-2").action, "removed");
  assert.equal(ev.find((e) => e.recordId === "ORD-3").action, "added");
  assert.equal(diffSave("orders", JSON.stringify([ORDER]), JSON.stringify([ORDER])).length, 0, "no change, no event");
});

test("staff saves are logged with who did it; owner gets one bundled email for important ones", async () => {
  await put("orders", [ORDER], tok.sam);
  await put("repair_tickets", [{ id: "RPR-1", status: "diagnosing", device: { brand: "Apple", model: "iPhone 12" } }], tok.sam);
  await put("repair_tickets", [{ id: "RPR-1", status: "in_repair", device: { brand: "Apple", model: "iPhone 12" } }], tok.sam);
  await put("orders", [{ ...ORDER, status: "approved_paid", inspection: { confirmedTotal: 280 } }], tok.sam);
  await put("expenses", [{ id: "EXP-1", category: "Rent", amount: 1200 }], tok.owner);

  const entries = await log();
  const repair = entries.find((e) => e.area === "repair_tickets" && e.action === "changed");
  assert.equal(repair.username, "sam");
  assert.deepEqual(repair.changes, [{ field: "status", from: "diagnosing", to: "in_repair" }]);
  assert.equal(repair.important, null, "routine change: log only");
  assert.ok(!JSON.stringify(entries).includes("12345678"), "bank number never logged");

  await wait(400);
  const mails = sent.filter((m) => /Portal change/.test(m.subject));
  assert.equal(mails.length, 1, "bundled into one email");
  assert.match(mails[0].subject, /2 important/);
  assert.match(mails[0].text, /sam \(Counter\), Trade-in orders: trade-in payout approved \$280/);
  assert.match(mails[0].text, /owner \(Owner\), Expenses: expense added \$1200/);
  assert.ok(!/12345678|062000/.test(mails[0].text));
});

test("deleting records and team changes are important", async () => {
  sent.length = 0;
  await put("expenses", [{ id: "EXP-1", category: "Rent", amount: 1200 }, { id: "EXP-2", category: "Other", description: "Coffee", amount: 9 }], tok.owner);
  await wait(400); sent.length = 0;
  await put("expenses", [{ id: "EXP-1", category: "Rent", amount: 1200 }], tok.owner);
  await call("POST", "/auth/users/sam/role", tok.owner, { role: "technician" });
  await wait(400);
  const text = sent.map((m) => m.text).join("\n");
  assert.match(text, /Expenses: deleted\n  deleted EXP-2 · Coffee/);
  assert.match(text, /Team: role changed/);
  const team = await log("?area=team");
  assert.ok(team.some((e) => /sam: Counter → Technician/.test(e.summary)));
});

test("only the Owner can read the log; filters work", async () => {
  tok.sam = (await call("POST", "/auth/login", null, { username: "sam", password: "sam-counter-pass" })).body.token;
  assert.equal((await call("GET", "/activity", tok.sam)).status, 403);
  const imp = await log("?important=1");
  assert.ok(imp.length && imp.every((e) => e.important));
  const sams = await log("?user=SAM");
  assert.ok(sams.length && sams.every((e) => e.username === "sam"));
  const first = await log();
  const older = await log(`?before=${first[1].id}`);
  assert.ok(older.every((e) => e.id < first[1].id));
});
