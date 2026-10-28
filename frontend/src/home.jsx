import { NumberTicker, useSpotlight, FX_CSS } from "./motion-fx.jsx";
import DeviceShowcase from "./device-showcase.jsx";
import GoogleReviews from "./google-reviews.jsx";
import { SpinViewer, hasSpin } from "./spin-360.jsx";
import React, { useState, useEffect, useRef } from "react";
import DeviceArt from "./device-art.jsx";
import Photo from "./photo.jsx";
import DeviceArtCard, { inferDeviceType } from "./device-art.jsx";
import { PHONE_FAULT_GROUPS, FAULT_GROUPS_BY_CATEGORY, BLOCKERS, baseBuybackAUD, DEFAULT_RETENTION_POINTS, DEFAULT_BRAND_FACTOR, DEFAULT_HOLDING_COST_PCT } from "./instant-quote-calculator.jsx";
import { mergeCatalog } from "./device-catalog.js";
import { DEFAULT_TIERS } from "./pricing.js";
import InspectionSignature from "./inspection-signature.jsx";

const REVEAL_CSS = `
.reveal{opacity:0;transform:translateY(28px);transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1)}
.reveal.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
`;
// ---- Hero: animated gradient, the shop's own phone photos, live price ticker ----
const TICKER_MODELS = ["iPhone 18 Pro Max", "iPhone 18 Pro", "iPhone 17 Pro Max", "iPhone 17", "iPhone Air", "Galaxy S26 Ultra", "Galaxy S26", "Pixel 10 Pro", "iPhone 16 Pro Max", "iPhone 15 Pro", "Galaxy Z Fold8"];
// "Top phones we buy" strip — big cards that glide across, each with a real "up to" price.
const FEATURED_PHONES = ["iPhone 18 Pro", "Galaxy S26", "iPhone Air", "iPhone 17", "Nothing Phone (3)", "Galaxy A17", "iPhone 18 Pro Max", "Galaxy S26 Ultra", "iPhone 17 Pro Max", "Pixel 10 Pro", "iPhone 16 Pro Max", "Galaxy Z Fold8", "iPhone 15 Pro Max", "Galaxy S25 Ultra", "iPhone 14 Pro Max", "Pixel 9 Pro", "iPhone 13 Pro Max", "Galaxy S24 Ultra"];
const TOP_CSS = `
.mvt-wrap{position:relative;overflow:hidden;padding:6px 0 10px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.mvt-track{display:flex;gap:16px;width:max-content;animation:mvt-scroll 60s linear infinite}
.mvt-wrap:hover .mvt-track,.mvt-track:focus-within{animation-play-state:paused}
@keyframes mvt-scroll{to{transform:translateX(-50%)}}
.mvt-card{flex:0 0 200px;background:var(--mr-surface);border:1px solid var(--mr-line);border-radius:18px;padding:14px;text-decoration:none;color:var(--mr-text);box-shadow:0 6px 20px rgba(17,24,39,.06);transition:transform .25s ease,box-shadow .25s ease}
.mvt-card:hover{transform:translateY(-8px) rotateX(4deg) rotateY(-2deg);box-shadow:0 24px 48px rgba(120,20,40,.2)}
.mvt-img{height:190px;border-radius:14px;background:linear-gradient(180deg,var(--mr-surface-2),var(--mr-surface-2));display:flex;align-items:center;justify-content:center;margin-bottom:12px;overflow:hidden}
.mvt-img img{max-height:170px;max-width:90%;object-fit:contain;filter:drop-shadow(0 12px 16px rgba(17,24,39,.18))}.mvt-img svg{max-height:96%;max-width:96%;width:auto;height:auto}
.mvt-name{font-weight:800;font-size:15px;margin-bottom:4px}
.mvt-price{font-family:'Archivo Black',sans-serif;font-size:22px;color:var(--mr-brand)}
.mvt-cta{font-size:13px;font-weight:700;color:var(--mr-brand);margin-top:6px}
@media(max-width:720px){.mvt-card{flex-basis:165px}.mvt-img{height:160px}.mvt-img img{max-height:145px}}
@media(prefers-reduced-motion:reduce){.mvt-track{animation:none}.mvt-wrap{overflow-x:auto}}
`;
function TopPhones({ phones }) {
  if (!phones.length) return null;
  const card = (p, n, dup) => (
    <a key={(dup ? "d" : "") + p.model} href={`/quote?q=${encodeURIComponent(p.model)}`} className="mvt-card" tabIndex={dup ? -1 : 0} aria-hidden={dup ? true : undefined}>
      <div className="mvt-img">
        {p.imageUrl ? <img src={p.imageUrl} alt={dup ? "" : p.model} loading="lazy" /> : <DeviceArtCard type="phone" size={168} brand={p.brand} model={p.model} />}
      </div>
      <div className="mvt-name">{p.model}</div>
      <div style={{ fontSize: 12.5, color: "var(--mr-muted)" }}>Get up to</div>
      <div className="mvt-price">${p.upTo.toLocaleString()}</div>
      <div className="mvt-cta">Get my quote →</div>
    </a>
  );
  return (
    <section aria-label="Top phones we buy" className="reveal" style={{ padding: "34px 0 6px" }}>
      <style>{TOP_CSS}</style>
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26 }}>Top phones we buy</div>
          <div style={{ color: "var(--mr-muted)", fontSize: 14.5 }}>Real prices from our quote tool. Tap a phone for your exact offer.</div>
        </div>
        <a href="/sell/apple" style={{ color: "var(--mr-brand)", fontWeight: 700, fontSize: 14.5 }}>See all models →</a>
      </div>
      <div className="mvt-wrap">
        <div className="mvt-track">{phones.map((p, n) => card(p, n, false))}{phones.map((p, n) => card(p, n, true))}</div>
      </div>
    </section>
  );
}

const MARQUEE = ["APPLE", "SAMSUNG", "GOOGLE PIXEL", "OPPO", "MOTOROLA", "XIAOMI", "ONEPLUS", "NOTHING", "IPAD", "APPLE WATCH"];
// Same formula as the quote tool (sealed, largest storage, after holding cost) — never more than a real quote.
// "Up to" per storage size (same capped formula as the Sell pages and the quote tool's sealed price).
function pricesFor(d, cfg) {
  const pts = DEFAULT_RETENTION_POINTS; // force latest curve (ignore old stored config)
  const f = { ...DEFAULT_BRAND_FACTOR, ...((cfg && cfg.brandFactors) || {}) };
  const hold = (cfg && cfg.holdingCostPct) ?? DEFAULT_HOLDING_COST_PCT;
  const out = {};
  for (const s of Object.keys(d.retail || {})) { const v = Math.floor((baseBuybackAUD(d, s, pts, f) || 0) * (1 - hold)); if (v > 0) out[s] = v; }
  return out;
}
// Sealed base per storage, before condition and holding cost (the card applies those).
function basesFor(d, cfg) {
  const f = { ...DEFAULT_BRAND_FACTOR, ...((cfg && cfg.brandFactors) || {}) };
  const out = {};
  for (const s of Object.keys(d.retail || {})) out[s] = baseBuybackAUD(d, s, DEFAULT_RETENTION_POINTS, f) || 0;
  return out;
}
// The quote tool's condition maths, with the shop's own overrides from the Pricing Console.
function conditionCfg(cfg) {
  const tierById = Object.fromEntries(((cfg && cfg.tiers) || []).map((t) => [t.id, t]));
  const factor = Object.fromEntries(DEFAULT_TIERS.map((t) => [t.id, tierById[t.id]?.factor ?? t.factor]));
  // per category (tablets, laptops, watches weigh the same fault differently), with the
  // console's overrides applied by fault id across all of them, exactly like the quote tool
  const over = {};
  ((cfg && cfg.faultGroups) || []).forEach((g) => g.faults.forEach((x) => { over[x.id] = x.pct; }));
  const pctBy = {};
  for (const [cat, groups] of Object.entries(FAULT_GROUPS_BY_CATEGORY)) {
    pctBy[cat] = {};
    groups.forEach((g) => g.faults.forEach((x) => { pctBy[cat][x.id] = over[x.id] ?? x.pct; }));
  }
  return { factor, pctBy, hold: (cfg && cfg.holdingCostPct) ?? DEFAULT_HOLDING_COST_PCT };
}
// Two quick questions on the homepage card. Each answer maps onto the quote tool's own
// condition tier and fault ids, so the card's number is what the full quote will say.
const SCREEN_OPTS = [
  { id: "perfect", label: "Perfect", tier: "asnew", faults: [] },
  { id: "scratched", label: "Scratches", tier: "good", faults: [] },
  { id: "cracked", label: "Cracked", tier: "good", faults: ["screen_crack"] },
];
const BATTERY_OPTS = [
  { id: "90", label: "90%+", faults: [] },
  { id: "80", label: "80–89%", faults: ["batt_80_89"] },
  { id: "low", label: "Under 80%", faults: ["batt_below80"] },
];
function conditionPrice(base, screen, battery, c, category) {
  const tierBase = base * (c.factor[screen.tier] ?? 1);
  const pct = c.pctBy[category] || c.pctBy.phone || {};
  const off = [...screen.faults, ...battery.faults].reduce((a, id) => a + (pct[id] || 0), 0);
  return Math.round(Math.max(base * 0.05, tierBase * (1 - off - c.hold))); // rounded like the quote tool
}

function upToFor(d, cfg) {
  const pts = DEFAULT_RETENTION_POINTS; // force latest curve (ignore old stored config)
  const f = { ...DEFAULT_BRAND_FACTOR, ...((cfg && cfg.brandFactors) || {}) };
  const hold = (cfg && cfg.holdingCostPct) ?? DEFAULT_HOLDING_COST_PCT;
  return Math.floor(Math.max(0, ...Object.keys(d.retail || {}).map((s) => baseBuybackAUD(d, s, pts, f) || 0)) * (1 - hold));
}
const HERO_CSS = `
.mvx-hero{position:relative;overflow:hidden;color:#fff;min-height:auto;background:linear-gradient(160deg,#2A1520 0%,#12080C 50%,#050304 100%);display:flex;align-items:center}
.mvx-hero-inner{position:relative;max-width:1180px;margin:0 auto;padding:60px 22px;display:grid;grid-template-columns:1.1fr .9fr;gap:30px;align-items:center;width:100%}
.mvx-chrome{background:linear-gradient(180deg,var(--mr-surface) 0%,#F5E6EA 40%,#C97A8A 60%,var(--mr-surface) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.mvx-eyebrow{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.3em;color:rgba(255,255,255,.6);margin-bottom:18px}
.mvx-eyebrow i{width:24px;height:1px;background:linear-gradient(90deg,#C97A8A,transparent);display:block}
.mvx-h1{font-family:'Outfit','Archivo',sans-serif;font-weight:800;font-size:clamp(40px,6vw,78px);line-height:.95;letter-spacing:-.04em;margin:0 0 18px;color:#fff}
.mvx-line{display:block}
.mvx-line>span{display:block}
.mvx-sub{font-size:17px;line-height:1.6;color:rgba(255,255,255,.75);max-width:440px;margin:0 0 26px}
.mvx-ctas{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}
.mvx-cta{display:inline-flex;align-items:center;gap:8px;min-height:50px;padding:0 26px;border-radius:999px;background:linear-gradient(180deg,#A0485C,#6B2D3C);color:#fff;font-weight:700;font-size:15px;text-decoration:none;box-shadow:0 12px 28px rgba(107,45,60,.4)}
.mvx-cta2{display:inline-flex;align-items:center;min-height:50px;padding:0 22px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;font-weight:600;font-size:15px;text-decoration:none}
.mvx-pills{display:flex;gap:8px;flex-wrap:wrap}
.mvx-pills span{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:rgba(255,255,255,.72);background:rgba(255,255,255,.1);padding:6px 12px;border-radius:999px;white-space:nowrap}
.mvx-pills svg{width:15px;height:15px;flex:none}
.mvx-stage{position:relative;min-height:auto;display:grid;grid-template-columns:minmax(0,340px);align-items:center;justify-content:end}
.mvx-glow{position:absolute;right:0;top:50%;margin-top:-170px;width:340px;height:340px;pointer-events:none;background:radial-gradient(circle,rgba(169,90,110,.4) 0%,transparent 70%);filter:blur(30px)}
.mvx-card{position:relative;width:100%;box-sizing:border-box;background:rgba(20,10,14,.8);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;box-shadow:0 20px 40px rgba(0,0,0,.4)}
.mvx-quote-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:11px;letter-spacing:.08em;color:rgba(255,255,255,.5)}
.mvx-live{display:flex;align-items:center;gap:5px;color:#7DDEA0}
.mvx-live i{width:6px;height:6px;border-radius:50%;background:#7DDEA0}
.mvx-quote label{display:block;font-size:12px;color:rgba(255,255,255,.55);margin-bottom:6px}
.mvx-search{position:relative}
.mvx-search input{width:100%;box-sizing:border-box;padding:10px 12px 10px 36px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23ffffff99' stroke-width='2' stroke-linecap='round' viewBox='0 0 24 24'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='M20 20l-3.5-3.5'/%3E%3C/svg%3E") no-repeat 12px 50%;color:#fff;font-size:16px;outline:none;-webkit-appearance:none}
.mvx-search input::placeholder{color:rgba(255,255,255,.6)}
.mvx-search input:focus{border-color:#C97A8A;box-shadow:0 0 0 3px rgba(201,122,138,.25)}
.mvx-hits{position:absolute;z-index:5;left:0;right:0;top:calc(100% + 6px);margin:0;padding:6px;list-style:none;background:#1E1016;border:1px solid rgba(255,255,255,.14);border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.5);max-height:300px;overflow:auto}
.mvx-hits li{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 10px;border-radius:8px;font-size:14px;cursor:pointer;color:#fff}
.mvx-hits li b{font-size:12px;color:#7DDEA0;font-weight:600;white-space:nowrap}
.mvx-hits li[aria-selected="true"]{background:rgba(201,122,138,.22)}
.mvx-hits li.none{border-top:1px solid rgba(255,255,255,.1);margin-top:4px;border-radius:0 0 8px 8px}
.mvx-hits li.none a{color:#F5C7D1;text-decoration:none;font-weight:600;display:block;width:100%}
.mvx-cur{margin:8px 0 6px;font-weight:800;font-size:16px;color:#fff}
.mvx-pop{display:flex;gap:6px;overflow-x:auto;margin:0 0 12px;padding-bottom:2px;scrollbar-width:none}
.mvx-pop::-webkit-scrollbar{display:none}
.mvx-chip{flex:none;padding:5px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.75);font-size:11.5px;cursor:pointer;white-space:nowrap}
.mvx-chip[aria-pressed="true"]{border-color:#C97A8A;color:#fff;background:rgba(201,122,138,.18)}
.mvx-sizes{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.mvx-size{padding:6px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.7);font-size:12px;cursor:pointer}
.mvx-size[aria-pressed="true"],.mvx-size[aria-checked="true"]{background:#8B3A4C;color:#fff;border-color:#8B3A4C}
.mvx-q{font-size:12px;color:rgba(255,255,255,.55);margin:2px 0 6px}
.mvx-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
.mvx-seg .mvx-size{padding:8px 4px;text-align:center}
.mvx-est{display:flex;justify-content:space-between;align-items:flex-end;margin:8px 0 12px}
.mvx-est-label{display:block;font-size:11px;color:rgba(255,255,255,.5);margin-bottom:2px}
.mvx-price{font-size:32px;font-weight:800}
.mvx-cash{font-size:11px;color:#7DDEA0;background:rgba(125,222,160,.12);padding:3px 7px;border-radius:6px}
.mvx-quote-btn{display:block;text-align:center;padding:12px;border-radius:11px;background:linear-gradient(180deg,#A0485C,#6B2D3C);color:#fff;font-weight:700;text-decoration:none}
.mvx-quote-note{font-size:11px;color:rgba(255,255,255,.4);margin-top:8px;line-height:1.4}
.mvx-benefits{background:var(--mr-surface-2);border-bottom:1px solid var(--mr-line)}
.mvx-benefits-inner{max-width:1180px;margin:0 auto;padding:18px 22px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.mvx-benefits-inner div{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13.5px;font-weight:600;color:#2A1A1E}
.mvx-benefits-inner svg{width:18px;height:18px;color:#8B3A4C}
@media(max-width:900px){
  .mvx-hero{min-height:auto!important;height:auto!important}
  .mvx-hero-inner{grid-template-columns:minmax(0,1fr);padding:24px 16px;gap:12px}
  .mvx-hero-inner>*{min-width:0}
  .mvx-stage{height:auto;padding-top:8px;min-height:auto!important}
  .mvx-stage{grid-template-columns:minmax(0,420px);justify-content:center}
  .mvx-card{width:100%;margin:0 auto;box-sizing:border-box}
  .mvx-glow{display:none}
  .mvx-benefits-inner{grid-template-columns:repeat(2,1fr);padding:12px 14px}
  .mvx-h1{font-size:32px!important}
  .mvx-sub{font-size:14px}
  .mvx-wide-only{display:none!important}
}
@media(max-width:480px){
  .mvx-hero-inner{padding:16px 12px}
  .mvx-h1{font-size:28px!important}
  .mvx-ctas{flex-direction:column}
  .mvx-cta,.mvx-cta2{width:100%;justify-content:center}
}
`;
const IC = {
  truck: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19.3a1.8 1.8 0 1 0 0-.1M17 19.3a1.8 1.8 0 1 0 0-.1" />,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>,
  shield: <><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
};
const Ico = ({ k }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IC[k]}</svg>;

// Chrome hero (design option 15). Same live quote as before: pick a model and size,
// see the capped "up to" price from the quote tool's formula, then go to the full quote.
// Search over every device we buy: every word typed must appear in "brand model".
// Model names that start with the query come first, then newest.
function searchModels(list, q) {
  const words = q.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hay = (d) => `${d.brand} ${d.model}`.toLowerCase();
  const hits = list.filter((d) => { const h = hay(d); return words.every((w) => h.includes(w)); });
  const ql = q.trim().toLowerCase();
  const rank = (d) => { const m = d.model.toLowerCase(), f = hay(d); return m === ql || f === ql ? 0 : m.startsWith(ql) || f.startsWith(ql) ? 1 : 2; };
  // exact name first, then names that start with it, shortest (the base model) before variants
  return hits.sort((a, b) => rank(a) - rank(b) || a.model.length - b.model.length).slice(0, 8);
}
const showName = (d) => (d.brand === "Apple" || d.model.toLowerCase().startsWith(d.brand.toLowerCase()) ? d.model : `${d.brand} ${d.model}`);

function ModelSearch({ list, current, onPick }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const hits = searchModels(list, q);
  const pick = (d) => { onPick(d); setQ(""); setOpen(false); };
  return (
    <div className="mvx-search">
      <input type="search" role="combobox" aria-expanded={open && q.length > 0} aria-controls="mvx-hits" aria-autocomplete="list"
        aria-label="Search your phone model" autoComplete="off" spellCheck="false"
        placeholder={current ? "Search another model…" : "Search your phone, e.g. iPhone 15 Pro"}
        value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
          else if (e.key === "Escape") { setOpen(false); }
        }} />
      {open && q.trim() && (
        <ul id="mvx-hits" className="mvx-hits" role="listbox">
          {hits.map((d, n) => (
            <li key={d.brand + d.model} role="option" aria-selected={n === hi} onMouseDown={(e) => { e.preventDefault(); pick(d); }} onMouseEnter={() => setHi(n)}>
              <span>{showName(d)}</span><b>up to ${Math.max(...Object.values(d.prices)).toLocaleString()}</b>
            </li>
          ))}
          {/* always offered under the results: the quote page's "we'll price it for you" request form */}
          <li className="none" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()}>
            <a href={`/quote?q=${encodeURIComponent(q.trim())}&ask=1`}>{hits.length ? "Not here? We'll price it for you →" : `Not listed? We'll price “${q.trim()}” for you →`}</a>
          </li>
        </ul>
      )}
    </div>
  );
}

function Hero({ quoteModels, allModels, condCfg }) {
  const [picked, setPicked] = useState(null);
  const [si, setSi] = useState(0);
  const [sc, setSc] = useState(0); // screen answer
  const [bt, setBt] = useState(0); // battery answer
  const cur = picked || quoteModels[0];
  const storages = cur ? Object.keys(cur.prices) : [];
  const storage = storages[Math.min(si, storages.length - 1)];
  const screen = SCREEN_OPTS[sc], battery = BATTERY_OPTS[bt];
  const price = cur && storage ? conditionPrice(cur.bases[storage] || 0, screen, battery, condCfg, cur.category) : 0;
  const sealed = cur && storage ? cur.prices[storage] : 0;
  const faults = [...screen.faults, ...battery.faults];
  const quoteHref = cur ? `/quote?q=${encodeURIComponent(cur.model)}&storage=${encodeURIComponent(storage || "")}&tier=${screen.tier}${faults.length ? `&faults=${faults.join(",")}` : ""}` : "/quote";
  return (
    <>
      <section className="mvx-hero" aria-label="Sell your phone">
        <style>{HERO_CSS}</style>
        <div className="mvx-hero-inner">
          <div>
            <div className="mvx-eyebrow mvx-in" style={{ animationDelay: "0.1s" }}><i />SYDNEY · SELL · REPAIR · BUY</div>
            <h1 className="mvx-h1">
              <span className="mvx-line"><span className="mvx-chrome" style={{ animationDelay: "0.2s" }}>Sell your phone.</span></span>
              <span className="mvx-line"><span className="mvx-chrome" style={{ animationDelay: "0.34s" }}>Get paid today.</span></span>
            </h1>
            <p className="mvx-sub mvx-in" style={{ animationDelay: "0.6s" }}>Sell it. Fix it. Find your next one. We collect from your door anywhere in Sydney and pay you in cash.</p>
            <div className="mvx-ctas mvx-in" style={{ animationDelay: "0.72s" }}>
              <a href="/quote" className="mvx-cta">Sell my phone <span aria-hidden="true">→</span></a>
              <a href="/shop" className="mvx-cta2">Shop refurbished</a>
            </div>
            <div className="mvx-pills mvx-in" style={{ animationDelay: "0.85s" }}>
              <span><Ico k="truck" />Home collection</span>
              <span><Ico k="cash" />Paid in cash</span>
              <span><Ico k="shield" />49-point check</span>
            </div>
          </div>
          <div className="mvx-stage">
            <div className="mvx-glow" aria-hidden="true" />
            {/* Hold the card's space while prices load, so the page doesn't jump when it appears. */}
            {!cur && <div className="mvx-card" aria-hidden="true" style={{ minHeight: 521, visibility: "hidden" }} />}
            {cur && (
              <div className="mvx-card">
                <div className="mvx-quote">
                  <div className="mvx-quote-top"><span>YOUR DEVICE</span><span className="mvx-live"><i />Live price</span></div>
                  <div className="mvx-q">Model</div>
                  <ModelSearch list={allModels.length ? allModels : quoteModels} current={cur} onPick={(d) => { setPicked(d); setSi(0); }} />
                  <div className="mvx-cur"><span>{showName(cur)}</span></div>
                  <div className="mvx-pop" aria-label="Popular models">
                    {quoteModels.slice(0, 6).map((d) => (
                      <button key={d.model} type="button" className="mvx-chip" aria-pressed={cur.model === d.model} onClick={() => { setPicked(d); setSi(0); }}>{d.model.replace(/^Galaxy /, "")}</button>
                    ))}
                  </div>
                  <div className="mvx-sizes" role="group" aria-label="Storage">
                    {storages.map((s, n) => <button key={s} type="button" className="mvx-size" aria-pressed={n === Math.min(si, storages.length - 1)} onClick={() => setSi(n)}>{s}</button>)}
                  </div>
                  <div className="mvx-q">Screen</div>
                  <div className="mvx-seg" role="radiogroup" aria-label="Screen condition">
                    {SCREEN_OPTS.map((o, n) => <button key={o.id} type="button" role="radio" aria-checked={n === sc} className="mvx-size" onClick={() => setSc(n)}>{o.label}</button>)}
                  </div>
                  <div className="mvx-q">Battery health</div>
                  <div className="mvx-seg" role="radiogroup" aria-label="Battery health">
                    {BATTERY_OPTS.map((o, n) => <button key={o.id} type="button" role="radio" aria-checked={n === bt} className="mvx-size" onClick={() => setBt(n)}>{o.label}</button>)}
                  </div>
                  <div className="mvx-est">
                    <div><span className="mvx-est-label">Your phone is worth about</span><span key={cur.model + storage + sc + bt} className="mvx-price mvx-chrome" aria-live="polite">${price.toLocaleString()}</span></div>
                    <span className="mvx-cash">Paid in cash</span>
                  </div>
                  <a href={quoteHref} className="mvx-quote-btn">Sell it for ${price.toLocaleString()} <span aria-hidden="true">→</span></a>
                  <div className="mvx-quote-note">Sealed in the box? Up to ${sealed.toLocaleString()}. Final offer after our 49-point check.</div>
                  <div className="mvx-sheen" aria-hidden="true" />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      <style>{REVEAL_CSS}</style><div className="mvx-benefits reveal">
        <div className="mvx-benefits-inner">
          <div><Ico k="truck" />Free Sydney home collection</div>
          <div><Ico k="shield" />49-point quality inspection</div>
          <div><Ico k="bolt" />Same-day in-store repairs</div>
          <div><Ico k="box" />1-year warranty on devices</div>
        </div>
      </div>
    </>
  );
}

// The real inspection checklist used by staff — so the "N-point check" number
// is always true, and updates itself if the checklist ever changes.
const CHECK_GROUPS = PHONE_FAULT_GROUPS.map((g) => ({ name: g.group || g.title || g.name, n: g.faults.length }));
const SIGNATURE_GROUPS = [...PHONE_FAULT_GROUPS.map((g) => ({ name: g.group || g.title || g.name, faults: g.faults })), { name: "Security & lock checks", faults: BLOCKERS.map((b) => ({ id: b.id, label: b.label })) }];
const CHECK_COUNT = CHECK_GROUPS.reduce((n, g) => n + g.n, 0) + BLOCKERS.length;

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared) {
  if (!storageAvailable()) return null;
  try {
    const r = await window.storage.get(key, shared);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}

const ink = "var(--mr-bg)", panel = "var(--mr-surface)", paper = "var(--mr-text)", muted = "var(--mr-muted)",
  brass = "var(--mr-brand)", brassDim = "var(--mr-brand-soft)", line = "var(--mr-line)";

// The three things people actually come here to do — each gets equal,
// prominent billing up top, the way PhoneExchange and Mobile Monster lead
// with their core actions rather than burying them.
const ACTIONS = [
  { href: "/quote", icon: "💰", title: "Sell your device", desc: "Instant quote, then we collect from your door anywhere in Sydney and pay you in cash.", cta: "Get a quote" },
  { href: "/shop", icon: "📱", title: "Buy refurbished", desc: "Graded, tested, 1-year warranty and free express shipping.", cta: "Shop now" },
  { href: "/repairs", icon: "🔧", title: "Get it repaired", desc: "Price match guarantee, genuine or premium parts, done same day in store.", cta: "Book a repair" },
];

const POPULAR = ["iPhone 16 Pro", "iPhone 15 Pro", "iPhone 14", "Galaxy S24 Ultra", "Pixel 9 Pro", "iPhone 13"];

const TRUST = [
  { area: "big", ic: "home", title: "Home collection across Sydney", desc: "We come to you, check your phone on the spot, and pay you — in cash if you like." },
  { area: "par", ic: "chip", title: "Genuine or premium parts", desc: "You choose. We always tell you which part goes in." },
  { area: "pm", ic: "tag", title: "Price match guarantee", desc: "Found it cheaper? We'll match it." },
  { area: "war", ic: "shield", title: "1-year warranty", desc: "On every device we sell. Repairs 90 days, parts & accessories 6 months." },
  { area: "gad", ic: "devices", title: "Every gadget", desc: "Phones, tablets, laptops and watches." },
  { area: "any", ic: "crack", title: "Any condition", desc: "Cracked, dead or water-damaged — we still make an offer." },
  { area: "dat", ic: "lock", title: "Data wiped securely", desc: "Every device is fully erased before it's resold." },
  { area: "ret", ic: "return", title: "30-day returns", desc: "Changed your mind? Return online purchases within 30 days. Conditions apply." },
  { area: "bat", ic: "battery", title: "Battery 80%+ guaranteed", desc: "Every refurbished phone we sell. Conditions apply." },
];

const BENTO_ICONS = {
  home: "<path d=\"M3 11l9-7 9 7\"/><path d=\"M5 10v10h14V10\"/><path d=\"M10 20v-6h4v6\"/>",
  chip: "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4\"/>",
  tag: "<path d=\"M3 12V4h8l10 10-8 8z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\"1.5\"/>",
  shield: "<path d=\"M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z\"/><path d=\"M8.5 12l2.5 2.5 4.5-5\"/>",
  devices: "<rect x=\"2\" y=\"5\" width=\"13\" height=\"10\" rx=\"1.5\"/><path d=\"M5 19h7\"/><rect x=\"17\" y=\"8\" width=\"5\" height=\"11\" rx=\"1.2\"/>",
  crack: "<rect x=\"6\" y=\"2\" width=\"12\" height=\"20\" rx=\"2.5\"/><path d=\"M10 6l3 4-3 3 4 5\"/>",
  lock: "<rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3\"/>",
  return: "<path d=\"M9 14L4 9l5-5\"/><path d=\"M4 9h11a5 5 0 0 1 0 10h-3\"/>",
  battery: "<rect x=\"2\" y=\"7\" width=\"18\" height=\"10\" rx=\"2\"/><path d=\"M22 11v2\"/><path d=\"M5 10h9v4H5z\"/>",
};
function BentoIcon({ k, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BENTO_ICONS[k] || "" }} />;
}

// "Why us" as a bento grid: the promise that wins the sale gets the big tile,
// the rest are scannable at a glance.
function BentoTrust() {
  const gridRef = useRef(null);
  useSpotlight(gridRef, ".bt-card");
  return (
    <div className="bt-band">
    <section aria-label="Why choose Mobile Recellr" className="bt-wrap">
      <style>{FX_CSS + `
        .bt-band { background: linear-gradient(180deg, var(--mr-surface-2) 0%, #E6EAF0 100%); padding: 24px 0 28px; margin-bottom: 20px; }
        .bt-wrap { max-width: 1140px; margin: 0 auto; padding: 0 20px; }
        .bt-head { font-family: 'Outfit', 'Archivo', sans-serif; font-weight: 800; font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.035em; text-align: center; margin: 0 0 22px; background: linear-gradient(180deg, #3A404D 0%, #11141B 45%, #5B6373 60%, #1A1E27 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .bt-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr));
          grid-template-areas: "big big war war" "big big pm pm" "gad dat ret bat" "par par any any"; }
        .bt-card { position: relative; border: 1px solid rgba(255,255,255,.95); border-radius: 22px; padding: 18px; background: linear-gradient(150deg, rgba(255,255,255,.92), rgba(255,255,255,.7)); box-shadow: 0 18px 40px rgba(31,36,48,.08), inset 0 1px 0 #fff; color: var(--mr-text); min-width: 0;
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
        .bt-card:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(17,24,39,.08); border-color: #C9D5F5; }
        .bt-ic { width: 42px; height: 42px; border-radius: 12px; background: var(--mr-brand-soft); color: var(--mr-brand); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .bt-t { font-weight: 800; font-size: 15.5px; margin-bottom: 4px; }
        .bt-d { color: var(--mr-muted); font-size: 13.5px; line-height: 1.5; }
        .bt-wide { display: flex; gap: 16px; align-items: center; }
        .bt-wide .bt-ic { margin-bottom: 0; flex: 0 0 auto; }
        .bt-war { background: var(--mr-surface-2); border-color: #D9E3FB; }
        .bt-big { overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; min-height: 280px; padding: 26px; border: none; color: #fff;
          background: radial-gradient(90% 90% at 85% 15%, #2A3046 0%, rgba(42,48,70,0) 60%), linear-gradient(150deg, #0B0C10 0%, #161A24 60%, #222838 100%); }
        .bt-big::before { content: ""; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px; border-radius: 50%; background: rgba(255,255,255,.08); }
        .bt-big .bt-ic { position: absolute; top: 24px; left: 26px; width: 52px; height: 52px; border-radius: 15px; background: rgba(255,255,255,.14); color: #fff; }
        .bt-big .bt-t { font-family: 'Outfit', 'Archivo', sans-serif; font-weight: 800; letter-spacing: -0.03em; background: linear-gradient(180deg, var(--mr-surface) 0%, #CDD3DE 40%, #8A93A3 56%, #ECEFF4 70%, #AEB6C4 100%); -webkit-background-clip: text; background-clip: text; color: transparent; font-size: clamp(22px, 2.6vw, 28px); line-height: 1.15; margin-bottom: 8px; position: relative; }
        .bt-big .bt-d { color: rgba(255,255,255,.86); font-size: 15px; max-width: 420px; position: relative; }
        .bt-cta { position: relative; align-self: flex-start; margin-top: 18px; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 18px; border-radius: 999px;
          background: var(--mr-surface); color: #1B43AA; font-weight: 800; font-size: 14px; text-decoration: none; transition: transform .15s ease; }
        .bt-cta:hover { transform: translateX(3px); }
        @media (max-width: 900px) {
          .bt-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: none; grid-auto-flow: row dense; }
          .bt-grid > * { grid-area: auto !important; }
          .bt-big, .bt-span2 { grid-column: span 2 !important; }
          .bt-big { min-height: 0; }
          .bt-big .bt-ic { position: relative; top: auto; left: auto; margin-bottom: 16px; }
        }
        @media (max-width: 520px) {
          .bt-grid { gap: 10px; }
          .bt-card { padding: 14px; border-radius: 16px; }
          .bt-wide { align-items: flex-start; }
          .bt-ic { width: 36px; height: 36px; border-radius: 11px; margin-bottom: 10px; }
          .bt-t { font-size: 14.5px; }
          .bt-d { font-size: 13px; }
        }
        @media (prefers-reduced-motion: reduce) { .bt-card, .bt-cta { transition: none; } .bt-card:hover { transform: none; } }
      `}</style>
      <h2 className="bt-head">Why people choose us</h2>
      <div className="bt-grid" ref={gridRef}>
        {TRUST.map((t, i) => {
          const big = t.area === "big", wide = ["war", "pm", "par", "any"].includes(t.area);
          return (
            <div key={t.title} className={`bt-card mv-rise fx-scroll-in fx-spot${big ? " bt-big fx-spot-dark" : ""}${wide ? " bt-wide bt-span2" : ""}${t.area === "war" ? " bt-war" : ""}`}
              style={{ gridArea: t.area, animationDelay: `${0.2 + i * 0.06}s` }}>
              <div className="bt-ic"><BentoIcon k={t.ic} size={big ? 26 : 22} /></div>
              <div>
                <div className="bt-t">{t.title}</div>
                <div className="bt-d">{t.desc}</div>
              </div>
              {big && <a href="/quote" className="bt-cta fx-shimmer fx-on-light">Get my quote <span aria-hidden="true">→</span></a>}
            </div>
          );
        })}
      </div>
    </section>
    </div>
  );
}

const STEP_ICONS = {"1": "<rect x=\"7\" y=\"2\" width=\"10\" height=\"20\" rx=\"2.5\"/><path d=\"M11 18h2\"/>", "2": "<path d=\"M3 7h11v9H3zM14 10h4l3 3v3h-7z\"/><circle cx=\"7\" cy=\"17.5\" r=\"1.8\"/><circle cx=\"17\" cy=\"17.5\" r=\"1.8\"/>", "3": "<rect x=\"2\" y=\"6\" width=\"20\" height=\"12\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M6 9v.01M18 15v.01\"/>"};
const STEPS = [
  { n: "1", title: "Get your quote", desc: "Tell us the model and condition. Your price appears instantly." },
  { n: "2", title: "We collect it", desc: "We collect from your door anywhere in Sydney — or post it, or drop it in store." },
  { n: "3", title: "Get paid", desc: "We run our 49-point check and pay you in cash, by bank transfer or PayPal. If anything differs, you choose whether to accept." },
];

const GUIDES = [
  { href: "/blog/charging-port-dust-or-real-fault", title: "Your charging port probably isn't broken" },
  { href: "/blog/refurbished-grades-explained", title: "What Grade A, B, or C actually means" },
  { href: "/blog/how-much-is-my-old-phone-worth", title: "How much is your old phone worth?" },
];

export default function Home() {
  const [stats, setStats] = useState([]);
  const [biz, setBiz] = useState({});
  const [featured, setFeatured] = useState(null);
  const [spinUnit, setSpinUnit] = useState(null);
  const [quoteModels, setQuoteModels] = useState([]);
  const [allModels, setAllModels] = useState([]);
  const [condCfg, setCondCfg] = useState(() => conditionCfg(null));
  const [topPhones, setTopPhones] = useState([]);
  const [photos, setPhotos] = useState({});

  useEffect(() => {
    (async () => {
      const cfg = await loadJSON("pricing-config", true);
      const b = (cfg && cfg.businessSettings) || {};
      setBiz(b);
      { const cat = mergeCatalog(cfg && cfg.catalog);
        const priced = (d) => ({ model: d.model, brand: d.brand, category: d.category || "phone", release: d.release, prices: pricesFor(d, cfg), bases: basesFor(d, cfg) });
        setQuoteModels(TICKER_MODELS.map((m) => cat.find((d) => d.model === m)).filter(Boolean).map(priced).filter((x) => Object.keys(x.prices).length));
        // every device we buy, for the card's search (newest first)
        setAllModels(cat.map(priced).filter((x) => Object.keys(x.prices).length).sort((a, b) => String(b.release || "").localeCompare(String(a.release || ""))));
        setCondCfg(conditionCfg(cfg));
        setTopPhones(FEATURED_PHONES.map((m) => cat.find((d) => d.model === m)).filter(Boolean).map((d) => ({ model: d.model, brand: d.brand, imageUrl: d.imageUrl, upTo: upToFor(d, cfg) })).filter((x) => x.upTo > 0)); }
      setPhotos(Object.fromEntries(mergeCatalog(cfg && cfg.catalog).filter((d) => d.imageUrl).map((d) => [`${d.brand}|${d.model}`, d.imageUrl])));
      // Featured deal: the highest-value device actually listed for sale right now.
      try {
        const r = window.storage && await window.storage.get("inventory", true);
        const listed = r ? JSON.parse(r.value).filter((i) => i.status === "listed" && i.listedPrice > 0) : [];
        setFeatured(listed.sort((a, x) => x.listedPrice - a.listedPrice)[0] || null);
        setSpinUnit(listed.find((i) => hasSpin(i)) || null); // a real phone with a 360 photo set, if any
      } catch (e) { /* no stock yet */ }
      // Only show numbers the owner has actually entered — never invented ones.
      const s = [];
      if (b.yearsInBusiness) s.push({ value: `${b.yearsInBusiness}+`, label: "Years in business" });
      if (b.devicesSoldCount) s.push({ value: Number(b.devicesSoldCount).toLocaleString(), label: "Devices sold" });
      if (b.googleRating) s.push({ value: `${b.googleRating}★`, label: "Google rating" });
      setStats(s);
    })();
  }, []);

  useEffect(() => {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // :not(.in), and re-run when the phone strip arrives: it renders only after its prices
    // load, so a one-off pass on mount never saw it and it stayed invisible (a blank band).
    const els = document.querySelectorAll(".reveal:not(.in)");
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  },[topPhones.length]);


  const section = { maxWidth: 1140, margin: "0 auto", padding: "0 20px" };
  const heading = { fontFamily: "'Archivo Black', sans-serif", fontSize: 24, letterSpacing: "-0.01em", marginBottom: 18, textAlign: "center" };

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=optional');


        @keyframes mv-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mv-glow { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.06); } }
        .mv-rise { animation: mv-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .mv-hero { position: relative; overflow: hidden; }
        .mv-hero::before { content: ""; position: absolute; top: -140px; left: 50%; width: 620px; height: 620px; margin-left: -310px;
          background: radial-gradient(circle, rgba(33,80,200,0.16) 0%, rgba(33,80,200,0) 65%); pointer-events: none; }
        .mv-hero > * { position: relative; }
        .mv-action:hover { border-color: var(--mr-brand) !important; }
        .mv-action:hover .mv-arrow { transform: translateX(5px); }
        .mv-arrow { display: inline-block; transition: transform 0.2s ease; }
        @keyframes mv-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        .mv-float { }
        .mv-chip { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; background: var(--mr-surface);
          border: 1px solid rgba(32,28,24,0.16); color: var(--mr-text); text-decoration: none; font-size: 14px; font-weight: 600;
          transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease; }
        .mv-chip:hover { border-color: var(--mr-brand); color: var(--mr-brand); transform: translateY(-1px); }
        @media (prefers-reduced-motion: reduce) { .mv-rise, .mv-hero::before, .mv-float { animation: none !important; } }
      `}</style>

      {/* ---- Hero ---- */}
      <Hero quoteModels={quoteModels} allModels={allModels} condCfg={condCfg} />

      {/* ---- Look around a real iPhone (scroll-driven 3D) ---- */}
      <DeviceShowcase />

      {spinUnit && hasSpin(spinUnit) && (
        <section aria-label="See this phone in 360 degrees" style={{ background: "#0E0F13", color: "#fff", padding: "24px 20px" }}>
          <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 12, letterSpacing: ".22em", color: "#A9BDF5", fontWeight: 700, marginBottom: 8 }}>IN STOCK NOW</div>
            <h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, margin: "0 0 6px" }}>See it in 360°</h2>
            <p style={{ color: "rgba(255,255,255,.7)", fontSize: 15, margin: "0 auto 22px", maxWidth: 480 }}>
              {spinUnit.brand} {spinUnit.model}{spinUnit.storage ? ` · ${spinUnit.storage}` : ""} — photos of the exact phone you'd receive. Drag to turn it.
            </p>
            <div style={{ background: "var(--mr-surface)", borderRadius: 20, padding: "18px 12px", maxWidth: 420, margin: "0 auto" }}>
              <SpinViewer frames={spinUnit.spinUrls} poster={spinUnit.photoUrl} alt={`${spinUnit.brand} ${spinUnit.model}`} />
            </div>
            <a href="/shop" className="mv-chip" style={{ marginTop: 22 }}>Shop refurbished phones <span className="mv-arrow" aria-hidden="true">→</span></a>
          </div>
        </section>
      )}
      <GoogleReviews />
      <TopPhones phones={topPhones} />
      <div className="mv-hero" style={{ ...section, textAlign: "center", padding: "34px 20px 34px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, textAlign: "left" }}>
          {ACTIONS.map((a, i) => (
            <a key={a.href} href={a.href} className="cs-card mv-action mv-rise"
              style={{ animationDelay: `${0.15 + i * 0.1}s`, display: "block", border: `1px solid ${line}`, borderRadius: 4, padding: 22, background: panel, color: paper, textDecoration: "none" }}>
              <div style={{ fontSize: 30, marginBottom: 10 }} aria-hidden="true">{a.icon}</div>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 19, marginBottom: 6 }}>{a.title}</div>
              <div style={{ color: muted, fontSize: 13.5, marginBottom: 16, lineHeight: 1.5 }}>{a.desc}</div>
              <span style={{ color: brass, fontWeight: 700, fontSize: 14 }}>{a.cta} <span className="mv-arrow">→</span></span>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12.5, color: muted, marginBottom: 10, letterSpacing: "0.04em" }}>POPULAR RIGHT NOW — TAP FOR AN INSTANT QUOTE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {POPULAR.map((m) => (
              <a key={m} href={`/quote?q=${encodeURIComponent(m)}`} className="mv-chip">{m}</a>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: muted, marginTop: 14 }}>
            ✓ Home collection across Sydney &nbsp;·&nbsp; ✓ Paid in cash or bank transfer &nbsp;·&nbsp; ✓ Price held 14 days
          </div>
        </div>

        {stats.length > 0 && (
          <div style={{ display: "flex", gap: 34, justifyContent: "center", flexWrap: "wrap", marginTop: 34 }}>
            {stats.map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, color: brass }}><NumberTicker value={s.value} /></div>
                <div style={{ fontSize: 12, color: muted }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Featured deal (only when stock is listed) ---- */}
      {featured && (
        <div style={{ ...section, marginBottom: 16 }}>
          <a href="/shop" className="cs-card" style={{ display: "flex", alignItems: "center", gap: 18, border: "2px solid var(--mr-brand)", background: panel, padding: 18, color: paper, textDecoration: "none", flexWrap: "wrap" }}>
            <DeviceArtCard type={inferDeviceType(featured.model, featured.category)} size={78} brand={featured.brand} model={featured.model}
              imageUrl={featured.photoUrl || photos[`${featured.brand}|${featured.model}`]} label={`${featured.brand} ${featured.model}`} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: brass, letterSpacing: "0.06em", marginBottom: 4 }}>FEATURED DEAL</div>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20 }}>{featured.brand} {featured.model}</div>
              <div style={{ color: muted, fontSize: 13.5 }}>{featured.storage} · Graded, tested, 1-year warranty, free express shipping</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, color: brass }}>${Math.round(featured.listedPrice).toLocaleString()}</div>
              <div style={{ color: brass, fontWeight: 700, fontSize: 13.5 }}>Shop now →</div>
            </div>
          </a>
        </div>
      )}

      {/* ---- Why us (bento) ---- */}
      <BentoTrust />

      {/* ---- Photo feature band ---- */}
      <div className="mvx-wide-only" style={{ ...section, marginBottom: 20 }}>
        <Photo name="workshop" height={320} overlay="linear-gradient(90deg, rgba(20,24,40,0.82) 0%, rgba(20,24,40,0.55) 55%, rgba(20,24,40,0.1) 100%)">
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 clamp(20px, 5vw, 44px)", maxWidth: 480, color: "#fff" }}>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(22px, 4vw, 30px)", lineHeight: 1.15, marginBottom: 10 }}>Real technicians.<br />Honest parts.</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.6, opacity: 0.92, marginBottom: 18 }}>We diagnose first and tell you honestly what's wrong, before quoting anything.</div>
            <a href="/repairs" className="cs-btn" style={{ alignSelf: "flex-start", padding: "12px 22px", background: "var(--mr-surface)", color: "var(--mr-text)", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 10 }}>Book a repair →</a>
          </div>
        </Photo>
      </div>

      {/* ---- How selling works: "From drawer to dollars" ---- */}
      <div style={{ background: "var(--mr-surface-2)", padding: "56px 0", marginBottom: 20 }}>
        <div style={section}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", color: brass, marginBottom: 8 }}>LESS HASSLE. MORE CASH.</div>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(28px, 5vw, 38px)", lineHeight: 1.15 }}>From drawer to dollars.</div>
            <div style={{ color: muted, fontSize: 15, marginTop: 8 }}>Three simple steps. You don't even need to leave home.</div>
          </div>
          <div className="mv-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 36 }}>
            {STEPS.map((s) => (
              <div key={s.n}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "'Archivo Black', sans-serif", color: brass, fontSize: 13, marginBottom: 18 }}>0{s.n}<span style={{ flex: 1, height: 1, background: line }} /></div>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--mr-surface)", color: brass, display: "grid", placeItems: "center", marginBottom: 16, boxShadow: "0 6px 16px rgba(17,24,39,.06)" }}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: STEP_ICONS[s.n] }} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>{s.title}</div>
                <div style={{ color: muted, fontSize: 14, lineHeight: 1.65 }}>{s.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 30 }}>
            <a href="/quote" className="cs-btn" style={{ padding: "14px 28px", background: brass, color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none", borderRadius: 12, display: "inline-block" }}>Get your instant quote →</a>
          </div>
        </div>
      </div>

      {/* ---- Before you sell ---- */}
      <div className="mvx-wide-only" style={{ ...section, marginBottom: 20 }}>
        <div style={heading}>Before you sell: 2 minutes of prep</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          {[{"i": "💾", "t": "Back it up", "d": "iCloud, Google, or your computer."}, {"i": "🔓", "t": "Sign out & turn off Find My", "d": "Settings → your name → Find My (iPhone), or remove your Google/Samsung account (Android). Locked phones can't be accepted."}, {"i": "🧹", "t": "Erase it", "d": "Settings → General → Transfer or Reset → Erase All Content (iPhone), or Factory reset (Android)."}, {"i": "📶", "t": "Remove your SIM", "d": "And any memory card."}].map((c) => (
            <div key={c.t} style={{ background: panel, border: "1px solid rgba(32,28,24,0.12)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 24, marginBottom: 6 }} aria-hidden="true">{c.i}</div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>{c.t}</div>
              <div style={{ color: muted, fontSize: 13, lineHeight: 1.5 }}>{c.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Our inspection checklist ---- */}
      <div style={{ ...section, marginBottom: 20 }}>
        <div style={heading}>Every device passes our {CHECK_COUNT}-point check</div>
        <div style={{ color: muted, fontSize: 14, textAlign: "center", maxWidth: 620, margin: "-8px auto 18px", lineHeight: 1.6 }}>
          The same checklist we use to inspect every trade-in, so you know exactly what's been tested.
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ flex: "0 1 320px", minWidth: 240 }}><InspectionSignature groups={SIGNATURE_GROUPS} size={320} /></div>
        <div className="mvx-wide-only" style={{ flex: "1 1 420px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {[...CHECK_GROUPS, { name: "Security & lock checks", n: BLOCKERS.length }].map((g) => (
            <div key={g.name} style={{ background: panel, border: "1px solid rgba(32,28,24,0.12)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{g.name}</span>
              <span style={{ fontSize: 12.5, color: brass, fontWeight: 800, whiteSpace: "nowrap" }}>{g.n} checks</span>
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* ---- Repairs ---- */}
      <div style={{ ...section, marginBottom: 20 }}>
        <div style={heading}>Affordable repairs, done same day in store</div>
        <div className="mv-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {[["📱", "Screen replacement", "From $85", "Cracked or unresponsive display."], ["🔋", "Battery replacement", "From $59", "Phone dying by lunchtime?"],
            ["🔌", "Charging port", "From $55", "Often just dust — we check and clean first."], ["📷", "Camera repair", "From $75", "Blurry, cracked or not focusing."]].map(([i, t, p, d]) => (
            <a key={t} href="/repairs" className="cs-card" style={{ display: "block", border: "1px solid var(--mr-line)", background: panel, padding: 16, color: paper, textDecoration: "none" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }} aria-hidden="true">{i}</div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t}</div>
              <div style={{ color: brass, fontWeight: 700, fontSize: 14, margin: "3px 0 6px" }}>{p}</div>
              <div style={{ color: muted, fontSize: 13 }}>{d}</div>
            </a>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13.5 }}>
          Price match guarantee · Same day in store · Mail-in Australia-wide · 90-day warranty · <a href="/repairs" style={{ color: brass, fontWeight: 700 }}>See all repairs →</a> · <a href="/tutorials" style={{ color: brass }}>DIY tutorials</a>
        </div>
      </div>

      {/* ---- Brands ---- */}
      <div className="mvx-wide-only" style={{ ...section, marginBottom: 20, textAlign: "center" }}>
        <div style={{ color: muted, fontSize: 12.5, marginBottom: 12, letterSpacing: "0.04em" }}>WE BUY, SELL AND REPAIR</div>
        <div style={{ display: "flex", justifyContent: "center", gap: "clamp(18px, 5vw, 44px)", flexWrap: "wrap" }}>
          {[["Apple", "apple"], ["Samsung", "samsung"], ["Google", "google"], ["OPPO", "oppo"], ["Motorola", "motorola"], ["Xiaomi", "xiaomi"]].map(([b, slug]) => (
            <a key={b} href={`/sell/${slug}`} title={`Sell your ${b === "Apple" ? "iPhone" : b}`} style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 17, color: muted, textDecoration: "none" }}>{b}</a>
          ))}
        </div>
      </div>

      {/* ---- Why we exist ---- */}
      <div style={{ ...section, marginBottom: 20 }}>
        <div style={{ border: `1px solid ${line}`, borderRadius: 4, padding: 28, background: brassDim }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 21, marginBottom: 10 }}>Why we started this</div>
          <div style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 14, maxWidth: 700 }}>
            We kept seeing people charged $150 for a "broken" charging port that was really just full of dust. So we built a shop that checks the simple explanation first — and only charges for a real repair when one's actually needed.
          </div>
          <a href="/about" style={{ color: brass, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Read our story →</a>
        </div>
      </div>

      {/* ---- Visit us (only once the address is set in Business settings) ---- */}
      {biz.address && (
        <div style={{ ...section, marginBottom: 20 }}>
          <div style={{ border: "1px solid var(--mr-line)", borderRadius: 14, background: panel, padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 21, marginBottom: 8 }}>Visit us in store</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>{biz.address}</div>
              {biz.hours && <div style={{ color: muted, fontSize: 13.5, lineHeight: 1.6, marginTop: 4, whiteSpace: "pre-line" }}>{biz.hours}</div>}
              <div style={{ color: muted, fontSize: 13, marginTop: 8 }}>Bring your phone in for a free check and an instant offer. Negotiation? We're listening.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.address)}`} target="_blank" rel="noopener" className="cs-btn"
                style={{ padding: "13px 20px", background: brass, color: "#fff", fontWeight: 700, textDecoration: "none", borderRadius: 10, textAlign: "center" }}>📍 Get directions</a>
              {biz.phone && <a href={`tel:${biz.phone.replace(/\s/g, "")}`} className="cs-btn"
                style={{ padding: "13px 20px", border: "1.5px solid var(--mr-line)", color: paper, fontWeight: 700, textDecoration: "none", borderRadius: 10, textAlign: "center" }}>📞 Call {biz.phone}</a>}
            </div>
          </div>
        </div>
      )}

      {/* ---- Guides ---- */}
      <div className="mvx-wide-only" style={{ ...section, marginBottom: 20 }}>
        <div style={heading}>Straight answers</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {GUIDES.map((g) => (
            <a key={g.href} href={g.href} className="cs-card"
              style={{ display: "block", border: `1px solid ${line}`, borderRadius: 4, padding: 18, background: panel, color: paper, textDecoration: "none", fontWeight: 600, fontSize: 14.5, lineHeight: 1.4 }}>
              {g.title} <span style={{ color: brass }}>→</span>
            </a>
          ))}
        </div>
      </div>

      {/* ---- Final call to action (Lovable design idea) ---- */}
      <div style={{ background: "linear-gradient(120deg,#1E3A8A,var(--mr-brand) 60%,#0EA5E9)", color: "#fff", padding: "54px 0", marginTop: 20 }}>
        <div style={{ ...section, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(28px, 5vw, 40px)", lineHeight: 1.12 }}>That old phone has a future.</div>
            <div style={{ fontSize: 15.5, opacity: 0.88, marginTop: 10 }}>And there could be cash in yours. We collect anywhere in Sydney and pay on the spot.</div>
          </div>
          <a href="/quote" className="cs-btn" style={{ background: "#FFFFFF", color: "#1E3A8A", padding: "15px 26px", borderRadius: 12, fontWeight: 800, fontSize: 15.5, textDecoration: "none", boxShadow: "0 12px 30px rgba(0,0,0,.2)" }}>Find out what it's worth →</a>
        </div>
      </div>
    </div>
  );
}
