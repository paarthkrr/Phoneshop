// Honest "Was $X" prices for listed phones.
//
// Australian Consumer Law: a "was" price must be a price the phone was really
// offered at, for a reasonable time, and recently. So the shop only shows one
// when our own records prove it:
//   - the earlier price was live on the website for at least MIN_DAYS_AT_OLD_PRICE,
//   - the price drop happened in the last MAX_DAYS_SINCE_DROP days,
//   - and the new price is actually lower.
// Staff never type a "was" price; it comes only from the listing's own history.

export const MIN_DAYS_AT_OLD_PRICE = 14;
export const MAX_DAYS_SINCE_DROP = 60;
const DAY = 24 * 60 * 60 * 1000;

const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

// Patch for publishing a listing: starts its price history today.
export function publishPatch(item, now = new Date()) {
  const at = now.toISOString();
  const price = num(item.listedPrice);
  return { status: "listed", listedAt: at, priceHistory: price != null ? [{ price, from: at }] : [] };
}

// Patch for changing the price. Only a live listing keeps history (a price
// change before publishing was never seen by a customer, so it can't be a "was").
export function pricePatch(item, newPrice, now = new Date()) {
  const price = num(newPrice);
  if (price == null || price <= 0) return null;
  if (item.status !== "listed") return { listedPrice: price };
  if (price === num(item.listedPrice)) return { listedPrice: price };
  const at = now.toISOString();
  const history = Array.isArray(item.priceHistory) && item.priceHistory.length
    ? item.priceHistory
    // Listed before this feature: we don't know since when, so this old price can't back a "was".
    : (num(item.listedPrice) != null ? [{ price: num(item.listedPrice), from: null }] : []);
  return { listedPrice: price, priceHistory: [...history, { price, from: at }].slice(-12) };
}

// { was, save, pct } when an honest "Was" can be shown, otherwise null.
export function wasPrice(item, now = Date.now()) {
  if (!item || item.status !== "listed") return null;
  const h = Array.isArray(item.priceHistory) ? item.priceHistory : [];
  if (h.length < 2) return null;
  const cur = h[h.length - 1], prev = h[h.length - 2];
  const current = num(item.listedPrice);
  if (current == null || num(cur.price) !== current) return null;
  const prevFrom = Date.parse(prev.from), curFrom = Date.parse(cur.from);
  if (!Number.isFinite(prevFrom) || !Number.isFinite(curFrom)) return null;
  if (curFrom - prevFrom < MIN_DAYS_AT_OLD_PRICE * DAY) return null;
  if (now - curFrom > MAX_DAYS_SINCE_DROP * DAY || now < curFrom) return null;
  const was = num(prev.price);
  if (was == null || was <= current) return null;
  return { was, save: was - current, pct: Math.round((1 - current / was) * 100) };
}
