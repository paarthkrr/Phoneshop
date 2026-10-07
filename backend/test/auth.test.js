// Safer sign-in: authenticator codes for Owner/Manager, password rules,
// sign-in history and owner alerts. Drops all tables first — never point at a
// real database.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

process.env.RESEND_API_KEY = "test-key";
process.env.OWNER_EMAIL = "owner@example.com";
const sec = require("../security.js");

const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://api.resend.com")) { sent.push(JSON.parse(opts.body)); return new Response("{}", { status: 200 }); }
  return realFetch(url, opts);
};
const settle = () => new Promise((r) => setTimeout(r, 100));

let app, server, base, pool;
async function call(method, path, token, body, headers = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await realFetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, body: json };
}
const login = (username, password, extra = {}) => call("POST", "/auth/login", null, { username, password, deviceId: "device-aaaaaaaaaaaaaaaa", ...extra });
// A code for a step that hasn't been used yet (the server refuses replays).
const codeFor = (secret, offset = 0) => sec.totpCode(secret, sec.currentStep() + offset);

before(async () => {
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts, login_log, known_devices, activity_log");
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); await app.__db.end(); });

test("authenticator codes match the RFC 6238 test vector and refuse replays", () => {
  // RFC 6238 appendix B, SHA-1, T = 59s -> 94287082 (last 6 digits 287082).
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890"
  assert.equal(sec.totpCode(secret, 1), "287082");
  const now = Date.now(), step = sec.currentStep(now);
  assert.equal(sec.checkTotp(secret, sec.totpCode(secret, step), null, now), step);
  assert.equal(sec.checkTotp(secret, sec.totpCode(secret, step), step, now), null, "same code twice");
  assert.equal(sec.checkTotp(secret, sec.totpCode(secret, step - 3), null, now), null, "too old");
  assert.equal(sec.checkTotp(secret, "12345", null, now), null);
});

test("password rules", () => {
  assert.match(sec.passwordProblem("short-pw", "sam"), /12 characters/);
  assert.match(sec.passwordProblem("password1234", "sam"), /common/);
  assert.match(sec.passwordProblem("aaaaaaaaaaaaaa", "sam"), /common/);
  assert.match(sec.passwordProblem("Priya-2026!!", "priya"), /username/);
  assert.match(sec.passwordProblem("MobileRecellr1", "sam"), /shop's name/);
  assert.equal(sec.passwordProblem("green kettle on tuesday", "sam"), null);
});

let ownerTok, secret;
test("owner must set up two-step before the portal opens", async () => {
  assert.equal((await call("POST", "/auth/register", null, { username: "owner", password: "short1" })).status, 400, "weak password refused");
  assert.equal((await call("POST", "/auth/register", null, { username: "owner", password: "blue harbour mornings" })).status, 200);
  const r = await login("owner", "blue harbour mornings");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.limits, ["two-step"]);
  ownerTok = r.body.token;
  const blocked = await call("GET", "/storage/orders?shared=true", ownerTok);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "SETUP_REQUIRED");
  assert.equal((await call("GET", "/auth/users", ownerTok)).status, 403);
  assert.equal((await call("POST", "/auth/register", ownerTok, { username: "x", password: "another long phrase" })).status, 403, "can't add staff yet");
  assert.deepEqual((await call("GET", "/auth/me", ownerTok)).body.limits, ["two-step"]);

  assert.equal((await call("POST", "/auth/2fa/setup", ownerTok, { password: "wrong one here" })).status, 401);
  const setup = await call("POST", "/auth/2fa/setup", ownerTok, { password: "blue harbour mornings" });
  assert.equal(setup.status, 200);
  secret = setup.body.secret;
  assert.match(setup.body.uri, /^otpauth:\/\/totp\/Mobile%20Recellr:owner\?secret=/);
  assert.equal((await call("POST", "/auth/2fa/enable", ownerTok, { code: "000000" })).status, 400);
  assert.equal((await call("POST", "/auth/2fa/enable", ownerTok, { code: codeFor(secret, -1) })).status, 200);

  assert.deepEqual((await call("GET", "/auth/me", ownerTok)).body.limits, []);
  assert.notEqual((await call("GET", "/storage/orders?shared=true", ownerTok)).status, 403, "portal open now");
  const row = (await pool.query("SELECT totp_secret FROM users WHERE username = 'owner'")).rows[0];
  assert.ok(!row.totp_secret.includes(secret), "secret is encrypted at rest");
});

test("sign-in with two-step: password, then code; wrong and reused codes fail", async () => {
  const first = await login("owner", "blue harbour mornings");
  assert.deepEqual(first.body, { needCode: true }, "no token without the code");
  const bad = await login("owner", "blue harbour mornings", { code: "123456" });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.needCode, true);
  const code = codeFor(secret);
  const ok = await login("owner", "blue harbour mornings", { code });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.deepEqual(ok.body.limits, []);
  ownerTok = ok.body.token;
  assert.equal((await login("owner", "blue harbour mornings", { code })).status, 401, "a used code can't be replayed");
  assert.equal((await login("owner", "wrong password!!", { code: codeFor(secret, 1) })).status, 401, "code alone isn't enough");
  await pool.query("DELETE FROM login_attempts");
});

test("a short old password must be changed at next sign-in", async () => {
  // Simulate a staff member created before the 12-character rule.
  assert.equal((await call("POST", "/auth/register", ownerTok, { username: "sam", password: "a long enough phrase", role: "staff" })).status, 200);
  const crypto = require("node:crypto");
  const salt = crypto.randomBytes(16).toString("hex");
  await pool.query("UPDATE users SET salt = $1, hash = $2 WHERE username = 'sam'", [salt, crypto.scryptSync("samsam12", salt, 64).toString("hex")]);
  const r = await login("sam", "samsam12");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.limits, ["password"], "counter doesn't need two-step, but must fix the password");
  assert.equal((await call("GET", "/storage/orders?shared=true", r.body.token)).status, 403);
  assert.equal((await call("POST", "/auth/change-password", r.body.token, { currentPassword: "samsam12", newPassword: "short" })).status, 400);
  assert.equal((await call("POST", "/auth/change-password", r.body.token, { currentPassword: "samsam12", newPassword: "rainy day at bondi" })).status, 200);
  assert.deepEqual((await call("GET", "/auth/me", r.body.token)).body.limits, []);
  assert.notEqual((await call("GET", "/storage/orders?shared=true", r.body.token)).status, 403);
});

test("new devices email the owner; known devices don't", async () => {
  await settle();
  const before = sent.length;
  const ua = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "CF-Connecting-IP": "203.0.113.9" };
  const r1 = await call("POST", "/auth/login", null, { username: "sam", password: "rainy day at bondi", deviceId: "phone-bbbbbbbbbbbbbbbb" }, ua);
  assert.equal(r1.status, 200);
  await settle();
  const alerts = sent.slice(before);
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0].to, ["owner@example.com"]);
  assert.match(alerts[0].subject, /New sign-in: sam \(Counter\) on Safari on iPhone/);
  assert.match(alerts[0].text, /203\.0\.113\.9/);
  await call("POST", "/auth/login", null, { username: "sam", password: "rainy day at bondi", deviceId: "phone-bbbbbbbbbbbbbbbb" }, ua);
  await settle();
  assert.equal(sent.length, before + 1, "same device: no second email");
});

test("lockout emails the owner once and shows in sign-in history", async () => {
  await settle();
  const before = sent.length;
  for (let i = 0; i < 6; i++) await login("sam", "not the password");
  await settle();
  const locks = sent.slice(before).filter((m) => /locked/.test(m.subject));
  assert.equal(locks.length, 1);

  const all = (await call("GET", "/auth/login-log", ownerTok)).body.entries;
  assert.ok(all.some((e) => e.username === "sam" && e.result === "wrong password"));
  assert.ok(all.some((e) => e.username === "sam" && e.result === "blocked (locked out)"));
  assert.ok(all.some((e) => e.username === "owner" && e.result === "wrong two-step code"));
  assert.ok(all.some((e) => e.username === "sam" && e.result === "signed in" && e.new_device && e.device === "Safari on iPhone"));
  await pool.query("DELETE FROM login_attempts");
  const samTok = (await login("sam", "rainy day at bondi")).body.token;
  const own = (await call("GET", "/auth/login-log", samTok)).body.entries;
  assert.ok(own.length && own.every((e) => e.username === "sam"), "staff only see their own");
});

test("owner can reset someone's two-step; managers can't turn theirs off", async () => {
  assert.equal((await call("POST", "/auth/register", ownerTok, { username: "mia", password: "manager phrase here", role: "manager" })).status, 200);
  const mia = await login("mia", "manager phrase here");
  assert.deepEqual(mia.body.limits, ["two-step"]);
  const s = (await call("POST", "/auth/2fa/setup", mia.body.token, { password: "manager phrase here" })).body.secret;
  assert.equal((await call("POST", "/auth/2fa/enable", mia.body.token, { code: codeFor(s) })).status, 200);
  assert.equal((await call("POST", "/auth/2fa/disable", mia.body.token, { password: "manager phrase here" })).status, 400);

  const users = (await call("GET", "/auth/users", ownerTok)).body.users;
  assert.equal(users.find((u) => u.username === "mia").two_step, true);
  await settle();
  const before = sent.length;
  assert.equal((await call("POST", "/auth/users/mia/2fa-reset", mia.body.token)).status, 403);
  assert.equal((await call("POST", "/auth/users/mia/2fa-reset", ownerTok)).status, 200);
  assert.equal((await call("GET", "/auth/me", mia.body.token)).status, 401, "signed out");
  assert.deepEqual((await login("mia", "manager phrase here")).body.limits, ["two-step"], "sets it up again");
  await settle();
  assert.ok(sent.slice(before).some((m) => /Two-step sign-in reset for mia/.test(m.subject)));
});

test("backup code resets the password and switches two-step off", async () => {
  const code = (await call("POST", "/auth/recovery-code", ownerTok)).body.code;
  assert.equal((await call("POST", "/auth/recover", null, { username: "OWNER", code, newPassword: "short" })).status, 400);
  assert.equal((await call("POST", "/auth/recover", null, { username: "OWNER", code, newPassword: "lost my phone today" })).status, 200);
  const r = await login("owner", "lost my phone today");
  assert.deepEqual(r.body.limits, ["two-step"], "no code needed, but must set two-step up again");
});
