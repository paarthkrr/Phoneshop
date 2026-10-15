// Migration kit: export everything, wipe, import it back, and nothing is lost.
// Also: the token is only accepted in its header, and the import never uses
// anything from the file as SQL. Drops all tables first — never point at a real database.
process.env.TWO_STEP_ROLES = "";
process.env.MIGRATION_TOKEN = "test-migration-token-0123456789-abcdef";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

let app, server, base, pool;
const TOKEN = process.env.MIGRATION_TOKEN;
const call = async (method, path, { token, body, headers = {} } = {}) => {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h["x-migrate-token"] = token;
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, body: json };
};

before(async () => {
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts, login_log, known_devices, activity_log");
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "owner", password: "owner-password-1" }) });
  await pool.query("UPDATE users SET access = $1, totp_secret = 'sealed-secret' WHERE username = 'owner'", [JSON.stringify(["bank"])]);
  await pool.query("INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ('shared', 'orders', $1, NOW(), 'owner')", [JSON.stringify([{ id: "ORD-1", quotedTotal: 420 }])]);
  await pool.query("INSERT INTO product_images (id, mime, data, created_by, created_at) VALUES ('img1', 'image/png', '\\x89504e47'::bytea, 'owner', NOW())");
  await pool.query("INSERT INTO known_devices (username, device_hash, first_seen, last_seen) VALUES ('owner', 'dev1', NOW(), NOW())");
  await pool.query("DELETE FROM activity_log"); await pool.query("DELETE FROM login_log");
  await pool.query("INSERT INTO activity_log (at, username, role, area, record_id, action, summary, changes) VALUES ('2026-10-01T01:00:00Z', 'owner', 'admin', 'orders', 'ORD-1', 'changed', 'price 400 -> 420', '{\"price\":[400,420]}')");
  await pool.query("INSERT INTO login_log (username, at, ip, device, result, new_device) VALUES ('owner', '2026-10-01T00:59:00Z', '203.0.113.5', 'Safari on iPhone', 'signed in', true)");
  await pool.query("INSERT INTO barcode_cache (code, found, title) VALUES ('9300000000001', true, 'USB-C cable')");
});
after(async () => { server.close(); await pool.end(); await app.__db.end(); });

test("the token is only accepted in its header", async () => {
  assert.equal((await call("GET", "/admin/migrate/export")).status, 403);
  assert.equal((await call("GET", "/admin/migrate/export", { token: "wrong-token-wrong-token-wrong-token" })).status, 403);
  assert.equal((await call("GET", `/admin/migrate/export?token=${encodeURIComponent(TOKEN)}`)).status, 403, "never from the URL");
});

test("export, wipe, import: every table comes back the same", async () => {
  const ex = await call("GET", "/admin/migrate/export", { token: TOKEN });
  assert.equal(ex.status, 200);
  assert.deepEqual(ex.body.counts, { storage: 1, users: 1, product_images: 1, known_devices: 1, activity_log: 1, login_log: 1, barcode_cache: 1, recovery_uses: 0, id_photos: 0 });
  assert.ok(ex.body.allTables && ex.body.allTables.sessions >= 0, "every table's row count is listed");
  const before = (await pool.query("SELECT username, salt, hash, role, access, totp_secret FROM users")).rows;

  await pool.query("TRUNCATE storage, users, product_images, known_devices, activity_log, login_log, barcode_cache");
  // the new host already has a log row of its own: it stays, and nothing collides with it
  await pool.query("INSERT INTO login_log (username, at, result) VALUES ('owner', '2026-10-15T00:00:00Z', 'signed in')");
  const im = await call("POST", "/admin/migrate/import", { token: TOKEN, body: ex.body });
  assert.equal(im.status, 200);
  assert.deepEqual(im.body.imported, { storage: 1, users: 1, product_images: 1, known_devices: 1, activity_log: 1, login_log: 1, barcode_cache: 1, recovery_uses: 0, id_photos: 0 });
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM login_log")).rows[0].n, 2);
  assert.deepEqual((await pool.query("SELECT summary, changes FROM activity_log")).rows, [{ summary: "price 400 -> 420", changes: { price: [400, 420] } }]);
  const again = await call("POST", "/admin/migrate/import", { token: TOKEN, body: ex.body });
  assert.equal(again.body.imported.activity_log + again.body.imported.login_log, 0, "running it twice adds no duplicate history");

  assert.deepEqual((await pool.query("SELECT username, salt, hash, role, access, totp_secret FROM users")).rows, before);
  assert.deepEqual(JSON.parse((await pool.query("SELECT value FROM storage WHERE key = 'orders'")).rows[0].value), [{ id: "ORD-1", quotedTotal: 420 }]);
  assert.equal((await pool.query("SELECT encode(data, 'hex') AS h FROM product_images WHERE id = 'img1'")).rows[0].h, "89504e47");
  const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "owner", password: "owner-password-1", deviceId: "device-aaaaaaaaaaaaaaaa" }) });
  assert.equal(login.status, 200, "the same password still works after the move");
});

test("unknown columns in the file are ignored, never used as SQL", async () => {
  const evil = { tables: { users: [{ username: "mallory", salt: "s", hash: "h", role: "staff", "role) VALUES ('x','x','x','admin',NOW()); DROP TABLE storage; --": 1 }] } };
  const r = await call("POST", "/admin/migrate/import", { token: TOKEN, body: evil });
  assert.equal(r.status, 200);
  assert.equal(r.body.imported.users, 1);
  assert.equal((await pool.query("SELECT role FROM users WHERE username = 'mallory'")).rows[0].role, "staff");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM storage")).rows[0].n, 1, "storage table untouched");
});

test("pull only accepts an https address of the old server", async () => {
  const r = await call("POST", "/admin/migrate/pull", { token: TOKEN, body: { sourceUrl: "http://169.254.169.254/latest" } });
  assert.equal(r.status, 400);
});
