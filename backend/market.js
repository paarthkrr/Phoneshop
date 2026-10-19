// Market price check: what other Australian buyers pay for the same phones,
// turned into suggested changes to each model's "market adj %" in the Pricing
// Console. Nothing changes on its own: staff accept suggestions one by one or
// with "Apply all safe".
//
// Sources are the public price files the competitors' own websites load in the
// browser (one request each per check), not scraped pages:
//   Mobile Monster   /_mm/device-data.json        brand_new / new / working per model + storage
//   Phone Exchange   odoo .../pex/buyback/prices   N (new) / S (premium) / A (used, max) per model + storage
//                    (falls back to their published snapshot file if the live one is down)

const SOURCES = [
  { id: "mobilemonster", name: "Mobile Monster", site: "https://mobilemonster.com.au/sell-your-phone",
    urls: ["https://mobilemonster.com.au/_mm/device-data.json"] },
  { id: "phoneexchange", name: "Phone Exchange", site: "https://phonexchange.com.au/pages/sell-my-phone",
    urls: ["https://odoo.phonexchange.com.au/pex/buyback/prices", "https://cdn.shopify.com/s/files/1/0992/3162/9619/files/pe-buyback-v2.json"] },
];
const USER_AGENT = "MobileRecellr-PriceCheck/1.0 (+https://mobilerecellr.com.au; weekly)";

// Our tiers vs theirs: sealed / like new / used-but-working.
const CONDITIONS = [
  { id: "new", label: "Sealed", mm: "brand_new", pe: "N" },
  { id: "asnew", label: "Like new", mm: "new", pe: "S" },
  { id: "good", label: "Good (working)", mm: "working", pe: "A" },
];

const LIMITS = {
  maxStepPct: 10,     // one check moves a model's price at most 10%
  minChangePts: 1,    // smaller than 1 point: leave it
  agreeSpread: 1.25,  // two sources more than 25% apart: needs a person
  ignoreBandPts: 3,   // after "Ignore", don't ask again unless the suggestion moves 3+ points
  adjMin: -60, adjMax: 30,  // same clamp as the pricing maths (pricing.js)
};

const norm = (s) => String(s || "").toUpperCase().replace(/\+/g, " PLUS").replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
// One spelling for a model across all sources: "Samsung Galaxy S22 Ultra 5G" and
// "GALAXY_S22_ULTRA" both become GALAXY_S22_ULTRA. (Brand names that are also part
// of model names, like OnePlus, stay; a doubled one, "OnePlus OnePlus 13", is undone.)
const canon = (name) => norm(name).replace(/_\d+(GB|TB)$/, "").replace(/^(APPLE|SAMSUNG|GOOGLE)_/, "").replace(/_[45]G\b/g, "").replace(/^([A-Z]+)_\1_/, "$1_");
const modelKey = (_brand, model) => canon(model);
const storageKey = (s) => norm(s).replace(/^(\d+)(GB|TB)$/, "$1$2");
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : null; };
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

// ---- parse each source into { "MODEL_KEY|128GB": { new, asnew, good } } ----
function parseMobileMonster(json) {
  const out = {};
  for (const e of Object.values(json || {})) {
    const dev = e && e.dev;
    if (!dev || !dev.storage || !/phone|tablet|watch/i.test(e.type || dev.type || "")) continue;
    // dev.model is the family ("Galaxy S22" covers S22, S22+ and Ultra); the title names the exact phone.
    const name = dev.title || [dev.brandname, dev.variant || dev.model].filter(Boolean).join(" ");
    const prices = {};
    for (const c of CONDITIONS) { const v = num(e[c.mm]); if (v) prices[c.id] = v; }
    if (Object.keys(prices).length) out[`${canon(name)}|${storageKey(dev.storage)}`] = prices;
  }
  return out;
}
function parsePhoneExchange(json) {
  const out = {};
  for (const [model, byStorage] of Object.entries((json && json.models) || {})) {
    for (const [storage, p] of Object.entries(byStorage || {})) {
      const prices = {};
      for (const c of CONDITIONS) { const v = num(p && p[c.pe]); if (v) prices[c.id] = v; }
      if (Object.keys(prices).length) out[`${canon(model)}|${storageKey(storage)}`] = prices;
    }
  }
  return out;
}
const PARSERS = { mobilemonster: parseMobileMonster, phoneexchange: parsePhoneExchange };

async function fetchJson(url, fetchImpl, timeoutMs = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// { id, name, site, ok, count, generated, error, prices }
async function fetchSources(fetchImpl = fetch) {
  return Promise.all(SOURCES.map(async (s) => {
    let lastErr = "";
    for (const url of s.urls) {
      try {
        const json = await fetchJson(url, fetchImpl);
        const prices = PARSERS[s.id](json);
        const count = Object.keys(prices).length;
        if (!count) throw new Error("no prices in the file (format changed?)");
        return { id: s.id, name: s.name, site: s.site, ok: true, count, generated: (json && json.generated) || null, fromSnapshot: url !== s.urls[0], prices };
      } catch (e) { lastErr = e.name === "AbortError" ? "timed out" : e.message; }
    }
    return { id: s.id, name: s.name, site: s.site, ok: false, count: 0, error: lastErr, prices: {} };
  }));
}

// Suggestions for every catalogue model the competitors also price.
// pricing = the frontend pricing module (same maths as every quote).
function buildSuggestions({ config, pricing, sources, decisions = [], now = Date.now() }) {
  const { brandNewBase, DEFAULT_TIERS, DEFAULT_HOLDING_COST_PCT, mergeCatalog } = pricing;
  const catalog = mergeCatalog((config && config.catalog) || []);
  const factor = Object.fromEntries(DEFAULT_TIERS.map((t) => [t.id, Number(((config && config.tiers) || []).find((x) => x.id === t.id)?.factor ?? t.factor)]));
  const holding = Number(config && config.holdingCostPct) >= 0 ? Number(config.holdingCostPct) : DEFAULT_HOLDING_COST_PCT;
  const position = Math.max(-20, Math.min(20, Number(config && config.marketPositionPct) || 0));
  const lastDecision = new Map();
  for (const d of decisions) if (d && d.model) { const k = `${d.brand}|${d.model}`; const prev = lastDecision.get(k); if (!prev || String(d.at) > String(prev.at)) lastDecision.set(k, d); }

  const suggestions = [], inLine = [], notFound = [];
  for (const dev of catalog) {
    if (!dev || !dev.retail) continue;
    const key = modelKey(dev.brand, dev.model);
    const rows = [];   // one per storage with at least one competitor price
    const ratiosBySource = {};
    for (const storage of Object.keys(dev.retail)) {
      const base = brandNewBase(config, { brand: dev.brand, model: dev.model, storage, region: "AU" }, now);
      if (!base) continue;
      const ours = Object.fromEntries(CONDITIONS.map((c) => [c.id, Math.round(base * factor[c.id] * (1 - holding))]));
      const theirs = {};
      for (const s of sources) {
        const p = s.ok && s.prices[`${key}|${storageKey(storage)}`];
        if (!p) continue;
        theirs[s.id] = p;
        for (const c of CONDITIONS) if (p[c.id] && ours[c.id] > 0) (ratiosBySource[s.id] = ratiosBySource[s.id] || []).push(p[c.id] / ours[c.id]);
      }
      if (Object.keys(theirs).length) rows.push({ storage, ours, theirs });
    }
    const perSource = Object.entries(ratiosBySource).map(([id, r]) => [id, median(r)]);
    if (!perSource.length) { notFound.push(`${dev.brand} ${dev.model}`); continue; }

    const ratio = median(perSource.map(([, r]) => r));
    const spread = perSource.length > 1 ? Math.max(...perSource.map(([, r]) => r)) / Math.min(...perSource.map(([, r]) => r)) : 1;
    const current = Number(dev.marketAdjPct) || 0;
    const wantedF = (1 + current / 100) * ratio * (1 + position / 100);
    const stepF = Math.max(1 - LIMITS.maxStepPct / 100, Math.min(1 + LIMITS.maxStepPct / 100, wantedF / (1 + current / 100)));
    const clipped = Math.abs(stepF * (1 + current / 100) - wantedF) > 1e-9;
    let suggested = Math.round(((1 + current / 100) * stepF - 1) * 100);
    const clamped = suggested < LIMITS.adjMin || suggested > LIMITS.adjMax;
    suggested = Math.max(LIMITS.adjMin, Math.min(LIMITS.adjMax, suggested));
    const gapPct = Math.round((ratio * (1 + position / 100) - 1) * 100);

    if (Math.abs(suggested - current) < LIMITS.minChangePts) { inLine.push(`${dev.brand} ${dev.model}`); continue; }
    const ignored = lastDecision.get(`${dev.brand}|${dev.model}`);
    if (ignored && ignored.decision === "ignored" && Math.abs(Number(ignored.suggested) - suggested) < LIMITS.ignoreBandPts) continue;

    const reasons = [];
    if (perSource.length < 2) reasons.push("only one competitor prices this model");
    if (spread > LIMITS.agreeSpread) reasons.push(`competitors disagree by ${Math.round((spread - 1) * 100)}%`);
    if (clipped) reasons.push(`market is ${gapPct > 0 ? "+" : ""}${gapPct}% away; moving ${LIMITS.maxStepPct}% this week`);
    if (clamped) reasons.push("hits the adjustment limit");
    suggestions.push({
      id: `${dev.brand}|${dev.model}`, brand: dev.brand, model: dev.model, current, suggested, gapPct,
      sources: perSource.map(([id, r]) => ({ id, pct: Math.round((r - 1) * 100) })),
      rows: rows.slice(0, 4), safe: perSource.length >= 2 && spread <= LIMITS.agreeSpread && !clamped, reasons,
    });
  }
  suggestions.sort((a, b) => Math.abs(b.suggested - b.current) - Math.abs(a.suggested - a.current));
  return { suggestions, inLine, notFound, position };
}

module.exports = { SOURCES, CONDITIONS, LIMITS, fetchSources, buildSuggestions, parseMobileMonster, parsePhoneExchange, modelKey, storageKey };

// Additional competitors
const EXTRA_SOURCES = [
  { id: "cashconverters", name: "Cash Converters", site: "https://www.cashconverters.com.au",
    urls: ["https://www.cashconverters.com.au/api/sell/prices"] },
  { id: "cexo", name: "Cex", site: "https://au.webuy.com",
    urls: ["https://au.webuy.com/api/prices"] },
];

module.exports.EXTRA_SOURCES = EXTRA_SOURCES;
