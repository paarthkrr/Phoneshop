// Google reviews strip: hidden until configured, cached, never invents or edits reviews.
// Run with: DATABASE_URL=postgres://... npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const realFetch = global.fetch;
let placesCalls = 0, placesReply = { status: 200 };
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://places.googleapis.com/")) {
    placesCalls += 1;
    if (placesReply.status !== 200) return new Response("down", { status: placesReply.status });
    assert.equal(opts.headers["X-Goog-Api-Key"], "test-places-key");
    return new Response(JSON.stringify({
      rating: 4.8, userRatingCount: 123, googleMapsUri: "https://maps.google.com/?cid=1",
      reviews: [
        { rating: 5, text: { text: "Fixed my screen in an hour" }, relativePublishTimeDescription: "a week ago",
          authorAttribution: { displayName: "Sam K", uri: "https://www.google.com/maps/contrib/1", photoUri: "https://lh3.googleusercontent.com/a/x" } },
        { rating: 2, text: { text: "Took a while" }, relativePublishTimeDescription: "a month ago",
          authorAttribution: { displayName: "Alex", uri: "javascript:alert(1)", photoUri: "https://evil.example/p.png" } },
      ],
    }), { status: 200 });
  }
  return realFetch(url, opts);
};
let app, server, base;
const get = () => realFetch(`${base}/public/reviews`).then((r) => r.json());

before(async () => {
  app = require("../server.js");
  await app.__schemaReady;
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await app.__db.end(); });

test("without a Places key and place id the strip stays hidden and Google is never called", async () => {
  delete process.env.GOOGLE_PLACES_API_KEY; delete process.env.GOOGLE_PLACE_ID;
  assert.deepEqual(await get(), { configured: false });
  assert.equal(placesCalls, 0);
});

test("configured: rating, count and every review Google returned, unsafe links dropped, then cached", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "test-places-key"; process.env.GOOGLE_PLACE_ID = "ChIJtest";
  require("../reviews.js").__reset();
  const j = await get();
  assert.equal(j.configured, true);
  assert.equal(j.rating, 4.8);
  assert.equal(j.count, 123);
  assert.equal(j.reviews.length, 2, "low ratings are not filtered out");
  assert.equal(j.reviews[0].author, "Sam K");
  assert.equal(j.reviews[0].photo, "https://lh3.googleusercontent.com/a/x");
  assert.equal(j.reviews[1].authorUrl, null, "non-Google link removed");
  assert.equal(j.reviews[1].photo, null, "non-Google image removed");
  await get();
  assert.equal(placesCalls, 1, "second request served from cache");
});

test("Google down: the last good answer keeps being served", async () => {
  require("../reviews.js").__reset();
  placesReply = { status: 200 }; await get();
  placesReply = { status: 503 };
  require("../reviews.js").__expire();
  const j = await get();
  assert.equal(j.rating, 4.8);
  placesReply = { status: 200 };
});
