// Run against a throwaway Postgres: DATABASE_URL=postgres://... npm test
// Every table is dropped first, so never point this at a real database.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

process.env.RESEND_API_KEY = "test-key";
process.env.OWNER_EMAIL = "owner@example.com";
process.env.PUBLIC_WRITE_MAX = "1000";
process.env.ID_PHOTO_ENCRYPTION_KEY = "a".repeat(64);

// Capture outgoing email instead of calling Resend.
const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://api.resend.com")) { sent.push(JSON.parse(opts.body)); return new Response("{}", { status: 200 }); }
  return realFetch(url, opts);
};
const settle = () => new Promise((r) => setTimeout(r, 100));

let app, server, base, adminToken, staffToken;

async function call(method, path, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await realFetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, body: json };
}
const put = (key, list, token) => call("PUT", `/storage/${key}`, { body: { value: JSON.stringify(list), shared: true }, token });
const getShared = async (key) => { const r = await call("GET", `/storage/${key}?shared=true`, { token: adminToken }); return r.status === 404 ? [] : JSON.parse(r.body.value); };

const ORDER = {
  id: "ORD-111111", createdAt: "2026-10-01T00:00:00.000Z", status: "awaiting_shipment", region: "AU", currency: "AUD",
  device: { brand: "Apple", model: "iPhone 15", storage: "128GB" }, quotedTotal: 410, referralCode: "JANE-AB12",
  customer: { name: "Jane Citizen", email: "jane@example.com", phone: "0400000000", payoutMethod: "bank", bankBsb: "062000", bankAccountNumber: "12345678", idOwnerName: "Jane Citizen" },
  address: "1 Test St", inspection: null,
};

before(async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts");
  await pool.end();
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await call("POST", "/auth/register", { body: { username: "owner", password: "ownerpass1" } });
  adminToken = (await call("POST", "/auth/login", { body: { username: "owner", password: "ownerpass1" } })).body.token;
  await call("POST", "/auth/register", { body: { username: "staff", password: "staffpass1", role: "staff" }, token: adminToken });
  staffToken = (await call("POST", "/auth/login", { body: { username: "staff", password: "staffpass1" } })).body.token;
  assert.equal((await put("orders", [ORDER])).status, 200);
  await settle();
});
after(async () => { server.close(); await app.__db.end(); });

test("owner alert for a new order leaves out bank and ID details", () => {
  const alert = sent.find((m) => m.to[0] === "owner@example.com" && m.subject.includes("Jane"));
  assert.ok(alert, "owner was alerted");
  assert.ok(!alert.text.includes("062000") && !alert.text.includes("12345678"), "no BSB / account number");
  assert.ok(!/idOwnerName/i.test(alert.text), "no ID details");
  assert.ok(alert.text.includes("jane@example.com"), "still has contact email");
});

test("public lookup returns only tracking fields", async () => {
  const r = await call("GET", "/public/find/orders?field=id&value=ord-111111");
  assert.equal(r.status, 200);
  assert.equal(r.body.record.status, "awaiting_shipment");
  assert.equal(r.body.record.device.model, "iPhone 15");
  assert.equal(r.body.record.customer, undefined);
  assert.equal(r.body.record.address, undefined);
  assert.ok(!JSON.stringify(r.body).includes("12345678"));
  assert.equal((await call("GET", "/public/find/orders?field=customer.email&value=JANE@example.com")).body.record.id, "ORD-111111");
});

test("public lookup refuses arbitrary fields and private collections", async () => {
  assert.equal((await call("GET", "/public/find/orders?field=status&value=awaiting_shipment")).status, 400);
  assert.equal((await call("GET", "/public/find/orders?field=referralCode&value=JANE-AB12")).status, 400);
  assert.equal((await call("GET", "/public/find/orders?field=customer.bankAccountNumber&value=12345678")).status, 400);
  assert.equal((await call("GET", "/public/find/notification_queue?field=id&value=x")).status, 401);
  assert.equal((await call("GET", "/public/find/referrals?field=id&value=x")).status, 401);
});

test("anonymous notification cannot email arbitrary people or text", async () => {
  const before = sent.length;
  const r = await put("notification_queue", [{ id: "NTF-1", type: "support_query", channel: "email", recipientEmail: "victim@example.com",
    subject: "Verify your bank account", message: "Click https://evil.example", relatedId: "SUP-NOPE" }]);
  assert.equal(r.status, 200);
  assert.equal(r.body.submitted, 0);
  await settle();
  assert.equal(sent.length, before, "nothing was emailed");
  assert.ok(!(await getShared("notification_queue")).some((n) => n.id === "NTF-1"), "nothing was stored");
});

test("confirmation goes to the record's email with server wording, once", async () => {
  await put("repair_requests", [{ id: "REP-222222", createdAt: "2026-10-01T00:00:00.000Z", status: "new", name: "sam lee", email: "sam@example.com",
    phone: "", deviceType: "Phone", model: "Pixel 9", issue: "Cracked screen", method: "walk-in" }]);
  await settle();
  const before = sent.length;
  await put("notification_queue", [{ id: "NTF-2", type: "repair_request", channel: "email", recipientEmail: "victim@example.com",
    subject: "Verify your bank account", message: "Click https://evil.example", relatedId: "REP-222222" }]);
  await settle();
  const mails = sent.slice(before);
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, ["sam@example.com"]);
  assert.equal(mails[0].subject, "Repair request REP-222222 received");
  assert.ok(mails[0].text.startsWith("Hi Sam,"));
  assert.ok(mails[0].text.includes("Pixel 9") && !mails[0].text.includes("evil"));

  const again = await put("notification_queue", [{ id: "NTF-3", type: "repair_request", channel: "email", recipientEmail: "sam@example.com", relatedId: "REP-222222" }]);
  assert.equal(again.body.submitted, 0);
  await settle();
  assert.equal(sent.length, before + 1, "no second email for the same record");
});

test("confirmation text strips links planted in form fields", async () => {
  await put("repair_requests", [{ id: "REP-333333", status: "new", name: "x", email: "x@example.com", deviceType: "Phone", model: "Visit evil.com/login now", issue: "x" }]);
  const before = sent.length;
  await put("notification_queue", [{ id: "NTF-4", type: "repair_request", relatedId: "REP-333333" }]);
  await settle();
  const mail = sent.slice(before).find((m) => m.to[0] === "x@example.com");
  assert.ok(mail && !mail.text.includes("evil.com"));
});

test("a clashing reference number is refused; an identical retry succeeds", async () => {
  assert.equal((await put("orders", [ORDER])).status, 200, "identical retry");
  const clash = await put("orders", [{ ...ORDER, customer: { ...ORDER.customer, email: "someone@example.com" } }]);
  assert.equal(clash.status, 409);
  const stored = (await getShared("orders")).filter((o) => o.id === "ORD-111111");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].customer.email, "jane@example.com");
});

test("referrals: server fills in the referrer and drops self-referrals", async () => {
  await put("referrals", [{ id: "REF-1", code: "jane-ab12", referredEmail: "new@example.com", referredName: "New", referredOrderId: "ORD-9", referrerPaid: true }]);
  await put("referrals", [{ id: "REF-2", code: "JANE-AB12", referredEmail: "JANE@example.com", referredName: "Jane" }]);
  await put("referrals", [{ id: "REF-3", code: "NOPE-0000", referredEmail: "b@example.com" }]);
  const refs = await getShared("referrals");
  assert.deepEqual(refs.map((r) => r.id), ["REF-1"]);
  assert.equal(refs[0].referrerEmail, "jane@example.com");
  assert.equal(refs[0].referrerPaid, false);
});

test("anonymous ID photo: only for an existing order, only once", async () => {
  const img = Buffer.from("fake image").toString("base64");
  assert.equal((await call("POST", "/id-photos", { body: { subjectKey: "order:ORD-000000", imageBase64: img } })).status, 403);
  assert.equal((await call("POST", "/id-photos", { body: { subjectKey: "instore:INV-1", imageBase64: img } })).status, 403);
  assert.equal((await call("POST", "/id-photos", { body: { subjectKey: "order:ORD-111111", imageBase64: img } })).status, 200);
  assert.equal((await call("POST", "/id-photos", { body: { subjectKey: "order:ORD-111111", imageBase64: img } })).status, 409);
  assert.equal((await call("POST", "/id-photos", { body: { subjectKey: "instore:INV-1", imageBase64: img }, token: staffToken })).status, 200, "staff unaffected");
});

test("only an admin can delete a shared collection", async () => {
  await put("scratch_list", [{ id: "a" }], staffToken);
  assert.equal((await call("DELETE", "/storage/scratch_list?shared=true", { token: staffToken })).status, 403);
  assert.equal((await call("DELETE", "/storage/scratch_list?shared=true", { token: adminToken })).status, 200);
  assert.equal((await call("DELETE", "/storage/my_draft?shared=false", { token: staffToken })).status, 200, "own private data still fine");
});

test("a stale staff save keeps the customer's answer; a newer re-inspection wins", async () => {
  const orders = await getShared("orders");
  const revised = orders.map((o) => o.id === ORDER.id ? { ...o, status: "revised_pending_customer", inspection: { confirmedTotal: 350, staffNote: "scratch", inspectedAt: "2026-10-02T00:00:00.000Z" } } : o);
  await put("orders", revised, staffToken);
  const r = await call("POST", `/public/orders/${ORDER.id}/respond`, { body: { email: "JANE@example.com", decision: "accept" } });
  assert.equal(r.body.status, "approved_paid");

  await put("orders", revised, staffToken); // copy loaded before the customer answered
  let o = (await getShared("orders")).find((x) => x.id === ORDER.id);
  assert.equal(o.status, "approved_paid");
  assert.equal(o.inspection.customerDecision, "accept");

  const reinspect = (await getShared("orders")).map((x) => x.id === ORDER.id ? { ...x, status: "revised_pending_customer", inspection: { confirmedTotal: 300, staffNote: "again", inspectedAt: new Date(Date.now() + 1000).toISOString() } } : x);
  await put("orders", reinspect, staffToken);
  o = (await getShared("orders")).find((x) => x.id === ORDER.id);
  assert.equal(o.status, "revised_pending_customer");
  assert.equal(o.inspection.confirmedTotal, 300);
});

test("public lookups are rate limited", async () => {
  let last;
  for (let i = 0; i < 70; i++) last = await call("GET", "/public/find/orders?field=id&value=ORD-NONE");
  assert.equal(last.status, 429);
});
