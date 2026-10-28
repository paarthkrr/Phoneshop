// Website funnel counts. Run with: DATABASE_URL=postgres://... npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { Pool } = require("pg");
const analytics = require("../analytics.js");

let pool, srv, base;
before(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("DROP TABLE IF EXISTS site_events_daily");
  const app = express(); app.use(express.json());
  // Stand-ins for the real login: the x-role header says who is asking.
  const requireAuth = (req, res, next) => { req.user = req.headers["x-role"] ? { areas: req.headers["x-role"] === "owner" ? ["reports"] : [] } : null; return req.user ? next() : res.status(401).end(); };
  analytics.register(app, { pool, makeLimiter: () => () => true, requireAuth, hasArea: (u, a) => (u.areas || []).includes(a) });
  srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(async () => { srv.close(); await pool.end(); });

const track = (e, p, ua = "Mozilla/5.0 (iPhone)") => fetch(`${base}/public/track`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": ua }, body: JSON.stringify({ e, p }) });
const settle = () => new Promise((r) => setTimeout(r, 150));

test("analytics: paths are cut down so nothing personal is stored", () => {
  assert.equal(analytics.cleanPath("/shop?item=INV-1&email=a@b.c"), "/shop");
  assert.equal(analytics.cleanPath("/sell/apple/iphone-15/extra"), "/sell/apple");
  assert.equal(analytics.cleanPath("/track/jane@example.com"), "/track");
  assert.equal(analytics.cleanPath("javascript:alert(1)"), "/");
});

test("analytics: counts real steps, ignores bots and unknown events, owner-only report", async () => {
  for (let i = 0; i < 3; i++) await track("view", "/quote");
  await track("quote_start", "/quote"); await track("quote_start", "/quote");
  await track("quote_price", "/quote");
  await track("view", "/quote", "Googlebot/2.1");   // bot: ignored
  await track("hack", "/quote");                    // unknown event: ignored
  const r0 = await track("order", "/shop"); assert.equal(r0.status, 204);
  await settle();
  assert.equal((await fetch(`${base}/analytics/funnel`)).status, 401);
  assert.equal((await fetch(`${base}/analytics/funnel`, { headers: { "x-role": "staff" } })).status, 403);
  const r = await (await fetch(`${base}/analytics/funnel?days=7`, { headers: { "x-role": "owner" } })).json();
  assert.equal(r.totals.view, 3);
  assert.equal(r.totals.quote_start, 2);
  assert.equal(r.totals.quote_price, 1);
  assert.equal(r.totals.order, 1);
  assert.equal(r.totals.hack, undefined);
  assert.deepEqual(r.pages, [{ path: "/quote", n: 3 }]);
  assert.deepEqual(r.funnels.sell, ["quote_start", "quote_price", "quote_submit"]);
});
