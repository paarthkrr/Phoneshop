// Address suggestions as the customer types (like Google Maps), for pickup,
// doorstep repair and delivery addresses:
//   GET /public/address?q=12 Smith St Parr&session=abc   → { provider, suggestions: [...] }
//   GET /public/address/details?id=...&session=abc      → { address, suburb, postcode, state }
// - With GOOGLE_PLACES_API_KEY set (the same key as the reviews strip; Places API
//   (New) must be enabled for it) suggestions come from Google, Australia only.
//   The key stays on the server; the browser only ever talks to us.
// - Without it, or if Google fails, they come from OpenStreetMap's Photon
//   (free, no key), limited to Australia.
// - Answers are cached for an hour, and each visitor is rate limited.
const TTL_MS = 60 * 60 * 1000;
const cache = new Map();
const MAX_CACHE = 500;
function cached(k) { const c = cache.get(k); if (c && Date.now() - c.at < TTL_MS) return c.v; cache.delete(k); return null; }
function remember(k, v) { if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value); cache.set(k, { at: Date.now(), v }); return v; }
const clean = (v, n = 120) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

async function googleSuggest(fetchImpl, key, q, session) {
  const r = await fetchImpl("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({ input: q, includedRegionCodes: ["au"], languageCode: "en-AU", ...(session ? { sessionToken: session } : {}) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`places autocomplete ${r.status}`);
  const j = await r.json();
  return (j.suggestions || []).map((s) => s.placePrediction).filter(Boolean).slice(0, 6).map((p) => ({
    id: String(p.placeId || ""), label: clean(p.text?.text, 200),
    main: clean(p.structuredFormat?.mainText?.text, 120), secondary: clean(p.structuredFormat?.secondaryText?.text, 120),
  })).filter((s) => s.id && s.label);
}

async function googleDetails(fetchImpl, key, id, session) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${session ? `?sessionToken=${encodeURIComponent(session)}` : ""}`;
  const r = await fetchImpl(url, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "formattedAddress,addressComponents" }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`places details ${r.status}`);
  const j = await r.json();
  const comp = (type, short) => { const c = (j.addressComponents || []).find((x) => (x.types || []).includes(type)); return c ? clean(short ? c.shortText : c.longText, 60) : ""; };
  const street = [comp("subpremise") && `${comp("subpremise")}/`, comp("street_number"), comp("route")].filter(Boolean).join(" ").replace("/ ", "/");
  const suburb = comp("locality") || comp("sublocality") || comp("postal_town");
  const state = comp("administrative_area_level_1", true), postcode = comp("postal_code");
  return { address: [street, [suburb, state, postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || clean(j.formattedAddress, 200), suburb, postcode, state };
}

const STATES = { "New South Wales": "NSW", Victoria: "VIC", Queensland: "QLD", "South Australia": "SA", "Western Australia": "WA", Tasmania: "TAS", "Australian Capital Territory": "ACT", "Northern Territory": "NT" };
async function photonSuggest(fetchImpl, q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&bbox=112.9,-43.7,153.7,-10.6`;
  const r = await fetchImpl(url, { headers: { "User-Agent": "MobileRecellr/1.0 (address suggestions)" }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`photon ${r.status}`);
  const j = await r.json();
  const out = [];
  for (const f of j.features || []) {
    const p = f.properties || {};
    if (p.countrycode && p.countrycode !== "AU") continue;
    const street = [p.housenumber, p.street || (p.type === "street" ? p.name : "")].filter(Boolean).join(" ");
    const suburb = p.city || p.district || p.locality || (p.type === "city" || p.type === "district" ? p.name : "") || "";
    const state = STATES[p.state] || clean(p.state, 30), postcode = clean(p.postcode, 4);
    const place = !street && p.name && p.name !== suburb ? p.name : "";
    const main = street || place || suburb;
    if (!main) continue;
    const secondary = [street || place ? suburb : "", state, postcode].filter(Boolean).join(" ");
    const address = [main, secondary].filter(Boolean).join(", ");
    if (out.some((x) => x.label === address)) continue;
    out.push({ id: "", label: clean(address, 200), main: clean(main), secondary: clean(secondary), address: clean(address, 200), suburb: clean(suburb, 60), postcode, state });
    if (out.length >= 6) break;
  }
  return out;
}

function register(app, { makeLimiter, fetchImpl }) {
  const allowed = makeLimiter(150, 10 * 60 * 1000);
  const f = () => fetchImpl || app.__addressFetch || fetch;
  app.get("/public/address", async (req, res) => {
    const q = clean(req.query.q), session = clean(req.query.session, 64);
    if (q.length < 3) return res.json({ provider: null, suggestions: [] });
    if (!allowed(req)) return res.status(429).json({ error: "Too many requests" });
    const key = process.env.GOOGLE_PLACES_API_KEY;
    const ck = `${key ? "g" : "p"}:${q.toLowerCase()}`;
    const hit = cached(ck);
    if (hit) return res.json(hit);
    try {
      if (key) {
        try { return res.json(remember(ck, { provider: "google", suggestions: await googleSuggest(f(), key, q, session) })); }
        catch (e) { console.error("address (google):", e.message); }
      }
      res.json(remember(ck, { provider: "osm", suggestions: await photonSuggest(f(), q) }));
    } catch (e) {
      console.error("address:", e.message);
      res.json({ provider: null, suggestions: [] }); // typing still works; there just aren't suggestions
    }
  });
  app.get("/public/address/details", async (req, res) => {
    const id = clean(req.query.id, 300), session = clean(req.query.session, 64);
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!id || !key) return res.status(400).json({ error: "no details available" });
    if (!allowed(req)) return res.status(429).json({ error: "Too many requests" });
    const ck = `d:${id}`;
    const hit = cached(ck);
    if (hit) return res.json(hit);
    try { res.json(remember(ck, await googleDetails(f(), key, id, session))); }
    catch (e) { console.error("address details:", e.message); res.status(502).json({ error: "couldn't look that address up" }); }
  });
}

module.exports = { register, __reset: () => cache.clear(), photonSuggest, googleDetails };
