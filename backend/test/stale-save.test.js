// Two staff screens editing the same list. Uses the real storage-shim.js from
// the frontend, loaded with a fake browser `window`, against a real server.
// Run with: DATABASE_URL=postgres://... npm test   (drops all tables first)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let app, server, base, token;

// Each "screen" is a separate browser context with its own copy of the shim.
function openScreen() {
  const store = new Map();
  const window = {};
  const context = vm.createContext({
    window, fetch, URLSearchParams, JSON, Map, Set, Object, Array, String, Error, console,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../frontend/src/storage-shim.js"), "utf8"), context);
  window.shopAuth.installStorage(base, () => token);
  return {
    load: async (key) => JSON.parse((await window.storage.get(key, true)).value),
    save: (key, list) => window.storage.set(key, JSON.stringify(list), true),
  };
}

before(async () => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest" });
  await pool.query("DROP TABLE IF EXISTS storage, users, id_photos, recovery_uses, product_images, sessions, login_attempts");
  await pool.end();
  delete require.cache[require.resolve("../server.js")];
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  await post("/auth/register", { username: "owner", password: "ownerpass1" });
  token = (await post("/auth/login", { username: "owner", password: "ownerpass1" })).token;
});
after(async () => { server.close(); await app.__db.end(); });

test("a screen left open only overwrites the records it changed", async () => {
  const a = openScreen(), b = openScreen();
  await a.save("repair_requests", [{ id: "R1", status: "new" }, { id: "R2", status: "new" }]);

  const listA = await a.load("repair_requests");   // screen A opened earlier
  const listB = await b.load("repair_requests");
  await b.save("repair_requests", listB.map((r) => r.id === "R1" ? { ...r, status: "contacted" } : r));  // B updates R1

  // A, still showing the old list, updates R2 only
  await a.save("repair_requests", listA.map((r) => r.id === "R2" ? { ...r, status: "contacted", note: "called" } : r));

  const now = await b.load("repair_requests");
  assert.equal(now.find((r) => r.id === "R1").status, "contacted", "B's edit survived A's stale save");
  assert.equal(now.find((r) => r.id === "R2").note, "called", "A's edit saved");

  // A saves again from the same stale screen: still doesn't roll back R1
  await a.save("repair_requests", listA.map((r) => r.id === "R2" ? { ...r, status: "done", note: "called" } : r));
  const again = await b.load("repair_requests");
  assert.equal(again.find((r) => r.id === "R1").status, "contacted");
  assert.equal(again.find((r) => r.id === "R2").status, "done");
});

test("new records from a stale screen are still added", async () => {
  const a = openScreen();
  const list = await a.load("repair_requests");
  await a.save("repair_requests", [{ id: "R3", status: "new" }, ...list]);
  assert.ok((await a.load("repair_requests")).some((r) => r.id === "R3"));
});

test("saves without a known starting point behave as before", async () => {
  const res = await fetch(`${base}/storage/notes_list`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value: JSON.stringify([{ id: "N1", t: "x" }]), shared: true }) });
  assert.equal(res.status, 200);
});
