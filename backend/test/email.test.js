// New email design keeps the security rules; rate limits use Cloudflare's visitor IP.
// Run with: DATABASE_URL=postgres://... npm test   (drops all tables first)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

process.env.TWO_STEP_ROLES = ""; // two-step sign-in has its own tests (auth.test.js)
process.env.RESEND_API_KEY = "test-key";
process.env.OWNER_EMAIL = "owner@example.com";
process.env.PUBLIC_WRITE_MAX = "1000";
const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://api.resend.com")) { sent.push(JSON.parse(opts.body)); return new Response('{"id":"em_1"}', { status: 200 }); }
  return realFetch(url, opts);
};
const settle = () => new Promise((r) => setTimeout(r, 100));
let app, server, base;
const put = (key, list, headers = {}) => realFetch(`${base}/storage/${key}`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ value: JSON.stringify(list), shared: true }) });
const find = (headers) => realFetch(`${base}/public/find/orders?field=id&value=ORD-NONE`, { headers });

before(async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts, login_log, known_devices");
  await pool.end();
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await app.__db.end(); });

test("owner alert (new design) has no bank or ID details, not even masked", async () => {
  await put("repair_requests", [{ id: "REP-1", createdAt: "2026-10-07T00:00:00Z", status: "new", name: "Ann Lee", email: "ann@example.com", phone: "0400 000 000",
    deviceType: "Phone", model: "Pixel 9", issue: "Battery", bankBsb: "062000", bankAccountNumber: "12345678", idOwnerName: "Ann Lee", idType: "passport" }]);
  await settle();
  const alert = sent.find((m) => m.to[0] === "owner@example.com");
  assert.ok(alert, "owner alerted");
  for (const part of [alert.text, alert.html]) {
    assert.ok(!part.includes("062000") && !part.includes("12345678") && !part.includes("678"), "no bank numbers");
    assert.ok(!/Name on ID|ID type|Passport|BSB|Account number/.test(part), "no ID or bank labels");
  }
  assert.ok(alert.html.includes("logo-512.png") && alert.html.includes("Open staff portal"), "new layout");
  assert.ok(alert.text.includes("ann@example.com") && alert.text.includes("Pixel 9"), "useful details still there");
});

test("customer confirmation uses the new layout and server wording", async () => {
  await put("notification_queue", [{ id: "NTF-1", type: "repair_request", relatedId: "REP-1", recipientEmail: "evil@example.com", message: "click evil.com" }]);
  await settle();
  const mail = sent.find((m) => m.to[0] === "ann@example.com");
  assert.ok(mail, "sent to the address on the record");
  assert.equal(mail.subject, "Repair request REP-1 received");
  assert.ok(mail.html.includes("What happens next") && mail.html.includes("Message us on WhatsApp"));
  assert.ok(mail.text.startsWith("Hi Ann,") && !mail.text.includes("evil"));
});

test("rate limits are per real visitor (Cloudflare header); True-Client-IP is ignored", async () => {
  const a = { "CF-Connecting-IP": "203.0.113.1" }, b = { "CF-Connecting-IP": "203.0.113.2" };
  let last;
  for (let i = 0; i < 61; i++) last = await find(a);
  assert.equal(last.status, 429, "visitor A blocked");
  assert.equal((await find(b)).status, 404, "visitor B unaffected");
  // Spoofing True-Client-IP doesn't give visitor A a fresh allowance
  assert.equal((await find({ ...a, "True-Client-IP": "198.51.100.9" })).status, 429);
});
