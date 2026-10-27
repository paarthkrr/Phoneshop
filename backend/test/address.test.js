const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const address = require("../address.js");

// A tiny app with only the address routes, and a fake fetch standing in for Google / Photon.
function appWith(fake) {
  const app = express();
  app.__addressFetch = fake;
  address.register(app, { makeLimiter: () => () => true });
  return new Promise((resolve) => { const srv = app.listen(0, () => resolve(srv)); });
}
async function call(srv, path) {
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${path}`);
  return { status: r.status, body: await r.json() };
}
const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
beforeEach(() => { address.__reset(); delete process.env.GOOGLE_PLACES_API_KEY; });

test("address: without a Google key, suggestions come from Photon (Australia only, tidy labels)", async () => {
  const calls = [];
  const srv = await appWith(async (url) => {
    calls.push(String(url));
    return json({ features: [
      { properties: { countrycode: "AU", housenumber: "12", street: "George Street", city: "Parramatta", state: "New South Wales", postcode: "2150", name: "Court House", type: "house" } },
      { properties: { countrycode: "NZ", housenumber: "12", street: "George Street", city: "Auckland" } },
      { properties: { countrycode: "AU", name: "Parramatta", type: "city", state: "New South Wales", postcode: "2150" } },
    ] });
  });
  try {
    const r = await call(srv, "/public/address?q=12%20george%20st%20parra");
    assert.equal(r.body.provider, "osm");
    assert.equal(r.body.suggestions.length, 2, "the New Zealand result is dropped");
    assert.deepEqual(r.body.suggestions[0], { id: "", label: "12 George Street, Parramatta NSW 2150", main: "12 George Street", secondary: "Parramatta NSW 2150",
      address: "12 George Street, Parramatta NSW 2150", suburb: "Parramatta", postcode: "2150", state: "NSW" });
    assert.match(calls[0], /photon\.komoot\.io/);
    await call(srv, "/public/address?q=12%20George%20St%20Parra");
    assert.equal(calls.length, 1, "the same search (any case) is answered from the cache");
    assert.deepEqual((await call(srv, "/public/address?q=ab")).body.suggestions, [], "too short to search");
  } finally { srv.close(); }
});

test("address: with a key, Google suggestions and details; the key never reaches the browser", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key-123";
  const seen = [];
  const srv = await appWith(async (url, opts = {}) => {
    seen.push({ url: String(url), key: opts.headers && opts.headers["X-Goog-Api-Key"] });
    if (String(url).includes(":autocomplete")) return json({ suggestions: [{ placePrediction: { placeId: "P1", text: { text: "5 Smith St, Ryde NSW, Australia" }, structuredFormat: { mainText: { text: "5 Smith St" }, secondaryText: { text: "Ryde NSW, Australia" } } } }] });
    return json({ formattedAddress: "5 Smith St, Ryde NSW 2112, Australia", addressComponents: [
      { types: ["street_number"], longText: "5", shortText: "5" }, { types: ["route"], longText: "Smith Street", shortText: "Smith St" },
      { types: ["locality"], longText: "Ryde", shortText: "Ryde" }, { types: ["administrative_area_level_1"], longText: "New South Wales", shortText: "NSW" },
      { types: ["postal_code"], longText: "2112", shortText: "2112" } ] });
  });
  try {
    const s = await call(srv, "/public/address?q=5%20smith%20st%20ryde&session=abc");
    assert.equal(s.body.provider, "google");
    assert.deepEqual(s.body.suggestions[0], { id: "P1", label: "5 Smith St, Ryde NSW, Australia", main: "5 Smith St", secondary: "Ryde NSW, Australia" });
    const d = await call(srv, "/public/address/details?id=P1&session=abc");
    assert.deepEqual(d.body, { address: "5 Smith Street, Ryde NSW 2112", suburb: "Ryde", postcode: "2112", state: "NSW" });
    assert.ok(seen.every((x) => x.key === "test-key-123"), "the key is sent to Google only");
    assert.ok(!JSON.stringify([s.body, d.body]).includes("test-key-123"), "and never in our answers");
  } finally { srv.close(); }
});

test("address: if Google fails, Photon still answers; if both fail, an empty list (typing still works)", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "k";
  let photonUp = true;
  const srv = await appWith(async (url) => {
    if (String(url).includes("googleapis")) return json({}, false);
    if (!photonUp) throw new Error("down");
    return json({ features: [{ properties: { countrycode: "AU", housenumber: "1", street: "Main Rd", city: "Penrith", state: "New South Wales", postcode: "2750" } }] });
  });
  try {
    const a = await call(srv, "/public/address?q=1%20main%20rd");
    assert.equal(a.body.provider, "osm");
    assert.equal(a.body.suggestions[0].postcode, "2750");
    photonUp = false;
    const b = await call(srv, "/public/address?q=2%20main%20rd");
    assert.equal(b.status, 200);
    assert.deepEqual(b.body.suggestions, []);
  } finally { srv.close(); }
});
