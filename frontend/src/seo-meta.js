// Per-page titles and descriptions. Used at runtime (App.jsx) AND at build
// time (vite.config.js) so every page's HTML already carries its own title,
// description and canonical link — Google sees the right tags on first scan.
import { POSTS } from "./blog-posts.js";

export const SITE = "Mobile Recellr";
export const PAGE_META = {
  "/": ["Mobile Recellr — Phone Repairs in Sydney with Price Match, Same Day In Store", "Phone repairs in Sydney with a price match guarantee, done same day in store with genuine parts. Sell your phone for an instant quote, or buy refurbished with a 1-year warranty and free express shipping."],
  "/quote": ["Sell Your Phone in Sydney — Home Collection & Cash Paid", "Instant quote from our 49-point check, then we collect from your door anywhere in Sydney and pay you in cash or by bank transfer. Any condition, price held 14 days."],
  "/sell": ["Sell Your Phone — Instant Quote", "Get an instant quote for your phone in under a minute. No sign-up, price held 14 days."],
  "/shop": ["Refurbished Phones — Graded & Tested", "Buy graded, tested refurbished iPhones and Android phones with a 1-year warranty and free express shipping."],
  "/repairs": ["Phone Repairs in Sydney from $85 — Price Match, Same Day In Store", "Screen, battery and charging port repairs from $85, done same day in store with genuine parts and a 90-day warranty. Found it cheaper? We'll match it. Mail-in repairs Australia-wide."],
  "/accessories": ["Phone Accessories, Parts & DIY Kits", "Cases, screen protectors, chargers and DIY repair kits. Free click & collect or fast delivery."],
  "/parts": ["Phone Accessories, Parts & DIY Kits", "Cases, screen protectors, chargers and DIY repair kits. Free click & collect or fast delivery."],
  "/tutorials": ["Phone Repair Tutorials — Screen & Back Glass", "Step-by-step videos for iPhone screen and back glass repair, with safety tips before you start."],
  "/blog": ["Guides — Phone Repair & Trade-in Advice", "Straight answers on repairs, trade-ins and buying refurbished phones."],
  "/about": ["About Us", "Why we started an honest phone repair and trade-in shop."],
  "/faq": ["FAQ", "Answers about our price match guarantee, genuine parts, warranty, and how selling works."],
  "/help": ["Help — Ask Us Anything", "Send us a question about a repair, order or trade-in."],
  "/contact": ["Contact Us", "Phone, email, address and opening hours."],
  "/privacy": ["Privacy Policy", "How we collect, use and protect your personal information."],
  "/terms": ["Terms & Warranty", "Trade-in terms, price match guarantee, warranty and your Australian Consumer Law rights."],
};

export const SELL_BRAND_NAMES = { apple: "iPhone", samsung: "Samsung", google: "Google Pixel", oppo: "OPPO", motorola: "Motorola", xiaomi: "Xiaomi", oneplus: "OnePlus", nothing: "Nothing", vivo: "Vivo" };

// Full title + description for any public path, or null.
export function metaFor(path) {
  if (PAGE_META[path]) {
    const [t, d] = PAGE_META[path];
    return { title: path === "/" ? t : `${t} | ${SITE}`, desc: d };
  }
  const post = path.startsWith("/blog/") && POSTS.find((p) => `/blog/${p.slug}` === path);
  if (post) return { title: `${post.title} | ${SITE}`, desc: post.excerpt };
  const brand = path.startsWith("/sell/") && SELL_BRAND_NAMES[path.slice(6)];
  if (brand) return { title: `Sell Your ${brand} — Instant Quote | ${SITE}`, desc: `Sell your ${brand} for cash. Instant quote, any condition, price held 14 days, paid by bank transfer or PayPal.` };
  return null;
}
