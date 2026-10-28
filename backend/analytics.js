// Website funnel, counted on our own server: how many people look, start a quote, see a
// price, send it; look at a phone, check out, order; book a repair. No cookies, no IPs or
// personal data are stored: just a count per day, step and page. Bots are ignored.

const EVENTS = {
  view: "Page views",
  quote_start: "Started a quote",
  quote_price: "Saw a price",
  quote_submit: "Sent a trade-in",
  shop_item: "Opened a phone",
  checkout: "Started checkout",
  order: "Placed an order",
  repair_submit: "Booked a repair",
};
const FUNNELS = {
  sell: ["quote_start", "quote_price", "quote_submit"],
  buy: ["shop_item", "checkout", "order"],
};
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch/i;
// Only the first one or two path segments, letters/digits/dashes, so nothing personal
// (ids, emails, query strings) can end up in the counts.
function cleanPath(p) {
  const s = String(p || "").split(/[?#]/)[0].toLowerCase();
  if (!s.startsWith("/")) return "/";
  const keep = [];
  for (const seg of s.split("/").slice(1, 3)) { if (!/^[a-z0-9-]{1,30}$/.test(seg)) break; keep.push(seg); } // a segment with anything else ends the path
  return "/" + keep.join("/");
}

function register(app, { pool, makeLimiter, requireAuth, hasArea, schemaReady }) {
  const ready = (schemaReady || Promise.resolve()).then(() => pool.query(`
    CREATE TABLE IF NOT EXISTS site_events_daily (
      day DATE NOT NULL, event TEXT NOT NULL, path TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, event, path)
    )`));
  const limit = makeLimiter(120, 5 * 60 * 1000);

  app.post("/public/track", async (req, res) => {
    res.status(204).end(); // never make the visitor wait on this
    try {
      const e = req.body && req.body.e;
      if (!EVENTS[e] || !limit(req) || BOT.test(String(req.headers["user-agent"] || ""))) return;
      await ready;
      await pool.query(`INSERT INTO site_events_daily (day, event, path, n) VALUES ((NOW() AT TIME ZONE 'Australia/Sydney')::date, $1, $2, 1)
        ON CONFLICT (day, event, path) DO UPDATE SET n = site_events_daily.n + 1`, [e, cleanPath(req.body.p)]);
    } catch (err) { /* counting is best effort */ }
  });

  // Owner and managers (the Reports area).
  app.get("/analytics/funnel", requireAuth, async (req, res) => {
    if (!hasArea(req.user, "reports")) return res.status(403).json({ error: "reports only" });
    try {
      await ready;
      const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
      const since = `(NOW() AT TIME ZONE 'Australia/Sydney')::date - ${days - 1}`;
      const totals = (await pool.query(`SELECT event, SUM(n)::int AS n FROM site_events_daily WHERE day >= ${since} GROUP BY event`)).rows;
      const daily = (await pool.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, event, SUM(n)::int AS n FROM site_events_daily WHERE day >= ${since} GROUP BY day, event ORDER BY day`)).rows;
      const pages = (await pool.query(`SELECT path, SUM(n)::int AS n FROM site_events_daily WHERE day >= ${since} AND event = 'view' GROUP BY path ORDER BY n DESC LIMIT 12`)).rows;
      const t = Object.fromEntries(Object.keys(EVENTS).map((k) => [k, 0]));
      totals.forEach((r) => { t[r.event] = r.n; });
      res.json({ days, totals: t, labels: EVENTS, funnels: FUNNELS, daily, pages });
    } catch (e) { res.status(500).json({ error: "could not load" }); }
  });
}

module.exports = { register, cleanPath, EVENTS, FUNNELS };
