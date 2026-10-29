// Buying and selling phones needs a NSW second-hand dealer licence (Fair Trading). Until
// it's granted the site is repairs (and new accessories / parts) only: no trade-in quotes,
// no "sell your phone", no used-phone shop. When the licence arrives, set this to true and
// redeploy: menus, homepage, routes, sitemap, page titles and the chat all switch back.
export const TRADING_OPEN = false;

// Pages that only make sense while buying / selling phones is open.
export const isTradingPath = (p) => /^\/(quote|sell|shop|used-phones-sydney)(\/|$)/.test(p || "");
