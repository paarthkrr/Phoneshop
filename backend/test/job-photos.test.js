// Repair photos: staff add/read/delete; a customer can only add damage photos to a fresh request.
const test = require("node:test"), assert = require("node:assert");
process.env.TWO_STEP_ROLES = "";
process.env.PUBLIC_WRITE_MAX = "1000";
const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP" + "A".repeat(40);
let base, server, app, token;
const call = async (method, path, body, tok) => { const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j }; };
test.before(async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts, login_log, known_devices, activity_log, job_photos");
  await pool.end();
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
  await call("POST", "/auth/register", { username: "owner", password: "owner-pass-2026" });
  token = (await call("POST", "/auth/login", { username: "owner", password: "owner-pass-2026" })).body.token;
});
test.after(async () => { server.close(); await app.__db.end(); });

test("staff add, list and delete job photos", async () => {
  const add = await call("POST", "/job-photos", { subject: "job:R-1", kind: "before", imageBase64: IMG }, token);
  assert.equal(add.status, 200);
  const list = await call("GET", "/job-photos?subject=job:R-1", null, token);
  assert.equal(list.body.photos.length, 1); assert.equal(list.body.photos[0].kind, "before");
  assert.equal((await call("GET", "/job-photos?subject=job:R-1")).status, 401, "never public");
  assert.equal((await call("DELETE", `/job-photos/${add.body.id}`, null, token)).body.deleted, 1);
});

test("the public can only add damage photos to a request sent in the last hour", async () => {
  assert.equal((await call("POST", "/job-photos", { subject: "job:R-1", kind: "before", imageBase64: IMG })).status, 401);
  assert.equal((await call("POST", "/job-photos", { subject: "request:REP-NOPE", kind: "damage", imageBase64: IMG })).status, 403);
  await call("PUT", "/storage/repair_requests", { value: JSON.stringify([{ id: "REP-777777", status: "new", name: "A", email: "a@example.com", deviceType: "Phone", model: "iPhone 12", issue: "screen" }]), shared: true });
  assert.equal((await call("POST", "/job-photos", { subject: "request:REP-777777", kind: "damage", imageBase64: IMG })).status, 200);
  assert.equal((await call("POST", "/job-photos", { subject: "request:REP-777777", kind: "damage", imageBase64: "data:text/html;base64,AAAA" })).status, 400);
});
