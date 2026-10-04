import React, { useState, useEffect, useMemo } from "react";
import { DEFAULT_CATALOG } from "./device-catalog.js";
import { suggestCompatible, typeOf, ACCESSORY_CATEGORIES, PART_CATEGORIES } from "./compatibility.js";

// Products: built for adding THOUSANDS of accessories fast.
//  • Quick add: photo + category + "fits" (tap a whole series) + price → one
//    listing per model is created automatically, with a ready-made description.
//  • Bulk import: paste rows straight from Excel / Google Sheets.
//  • List: search, edit price/stock inline, bulk price change / hide / remove.
const ink = "#FFFFFF", panel = "#FFFFFF", panel2 = "#F4F6F9", paper = "#111827", muted = "#5B6472", brass = "#2150C8", red = "#8B2E2E", green = "#3F6B34", line = "#E2E6EC";
export const CATEGORIES = [...ACCESSORY_CATEGORIES, ...PART_CATEGORIES];
const MARKUP = { "Cases & covers": 3, "Screen protectors": 4, "Chargers & cables": 2.5, "DIY repair kits": 1.8, "Audio": 2, "Power banks": 2, "Watch bands": 3, "Other": 2.5,
  "Screens & displays": 1.6, "Batteries": 1.8, "Back glass & housings": 1.8, "Charging ports & flex": 2, "Cameras & lenses": 1.8, "Other parts": 1.8 };
const input = { padding: "11px 12px", borderRadius: 10, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 15, boxSizing: "border-box", fontFamily: "inherit", width: "100%" };
const btn = (bg, fg = "#fff", extra = {}) => ({ padding: "11px 16px", borderRadius: 10, border: bg === "transparent" ? `1px solid ${line}` : "none", background: bg, color: fg, fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...extra });
const genId = () => "ACC-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
const money = (n) => "$" + Number(n || 0).toFixed(2);

// Price ending in .95, from cost × markup.
export function autoPrice(cost, category) {
  const c = Number(cost); if (!c) return "";
  return (Math.max(1, Math.ceil(c * (MARKUP[category] || 2.5))) - 0.05).toFixed(2);
}
// Neutral, always-true descriptions (staff can edit). Never claims specs we can't verify.
export function autoDescription(category, fits) {
  const f = fits && fits.length ? fits.join(", ") : "a range of devices";
  switch (category) {
    case "Cases & covers": return `Case designed for ${f}, with cut-outs for buttons, ports and cameras.`;
    case "Screen protectors": return `Screen protector for ${f}. Helps protect your display from scratches and everyday knocks.`;
    case "DIY repair kits": return `DIY repair kit for ${f}. Watch our repair tutorials first, or let us fit it for you in store.`;
    case "Watch bands": return `Replacement band for ${f}.`;
    case "Screens & displays": case "Batteries": case "Back glass & housings": case "Charging ports & flex": case "Cameras & lenses": case "Other parts":
      return `Replacement ${category.toLowerCase().replace(/ & .*/, "").replace(/s$/, "")} for ${f}. Parts are model-specific, so check your exact model before ordering — or let us fit it in store with a 90-day warranty.`;
    default: return `Compatible with ${f}.`;
  }
}
// "iPhone 16 Pro" -> "iPhone 16 series" etc, for one-tap series selection.
export function seriesOf(model) {
  let m;
  if ((m = /^iPhone (\d+)/.exec(model))) return `iPhone ${m[1]} series`;
  if ((m = /^Galaxy S(\d+)/.exec(model))) return `Galaxy S${m[1]} series`;
  if ((m = /^Galaxy Z (Fold|Flip)/.exec(model))) return `Galaxy Z ${m[1]}`;
  if (/^Galaxy A/.test(model)) return "Galaxy A series";
  if ((m = /^Pixel (\d+)/.exec(model))) return `Pixel ${m[1]} series`;
  if (/^iPad/.test(model)) return "iPad";
  if (/Watch/.test(model)) return "Watch";
  return null;
}
// Paste from Excel/Sheets (tabs) or a CSV file (commas, quotes).
export function parseRows(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["Paste a header row plus at least one product row."] };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const split = (l) => { if (sep === "\t") return l.split("\t"); const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out; };
  const head = split(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (names) => head.findIndex((h) => names.includes(h));
  const ix = { name: col(["name", "product", "title"]), category: col(["category", "type"]), price: col(["price", "sell price", "sellprice"]), cost: col(["cost", "cost price"]),
    stock: col(["stock", "qty", "quantity"]), fits: col(["fits", "compatible", "compatible with", "models"]), photo: col(["photo", "image", "image url", "photo url"]),
    description: col(["description", "desc"]), compare: col(["compare_at", "compare at", "was", "rrp"]) };
  if (ix.name < 0) return { rows: [], errors: ['Header row needs a "name" column.'] };
  const rows = [], errors = [];
  lines.slice(1).forEach((l, n) => {
    const c = split(l).map((x) => (x || "").trim()); const get = (k) => (ix[k] >= 0 ? c[ix[k]] || "" : "");
    const name = get("name"); if (!name) return;
    let category = CATEGORIES.find((k) => k.toLowerCase() === get("category").toLowerCase()) || (get("category") ? get("category") : "Other");
    const cost = parseFloat(get("cost").replace(/[$,]/g, "")) || 0;
    let price = parseFloat(get("price").replace(/[$,]/g, "")) || parseFloat(autoPrice(cost, category)) || 0;
    if (!price) { errors.push(`Row ${n + 2} (${name}): needs a price or a cost.`); return; }
    const fits = get("fits") ? get("fits").split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [];
    rows.push({ id: genId(), name, category, sellPrice: price, cost, qtyOnHand: parseInt(get("stock"), 10) || 0, compatibleWith: fits.join(", "),
      imageUrl: get("photo"), description: get("description") || autoDescription(category, fits), compareAtPrice: parseFloat(get("compare").replace(/[$,]/g, "")) || undefined,
      showOnline: true, createdAt: new Date().toISOString() });
  });
  return { rows, errors };
}
const TEMPLATE = "name,category,price,cost,stock,fits,photo,description,compare_at\nClear MagSafe case,Cases & covers,29.95,7,20,iPhone 16;iPhone 16 Pro,,,39.95\nTempered glass,Screen protectors,,2.5,50,Galaxy S25 Ultra,,,\n";

// Shrink a photo in the browser before upload (fast pages, small storage).
// Upload a photo (resized first). Returns a public URL, or a data URL in preview mode.
async function uploadPhoto(file) {
  const dataUrl = await resizeToDataUrl(file);
  if (!window.SHOP_API_BASE_URL || !window.shopAuth) return dataUrl;
  const res = await fetch(`${window.SHOP_API_BASE_URL}/product-images`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${window.shopAuth.authToken()}` }, body: JSON.stringify({ dataUrl }) });
  const body = await res.json(); if (!res.ok) throw new Error(body.error || "Upload failed");
  return body.url;
}
async function resizeToDataUrl(file, max = 900) {
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.82);
}

export default function Products() {
  const [items, setItems] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [tab, setTab] = useState("add");
  const flash = (text, ok = true) => setMsg({ text, ok });
  useEffect(() => { (async () => {
    try { const r = window.storage && await window.storage.get("accessories", true); setItems(r ? JSON.parse(r.value) : []); } catch (e) { setItems([]); }
  })(); }, []);
  async function persist(next, note) {
    try { await window.storage.set("accessories", JSON.stringify(next), true); setItems(next); setDirty(false); if (note) flash(note); return true; }
    catch (e) { flash("Couldn't save — check your connection and try again.", false); return false; }
  }
  if (items === null) return <Shell><div style={{ color: muted }}>Loading products…</div></Shell>;
  const live = items.filter((i) => !i.archived);
  return (
    <Shell>
      <div style={{ color: muted, fontSize: 14.5, marginBottom: 14 }}>{live.length} products · {live.filter((i) => i.showOnline !== false && i.qtyOnHand > 0).length} live in the online shop</div>
      {msg.text && <div role="status" style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 14, fontSize: 14.5, background: msg.ok ? "#EEF5EC" : "#FBF1EF", color: msg.ok ? green : red, border: `1px solid ${msg.ok ? green : red}` }}>{msg.text}</div>}
      <div role="tablist" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["add", "➕ Quick add"], ["bulk", "📋 Bulk import"], ["list", `📦 All products (${live.length})`]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={btn(tab === k ? brass : "transparent", tab === k ? "#fff" : paper)}>{l}</button>
        ))}
      </div>
      {tab === "add" && <QuickAdd onSave={(rows) => persist([...rows, ...items], `${rows.length} product${rows.length === 1 ? "" : "s"} added and live in the online shop.`)} />}
      {tab === "bulk" && <BulkImport onSave={(rows) => persist([...rows, ...items], `${rows.length} products imported.`)} />}
      {tab === "list" && <ProductList items={items} setItems={(n) => { setItems(n); setDirty(true); }} dirty={dirty} onSave={() => persist(items, "Changes saved.")} onSaveNow={(next, note) => persist(next, note)} />}
    </Shell>
  );
}

function QuickAdd({ onSave }) {
  const [photo, setPhoto] = useState(""); const [uploading, setUploading] = useState(false); const [err, setErr] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]); const [name, setName] = useState("");
  const [fits, setFits] = useState([]); const [find, setFind] = useState(""); const [perModel, setPerModel] = useState(true);
  const [cost, setCost] = useState(""); const [price, setPrice] = useState(""); const [compare, setCompare] = useState(""); const [stock, setStock] = useState("10");
  const [desc, setDesc] = useState(""); const [descEdited, setDescEdited] = useState(false);
  const models = useMemo(() => DEFAULT_CATALOG.slice().sort((a, b) => String(b.release).localeCompare(String(a.release))).map((d) => d.model), []);
  const series = useMemo(() => { const m = {}; models.forEach((x) => { const s = seriesOf(x); if (s) (m[s] = m[s] || []).push(x); }); return m; }, [models]);
  useEffect(() => { if (!descEdited) setDesc(autoDescription(category, perModel ? ["{model}"] : fits)); }, [category, fits, perModel, descEdited]);
  const q = find.trim().toLowerCase();
  const seriesHits = Object.keys(series).filter((s) => !q || s.toLowerCase().includes(q)).slice(0, q ? 12 : 10);
  const modelHits = q ? models.filter((m) => m.toLowerCase().includes(q)).slice(0, 16) : [];
  const toggle = (m) => setFits((f) => (f.includes(m) ? f.filter((x) => x !== m) : [...f, m]));
  const suggestions = useMemo(() => suggestCompatible(category, fits, DEFAULT_CATALOG), [category, fits]);
  const byLevel = (l) => suggestions.filter((x) => x.level === l);
  const addMany = (list) => setFits((f) => [...new Set([...f, ...list.map((x) => x.model)])]);
  const ICON = { same: "✅", likely: "🟡", check: "⚠️" };
  const addSeries = (s) => setFits((f) => [...new Set([...f, ...series[s]])]);

  async function onPhoto(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setErr(""); setUploading(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      if (!window.SHOP_API_BASE_URL || !window.shopAuth) { setPhoto(dataUrl); return; } // preview mode
      const res = await fetch(`${window.SHOP_API_BASE_URL}/product-images`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${window.shopAuth.authToken()}` }, body: JSON.stringify({ dataUrl }) });
      const body = await res.json(); if (!res.ok) throw new Error(body.error || "Upload failed");
      setPhoto(body.url);
    } catch (x) { setErr(x.message || "Couldn't upload that photo."); } finally { setUploading(false); }
  }
  function save() {
    if (!name.trim()) return setErr("Give the product a name.");
    const p = parseFloat(price) || parseFloat(autoPrice(cost, category)); if (!p) return setErr("Enter a price (or a cost to auto-price).");
    const base = { category, sellPrice: p, cost: parseFloat(cost) || 0, qtyOnHand: parseInt(stock, 10) || 0, imageUrl: photo, compareAtPrice: parseFloat(compare) || undefined, showOnline: true, createdAt: new Date().toISOString() };
    const rows = perModel && fits.length
      ? fits.map((m) => ({ ...base, id: genId(), name: `${name.trim()} — ${m}`, compatibleWith: m, description: desc.split("{model}").join(m) }))
      : [{ ...base, id: genId(), name: name.trim(), compatibleWith: fits.join(", "), description: desc.split("{model}").join(fits.join(", ") || "a range of devices") }];
    onSave(rows); setName(""); setFits([]); setPhoto(""); setCompare(""); setDescEdited(false); setErr("");
  }
  const suggested = autoPrice(cost, category);
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 14, alignItems: "start", marginBottom: 12 }}>
        <label style={{ width: 120, height: 120, borderRadius: 12, border: `1.5px dashed ${line}`, background: panel2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", textAlign: "center", fontSize: 13, color: muted }}>
          {photo ? <img src={photo} alt="Product" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : uploading ? "Uploading…" : <span>📷<br />Add photo</span>}
          <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} aria-label="Product photo" />
        </label>
        <div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" style={{ ...input, marginBottom: 8 }}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name, e.g. Clear MagSafe case" aria-label="Product name" style={input} />
        </div>
      </div>
      <input value={photo.startsWith("data:") ? "" : photo} onChange={(e) => setPhoto(e.target.value.trim())} placeholder="…or paste a photo link" aria-label="Photo link" style={{ ...input, marginBottom: 14, fontSize: 13.5 }} />

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Fits ({fits.length} selected)</div>
      <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a series or model, e.g. iPhone 16, S25, Pixel" aria-label="Find models" style={{ ...input, marginBottom: 8 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {seriesHits.map((s) => <button key={s} type="button" onClick={() => addSeries(s)} style={btn("transparent", brass, { padding: "7px 11px", fontSize: 13 })}>+ {s} ({series[s].length})</button>)}
        {modelHits.map((m) => <button key={m} type="button" aria-pressed={fits.includes(m)} onClick={() => toggle(m)} style={btn(fits.includes(m) ? "rgba(33,80,200,0.10)" : "transparent", fits.includes(m) ? brass : paper, { padding: "7px 11px", fontSize: 13 })}>{fits.includes(m) ? "✓ " : ""}{m}</button>)}
      </div>
      {fits.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {fits.map((m) => <span key={m} style={{ background: "rgba(33,80,200,0.10)", color: brass, borderRadius: 999, padding: "5px 10px", fontSize: 13, fontWeight: 600 }}>{m} <button type="button" aria-label={`Remove ${m}`} onClick={() => toggle(m)} style={{ border: "none", background: "none", color: brass, cursor: "pointer", fontWeight: 800 }}>×</button></span>)}
        <button type="button" onClick={() => setFits([])} style={{ border: "none", background: "none", color: muted, cursor: "pointer", fontSize: 13 }}>clear all</button>
      </div>}
      {suggestions.length > 0 && (
        <div style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 12, marginBottom: 12, background: "#FAFBFD" }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>🔎 Compatibility check — this may also fit:</div>
          <div style={{ fontSize: 12.5, color: muted, marginBottom: 8 }}>✅ same fit (widely agreed) · 🟡 likely (confirm on the packaging) · ⚠️ check first (brand-dependent — try it on the phone)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {byLevel("same").length > 0 && <button type="button" onClick={() => addMany(byLevel("same"))} style={btn(green, "#fff", { padding: "7px 11px", fontSize: 13 })}>+ Add {byLevel("same").length} same-fit model{byLevel("same").length === 1 ? "" : "s"}</button>}
            {byLevel("likely").length > 0 && <button type="button" onClick={() => addMany(byLevel("likely"))} style={btn("transparent", paper, { padding: "7px 11px", fontSize: 13 })}>+ Add all {byLevel("likely").length} likely</button>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
            {suggestions.slice(0, 40).map((x) => (
              <button key={x.model} type="button" onClick={() => toggle(x.model)} title={x.note}
                style={{ textAlign: "left", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, color: paper, padding: "3px 0" }}>
                {ICON[x.level]} <strong>+ {x.model}</strong> <span style={{ color: muted }}>— {x.note}</span>
              </button>
            ))}
            {suggestions.length > 40 && <div style={{ fontSize: 12.5, color: muted }}>…and {suggestions.length - 40} more (use the buttons above)</div>}
          </div>
        </div>
      )}
      {typeOf(category) === "part" && fits.length > 0 && (
        <div style={{ fontSize: 13, color: red, background: "#FBF1EF", borderRadius: 10, padding: "9px 11px", marginBottom: 12 }}>
          Repair parts are model-specific. Only add another model if the part number matches — a wrong-fit part means a return.
        </div>
      )}
      {fits.length > 1 && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 12 }}>
        <input type="checkbox" checked={perModel} onChange={(e) => setPerModel(e.target.checked)} /> Create a separate listing for each model ({fits.length} listings) — best for shoppers searching their exact phone
      </label>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 13, color: muted }}>Cost (each)<input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="e.g. 6" style={input} /></label>
        <label style={{ fontSize: 13, color: muted }}>Price<input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder={suggested || "e.g. 29.95"} style={input} /></label>
        <label style={{ fontSize: 13, color: muted }}>Was (optional)<input value={compare} onChange={(e) => setCompare(e.target.value)} inputMode="decimal" placeholder="shows a sale" style={input} /></label>
        <label style={{ fontSize: 13, color: muted }}>Stock each<input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" style={input} /></label>
      </div>
      {suggested && !price && <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Auto price from cost: <strong style={{ color: paper }}>{money(suggested)}</strong> ({MARKUP[category]}× markup) — <button type="button" onClick={() => setPrice(suggested)} style={{ border: "none", background: "none", color: brass, cursor: "pointer", fontWeight: 700 }}>use it</button></div>}
      <label style={{ fontSize: 13, color: muted, display: "block", marginBottom: 12 }}>Description (auto-written — edit if you like{perModel && fits.length > 1 ? "; {model} becomes each phone's name" : ""})
        <textarea value={desc} onChange={(e) => { setDesc(e.target.value); setDescEdited(true); }} rows={2} style={{ ...input, resize: "vertical" }} />
      </label>
      {err && <div style={{ color: red, fontSize: 14, marginBottom: 10 }}>{err}</div>}
      <button onClick={save} disabled={uploading} style={btn(brass, "#fff", { width: "100%", padding: 14, fontSize: 16 })}>
        {perModel && fits.length > 1 ? `Add ${fits.length} listings` : "Add product"}
      </button>
    </Card>
  );
}

function BulkImport({ onSave }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseRows(text) : null), [text]);
  const templateHref = "data:text/csv;charset=utf-8," + encodeURIComponent(TEMPLATE);
  return (
    <Card>
      <div style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 10 }}>
        In Excel or Google Sheets, select your product rows <strong>including the header row</strong>, copy, and paste below. Columns: <code>name, category, price, cost, stock, fits, photo, description, compare_at</code>. Only <strong>name</strong> and a <strong>price or cost</strong> are required. Separate several models in <code>fits</code> with <code>;</code>. No description? We write one.
      </div>
      <a href={templateHref} download="recellr-products-template.csv" style={{ ...btn("transparent", brass), display: "inline-block", textDecoration: "none", marginBottom: 12 }}>⬇ Download template</a>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste rows here…" aria-label="Paste product rows" style={{ ...input, fontFamily: "ui-monospace, monospace", fontSize: 13, resize: "vertical" }} />
      {parsed && <div style={{ margin: "10px 0", fontSize: 14.5 }}>
        <strong style={{ color: parsed.rows.length ? green : red }}>{parsed.rows.length} products ready</strong>{parsed.errors.length ? <span style={{ color: red }}> · {parsed.errors.length} rows need fixing</span> : null}
        {parsed.errors.slice(0, 5).map((e) => <div key={e} style={{ color: red, fontSize: 13 }}>{e}</div>)}
        {parsed.rows.slice(0, 3).map((r) => <div key={r.id} style={{ color: muted, fontSize: 13 }}>• {r.name} — {money(r.sellPrice)}{r.compatibleWith ? ` — fits ${r.compatibleWith}` : ""}</div>)}
      </div>}
      <button disabled={!parsed || !parsed.rows.length} onClick={() => { onSave(parsed.rows); setText(""); }} style={btn(parsed && parsed.rows.length ? brass : "#C9CED6", "#fff", { width: "100%", padding: 14, fontSize: 16 })}>
        Import {parsed ? parsed.rows.length : 0} products
      </button>
    </Card>
  );
}

function ProductList({ items, setItems, dirty, onSave, onSaveNow }) {
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState(""); const [cat, setCat] = useState("All"); const [page, setPage] = useState(0); const [sel, setSel] = useState([]); const [pct, setPct] = useState("");
  const live = items.filter((i) => !i.archived);
  const shown = live.filter((i) => (cat === "All" || i.category === cat) && (!q.trim() || `${i.name} ${i.compatibleWith || ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const PAGE = 50; const pageItems = shown.slice(page * PAGE, page * PAGE + PAGE);
  const upd = (id, patch) => setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const bulk = (fn) => { setItems(items.map((i) => (sel.includes(i.id) ? fn(i) : i))); setSel([]); };
  return (
    <Card>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name or model" aria-label="Search products" style={{ ...input, flex: 2, minWidth: 180 }} />
        <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(0); }} aria-label="Filter category" style={{ ...input, flex: 1, minWidth: 150 }}><option>All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {sel.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: panel2, borderRadius: 10, padding: 10, marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>{sel.length} selected</strong>
        <input value={pct} onChange={(e) => setPct(e.target.value)} placeholder="±%" inputMode="decimal" aria-label="Price change percent" style={{ ...input, width: 80 }} />
        <button onClick={() => { const p = parseFloat(pct); if (p) bulk((i) => ({ ...i, sellPrice: Math.max(0.95, Math.round(i.sellPrice * (1 + p / 100)) - 0.05) })); }} style={btn(brass)}>Change price</button>
        <button onClick={() => bulk((i) => ({ ...i, showOnline: false }))} style={btn("transparent", paper)}>Hide online</button>
        <button onClick={() => bulk((i) => ({ ...i, showOnline: true }))} style={btn("transparent", paper)}>Show online</button>
        <button onClick={() => { if (window.confirm(`Remove ${sel.length} products?`)) bulk((i) => ({ ...i, archived: true })); }} style={btn("transparent", red)}>Remove</button>
      </div>}
      {editing && (() => {
        const it = items.find((x) => x.id === editing);
        return it ? <ProductEditor key={it.id} item={it} onCancel={() => setEditing(null)}
          onSave={(patch) => { onSaveNow(items.map((x) => (x.id === it.id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)), `"${patch.name}" saved.`); setEditing(null); }} /> : null;
      })()}
      <label style={{ fontSize: 13, color: muted, display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
        <input type="checkbox" checked={pageItems.length > 0 && pageItems.every((i) => sel.includes(i.id))} onChange={(e) => setSel(e.target.checked ? [...new Set([...sel, ...pageItems.map((i) => i.id)])] : sel.filter((id) => !pageItems.some((i) => i.id === id)))} /> Select all on this page · {shown.length} shown
      </label>
      {pageItems.map((i) => (
        <div key={i.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderTop: `1px solid ${line}`, flexWrap: "wrap" }}>
          <input type="checkbox" checked={sel.includes(i.id)} onChange={() => setSel(sel.includes(i.id) ? sel.filter((x) => x !== i.id) : [...sel, i.id])} aria-label={`Select ${i.name}`} />
          <div style={{ width: 44, height: 44, borderRadius: 8, background: panel2, overflow: "hidden", flexShrink: 0 }}>{i.imageUrl ? <img src={i.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{i.name}{i.showOnline === false ? <span style={{ color: muted, fontWeight: 400 }}> · hidden</span> : null}</div>
            <div style={{ fontSize: 12.5, color: muted }}>{i.category}{i.compatibleWith ? ` · ${i.compatibleWith}` : ""}</div>
          </div>
          <label style={{ fontSize: 12, color: muted }}>$<input value={i.sellPrice} onChange={(e) => upd(i.id, { sellPrice: parseFloat(e.target.value) || 0 })} inputMode="decimal" aria-label={`Price of ${i.name}`} style={{ ...input, width: 80, padding: "7px 8px", fontSize: 14 }} /></label>
          <label style={{ fontSize: 12, color: muted }}>Stock<input value={i.qtyOnHand} onChange={(e) => upd(i.id, { qtyOnHand: parseInt(e.target.value, 10) || 0 })} inputMode="numeric" aria-label={`Stock of ${i.name}`} style={{ ...input, width: 64, padding: "7px 8px", fontSize: 14 }} /></label>
          <button onClick={() => setEditing(i.id)} style={btn("transparent", brass, { padding: "7px 12px", fontSize: 13 })}>Edit</button>
        </div>
      ))}
      {shown.length > PAGE && <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "12px 0" }}>
        <button disabled={page === 0} onClick={() => setPage(page - 1)} style={btn("transparent", paper)}>← Prev</button>
        <span style={{ alignSelf: "center", fontSize: 14 }}>Page {page + 1} of {Math.ceil(shown.length / PAGE)}</span>
        <button disabled={(page + 1) * PAGE >= shown.length} onClick={() => setPage(page + 1)} style={btn("transparent", paper)}>Next →</button>
      </div>}
      <button disabled={!dirty} onClick={onSave} style={btn(dirty ? brass : "#C9CED6", "#fff", { width: "100%", padding: 14, fontSize: 16, marginTop: 10, position: "sticky", bottom: 10 })}>{dirty ? "Save changes" : "All changes saved"}</button>
    </Card>
  );
}

// Edit everything about an existing product after it's been added.
function ProductEditor({ item, onCancel, onSave }) {
  const [p, setP] = useState({ ...item });
  const [fits, setFits] = useState((item.compatibleWith || "").split(",").map((x) => x.trim()).filter(Boolean));
  const [find, setFind] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const models = useMemo(() => DEFAULT_CATALOG.map((d) => d.model), []);
  const suggestions = useMemo(() => suggestCompatible(p.category, fits, DEFAULT_CATALOG), [p.category, fits]);
  const hits = find.trim() ? models.filter((m) => m.toLowerCase().includes(find.trim().toLowerCase()) && !fits.includes(m)).slice(0, 10) : [];
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const ICON = { same: "✅", likely: "🟡", check: "⚠️" };
  async function onPhoto(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    setBusy(true); setErr("");
    try { set("imageUrl", await uploadPhoto(f)); } catch (x) { setErr(x.message || "Couldn't upload that photo."); } finally { setBusy(false); }
  }
  function save() {
    if (!String(p.name || "").trim()) return setErr("Name can't be empty.");
    const price = parseFloat(p.sellPrice); if (!price) return setErr("Enter a price.");
    onSave({ ...p, name: p.name.trim(), sellPrice: price, cost: parseFloat(p.cost) || 0, qtyOnHand: parseInt(p.qtyOnHand, 10) || 0,
      compareAtPrice: parseFloat(p.compareAtPrice) || undefined, compatibleWith: fits.join(", ") });
  }
  return (
    <div style={{ border: `2px solid ${brass}`, borderRadius: 14, padding: 14, margin: "6px 0 14px", background: "#FAFBFF" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 16 }}>Edit product</strong>
        <button onClick={onCancel} aria-label="Close editor" style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: muted }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, marginBottom: 10 }}>
        <label style={{ width: 100, height: 100, borderRadius: 12, border: `1.5px dashed ${line}`, background: panel2, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", fontSize: 12.5, color: muted, textAlign: "center" }}>
          {p.imageUrl ? <img src={p.imageUrl} alt="Product" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : busy ? "Uploading…" : <span>📷<br />Add photo</span>}
          <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} aria-label="Change photo" />
        </label>
        <div>
          <input value={p.name} onChange={(e) => set("name", e.target.value)} aria-label="Edit name" style={{ ...input, marginBottom: 8 }} />
          <select value={p.category} onChange={(e) => set("category", e.target.value)} aria-label="Edit category" style={input}>
            {[...new Set([...CATEGORIES, p.category])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {p.imageUrl && <button onClick={() => set("imageUrl", "")} style={{ border: "none", background: "none", color: red, cursor: "pointer", fontSize: 13, marginBottom: 8 }}>Remove photo</button>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5, color: muted }}>Price<input value={p.sellPrice} onChange={(e) => set("sellPrice", e.target.value)} inputMode="decimal" aria-label="Edit price" style={input} /></label>
        <label style={{ fontSize: 12.5, color: muted }}>Was<input value={p.compareAtPrice || ""} onChange={(e) => set("compareAtPrice", e.target.value)} inputMode="decimal" aria-label="Edit was price" style={input} /></label>
        <label style={{ fontSize: 12.5, color: muted }}>Cost<input value={p.cost || ""} onChange={(e) => set("cost", e.target.value)} inputMode="decimal" aria-label="Edit cost" style={input} /></label>
        <label style={{ fontSize: 12.5, color: muted }}>Stock<input value={p.qtyOnHand} onChange={(e) => set("qtyOnHand", e.target.value)} inputMode="numeric" aria-label="Edit stock" style={input} /></label>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Fits ({fits.length})</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {fits.map((m) => <span key={m} style={{ background: "rgba(33,80,200,0.10)", color: brass, borderRadius: 999, padding: "5px 10px", fontSize: 13, fontWeight: 600 }}>{m} <button type="button" aria-label={`Remove ${m}`} onClick={() => setFits(fits.filter((x) => x !== m))} style={{ border: "none", background: "none", color: brass, cursor: "pointer", fontWeight: 800 }}>×</button></span>)}
      </div>
      <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Add a model…" aria-label="Add model to fits" style={{ ...input, marginBottom: 6 }} />
      {hits.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{hits.map((m) => <button key={m} type="button" onClick={() => { setFits([...fits, m]); setFind(""); }} style={btn("transparent", paper, { padding: "6px 10px", fontSize: 13 })}>+ {m}</button>)}</div>}
      {suggestions.length > 0 && <div style={{ fontSize: 13, marginBottom: 10 }}>
        <div style={{ color: muted, marginBottom: 4 }}>🔎 May also fit:</div>
        {suggestions.slice(0, 12).map((x) => <button key={x.model} type="button" title={x.note} onClick={() => setFits([...fits, x.model])} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: paper, display: "block", padding: "2px 0", textAlign: "left" }}>{ICON[x.level]} <strong>+ {x.model}</strong> <span style={{ color: muted }}>— {x.note}</span></button>)}
      </div>}
      <label style={{ fontSize: 12.5, color: muted, display: "block", marginBottom: 8 }}>Description
        <textarea value={p.description || ""} onChange={(e) => set("description", e.target.value)} rows={3} aria-label="Edit description" style={{ ...input, resize: "vertical" }} />
      </label>
      <button type="button" onClick={() => set("description", autoDescription(p.category, fits))} style={{ border: "none", background: "none", color: brass, cursor: "pointer", fontSize: 13, marginBottom: 8, padding: 0 }}>↻ Rewrite description from category &amp; fits</button>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 10 }}>
        <input type="checkbox" checked={p.showOnline !== false} onChange={(e) => set("showOnline", e.target.checked)} /> Show in the online shop
      </label>
      {err && <div style={{ color: red, fontSize: 13.5, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={busy} style={btn(brass, "#fff", { flex: 1, padding: 13 })}>Save product</button>
        <button onClick={onCancel} style={btn("transparent", paper, { padding: 13 })}>Cancel</button>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "26px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, marginBottom: 4 }}>Products</div>
        {children}
      </div>
    </div>
  );
}
function Card({ children }) { return <div style={{ background: panel, border: `1px solid ${line}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>{children}</div>; }
