import React, { useState, useEffect } from "react";
import DeviceArt from "./device-art.jsx";
import Photo from "./photo.jsx";
import DeviceArtCard, { inferDeviceType } from "./device-art.jsx";
import { PHONE_FAULT_GROUPS, BLOCKERS, baseBuybackAUD, DEFAULT_RETENTION_POINTS, DEFAULT_BRAND_FACTOR, DEFAULT_HOLDING_COST_PCT } from "./instant-quote-calculator.jsx";
import { mergeCatalog } from "./device-catalog.js";
import InspectionSignature from "./inspection-signature.jsx";

// ---- Hero: animated gradient, the shop's own phone photos, live price ticker ----
const TICKER_MODELS = ["iPhone 18 Pro Max", "iPhone 18 Pro", "iPhone 17 Pro Max", "iPhone 17", "iPhone Air", "Galaxy S26 Ultra", "Galaxy S26", "Pixel 10 Pro", "iPhone 16 Pro Max", "iPhone 15 Pro", "Galaxy Z Fold8"];
// "Top phones we buy" strip — big cards that glide across, each with a real "up to" price.
const FEATURED_PHONES = ["iPhone 18 Pro", "Galaxy S26", "iPhone Air", "iPhone 17", "Nothing Phone (3)", "Galaxy A17", "iPhone 18 Pro Max", "Galaxy S26 Ultra", "iPhone 17 Pro Max", "Pixel 10 Pro", "iPhone 16 Pro Max", "Galaxy Z Fold8", "iPhone 15 Pro Max", "Galaxy S25 Ultra", "iPhone 14 Pro Max", "Pixel 9 Pro", "iPhone 13 Pro Max", "Galaxy S24 Ultra"];
const TOP_CSS = `
.mvt-wrap{position:relative;overflow:hidden;padding:6px 0 10px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.mvt-track{display:flex;gap:16px;width:max-content;animation:mvt-scroll 60s linear infinite}
.mvt-wrap:hover .mvt-track,.mvt-track:focus-within{animation-play-state:paused}
@keyframes mvt-scroll{to{transform:translateX(-50%)}}
.mvt-card{flex:0 0 200px;background:#fff;border:1px solid #E2E6EC;border-radius:18px;padding:14px;text-decoration:none;color:#111827;box-shadow:0 6px 20px rgba(17,24,39,.06);transition:transform .25s ease,box-shadow .25s ease}
.mvt-card:hover{transform:translateY(-6px);box-shadow:0 16px 34px rgba(33,80,200,.16)}
.mvt-img{height:190px;border-radius:14px;background:linear-gradient(180deg,#F7F9FC,#EEF2F8);display:flex;align-items:center;justify-content:center;margin-bottom:12px;overflow:hidden}
.mvt-img img{max-height:170px;max-width:90%;object-fit:contain;filter:drop-shadow(0 12px 16px rgba(17,24,39,.18))}.mvt-img svg{max-height:96%;max-width:96%;width:auto;height:auto}
.mvt-name{font-weight:800;font-size:15px;margin-bottom:4px}
.mvt-price{font-family:'Archivo Black',sans-serif;font-size:22px;color:#2150C8}
.mvt-cta{font-size:13px;font-weight:700;color:#2150C8;margin-top:6px}
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
      <div style={{ fontSize: 12.5, color: "#5B6472" }}>Get up to</div>
      <div className="mvt-price">${p.upTo.toLocaleString()}</div>
      <div className="mvt-cta">Get my quote →</div>
    </a>
  );
  return (
    <section aria-label="Top phones we buy" style={{ padding: "34px 0 6px" }}>
      <style>{TOP_CSS}</style>
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26 }}>Top phones we buy</div>
          <div style={{ color: "#5B6472", fontSize: 14.5 }}>Real prices from our quote tool. Tap a phone for your exact offer.</div>
        </div>
        <a href="/sell/apple" style={{ color: "#2150C8", fontWeight: 700, fontSize: 14.5 }}>See all models →</a>
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
  const pts = (cfg && cfg.retentionPoints) || DEFAULT_RETENTION_POINTS;
  const f = { ...DEFAULT_BRAND_FACTOR, ...((cfg && cfg.brandFactors) || {}) };
  const hold = (cfg && cfg.holdingCostPct) ?? DEFAULT_HOLDING_COST_PCT;
  const out = {};
  for (const s of Object.keys(d.retail || {})) { const v = Math.floor((baseBuybackAUD(d, s, pts, f) || 0) * (1 - hold)); if (v > 0) out[s] = v; }
  return out;
}
function upToFor(d, cfg) {
  const pts = (cfg && cfg.retentionPoints) || DEFAULT_RETENTION_POINTS;
  const f = { ...DEFAULT_BRAND_FACTOR, ...((cfg && cfg.brandFactors) || {}) };
  const hold = (cfg && cfg.holdingCostPct) ?? DEFAULT_HOLDING_COST_PCT;
  return Math.floor(Math.max(0, ...Object.keys(d.retail || {}).map((s) => baseBuybackAUD(d, s, pts, f) || 0)) * (1 - hold));
}
const HERO_CSS = `
.mvx-hero{position:relative;overflow:hidden;color:#0F1B3D;background:linear-gradient(118deg,#F3F7FF,#E6EEFC)}
.mvx-hero-inner{max-width:1180px;margin:0 auto;padding:58px 22px 46px;display:grid;grid-template-columns:1.05fr 1fr;gap:26px;align-items:center}
.mvx-eyebrow{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:800;letter-spacing:.16em;color:#0F1B3D;margin-bottom:20px}
.mvx-eyebrow i{width:26px;height:2px;background:#2150C8;display:block}
.mvx-h1{font-family:'Archivo Black',sans-serif;font-size:clamp(40px,6.4vw,68px);line-height:1.04;letter-spacing:-.02em;margin:0 0 18px}
.mvx-h1 .mvx-blue{color:#2150C8}
/* Phones: skip sections that repeat what's in the menu or later steps, so the page stays short. */
@media (max-width:720px){.mvx-wide-only{display:none!important}}
.mvx-word{display:inline-block;opacity:0;transform:translateY(45%);animation:mvx-up .75s cubic-bezier(.16,1,.3,1) forwards}
.mvx-in{opacity:0;animation:mvx-up .75s cubic-bezier(.16,1,.3,1) forwards}
@keyframes mvx-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.mvx-sub{font-size:17px;line-height:1.65;color:#5B6472;max-width:440px;margin:0 0 24px}
.mvx-ctas{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px}
.mvx-cta{position:relative;overflow:hidden;background:#2150C8;color:#fff;font-weight:800;padding:15px 22px;border-radius:12px;text-decoration:none;font-size:15.5px;box-shadow:0 12px 28px rgba(33,80,200,.28);transition:transform .2s ease}
.mvx-cta:hover{transform:translateY(-2px)}
.mvx-shine::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);animation:mvx-shine 3.2s ease-in-out infinite}
@keyframes mvx-shine{0%{left:-60%}60%,100%{left:130%}}
.mvx-cta2{color:#0F1B3D;font-weight:800;padding:15px 20px;border-radius:12px;border:1.5px solid #C9D3E6;background:#fff;text-decoration:none;font-size:15.5px}
.mvx-pills{display:flex;flex-wrap:wrap;gap:16px;font-size:13.5px;font-weight:700}
.mvx-pills span{display:flex;align-items:center;gap:6px}.mvx-pills svg{width:17px;height:17px;color:#2150C8}
.mvx-stage{position:relative;height:470px}
.mvx-stage::before{content:"";position:absolute;width:380px;height:380px;border-radius:50%;border:1px solid rgba(33,80,200,.14);background:radial-gradient(closest-side,rgba(255,255,255,.9),rgba(255,255,255,0));top:22px;left:4%}
.mvx-phones{position:absolute;inset:0}
.mvx-phone{position:absolute;filter:drop-shadow(10px 18px 22px rgba(15,27,61,.12));transform:rotate(var(--r));animation:mvx-float 6s ease-in-out infinite}
.mvx-phone svg{width:100%!important;height:auto!important}.mvx-ph-back{width:210px;left:2%;top:70px;--r:-10deg;opacity:.92}
.mvx-ph-front{width:235px;left:27%;top:6px;--r:6deg;animation-delay:.9s}
@keyframes mvx-float{0%,100%{transform:rotate(var(--r)) translateY(0)}50%{transform:rotate(var(--r)) translateY(-12px)}}
.mvx-sticker{position:absolute;top:18px;right:2%;background:#fff;border:1px solid #E2E6EC;border-radius:8px;padding:10px 13px;font-size:13px;font-weight:800;transform:rotate(4deg);box-shadow:0 8px 20px rgba(15,27,61,.08);z-index:3}
.mvx-quote{position:absolute;right:0;bottom:0;width:300px;background:#fff;border:1px solid #E2E6EC;border-radius:16px;box-shadow:0 22px 60px rgba(15,27,61,.16);padding:18px;z-index:4;text-align:left}
.mvx-quote-top{display:flex;justify-content:space-between;font-size:11px;font-weight:800;letter-spacing:.08em;color:#5B6472;margin-bottom:12px}
.mvx-live{display:flex;align-items:center;gap:6px;color:#0F1B3D}.mvx-live i{width:7px;height:7px;border-radius:50%;background:#10B981;box-shadow:0 0 0 4px rgba(16,185,129,.15);display:block;animation:mvx-pulse 1.8s ease-in-out infinite}
@keyframes mvx-pulse{50%{box-shadow:0 0 0 7px rgba(16,185,129,0)}}
.mvx-quote label{display:grid;gap:5px;font-size:12px;color:#5B6472;font-weight:700}
.mvx-quote select{width:100%;height:40px;border:1px solid #E2E6EC;background:#F4F6F9;border-radius:10px;padding:0 10px;font-size:14px;font-weight:700;color:#0F1B3D;font-family:inherit}
.mvx-quote-row{display:grid;grid-template-columns:1.6fr 1fr;gap:8px}
.mvx-est{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:14px 0}.mvx-quote-img{width:62px;flex-shrink:0;background:#F4F6F9;border-radius:12px;padding:4px;animation:mvx-flip .45s cubic-bezier(.16,1,.3,1)}.mvx-quote-img svg{width:100%!important;height:auto!important}
.mvx-est-label{font-size:12px;color:#5B6472}.mvx-price{display:block;font-family:'Archivo Black',sans-serif;font-size:34px;line-height:1.1;color:#0F1B3D;animation:mvx-flip .45s cubic-bezier(.16,1,.3,1)}
@keyframes mvx-flip{from{opacity:0;transform:translateY(40%)}to{opacity:1;transform:none}}
.mvx-cash{font-size:12px;font-weight:800;color:#047857;background:#ECFDF5;border-radius:8px;padding:6px 8px;white-space:nowrap}
.mvx-quote-btn{display:flex;justify-content:space-between;align-items:center;width:100%;background:#0F1B3D;color:#fff;border-radius:10px;padding:12px 14px;font-weight:800;font-size:14.5px;text-decoration:none;box-sizing:border-box}
.mvx-quote-note{font-size:11.5px;color:#5B6472;margin-top:9px;line-height:1.45}
.mvx-benefits{border-top:1px solid #DCE4F2;background:#fff}
.mvx-benefits-inner{max-width:1180px;margin:0 auto;padding:18px 22px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.mvx-benefits-inner div{display:flex;align-items:center;justify-content:center;gap:9px;font-size:13.5px;font-weight:700}
.mvx-benefits-inner svg{width:19px;height:19px;color:#2150C8;flex-shrink:0}
@media(max-width:860px){.mvx-hero-inner{grid-template-columns:1fr;padding:34px 18px 26px}.mvx-stage{height:430px;max-width:420px;width:100%;margin:0 auto}.mvx-stage::before{width:290px;height:290px;left:6px}.mvx-ph-back{width:150px;left:0;top:52px}.mvx-ph-front{width:170px;left:24%;top:4px}.mvx-quote{width:250px;padding:14px}.mvx-price{font-size:28px}.mvx-sticker{font-size:11.5px;top:4px}.mvx-benefits-inner{grid-template-columns:1fr 1fr}.mvx-benefits-inner div{justify-content:flex-start;font-size:12.5px}}
@media(prefers-reduced-motion:reduce){.mvx-phone,.mvx-shine::after,.mvx-live i{animation:none}.mvx-word,.mvx-in{animation:mvx-fade .6s ease forwards;transform:none}.mvx-price{animation:mvx-fade .3s ease}}
@keyframes mvx-fade{from{opacity:0}to{opacity:1}}
`;
const IC = {
  truck: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19.3a1.8 1.8 0 1 0 0-.1M17 19.3a1.8 1.8 0 1 0 0-.1" />,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>,
  shield: <><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
};
const Ico = ({ k }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IC[k]}</svg>;

// Lovable-inspired hero: light canvas, the shop's own phones, and a live quote card.
// Prices use the same capped "up to" formula as the quote tool (never above a real quote).
function Hero({ quoteModels }) {
  const [mi, setMi] = useState(0);
  const [si, setSi] = useState(0);
  const cur = quoteModels[Math.min(mi, quoteModels.length - 1)];
  const storages = cur ? Object.keys(cur.prices) : [];
  const storage = storages[Math.min(si, storages.length - 1)];
  const price = cur && storage ? cur.prices[storage] : 0;
  const words = [["Sell", 0], ["your", 0], ["phone.", 0], ["Get", 1], ["paid", 1], ["today.", 1]];
  return (
    <>
      <section className="mvx-hero" aria-label="Sell your phone">
        <style>{HERO_CSS}</style>
        <div className="mvx-hero-inner">
          <div>
            <div className="mvx-eyebrow mvx-in"><i />SYDNEY · SELL · REPAIR · BUY</div>
            <h1 className="mvx-h1">
              {words.map(([w, hl], n) => <span key={n} className={"mvx-word" + (hl ? " mvx-blue" : "")} style={{ animationDelay: `${0.15 + n * 0.07}s` }}>{w}{n === 2 ? <br /> : "\u00a0"}</span>)}
            </h1>
            <p className="mvx-sub mvx-in" style={{ animationDelay: "0.6s" }}>Sell it. Fix it. Find your next one. We collect from your door anywhere in Sydney and pay you in cash.</p>
            <div className="mvx-ctas mvx-in" style={{ animationDelay: "0.7s" }}>
              <a href="/quote" className="mvx-cta mvx-shine">Sell my phone ↗</a>
              <a href="/shop" className="mvx-cta2">Shop refurbished ↗</a>
            </div>
            <div className="mvx-pills mvx-in" style={{ animationDelay: "0.8s" }}>
              <span><Ico k="truck" />Home collection across Sydney</span>
              <span><Ico k="cash" />Paid in cash</span>
              <span><Ico k="shield" />49-point check</span>
            </div>
          </div>
          <div className="mvx-stage">
            <div className="mvx-phones" aria-hidden="true">
              <div className="mvx-phone mvx-ph-back"><DeviceArtCard type="phone" size={240} brand="Samsung" model="Galaxy S26 Ultra" /></div>
              <div className="mvx-phone mvx-ph-front"><DeviceArtCard type="phone" size={260} brand="Apple" model="iPhone 17 Pro Max" /></div>
            </div>
            <div className="mvx-sticker">♻ Good phones. More life.</div>
            {cur && (
              <div className="mvx-quote mvx-in" style={{ animationDelay: "0.5s" }}>
                <div className="mvx-quote-top"><span className="mvx-live"><i />LIVE QUOTE</span><span>SYDNEY</span></div>
                <div className="mvx-quote-row">
                  <label>Model
                    <select aria-label="Phone model" value={mi} onChange={(e) => { setMi(+e.target.value); setSi(0); }}>
                      {quoteModels.map((q, n) => <option key={q.model} value={n}>{q.model}</option>)}
                    </select>
                  </label>
                  <label>Storage
                    <select aria-label="Storage" value={si} onChange={(e) => setSi(+e.target.value)}>
                      {storages.map((s, n) => <option key={s} value={n}>{s}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mvx-est">
                  <div key={"img" + cur.model} className="mvx-quote-img" aria-hidden="true"><DeviceArtCard type="phone" size={74} brand={cur.brand} model={cur.model} /></div>
                  <div style={{ flex: 1 }}><span className="mvx-est-label">Yours could be worth up to</span><span key={cur.model + storage} className="mvx-price">${price.toLocaleString()}</span></div>
                  <span className="mvx-cash">💵 Paid in cash</span>
                </div>
                <a href={`/quote?q=${encodeURIComponent(cur.model)}`} className="mvx-quote-btn">Get my exact quote <span aria-hidden="true">→</span></a>
                <div className="mvx-quote-note">Top price for a flawless device. Final offer after our 49-point check.</div>
              </div>
            )}
          </div>
        </div>
      </section>
      <div className="mvx-benefits">
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

const ink = "#FFFFFF", panel = "#FFFFFF", paper = "#111827", muted = "#5B6472",
  brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", line = "#E2E6EC";

// The three things people actually come here to do — each gets equal,
// prominent billing up top, the way PhoneExchange and Mobile Monster lead
// with their core actions rather than burying them.
const ACTIONS = [
  { href: "/quote", icon: "💰", title: "Sell your device", desc: "Instant quote, then we collect from your door anywhere in Sydney and pay you in cash.", cta: "Get a quote" },
  { href: "/shop", icon: "📱", title: "Buy refurbished", desc: "Graded, tested, 1-year warranty and free express shipping.", cta: "Shop now" },
  { href: "/repairs", icon: "🔧", title: "Get it repaired", desc: "Price match guarantee, genuine parts, done same day in store.", cta: "Book a repair" },
];

const POPULAR = ["iPhone 16 Pro", "iPhone 15 Pro", "iPhone 14", "Galaxy S24 Ultra", "Pixel 9 Pro", "iPhone 13"];

const TRUST = [
  { title: "Home collection across Sydney", desc: "We come to you, check your phone on the spot, and pay you — in cash if you like." },
  { title: "Genuine parts only", desc: "Never unmarked aftermarket substitutes." },
  { title: "Price match guarantee", desc: "Found it cheaper? We'll match it." },
  { title: "1-year warranty", desc: "On every device we sell. Repairs 90 days, parts & accessories 6 months." },
  { title: "Every gadget", desc: "Phones, tablets, laptops and watches." },
  { title: "Any condition", desc: "Cracked, dead or water-damaged — we still make an offer." },
  { title: "Data wiped securely", desc: "Every device is fully erased before it's resold." },
  { title: "30-day returns", desc: "Changed your mind? Return online purchases within 30 days. Conditions apply." },
  { title: "Battery 80%+ guaranteed", desc: "Every refurbished phone we sell. Conditions apply." },
];

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
  const [quoteModels, setQuoteModels] = useState([]);
  const [topPhones, setTopPhones] = useState([]);
  const [photos, setPhotos] = useState({});

  useEffect(() => {
    (async () => {
      const cfg = await loadJSON("pricing-config", true);
      const b = (cfg && cfg.businessSettings) || {};
      setBiz(b);
      { const cat = mergeCatalog(cfg && cfg.catalog);
        setQuoteModels(TICKER_MODELS.map((m) => cat.find((d) => d.model === m)).filter(Boolean).map((d) => ({ model: d.model, brand: d.brand, category: d.category, prices: pricesFor(d, cfg) })).filter((x) => Object.keys(x.prices).length));
        setTopPhones(FEATURED_PHONES.map((m) => cat.find((d) => d.model === m)).filter(Boolean).map((d) => ({ model: d.model, brand: d.brand, imageUrl: d.imageUrl, upTo: upToFor(d, cfg) })).filter((x) => x.upTo > 0)); }
      setPhotos(Object.fromEntries(mergeCatalog(cfg && cfg.catalog).filter((d) => d.imageUrl).map((d) => [`${d.brand}|${d.model}`, d.imageUrl])));
      // Featured deal: the highest-value device actually listed for sale right now.
      try {
        const r = window.storage && await window.storage.get("inventory", true);
        const listed = r ? JSON.parse(r.value).filter((i) => i.status === "listed" && i.listedPrice > 0) : [];
        setFeatured(listed.sort((a, x) => x.listedPrice - a.listedPrice)[0] || null);
      } catch (e) { /* no stock yet */ }
      // Only show numbers the owner has actually entered — never invented ones.
      const s = [];
      if (b.yearsInBusiness) s.push({ value: `${b.yearsInBusiness}+`, label: "Years in business" });
      if (b.devicesSoldCount) s.push({ value: Number(b.devicesSoldCount).toLocaleString(), label: "Devices sold" });
      if (b.googleRating) s.push({ value: `${b.googleRating}★`, label: "Google rating" });
      setStats(s);
    })();
  }, []);

  const section = { maxWidth: 1140, margin: "0 auto", padding: "0 20px" };
  const heading = { fontFamily: "'Archivo Black', sans-serif", fontSize: 24, letterSpacing: "-0.01em", marginBottom: 18, textAlign: "center" };

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');
        @keyframes mv-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mv-glow { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.06); } }
        .mv-rise { animation: mv-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .mv-hero { position: relative; overflow: hidden; }
        .mv-hero::before { content: ""; position: absolute; top: -140px; left: 50%; width: 620px; height: 620px; margin-left: -310px;
          background: radial-gradient(circle, rgba(33,80,200,0.16) 0%, rgba(33,80,200,0) 65%); animation: mv-glow 7s ease-in-out infinite; pointer-events: none; }
        .mv-hero > * { position: relative; }
        .mv-action:hover { border-color: #2150C8 !important; }
        .mv-action:hover .mv-arrow { transform: translateX(5px); }
        .mv-arrow { display: inline-block; transition: transform 0.2s ease; }
        @keyframes mv-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        .mv-float { animation: mv-float 4.5s ease-in-out infinite; }
        .mv-chip { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; background: #fff;
          border: 1px solid rgba(32,28,24,0.16); color: #111827; text-decoration: none; font-size: 14px; font-weight: 600;
          transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease; }
        .mv-chip:hover { border-color: #2150C8; color: #2150C8; transform: translateY(-1px); }
        @media (prefers-reduced-motion: reduce) { .mv-rise, .mv-hero::before, .mv-float { animation: none !important; } }
      `}</style>

      {/* ---- Hero ---- */}
      <Hero quoteModels={quoteModels} />
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
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, color: brass }}>{s.value}</div>
                <div style={{ fontSize: 12, color: muted }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Featured deal (only when stock is listed) ---- */}
      {featured && (
        <div style={{ ...section, marginBottom: 34 }}>
          <a href="/shop" className="cs-card" style={{ display: "flex", alignItems: "center", gap: 18, border: "2px solid #2150C8", background: panel, padding: 18, color: paper, textDecoration: "none", flexWrap: "wrap" }}>
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

      {/* ---- Trust strip ---- */}
      <div style={{ borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}`, background: panel, padding: "26px 16px", marginBottom: 50 }}>
        <div style={{ ...section, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
          {TRUST.map((t, i) => (
            <div key={t.title} className="mv-rise" style={{ animationDelay: `${0.45 + i * 0.08}s` }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}><span style={{ color: brass }}>✓</span> {t.title}</div>
              <div style={{ color: muted, fontSize: 13 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Photo feature band ---- */}
      <div className="mvx-wide-only" style={{ ...section, marginBottom: 50 }}>
        <Photo name="workshop" height={320} overlay="linear-gradient(90deg, rgba(20,24,40,0.82) 0%, rgba(20,24,40,0.55) 55%, rgba(20,24,40,0.1) 100%)">
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 clamp(20px, 5vw, 44px)", maxWidth: 480, color: "#fff" }}>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(22px, 4vw, 30px)", lineHeight: 1.15, marginBottom: 10 }}>Real technicians.<br />Genuine parts.</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.6, opacity: 0.92, marginBottom: 18 }}>We diagnose first and tell you honestly what's wrong, before quoting anything.</div>
            <a href="/repairs" className="cs-btn" style={{ alignSelf: "flex-start", padding: "12px 22px", background: "#fff", color: "#111827", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 10 }}>Book a repair →</a>
          </div>
        </Photo>
      </div>

      {/* ---- How selling works: "From drawer to dollars" ---- */}
      <div style={{ background: "#F4F6F9", padding: "56px 0", marginBottom: 50 }}>
        <div style={section}>
          <div style={{ textAlign: "center", marginBottom: 34 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", color: brass, marginBottom: 8 }}>LESS HASSLE. MORE CASH.</div>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(28px, 5vw, 38px)", lineHeight: 1.15 }}>From drawer to dollars.</div>
            <div style={{ color: muted, fontSize: 15, marginTop: 8 }}>Three simple steps. You don't even need to leave home.</div>
          </div>
          <div className="mv-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 36 }}>
            {STEPS.map((s) => (
              <div key={s.n}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "'Archivo Black', sans-serif", color: brass, fontSize: 13, marginBottom: 18 }}>0{s.n}<span style={{ flex: 1, height: 1, background: line }} /></div>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: "#fff", color: brass, display: "grid", placeItems: "center", marginBottom: 16, boxShadow: "0 6px 16px rgba(17,24,39,.06)" }}>
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
      <div className="mvx-wide-only" style={{ ...section, marginBottom: 50 }}>
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
      <div style={{ ...section, marginBottom: 50 }}>
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
      <div style={{ ...section, marginBottom: 50 }}>
        <div style={heading}>Affordable repairs, done same day in store</div>
        <div className="mv-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {[["📱", "Screen replacement", "From $85", "Cracked or unresponsive display."], ["🔋", "Battery replacement", "From $59", "Phone dying by lunchtime?"],
            ["🔌", "Charging port", "From $55", "Often just dust — we check and clean first."], ["📷", "Camera repair", "From $75", "Blurry, cracked or not focusing."]].map(([i, t, p, d]) => (
            <a key={t} href="/repairs" className="cs-card" style={{ display: "block", border: "1px solid #E2E6EC", background: panel, padding: 16, color: paper, textDecoration: "none" }}>
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
      <div className="mvx-wide-only" style={{ ...section, marginBottom: 50, textAlign: "center" }}>
        <div style={{ color: muted, fontSize: 12.5, marginBottom: 12, letterSpacing: "0.04em" }}>WE BUY, SELL AND REPAIR</div>
        <div style={{ display: "flex", justifyContent: "center", gap: "clamp(18px, 5vw, 44px)", flexWrap: "wrap" }}>
          {[["Apple", "apple"], ["Samsung", "samsung"], ["Google", "google"], ["OPPO", "oppo"], ["Motorola", "motorola"], ["Xiaomi", "xiaomi"]].map(([b, slug]) => (
            <a key={b} href={`/sell/${slug}`} title={`Sell your ${b === "Apple" ? "iPhone" : b}`} style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 17, color: muted, textDecoration: "none" }}>{b}</a>
          ))}
        </div>
      </div>

      {/* ---- Why we exist ---- */}
      <div style={{ ...section, marginBottom: 50 }}>
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
        <div style={{ ...section, marginBottom: 50 }}>
          <div style={{ border: "1px solid #E2E6EC", borderRadius: 14, background: panel, padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, alignItems: "center" }}>
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
                style={{ padding: "13px 20px", border: "1.5px solid #E2E6EC", color: paper, fontWeight: 700, textDecoration: "none", borderRadius: 10, textAlign: "center" }}>📞 Call {biz.phone}</a>}
            </div>
          </div>
        </div>
      )}

      {/* ---- Guides ---- */}
      <div className="mvx-wide-only" style={{ ...section, marginBottom: 50 }}>
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
      <div style={{ background: "linear-gradient(120deg,#1E3A8A,#2150C8 60%,#0EA5E9)", color: "#fff", padding: "54px 0", marginTop: 20 }}>
        <div style={{ ...section, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(28px, 5vw, 40px)", lineHeight: 1.12 }}>That old phone has a future.</div>
            <div style={{ fontSize: 15.5, opacity: 0.88, marginTop: 10 }}>And there could be cash in yours. We collect anywhere in Sydney and pay on the spot.</div>
          </div>
          <a href="/quote" className="cs-btn" style={{ background: "#fff", color: "#1E3A8A", padding: "15px 26px", borderRadius: 12, fontWeight: 800, fontSize: 15.5, textDecoration: "none", boxShadow: "0 12px 30px rgba(0,0,0,.2)" }}>Find out what it's worth →</a>
        </div>
      </div>
    </div>
  );
}
