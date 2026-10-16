// Google reviews for the website: GET /public/reviews
// - Works only once GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID are set (Railway variables).
//   Without them it answers { configured: false } and the site hides the reviews strip.
// - Reads the shop's rating, review count and the reviews Google chooses to return
//   (Places API, New). Nothing is filtered or edited: what Google shows is what we show.
// - Cached for 6 hours (Google bills per call, and reviews don't change by the minute);
//   if Google is down, the last good answer keeps being served.
const TTL_MS = 6 * 60 * 60 * 1000;
let cache = { at: 0, data: null, key: "" };

function shape(p) {
  const reviews = (Array.isArray(p.reviews) ? p.reviews : []).slice(0, 10).map((r) => ({
    author: String(r.authorAttribution?.displayName || "Google user").slice(0, 80),
    authorUrl: /^https:\/\/www\.google\.com\//.test(r.authorAttribution?.uri || "") ? r.authorAttribution.uri : null,
    photo: /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(r.authorAttribution?.photoUri || "") ? r.authorAttribution.photoUri : null,
    rating: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0))),
    text: String(r.text?.text || r.originalText?.text || "").slice(0, 600),
    when: String(r.relativePublishTimeDescription || "").slice(0, 40),
  }));
  return {
    configured: true,
    rating: Number(p.rating) || null,
    count: Number(p.userRatingCount) || 0,
    url: /^https:\/\/(maps\.google\.com|www\.google\.com)\//.test(p.googleMapsUri || "") ? p.googleMapsUri : null,
    reviews,
  };
}

async function fetchPlace(key, placeId) {
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`places ${r.status}`);
  return shape(await r.json());
}

function register(app, { makeLimiter }) {
  const allowed = makeLimiter(60, 10 * 60 * 1000);
  app.get("/public/reviews", async (req, res) => {
    const key = process.env.GOOGLE_PLACES_API_KEY, placeId = process.env.GOOGLE_PLACE_ID;
    if (!key || !placeId) return res.json({ configured: false });
    if (!allowed(req)) return res.status(429).json({ error: "Too many requests" });
    const ck = `${placeId}`;
    try {
      if (!cache.data || cache.key !== ck || Date.now() - cache.at > TTL_MS) {
        cache = { at: Date.now(), data: await fetchPlace(key, placeId), key: ck };
      }
    } catch (e) {
      console.error("reviews:", e.message);
      if (!cache.data || cache.key !== ck) return res.json({ configured: true, rating: null, count: 0, url: null, reviews: [] });
      // keep serving the last good answer while Google is unreachable; try again in 10 minutes
      cache.at = Date.now() - TTL_MS + 10 * 60 * 1000;
    }
    res.set("Cache-Control", "public, max-age=1800");
    res.json(cache.data);
  });
}

module.exports = { register, __reset: () => { cache = { at: 0, data: null, key: "" }; }, __expire: () => { cache.at = 0; } };
