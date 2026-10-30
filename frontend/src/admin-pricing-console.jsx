import BrandColours from "./brand-colours.jsx";
import { printReviewCard } from "./customer-messages.jsx";
import { repairPricesFrom, REPAIRS_BY_DEVICE } from "./repair-prices.js";
import { applyBrand, rememberBrand } from "./theme.jsx";
import { DEFAULT_CATALOG, mergeCatalog } from "./device-catalog.js";
import { PHONE_FAULT_GROUPS } from "./instant-quote-calculator.jsx";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { DeviceRequestsTab, decodeAddLink } from "./device-requests.jsx";
import MarketTab from "./market-tab.jsx";
import { sydneyToday } from "./sydney-time.js";

/* =================================================================
   ADMIN PRICING CONSOLE
   This is the database. Every number the quote calculator uses —
   retail prices, the age-retention curve, brand factors, condition
   tier factors, fault percentages, region multipliers, holding
   cost — lives here in persistent storage, editable without code,
   with every change logged. This is the piece that turns "a file I
   hand-patch" into "a system your team can actually run."
================================================================= */

const CONFIG_KEY = "pricing-config";
const HISTORY_KEY = "pricing-history";

const DEFAULT_CONFIG = {
  version: 6,
  businessSettings: {
    shopName: "Your Phone Shop", abn: "", gstRegistered: true,
    address: "", phone: "", email: "", bankDetails: "",
    // Storefront trust stats — deliberately blank by default. These show
    // up on the public website, so nothing gets shown unless YOU fill it
    // in with a real number. No shop should have "13+ years in business"
    // fabricated for it on day one.
    yearsInBusiness: "", devicesSoldCount: "", googleRating: "",
    // Site colours (hex). Blank = the built-in Recellr blue and wine.
    brandColor: "", accentColor: "",
  },
  holdingCostPct: 0.02,
  regions: {
    AU: { label: "Australia", currency: "AUD", symbol: "A$", mult: 1.00 },
    US: { label: "United States", currency: "USD", symbol: "$", mult: 0.70 },
    UK: { label: "United Kingdom", currency: "GBP", symbol: "£", mult: 0.46 },
    IN: { label: "India", currency: "INR", symbol: "₹", mult: 37 },
    AE: { label: "UAE", currency: "AED", symbol: "AED ", mult: 2.35 },
  },
  retentionPoints: [
    { m: 0, r: 0.66 }, { m: 12, r: 0.58 }, { m: 24, r: 0.51 },
    { m: 36, r: 0.37 }, { m: 48, r: 0.33 }, { m: 60, r: 0.233 },
    { m: 72, r: 0.165 }, { m: 84, r: 0.113 }, { m: 96, r: 0.075 }, { m: 120, r: 0.045 },
  ],
  brandFactors: {
    Apple: 1.00, Samsung: 0.88, Google: 0.80, OnePlus: 0.72,
    Xiaomi: 0.60, Oppo: 0.68, Vivo: 0.65, Motorola: 0.62, Nothing: 0.58,
  },
  tiers: [
    { id: "new", label: "Brand New", factor: 1.00 },
    { id: "asnew", label: "Like New", factor: 0.94 },
    { id: "good", label: "Good", factor: 0.89 },
    { id: "fair", label: "Fair", factor: 0.75 },
    { id: "parts", label: "Faulty / For Parts", factor: 0.09 },
  ],
  faultGroups: PHONE_FAULT_GROUPS,
  catalog: DEFAULT_CATALOG,
};
const CONFIG_VERSION = 6;
const CATEGORY_FACTOR = { phone: 1.00, tablet: 1.05, laptop: 1.15, watch: 0.70 };

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadConfig() {
  if (!storageAvailable()) return null;
  try {
    const r = await window.storage.get(CONFIG_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveConfig(config) {
  if (!storageAvailable()) return false;
  try {
    await window.storage.set(CONFIG_KEY, JSON.stringify(config), true);
    return true;
  } catch (e) {
    return false;
  }
}
async function loadHistory() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(HISTORY_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function pushHistory(entries) {
  const existing = await loadHistory();
  const updated = [...entries, ...existing].slice(0, 200);
  if (storageAvailable()) {
    try { await window.storage.set(HISTORY_KEY, JSON.stringify(updated), true); } catch (e) { /* keep in-memory only */ }
  }
  return updated;
}

const PRICE_MATCH_KEY = "price_match_requests";
async function loadPriceMatches() {
  if (!storageAvailable()) return [];
  try {
    const r = await window.storage.get(PRICE_MATCH_KEY, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}
async function savePriceMatches(list) {
  if (!storageAvailable()) return false;
  try { await window.storage.set(PRICE_MATCH_KEY, JSON.stringify(list), true); return true; } catch (e) { return false; }
}

const TABS = ["Business", "Catalog", "Repair Prices", "Market", "Requests", "Age Curve", "Brand Factors", "Condition Tiers", "Faults", "Regions", "Price Matches", "History"];

export default function AdminPricingConsole() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [priceMatches, setPriceMatches] = useState([]);
  // A one-click link from the daily device-request email: /portal/pricing?addDevice=...
  const addPrefill = useMemo(() => { try { const v = new URLSearchParams(window.location.search).get("addDevice"); return v ? decodeAddLink(v) : null; } catch (e) { return null; } }, []);
  const [tab, setTab] = useState(addPrefill ? "Requests" : "Catalog");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [persisted, setPersisted] = useState(true);

  const init = useCallback(async () => {
    setLoading(true);
    // Never hang forever: fall back to defaults after 4s no matter what.
    const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), 4000));
    const work = (async () => {
      let c = await loadConfig();
      let isNew = false;
      let migrated = false;
      if (!c) { c = DEFAULT_CONFIG; isNew = true; }
      else {
        // Fill any missing section from the defaults first, so a partial saved
        // config (e.g. only business details) can never crash the console.
        const missing = Object.keys(DEFAULT_CONFIG).filter((k) => c[k] === undefined || (k === 'catalog' && !Array.isArray(c.catalog)));
        if (missing.length) { c = { ...DEFAULT_CONFIG, ...c, catalog: Array.isArray(c.catalog) ? c.catalog : DEFAULT_CONFIG.catalog }; migrated = true; }
      }
      if (isNew) {}
      else if ((c.version || 1) < CONFIG_VERSION) {
        // Migration: earlier version only seeded 17 catalog entries.
        // Bring the catalog up to the full list without touching any
        // prices staff may have already edited for models that existed before.
        const prevByKey = Object.fromEntries(c.catalog.map((d) => [d.brand + "|" + d.model, d]));
        c = { ...c, version: CONFIG_VERSION, catalog: DEFAULT_CONFIG.catalog.map((d) => prevByKey[d.brand + "|" + d.model] || d) };
        // Merge in any NEW businessSettings fields (like the storefront
        // stats) without wiping fields the shop already set — same
        // preserve-existing-edits principle as the catalog merge above.
        c.businessSettings = { ...DEFAULT_CONFIG.businessSettings, ...(c.businessSettings || {}) };
        migrated = true;
      }
      // Always edit the full shared checklist; keep percentages already saved.
      if (!isNew) {
        const pct = {}; (c.faultGroups || []).forEach((g) => (g.faults || []).forEach((f) => { pct[f.id] = f.pct; }));
        const full = PHONE_FAULT_GROUPS.map((g) => ({ ...g, faults: g.faults.map((f) => ({ ...f, pct: pct[f.id] ?? f.pct })) }));
        if (JSON.stringify(full) !== JSON.stringify(c.faultGroups)) { c = { ...c, faultGroups: full }; migrated = true; }
      }
      // Pick up any newly added built-in models (e.g. a new phone launch)
      // without changing prices staff have already edited.
      if (!isNew) {
        const merged = mergeCatalog(c.catalog, { all: true });
        if (merged.length !== (c.catalog || []).length) { c = { ...c, catalog: merged }; migrated = true; }
      }
      const ok = (isNew || migrated) ? await saveConfig(c) : true;
      if (isNew && ok) {
        await pushHistory([{ ts: Date.now(), field: "system", note: "Initialized pricing database with default values" }]);
      }
      if (migrated && ok) {
        await pushHistory([{ ts: Date.now(), field: "system", note: `Migrated catalog to v${CONFIG_VERSION} — now ${DEFAULT_CONFIG.catalog.length} devices across phones/tablets/laptops/watches, kept existing price edits` }]);
      }
      const h = await loadHistory();
      const pm = await loadPriceMatches();
      return { c, h, pm, persisted: storageAvailable() && ok };
    })();
    const result = await Promise.race([work, timeout]);
    if (result === "timeout" || !result) {
      setConfig(DEFAULT_CONFIG);
      setDraft(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
      setHistory([]);
      setPriceMatches([]);
      setPersisted(false);
    } else {
      setConfig(result.c);
      setDraft(JSON.parse(JSON.stringify(result.c)));
      setHistory(result.h);
      setPriceMatches(result.pm);
      setPersisted(result.persisted);
    }
    setLoading(false);
  }, []);

  useEffect(() => { init(); }, [init]);

  const dirty = config && draft && JSON.stringify(config) !== JSON.stringify(draft);

  const diffSummary = useCallback((oldC, newC, section) => {
    const notes = [];
    if (section === "businessSettings") {
      Object.keys(newC.businessSettings).forEach((k) => {
        if (oldC.businessSettings[k] !== newC.businessSettings[k]) notes.push(`${k}: "${oldC.businessSettings[k]}" → "${newC.businessSettings[k]}"`);
      });
    } else if (section === "catalog") {
      newC.catalog.forEach((d, i) => {
        const old = oldC.catalog[i];
        if (!old) { notes.push(`Added ${d.brand} ${d.model}`); return; }
        Object.keys(d.retail).forEach((s) => {
          if (old.retail[s] !== d.retail[s]) notes.push(`${d.brand} ${d.model} ${s}: $${old.retail[s]} → $${d.retail[s]}`);
        });
        if ((old.marketAdjPct || 0) !== (d.marketAdjPct || 0)) notes.push(`${d.brand} ${d.model} market adjustment: ${old.marketAdjPct || 0}% → ${d.marketAdjPct || 0}%`);
        if (old.marketCheckedAt !== d.marketCheckedAt && d.marketCheckedAt) notes.push(`${d.brand} ${d.model} market-checked ${d.marketCheckedAt}`);
      });
    } else if (section === "retentionPoints") {
      newC.retentionPoints.forEach((p, i) => {
        const old = oldC.retentionPoints[i];
        if (old && old.r !== p.r) notes.push(`${p.m}mo retention: ${(old.r * 100).toFixed(1)}% → ${(p.r * 100).toFixed(1)}%`);
      });
    } else if (section === "brandFactors") {
      Object.keys(newC.brandFactors).forEach((b) => {
        if (oldC.brandFactors[b] !== newC.brandFactors[b]) notes.push(`${b} factor: ${oldC.brandFactors[b]} → ${newC.brandFactors[b]}`);
      });
    } else if (section === "tiers") {
      newC.tiers.forEach((t, i) => {
        const old = oldC.tiers[i];
        if (old && old.factor !== t.factor) notes.push(`${t.label} tier: ${(old.factor * 100).toFixed(0)}% → ${(t.factor * 100).toFixed(0)}%`);
      });
    } else if (section === "faultGroups") {
      newC.faultGroups.forEach((g, gi) => {
        g.faults.forEach((f, fi) => {
          const old = oldC.faultGroups[gi]?.faults[fi];
          if (old && old.pct !== f.pct) notes.push(`"${f.label}": ${(old.pct * 100).toFixed(0)}% → ${(f.pct * 100).toFixed(0)}%`);
        });
      });
    } else if (section === "regions") {
      Object.keys(newC.regions).forEach((r) => {
        if (oldC.regions[r].mult !== newC.regions[r].mult) notes.push(`${r} multiplier: ${oldC.regions[r].mult} → ${newC.regions[r].mult}`);
      });
    } else if (section === "repairPrices") {
      const was = repairPricesFrom(oldC.repairPrices), now = repairPricesFrom(newC.repairPrices);
      Object.keys(now).forEach((d) => {
        const before = Object.fromEntries((was[d] || []).map((r) => [r.name, r.from]));
        now[d].forEach((r) => { if (before[r.name] !== r.from) notes.push(before[r.name] == null ? `${d}: added ${r.name} from $${r.from}` : `${d} ${r.name}: from $${before[r.name]} → $${r.from}`); });
        (was[d] || []).forEach((r) => { if (!now[d].some((x) => x.name === r.name)) notes.push(`${d}: removed ${r.name}`); });
      });
    } else if (section === "holdingCostPct") {
      if (oldC.holdingCostPct !== newC.holdingCostPct) notes.push(`Holding cost: ${(oldC.holdingCostPct * 100).toFixed(1)}% → ${(newC.holdingCostPct * 100).toFixed(1)}%`);
    }
    return notes;
  }, []);

  async function handleSave(section) {
    const notes = diffSummary(config, draft, section);
    if (notes.length === 0) { setStatus("No changes to save."); setTimeout(() => setStatus(""), 2000); return; }
    setStatus("Saving…");
    try {
      await saveConfig(draft);
      const entries = notes.map((note) => ({ ts: Date.now(), field: section, note }));
      const h = await pushHistory(entries);
      setConfig(JSON.parse(JSON.stringify(draft)));
      // Keep this browser on the saved colours for its next visit.
      rememberBrand({ brand: draft.businessSettings?.brandColor, accent: draft.businessSettings?.accentColor });
      setHistory(h);
      setStatus(`Saved ${notes.length} change${notes.length > 1 ? "s" : ""}.`);
      setTimeout(() => setStatus(""), 2500);
    } catch (e) {
      setStatus("Save failed — try again.");
    }
  }

  function discardSection() {
    setDraft(JSON.parse(JSON.stringify(config)));
    // Undo the live colour preview too.
    applyBrand({ brand: config.businessSettings?.brandColor, accent: config.businessSettings?.accentColor });
    setStatus("Discarded unsaved changes.");
    setTimeout(() => setStatus(""), 2000);
  }

  const ink = "var(--mr-bg)", panel = "var(--mr-surface)", panel2 = "var(--mr-surface-2)", paper = "var(--mr-text)", muted = "var(--mr-muted)",
    brass = "var(--mr-brand)", brassDim = "var(--mr-brand-soft)", red = "var(--mr-bad)", green = "var(--mr-ok)", line = "var(--mr-line)";

  const numInput = (value, onChange, opts = {}) => (
    <input
      type="number"
      step={opts.step || "0.01"}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={{ width: opts.width || 76, padding: "6px 8px", borderRadius: 2, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13 }}
    />
  );

  if (loading) {
    return (
      <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif", display: "flex", alignItems: "center", gap: 10 }}>
        <span>Loading pricing database…</span>
      </div>
    );
  }

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=optional');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: "-0.01em", marginBottom: 4 }}>Pricing Console</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 18 }}>
          Every number your quote calculator uses lives here. Changes save to a shared database — visible to anyone with this console open — and every edit is logged below.
        </div>
        {!persisted && (
          <div style={{ border: `1px solid ${red}`, borderRadius: 3, padding: "10px 14px", marginBottom: 18, fontSize: 12.5, color: red }}>
            Storage isn't available right now, so this is running on defaults only — nothing you change here will save. Try reopening this artifact; if it keeps happening, the storage backend may be down.
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20, borderBottom: `1px solid ${line}`, paddingBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer",
                border: `1px solid ${tab === t ? brass : line}`, background: tab === t ? brassDim : "transparent",
                color: tab === t ? brass : paper }}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Business" && (
          <Section title="Business details — shown on every invoice and receipt" onSave={() => handleSave("businessSettings")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {[
              { key: "shopName", label: "Shop name" }, { key: "abn", label: "ABN (or local business number)" },
              { key: "address", label: "Business address" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
              { key: "hours", label: "Opening hours (e.g. Mon–Fri 9am–6pm, Sat 10am–4pm)" },
              { key: "dealerLicence", label: "Second-hand dealer licence no. (shown on the site only if entered)" },
              { key: "tradeInPostalAddress", label: "Postal address for trade-ins (shown to customers who choose to post)" },
              { key: "pickupArea", label: "Doorstep pickup area, e.g. Chatswood & North Shore (leave blank to switch pickup off)" },
              { key: "payLaterInStore", label: "Pay-later accepted in store, e.g. Afterpay, Zip (leave blank if none)" },
              { key: "staffDiscountLimitPct", label: "Most a counter staff member can take off a price, in % (owner and managers have no limit; default 10)" },
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }}>{f.label}</label>
                <input value={draft.businessSettings[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, [f.key]: e.target.value } })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }}>Bank details for customer transfers (shown on payout/purchase invoices)</label>
              <textarea value={draft.businessSettings.bankDetails} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, bankDetails: e.target.value } })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, minHeight: 60, boxSizing: "border-box" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={draft.businessSettings.gstRegistered} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, gstRegistered: e.target.checked } })} />
              Registered for GST (10%) — shows a GST breakdown on invoices when on
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 8 }}>
              <input type="checkbox" checked={draft.businessSettings.dailySummary !== false} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, dailySummary: e.target.checked } })} />
              Email me an end-of-day summary after 7pm (takings, profit, what's waiting tomorrow)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 8 }}>
              <input type="checkbox" checked={draft.businessSettings.autoPickupEmails !== false} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, autoPickupEmails: e.target.checked } })} />
              Email repair customers automatically: "ready to collect" if nobody told them within 15 minutes, then a reminder after 3 and 7 days if it's not collected (9am–7pm only)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 8 }}>
              <input type="checkbox" checked={draft.businessSettings.autoFollowUp !== false} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, autoFollowUp: e.target.checked } })} />
              One follow-up email a week after a repair is collected ("still working? it's under warranty", plus a Google review link and a way to opt out)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 8 }}>
              <input type="checkbox" checked={draft.businessSettings.autoPartArrived !== false} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, autoPartArrived: e.target.checked } })} />
              Email the customer when a part their repair was waiting on arrives
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 8 }}>
              <input type="checkbox" checked={draft.businessSettings.autoWarrantyReminder !== false} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, autoWarrantyReminder: e.target.checked } })} />
              Remind the customer a week before their repair warranty ends
            </label>

            <div style={{ marginTop: 20, fontSize: 13 }}>Google reviews</div>
            <div style={{ fontSize: 12, color: muted, margin: "4px 0 8px" }}>Reviews decide who shows in Google Maps. Put this card on the counter; every printed job ticket has the same QR code.</div>
            <button type="button" onClick={() => printReviewCard(draft.businessSettings.shopName && draft.businessSettings.shopName !== "Your Phone Shop" ? { name: draft.businessSettings.shopName } : {})} style={{ padding: "8px 12px", border: `1px solid ${line}`, borderRadius: 8, fontSize: 13, background: "transparent", color: paper, cursor: "pointer" }}>🖨 Print review QR cards</button>

            <BrandColours brand={draft.businessSettings.brandColor} accent={draft.businessSettings.accentColor} colors={{ muted, line, paper }}
              onChange={(c) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, ...c } })} />

            <div style={{ fontSize: 13, marginTop: 20, marginBottom: 4 }}>Storefront trust stats (optional)</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
              Shown on the public website if filled in. Leave blank to hide — never fabricate a number here just to look established.
            </div>
            {[
              { key: "yearsInBusiness", label: "Years in business", placeholder: "e.g. 3" },
              { key: "devicesSoldCount", label: "Devices sold (lifetime, approx.)", placeholder: "e.g. 850" },
              { key: "googleRating", label: "Google rating (out of 5)", placeholder: "e.g. 4.8" },
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: muted, marginBottom: 4 }}>{f.label}</label>
                <input value={draft.businessSettings[f.key]} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, businessSettings: { ...draft.businessSettings, [f.key]: e.target.value } })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
          </Section>
        )}

        {tab === "Market" && (
          <MarketTab colors={{ panel2, paper, muted, brass, brassDim, red, green, line }} position={Number(config && config.marketPositionPct) || 0}
            onApply={async (changes) => {
              // Re-read the price list first so a change someone else saved meanwhile isn't lost.
              const latest = (await loadConfig()) || config;
              const today = sydneyToday();
              const byKey = new Map(changes.map((c) => [`${c.brand}|${c.model}`, c]));
              const catalog = mergeCatalog(latest.catalog, { all: true }).map((d) => { const c = byKey.get(`${d.brand}|${d.model}`); return c ? { ...d, marketAdjPct: c.to, marketCheckedAt: today } : d; });
              const next = { ...latest, catalog };
              if (!(await saveConfig(next))) return false;
              const h = await pushHistory(changes.map((c) => ({ ts: Date.now(), field: "catalog", note: `${c.brand} ${c.model} market adjustment: ${c.from}% → ${c.to}% (${c.note})` })));
              setConfig(JSON.parse(JSON.stringify(next)));
              setDraft((d) => (d ? { ...d, catalog: d.catalog.map((x) => { const c = byKey.get(`${x.brand}|${x.model}`); return c ? { ...x, marketAdjPct: c.to, marketCheckedAt: today } : x; }) } : d));
              setHistory(h);
              return true;
            }}
            onPosition={async (pct) => {
              const latest = (await loadConfig()) || config;
              const next = { ...latest, marketPositionPct: pct };
              if (!(await saveConfig(next))) return false;
              setHistory(await pushHistory([{ ts: Date.now(), field: "market", note: `Market position: pay ${pct}% vs competitors` }]));
              setConfig(JSON.parse(JSON.stringify(next)));
              return true;
            }} />
        )}

        {tab === "Requests" && (
          <DeviceRequestsTab catalog={config && config.catalog} prefill={addPrefill} colors={{ panel2, paper, muted, brass, brassDim, red, green, line }}
            onAddDevice={async (device) => {
              const latest = (await loadConfig()) || config;
              const next = { ...latest, catalog: [...(Array.isArray(latest.catalog) ? latest.catalog : []), device] };
              if (!(await saveConfig(next))) return false;
              const h = await pushHistory([{ ts: Date.now(), field: "catalog", note: `Added ${device.brand} ${device.model} (${Object.entries(device.retail).map(([k, v]) => `${k} $${v}`).join(", ")})${device.addedFrom !== "manual" ? ` from customer request ${device.addedFrom}` : ""}` }]);
              setConfig(JSON.parse(JSON.stringify(next)));
              setDraft((d) => (d ? { ...d, catalog: [...d.catalog, device] } : d));
              setHistory(h);
              return true;
            }} />
        )}

        {tab === "Catalog" && (
          <Section title="Device retail prices (AUD)" onSave={() => handleSave("catalog")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {(() => {
              const stale = draft.catalog.filter((d) => !d.marketCheckedAt || (Date.now() - new Date(d.marketCheckedAt)) / 86400000 > 30).length;
              return (
                <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.6, marginBottom: 12, padding: 10, border: `1px dashed ${line}`, borderRadius: 3 }}>
                  <strong style={{ color: stale ? red : green }}>{stale} of {draft.catalog.length} models not market-checked in the last 30 days.</strong><br />
                  Weekly routine: compare your best sellers against 2–3 other buyers. If a model is too high or low, set its <em>market adj %</em> (e.g. −8 to pay 8% less), tick "Checked today", then Save.
                </div>
              );
            })()}
            <CatalogEditor draft={draft} setDraft={setDraft} numInput={numInput} line={line} muted={muted} red={red} green={green} brass={brass} />
          </Section>
        )}

        {tab === "Age Curve" && (
          <Section title="Retention curve — % of retail retained by age" onSave={() => handleSave("retentionPoints")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
              Calibrated 28 Sep–3 Oct 2026 against live Australian market prices (0–4 years). Re-check monthly, and use market adj % for individual models.
            </div>
            {draft.retentionPoints.map((p, i) => (
              <div key={p.m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ width: 70, fontSize: 13 }}>{p.m} months</div>
                {numInput((p.r * 100).toFixed(1), (v) => {
                  const next = { ...draft };
                  next.retentionPoints = draft.retentionPoints.map((pp, ii) => ii === i ? { ...pp, r: v / 100 } : pp);
                  setDraft(next);
                }, { step: "0.1" })}
                <span style={{ fontSize: 12, color: muted }}>%</span>
              </div>
            ))}
          </Section>
        )}

        {tab === "Repair Prices" && (() => {
          const prices = { ...REPAIRS_BY_DEVICE, ...(draft.repairPrices || {}) }; // raw, so a box can be empty while typing
          const setDev = (dev, rows) => setDraft({ ...draft, repairPrices: { ...prices, [dev]: rows } });
          const inp = { padding: "8px 10px", fontSize: 13, border: `1px solid ${line}`, borderRadius: 3, background: "var(--mr-surface)", color: paper };
          return (
            <Section title="Repair prices (the &quot;from&quot; price customers see)" onSave={() => handleSave("repairPrices")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
              <div style={{ fontSize: 12.5, color: muted, marginBottom: 12 }}>Shown on the Repairs page, in the chat and by the AI assistant. Customers always see these as starting prices; the exact price is confirmed before any work.</div>
              {Object.keys(prices).map((dev) => (
                <div key={dev} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{dev}</div>
                  {prices[dev].map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <input value={r.name} aria-label={`${dev} repair name`} onChange={(e) => setDev(dev, prices[dev].map((x, j) => j === i ? { ...x, name: e.target.value } : x))} style={{ ...inp, flex: "1 1 200px" }} />
                      <span style={{ fontSize: 13, color: muted }}>from $</span>
                      <input value={r.from} inputMode="numeric" aria-label={`${r.name} price`} onChange={(e) => setDev(dev, prices[dev].map((x, j) => j === i ? { ...x, from: e.target.value.replace(/[^\d]/g, "") } : x))} style={{ ...inp, width: 80 }} />
                      <button type="button" onClick={() => setDev(dev, prices[dev].filter((_, j) => j !== i))} disabled={prices[dev].length < 2} title="Remove" style={{ ...inp, cursor: "pointer", color: red }}>✕</button>
                      <ModelPrices row={r} inp={inp} muted={muted} onChange={(models) => setDev(dev, prices[dev].map((x, j) => (j === i ? { ...x, models } : x)))} />
                    </div>
                  ))}
                  <button type="button" onClick={() => setDev(dev, [...prices[dev], { name: "New repair", from: 50 }])} style={{ ...inp, cursor: "pointer", color: brass }}>+ Add a repair</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 14px" }}>
                <button type="button" style={{ ...inp, cursor: "pointer", color: brass }} onClick={() => {
                  const name = (window.prompt("New device type, e.g. Game console, Drone, AirPods (letters and spaces only)") || "").trim().replace(/\s+/g, " ");
                  if (!name) return;
                  if (!/^[A-Za-z ]{2,20}$/.test(name)) { window.alert("Use 2 to 20 letters and spaces."); return; }
                  if (prices[name]) { window.alert("That device type is already there."); return; }
                  setDev(name, [{ name: "Screen repair", from: 99 }]);
                }}>+ Add a device type</button>
                {Object.keys(prices).filter((d) => !REPAIRS_BY_DEVICE[d]).map((d) => (
                  <button key={d} type="button" style={{ ...inp, cursor: "pointer", color: red }} onClick={() => { if (window.confirm(`Remove ${d} and its prices? (Then press Save.)`)) { const { [d]: _, ...rest } = draft.repairPrices || {}; setDraft({ ...draft, repairPrices: rest }); } }}>Remove {d}</button>
                ))}
              </div>
              <button type="button" onClick={() => setDraft({ ...draft, repairPrices: null })} style={{ ...inp, cursor: "pointer", color: muted }}>Reset to the built-in prices</button>
            </Section>
          );
        })()}

        {tab === "Brand Factors" && (
          <Section title="Brand liquidity factor" onSave={() => handleSave("brandFactors")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Multiplies the age curve. 1.00 = holds value like Apple. Only Apple is verified against real data — the rest are estimates.</div>
            {Object.keys(draft.brandFactors).map((b, i) => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ width: 100, fontSize: 13 }}>{b}</div>
                {numInput(draft.brandFactors[b], (v) => setDraft({ ...draft, brandFactors: { ...draft.brandFactors, [b]: v } }))}
              </div>
            ))}
          </Section>
        )}

        {tab === "Condition Tiers" && (
          <Section title="Condition tier factors" onSave={() => handleSave("tiers")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {draft.tiers.map((t, i) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ width: 160, fontSize: 13 }}>{t.label}</div>
                {numInput((t.factor * 100).toFixed(0), (v) => {
                  const next = { ...draft };
                  next.tiers = draft.tiers.map((tt, ii) => ii === i ? { ...tt, factor: v / 100 } : tt);
                  setDraft(next);
                }, { step: "1" })}
                <span style={{ fontSize: 12, color: muted }}>%</span>
              </div>
            ))}
          </Section>
        )}

        {tab === "Faults" && (
          <Section title="Fault deduction percentages" onSave={() => handleSave("faultGroups")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {draft.faultGroups.map((g, gi) => (
              <div key={g.group} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: brass, marginBottom: 6 }}>{g.group}</div>
                {g.faults.map((f, fi) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: fi === 0 ? "none" : `1px solid ${line}` }}>
                    <div style={{ fontSize: 13 }}>{f.label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {numInput((f.pct * 100).toFixed(0), (v) => {
                        const next = { ...draft };
                        next.faultGroups = draft.faultGroups.map((gg, gii) =>
                          gii === gi ? { ...gg, faults: gg.faults.map((ff, fii) => fii === fi ? { ...ff, pct: v / 100 } : ff) } : gg
                        );
                        setDraft(next);
                      }, { step: "1" })}
                      <span style={{ fontSize: 12, color: muted }}>%</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </Section>
        )}

        {tab === "Regions" && (
          <Section title="Region multipliers (relative to AUD)" onSave={() => handleSave("regions")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            {Object.keys(draft.regions).map((code, i) => (
              <div key={code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ width: 160, fontSize: 13 }}>{draft.regions[code].label} ({draft.regions[code].currency})</div>
                {numInput(draft.regions[code].mult, (v) => setDraft({ ...draft, regions: { ...draft.regions, [code]: { ...draft.regions[code], mult: v } } }), { step: "0.01" })}
              </div>
            ))}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${line}` }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Holding & refurb cost</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {numInput((draft.holdingCostPct * 100).toFixed(1), (v) => setDraft({ ...draft, holdingCostPct: v / 100 }), { step: "0.1" })}
                <span style={{ fontSize: 12, color: muted }}>%</span>
              </div>
            </div>
          </Section>
        )}

        {tab === "Price Matches" && (
          <PriceMatchesTab colors={{ panel, panel2, paper, muted, brass, brassDim, red, green, line }}
            requests={priceMatches} regions={draft.regions}
            onApprove={async (id, approvedPrice, note) => {
              const next = priceMatches.map((r) => r.id === id ? { ...r, status: "approved", approvedPrice, staffNote: note } : r);
              await savePriceMatches(next); setPriceMatches(next);
              await pushHistory([{ ts: Date.now(), field: "price_match", note: `Approved price match ${id} at ${approvedPrice}` }]);
              setHistory(await loadHistory());
            }}
            onDeny={async (id, note) => {
              const next = priceMatches.map((r) => r.id === id ? { ...r, status: "denied", staffNote: note } : r);
              await savePriceMatches(next); setPriceMatches(next);
              await pushHistory([{ ts: Date.now(), field: "price_match", note: `Denied price match ${id}${note ? `: ${note}` : ""}` }]);
              setHistory(await loadHistory());
            }} />
        )}

        {tab === "History" && (
          <div>
            <div style={{ fontSize: 15, marginBottom: 4 }}>Edit history</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 14 }}>Every saved change, most recent first. Nothing here can be un-logged — mistakes are visible, not hidden.</div>
            {history.length === 0 && <div style={{ color: muted, fontSize: 13 }}>No changes yet.</div>}
            {history.map((h, i) => (
              <div key={i} style={{ padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${line}`, fontSize: 13 }}>
                <div>{h.note}</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{h.field} · {new Date(h.ts).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, onSave, onDiscard, dirty, status, line, muted }) {
  const brass = "var(--mr-brand)", panel = "var(--mr-surface)", paper = "var(--mr-text)";
  return (
    <div>
      <div style={{ fontSize: 15, marginBottom: 12 }}>{title}</div>
      <div style={{ marginBottom: 16 }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "sticky", bottom: 12, background: panel, border: `1px solid ${line}`, borderRadius: 3, padding: "10px 14px" }}>
        <button onClick={onSave} disabled={!dirty}
          style={{ padding: "9px 18px", borderRadius: 3, border: "none", background: dirty ? "var(--mr-brand-fill)" : line, color: dirty ? "#fff" : muted, fontSize: 13, fontWeight: 600, cursor: dirty ? "pointer" : "default" }}>
          Save changes
        </button>
        {dirty && <button onClick={onDiscard} style={{ padding: "9px 14px", borderRadius: 3, border: `1px solid ${line}`, background: "transparent", color: muted, fontSize: 13, cursor: "pointer" }}>Discard</button>}
        {status && <span style={{ fontSize: 12, color: muted }}>{status}</span>}
      </div>
    </div>
  );
}

function PriceMatchesTab({ colors, requests, regions, onApprove, onDeny }) {
  const { panel, panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [drafts, setDrafts] = useState({});
  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  const fmt = (n, regionCode) => {
    const r = (regions && regions[regionCode]) || { symbol: "$" };
    return `${r.symbol}${Math.round(n || 0).toLocaleString()}`;
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
        Customer-submitted "beat this quote" requests. Approving sets the price customers see when they track their request — it doesn't automatically change anything else.
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Pending ({pending.length})</div>
      {pending.length === 0 && <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>Nothing waiting.</div>}
      {pending.map((r) => {
        const d = drafts[r.id] || { price: String(r.competitorPrice), note: "" };
        return (
          <div key={r.id} style={{ border: `1px solid ${brass}`, borderRadius: 3, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>{r.id}</span>
              <span style={{ fontSize: 12, color: muted }}>{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>{r.device ? `${r.device.brand} ${r.device.model} · ${r.device.storage}` : "No device on file"}</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
              Our quote: {fmt(r.ourQuote, r.region)} · {r.competitorName} quoted: <span style={{ color: red }}>{fmt(r.competitorPrice, r.region)}</span>
              <div style={{ marginTop: 4 }}>Customer: {r.customerEmail ? <a href={`mailto:${r.customerEmail}`} style={{ color: brass }}>{r.customerEmail}</a> : "no email left"}</div>
              {r.note && <div style={{ marginTop: 4 }}>Customer note: {r.note}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={d.price} onChange={(e) => setDrafts((s) => ({ ...s, [r.id]: { ...d, price: e.target.value } }))} placeholder="Price to match at" type="number"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, outline: "none" }} />
            </div>
            <input value={d.note} onChange={(e) => setDrafts((s) => ({ ...s, [r.id]: { ...d, note: e.target.value } }))} placeholder="Note to customer (required if denying)"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onApprove(r.id, parseFloat(d.price), d.note)} style={{ flex: 1, padding: "9px", borderRadius: 3, border: "none", background: green, color: "#0c1a12", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                Approve at this price
              </button>
              <button onClick={() => d.note.trim() && onDeny(r.id, d.note)} disabled={!d.note.trim()}
                style={{ flex: 1, padding: "9px", borderRadius: 3, border: `1px solid ${red}`, background: "transparent", color: red, fontSize: 12.5, cursor: d.note.trim() ? "pointer" : "default", opacity: d.note.trim() ? 1 : 0.5 }}>
                Deny (needs a note)
              </button>
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: 13, marginBottom: 8, marginTop: 20 }}>Resolved ({resolved.length})</div>
      {resolved.slice(0, 20).map((r) => (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${line}`, fontSize: 13 }}>
          <span>{r.id} · {r.competitorName}</span>
          <span style={{ color: r.status === "approved" ? green : muted }}>{r.status === "approved" ? `matched at ${fmt(r.approvedPrice, r.region)}` : "denied"}</span>
        </div>
      ))}
    </div>
  );
}

// Phone models: search, add, edit (release date, storage sizes and prices, photo,
// market adj %), hide from the website and quotes, or delete a model you added.
// Built-in models are hidden rather than deleted, so they don't come back on the next load.
const BUILT_IN = new Set(DEFAULT_CATALOG.map((d) => `${d.brand}|${d.model}`));
function CatalogEditor({ draft, setDraft, numInput, line, muted, red, green, brass }) {
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ brand: "Apple", model: "", category: "phone", release: new Date().toISOString().slice(0, 10), sizes: "128GB 999, 256GB 1199" });
  const [newSize, setNewSize] = useState({});
  const inp = { padding: "6px 8px", fontSize: 12.5, border: `1px solid ${line}`, borderRadius: 3, background: "var(--mr-surface)", color: "var(--mr-text)", fontFamily: "inherit" };
  const btn = { ...inp, cursor: "pointer" };
  const upd = (di, patch) => { const next = { ...draft, catalog: [...draft.catalog] }; next.catalog[di] = { ...draft.catalog[di], ...patch }; setDraft(next); };
  const parseSizes = (t) => Object.fromEntries(t.split(/[,\n]/).map((x) => x.trim().match(/^(\S+)\s*[:=]?\s*\$?(\d+)$/)).filter(Boolean).map((m) => [m[1].toUpperCase().replace(/^(\d+)(G|T)$/, "$1$2B"), Number(m[2])]));
  const brands = [...new Set(draft.catalog.map((d) => d.brand))];
  const dupe = draft.catalog.some((d) => d.brand.toLowerCase() === nf.brand.trim().toLowerCase() && d.model.toLowerCase() === nf.model.trim().toLowerCase());
  const sizes = parseSizes(nf.sizes);
  const needle = q.trim().toLowerCase();
  const rows = draft.catalog.map((d, di) => [d, di]).filter(([d]) => (showHidden || !d.hidden) && (!needle || `${d.brand} ${d.model}`.toLowerCase().includes(needle)));
  const hiddenCount = draft.catalog.filter((d) => d.hidden).length;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${draft.catalog.length} models`} aria-label="Search models" style={{ ...inp, flex: "1 1 200px", fontSize: 13.5, padding: "8px 10px" }} />
        <button type="button" onClick={() => setAdding(!adding)} style={{ ...btn, color: brass, fontWeight: 700 }}>{adding ? "Close" : "+ Add a model"}</button>
        {hiddenCount > 0 && <button type="button" onClick={() => setShowHidden(!showHidden)} style={btn}>{showHidden ? "Hide hidden models" : `Show ${hiddenCount} hidden`}</button>}
        <button type="button" style={btn} onClick={() => {
          const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const rows = [["Brand", "Model", "Type", "Released", "Prices (size price; size price)", "Market adj %", "Hidden"],
            ...draft.catalog.map((d) => [d.brand, d.model, d.category || "phone", (d.release || "").slice(0, 10), Object.entries(d.retail || {}).map(([k, v]) => `${k} ${v}`).join("; "), d.marketAdjPct ?? 0, d.hidden ? "yes" : ""])];
          const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" })); a.download = `phone-models-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        }}>Export CSV</button>
        <label style={{ ...btn, display: "inline-flex", alignItems: "center" }}>Import CSV
          <input type="file" accept=".csv,text/csv" hidden onChange={async (e) => {
            const file = e.target.files && e.target.files[0]; e.target.value = ""; if (!file) return;
            const text = await file.text();
            const parseLine = (l) => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
            const lines = text.split(/\r?\n/).filter((l) => l.trim()); if (/brand/i.test(lines[0] || "")) lines.shift();
            let added = 0, changed = 0; const next = [...draft.catalog];
            for (const l of lines) {
              const [brand, model, category, release, sizes, adj, hidden] = parseLine(l).map((x) => (x || "").trim());
              if (!brand || !model) continue;
              const retail = Object.fromEntries(String(sizes || "").split(/[;|]/).map((x) => x.trim().match(/^(\S+)\s*[:=]?\s*\$?(\d+)$/)).filter(Boolean).map((m) => [m[1].toUpperCase(), Number(m[2])]));
              const i = next.findIndex((d) => d.brand.toLowerCase() === brand.toLowerCase() && d.model.toLowerCase() === model.toLowerCase());
              const patch = { ...(Object.keys(retail).length ? { retail } : {}), ...(release ? { release } : {}), ...(category ? { category } : {}), ...(adj !== "" && Number.isFinite(Number(adj)) ? { marketAdjPct: Number(adj) } : {}), hidden: /^y/i.test(hidden || "") };
              if (i >= 0) { next[i] = { ...next[i], ...patch }; changed++; }
              else if (Object.keys(retail).length) { next.unshift({ brand, model, category: category || "phone", release: release || new Date().toISOString().slice(0, 10), marketAdjPct: 0, ...patch, retail }); added++; }
            }
            setDraft({ ...draft, catalog: next });
            window.alert(`${changed} updated, ${added} added. Check them, then press Save.`);
          }} />
        </label>
      </div>
      {adding && (
        <div style={{ border: `1px solid ${brass}`, borderRadius: 4, padding: 12, marginBottom: 14, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input list="mr-brands" value={nf.brand} onChange={(e) => setNf({ ...nf, brand: e.target.value })} placeholder="Brand" aria-label="Brand" style={{ ...inp, flex: "1 1 120px" }} />
            <datalist id="mr-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
            <input value={nf.model} onChange={(e) => setNf({ ...nf, model: e.target.value })} placeholder="Model, e.g. Galaxy S26 Ultra" aria-label="Model" style={{ ...inp, flex: "2 1 200px" }} />
            <select value={nf.category} onChange={(e) => setNf({ ...nf, category: e.target.value })} aria-label="Type" style={inp}>{["phone", "tablet", "laptop", "watch"].map((c) => <option key={c}>{c}</option>)}</select>
            <label style={{ fontSize: 12, color: muted, display: "flex", gap: 6, alignItems: "center" }}>released <input type="date" value={nf.release} onChange={(e) => setNf({ ...nf, release: e.target.value })} style={inp} /></label>
          </div>
          <input value={nf.sizes} onChange={(e) => setNf({ ...nf, sizes: e.target.value })} placeholder="Storage and new retail price: 128GB 999, 256GB 1199" aria-label="Storage sizes and prices" style={inp} />
          <div style={{ fontSize: 12, color: dupe ? red : muted }}>{dupe ? "That model is already in the catalog." : `Sizes read as: ${Object.entries(sizes).map(([k, v]) => `${k} $${v}`).join(", ") || "none yet"}`}</div>
          <div><button type="button" disabled={!nf.brand.trim() || !nf.model.trim() || dupe || !Object.keys(sizes).length}
            onClick={() => { setDraft({ ...draft, catalog: [{ brand: nf.brand.trim(), model: nf.model.trim(), category: nf.category, release: nf.release, retail: sizes, marketAdjPct: 0, addedAt: new Date().toISOString() }, ...draft.catalog] }); setAdding(false); setNf({ ...nf, model: "" }); }}
            style={{ ...btn, background: brass, color: "#fff", border: "none", fontWeight: 700 }}>Add model</button> <span style={{ fontSize: 12, color: muted }}>Then press Save below.</span></div>
        </div>
      )}
      {rows.length === 0 && <div style={{ fontSize: 13, color: muted }}>No models match.</div>}
      {rows.map(([d, di], i) => {
        const days = d.marketCheckedAt ? Math.max(0, Math.floor((Date.now() - new Date(String(d.marketCheckedAt).slice(0, 10) + "T00:00:00")) / 86400000)) : null; // a date, read as local midnight
        const builtIn = BUILT_IN.has(`${d.brand}|${d.model}`);
        const ns = newSize[di] || { k: "", v: "" };
        return (
          <div key={d.brand + d.model} style={{ padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${line}`, opacity: d.hidden ? 0.55 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}><strong>{d.brand} {d.model}</strong> {d.hidden && <span style={{ color: red }}>· hidden from the website and quotes</span>}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: muted }}>
                released <input type="date" value={(d.release || "").slice(0, 10)} onChange={(e) => upd(di, { release: e.target.value })} aria-label={`${d.model} release date`} style={inp} />
                <button type="button" onClick={() => upd(di, { hidden: !d.hidden })} style={btn}>{d.hidden ? "Show again" : "Hide"}</button>
                {!builtIn && <button type="button" style={{ ...btn, color: red }} onClick={() => { if (window.confirm(`Delete ${d.brand} ${d.model} from the catalog? (Then press Save.)`)) setDraft({ ...draft, catalog: draft.catalog.filter((_, j) => j !== di) }); }}>Delete</button>}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {Object.keys(d.retail).map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: muted }}>
                  {s}
                  {numInput(d.retail[s], (v) => upd(di, { retail: { ...d.retail, [s]: v } }), { step: "1", width: 70 })}
                  {Object.keys(d.retail).length > 1 && <button type="button" aria-label={`Remove ${s}`} title={`Remove ${s}`} onClick={() => { const { [s]: _, ...rest } = d.retail; upd(di, { retail: rest }); }} style={{ ...btn, padding: "2px 6px", color: red }}>×</button>}
                </label>
              ))}
              <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input value={ns.k} onChange={(e) => setNewSize({ ...newSize, [di]: { ...ns, k: e.target.value } })} placeholder="512GB" aria-label={`New size for ${d.model}`} style={{ ...inp, width: 64 }} />
                <input value={ns.v} onChange={(e) => setNewSize({ ...newSize, [di]: { ...ns, v: e.target.value.replace(/\D/g, "") } })} placeholder="$" aria-label={`Price for new size of ${d.model}`} inputMode="numeric" style={{ ...inp, width: 64 }} />
                <button type="button" disabled={!ns.k.trim() || !ns.v} onClick={() => { upd(di, { retail: { ...d.retail, [ns.k.trim().toUpperCase()]: Number(ns.v) } }); setNewSize({ ...newSize, [di]: { k: "", v: "" } }); }} style={{ ...btn, color: brass }}>+ size</button>
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 12, color: muted }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>market adj %{numInput(d.marketAdjPct ?? 0, (v) => upd(di, { marketAdjPct: Math.max(-60, Math.min(30, Number(v) || 0)) }), { step: "1", width: 60 })}</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>photo link
                <input value={d.imageUrl || ""} onChange={(e) => upd(di, { imageUrl: e.target.value.trim() })} placeholder="https://… (optional)" style={{ ...inp, width: 170 }} /></label>
              <button type="button" onClick={() => upd(di, { marketCheckedAt: new Date().toISOString().slice(0, 10) })} style={btn}>✓ Checked today</button>
              <span style={{ color: days === null || days > 30 ? red : green }}>{days === null ? "never market-checked" : days === 0 ? "checked today" : `checked ${days} day${days === 1 ? "" : "s"} ago`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Exact prices for particular models on one repair ("iPhone 13 189; iPhone 14 219"). The
// website then shows the customer's exact price once they type their model.
function ModelPrices({ row, inp, muted, onChange }) {
  const [open, setOpen] = useState(false);
  const toText = (m) => Object.entries(m || {}).map(([k, v]) => `${k} ${v}`).join("; ");
  const [t, setT] = useState(toText(row.models));
  const n = Object.keys(row.models || {}).length;
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ ...inp, cursor: "pointer", color: muted, fontSize: 12 }}>{n ? `${n} exact model price${n === 1 ? "" : "s"}` : "+ exact price by model"}</button>;
  return (
    <div style={{ flex: "1 1 100%", display: "flex", gap: 6, alignItems: "center" }}>
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="iPhone 13 189; iPhone 14 219; Galaxy S23 249" aria-label={`Exact prices for ${row.name}`} style={{ ...inp, flex: 1 }} />
      <button type="button" style={{ ...inp, cursor: "pointer" }} onClick={() => {
        const models = Object.fromEntries(t.split(/[;\n]/).map((x) => x.trim().match(/^(.+?)\s+\$?(\d+)$/)).filter(Boolean).map((m) => [m[1].trim(), Number(m[2])]));
        onChange(Object.keys(models).length ? models : undefined); setOpen(false);
      }}>Done</button>
    </div>
  );
}
