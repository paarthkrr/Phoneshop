import { DEFAULT_CATALOG, mergeCatalog } from "./device-catalog.js";
import React, { useState, useEffect, useCallback } from "react";

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
  faultGroups: [
    { group: "Display", faults: [
      { id: "screen_scratch", label: "Minor scratches on screen", pct: 0.05 },
      { id: "screen_crack", label: "Cracked / shattered screen", pct: 0.25 },
      { id: "screen_crack_severe", label: "Screen glass missing pieces", pct: 0.40 },
      { id: "dead_pixels", label: "Dead pixels or lines", pct: 0.15 },
      { id: "burn_in", label: "Screen burn-in (OLED)", pct: 0.15 },
      { id: "touch_dead", label: "Touch completely unresponsive", pct: 0.35 },
    ]},
    { group: "Body & Battery", faults: [
      { id: "back_crack", label: "Cracked back glass", pct: 0.10 },
      { id: "bent", label: "Bent chassis", pct: 0.20 },
      { id: "batt_below80", label: "Battery health below 80%", pct: 0.12 },
      { id: "batt_swollen", label: "Battery swollen", pct: 0.25 },
    ]},
    { group: "Functional", faults: [
      { id: "cam_rear", label: "Rear camera not working", pct: 0.12 },
      { id: "port_charge", label: "Charging port faulty", pct: 0.10 },
      { id: "speaker", label: "Speaker not working", pct: 0.08 },
      { id: "biometric", label: "Face ID / fingerprint not working", pct: 0.10 },
    ]},
  ],
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

const TABS = ["Business", "Catalog", "Age Curve", "Brand Factors", "Condition Tiers", "Faults", "Regions", "Price Matches", "History"];

export default function AdminPricingConsole() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [priceMatches, setPriceMatches] = useState([]);
  const [tab, setTab] = useState("Catalog");
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
      // Pick up any newly added built-in models (e.g. a new phone launch)
      // without changing prices staff have already edited.
      if (!isNew) {
        const merged = mergeCatalog(c.catalog);
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
      setHistory(h);
      setStatus(`Saved ${notes.length} change${notes.length > 1 ? "s" : ""}.`);
      setTimeout(() => setStatus(""), 2500);
    } catch (e) {
      setStatus("Save failed — try again.");
    }
  }

  function discardSection() {
    setDraft(JSON.parse(JSON.stringify(config)));
    setStatus("Discarded unsaved changes.");
    setTimeout(() => setStatus(""), 2000);
  }

  const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
    brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
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
            {draft.catalog.map((d, di) => (
              <div key={d.brand + d.model} style={{ padding: "10px 0", borderTop: di === 0 ? "none" : `1px solid ${line}` }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>{d.brand} {d.model} <span style={{ color: muted }}>· released {d.release}</span></div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {Object.keys(d.retail).map((s) => (
                    <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: muted }}>
                      {s}
                      {numInput(d.retail[s], (v) => {
                        const next = { ...draft };
                        next.catalog = [...next.catalog];
                        next.catalog[di] = { ...d, retail: { ...d.retail, [s]: v } };
                        setDraft(next);
                      }, { step: "1", width: 70 })}
                    </label>
                  ))}
                </div>
                {(() => {
                  const days = d.marketCheckedAt ? Math.floor((Date.now() - new Date(d.marketCheckedAt)) / 86400000) : null;
                  const upd = (patch) => { const next = { ...draft }; next.catalog = [...next.catalog]; next.catalog[di] = { ...d, ...patch }; setDraft(next); };
                  return (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 12, color: muted }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        market adj %
                        {numInput(d.marketAdjPct ?? 0, (v) => upd({ marketAdjPct: Math.max(-60, Math.min(30, Number(v) || 0)) }), { step: "1", width: 60 })}
                      </label>
                      <button onClick={() => upd({ marketCheckedAt: new Date().toISOString().slice(0, 10) })}
                        style={{ padding: "4px 9px", fontSize: 11.5, border: `1px solid ${line}`, borderRadius: 3, background: "transparent", cursor: "pointer" }}>✓ Checked today</button>
                      <span style={{ color: days === null || days > 30 ? red : green }}>
                        {days === null ? "never market-checked" : days === 0 ? "checked today" : `checked ${days} day${days === 1 ? "" : "s"} ago`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            ))}
          </Section>
        )}

        {tab === "Age Curve" && (
          <Section title="Retention curve — % of retail retained by age" onSave={() => handleSave("retentionPoints")} onDiscard={discardSection} dirty={dirty} status={status} line={line} muted={muted}>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
              Anchored: 36mo and 60mo are calibrated against real Mobile Monster prices. Edit the rest as you gather more data.
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
  const brass = "#2150C8", panel = "#FFFFFF", paper = "#201C18";
  return (
    <div>
      <div style={{ fontSize: 15, marginBottom: 12 }}>{title}</div>
      <div style={{ marginBottom: 16 }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "sticky", bottom: 12, background: panel, border: `1px solid ${line}`, borderRadius: 3, padding: "10px 14px" }}>
        <button onClick={onSave} disabled={!dirty}
          style={{ padding: "9px 18px", borderRadius: 3, border: "none", background: dirty ? brass : line, color: dirty ? "#1a1408" : muted, fontSize: 13, fontWeight: 600, cursor: dirty ? "pointer" : "default" }}>
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
