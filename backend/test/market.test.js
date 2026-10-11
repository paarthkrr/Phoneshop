// Market price check: competitor files are parsed, compared with our own quotes,
// and turned into guarded suggestions. Competitor data is faked; nothing goes to
// the internet. Drops all tables first — never point at a real database.
process.env.TWO_STEP_ROLES = "";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const market = require("../market.js");

let app, server, base, pricing, catalogMod;
const tok = {};
const call = async (method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, body: json };
};
const login = async (u) => (await call("POST", "/auth/login", null, { username: u, password: `${u}-password-1` })).body.token;

// Our own quote for a device (sealed / like new / good), from the real pricing maths.
async function ours(brand, model, storage) {
  const base = pricing.brandNewBase({}, { brand, model, storage, region: "AU" });
  const f = Object.fromEntries(pricing.DEFAULT_TIERS.map((t) => [t.id, t.factor]));
  return Object.fromEntries(["new", "asnew", "good"].map((c) => [c, Math.round(base * f[c] * (1 - pricing.DEFAULT_HOLDING_COST_PCT))]));
}
// Fake competitor files paying `mm` / `pe` times our price for one model.
async function files(brand, model, storage, mm, pe) {
  const o = await ours(brand, model, storage);
  return {
    mobilemonster: { "/sell/x": { type: "Phone", brand_new: Math.round(o.new * mm), new: Math.round(o.asnew * mm), working: Math.round(o.good * mm),
      dev: { brandname: brand, model: model.split(" ").slice(0, 2).join(" "), title: `${brand} ${model} 5G ${storage}`, storage } } },
    phoneexchange: { generated: "2026-10-11T00:00:00Z", models: { [model.toUpperCase().replace(/[^A-Z0-9]+/g, "_")]: { [storage]: { N: Math.round(o.new * pe), S: Math.round(o.asnew * pe), A: Math.round(o.good * pe) } } } },
  };
}
const fakeFetch = (f) => async (url) => ({ ok: true, status: 200, json: async () => (url.includes("mobilemonster") ? f.mobilemonster : f.phoneexchange) });
const suggest = async (f, decisions, config = {}) => market.buildSuggestions({ config, pricing: { ...pricing, mergeCatalog: catalogMod.mergeCatalog }, sources: await market.fetchSources(fakeFetch(f)), decisions });

before(async () => {
  pricing = await import("../../frontend/src/pricing.js");
  catalogMod = await import("../../frontend/src/device-catalog.js");
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
  await call("POST", "/auth/register", tok.owner, { username: "counter", password: "counter-password-1", role: "staff" });
  tok.counter = await login("counter");
});
after(async () => { server.close(); await app.__db.end(); });

test("model names match across sources (family names, 5G, storage)", () => {
  const mm = market.parseMobileMonster({ a: { type: "Phone", brand_new: 400, new: 370, working: 310, dev: { brandname: "Samsung", model: "Galaxy S22", title: "Samsung Galaxy S22 Ultra 5G 256GB", storage: "256GB" } } });
  assert.deepEqual(Object.keys(mm), ["GALAXY_S22_ULTRA|256GB"], "the exact phone, not the family");
  const pe = market.parsePhoneExchange({ models: { GALAXY_Z_FLIP5_5G: { "256GB": { N: 1, S: 2, A: 3 } }, ONEPLUS_13: { "256GB": { A: 5 } } } });
  assert.ok(pe["GALAXY_Z_FLIP5|256GB"] && pe["ONEPLUS_13|256GB"]);
  assert.equal(market.modelKey("OnePlus", "OnePlus 13"), "ONEPLUS_13");
});

test("both competitors pay 6% more: a safe +6 suggestion", async () => {
  const r = await suggest(await files("Apple", "iPhone 15", "128GB", 1.06, 1.06));
  const s = r.suggestions.find((x) => x.model === "iPhone 15");
  assert.ok(s && s.safe, "safe when both agree");
  assert.equal(s.suggested - s.current, 6);
  assert.deepEqual(s.sources.map((x) => x.pct), [6, 6]);
});

test("guard rails: 10% per check, disagreement and single-source need a person", async () => {
  const big = (await suggest(await files("Apple", "iPhone 15", "128GB", 1.5, 1.5))).suggestions.find((x) => x.model === "iPhone 15");
  assert.equal(big.suggested - big.current, 10, "capped at 10% this week");
  assert.ok(big.safe && big.reasons.some((x) => /moving 10% this week/.test(x)));
  const split = (await suggest(await files("Apple", "iPhone 15", "128GB", 1.4, 0.9))).suggestions.find((x) => x.model === "iPhone 15");
  assert.equal(split.safe, false);
  assert.ok(split.reasons.some((x) => /disagree/.test(x)));
  const f = await files("Apple", "iPhone 15", "128GB", 1.08, 1.08); f.phoneexchange.models = {};
  const one = (await suggest(f)).suggestions.find((x) => x.model === "iPhone 15");
  assert.equal(one.safe, false);
  assert.ok(one.reasons.some((x) => /only one competitor/.test(x)));
});

test("an ignored suggestion isn't asked again unless the market moves", async () => {
  const f = await files("Apple", "iPhone 15", "128GB", 1.06, 1.06);
  const first = (await suggest(f)).suggestions.find((x) => x.model === "iPhone 15");
  const ignored = [{ brand: "Apple", model: "iPhone 15", suggested: first.suggested, decision: "ignored", at: "2026-10-11T00:00:00Z" }];
  assert.equal((await suggest(f, ignored)).suggestions.find((x) => x.model === "iPhone 15"), undefined);
  const moved = (await suggest(await files("Apple", "iPhone 15", "128GB", 0.9, 0.9), ignored)).suggestions.find((x) => x.model === "iPhone 15");
  assert.ok(moved, "asked again once the suggestion is 3+ points away");
});

test("'pay 2% more than competitors' shifts every suggestion", async () => {
  const r = await suggest(await files("Apple", "iPhone 15", "128GB", 1.06, 1.06), [], { marketPositionPct: 2 });
  const s = r.suggestions.find((x) => x.model === "iPhone 15");
  assert.equal(s.suggested - s.current, 8);
});

test("a failed source is reported, not fatal; the check is staff-only and stored", async () => {
  const f = await files("Apple", "iPhone 15", "128GB", 1.06, 1.06);
  app.__marketFetch = async (url) => (url.includes("mobilemonster") ? { ok: false, status: 503, json: async () => ({}) } : fakeFetch(f)(url));
  assert.equal((await call("POST", "/market/check", tok.counter, {})).status, 403, "counter staff have no pricing access");
  assert.equal((await call("POST", "/market/check", null, {})).status, 401);
  const r = await call("POST", "/market/check", tok.owner, {});
  assert.equal(r.status, 200);
  const mm = r.body.sources.find((s) => s.id === "mobilemonster");
  assert.equal(mm.ok, false);
  assert.match(mm.error, /503/);
  assert.ok(r.body.suggestions.find((x) => x.model === "iPhone 15"));
  assert.ok(!JSON.stringify(r.body).includes('"prices"'), "raw competitor files aren't stored");
  const stored = await call("GET", "/storage/market_check?shared=true", tok.owner);
  assert.equal(JSON.parse(stored.body.value).checkedAt, r.body.checkedAt);
  assert.equal((await call("GET", "/storage/market_check?shared=true", tok.counter)).status, 403);
  assert.equal((await call("POST", "/market/check", tok.owner, {})).status, 429, "one manual check every couple of minutes");
});
