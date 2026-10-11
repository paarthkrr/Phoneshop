import React, { useEffect, useRef, useState } from "react";

/* "Can't find your device?" — customers ask for a model we don't list yet,
   staff add it to the price list in one go, and the customer is told it's live.

   Flow:
   1. Customer fills DeviceRequestForm (quote page). Saved to "device_requests";
      the owner gets the usual new-submission email.
   2. A daily Claude task reads open requests, looks up the official Australian
      launch prices, and emails the owner a link: /portal/pricing?addDevice=...
   3. That link opens DeviceRequestsTab with the form already filled in. Staff
      check the prices and press "Add to website". Nothing goes live unchecked,
      because these prices decide what we pay out. */

const KEY = "device_requests";
const BRAND_OPTIONS = ["Apple", "Samsung", "Google", "OnePlus", "Xiaomi", "Oppo", "Vivo", "Motorola", "Nothing", "Other"];
const CATEGORIES = [["phone", "Phone"], ["tablet", "Tablet"], ["laptop", "Laptop"], ["watch", "Watch"]];
const CONDITIONS = ["Like new", "Good", "Fair", "Faulty / broken"];
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());
const digits = (v) => (v || "").replace(/[^\d+]/g, "");
const isPhone = (v) => digits(v).replace(/^\+?61/, "0").length >= 8;
const genId = () => "DRQ-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");

async function loadList() {
  try { const r = window.storage && await window.storage.get(KEY, true); const v = r ? JSON.parse(r.value) : []; return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
async function saveList(list) {
  try { await window.storage.set(KEY, JSON.stringify(list), true); return true; } catch (e) { return false; }
}

// Base64url <-> JSON, for the one-click link in the owner's email.
export function decodeAddLink(s) {
  try {
    const b = String(s).replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b + "===".slice((b.length + 3) % 4))));
    const o = JSON.parse(json);
    return o && typeof o === "object" ? o : null;
  } catch (e) { return null; }
}

/* ----------------------------- Customer form ----------------------------- */

export function DeviceRequestForm({ initialQuery = "", onClose }) {
  const guessBrand = () => {
    const q = initialQuery.toLowerCase();
    if (/iphone|ipad|macbook|apple|watch/.test(q)) return "Apple";
    const hit = BRAND_OPTIONS.find((b) => b !== "Other" && q.includes(b.toLowerCase()));
    if (hit) return hit;
    if (/galaxy/.test(q)) return "Samsung";
    if (/pixel/.test(q)) return "Google";
    return "";
  };
  const [f, setF] = useState({ brand: guessBrand(), otherBrand: "", model: initialQuery.trim(), storage: "", condition: "", name: "", email: "", phone: "", note: "", website: "" });
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const brand = f.brand === "Other" ? f.otherBrand.trim() : f.brand;
  const errors = {
    brand: !brand ? "Pick the brand" : "",
    model: f.model.trim().length < 2 ? "Type the model name" : "",
    contact: !isEmail(f.email) && !isPhone(f.phone) ? "Add an email or a mobile number so we can send your price" : "",
    email: f.email.trim() && !isEmail(f.email) ? "That email doesn't look right" : "",
  };
  const ok = !Object.values(errors).some(Boolean);

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (!ok || state === "sending") return;
    if (f.website) { setState("done"); return; } // spam bot filled the hidden field
    setState("sending");
    const record = {
      id: genId(), createdAt: new Date().toISOString(), status: "open",
      brand, model: f.model.trim().slice(0, 80), storage: f.storage.trim().slice(0, 20), condition: f.condition,
      name: f.name.trim().slice(0, 80), email: f.email.trim().slice(0, 120), phone: f.phone.trim().slice(0, 30), note: f.note.trim().slice(0, 400),
      source: typeof window !== "undefined" ? window.location.pathname : "",
    };
    const saved = await saveList([record]);
    setState(saved ? "done" : "error");
  }

  const box = { border: "1px solid #E2E6EC", borderRadius: 16, background: "#fff", padding: 18, marginTop: 12 };
  const input = { width: "100%", padding: "12px 13px", borderRadius: 10, border: "1px solid #E2E6EC", background: "#F7F9FC", fontSize: 15, fontFamily: "inherit", color: "#111827", boxSizing: "border-box", minHeight: 46 };
  const label = { display: "block", fontSize: 12.5, fontWeight: 700, color: "#374151", margin: "0 0 5px" };
  const err = (m) => touched && m ? <div role="alert" style={{ color: "#B42318", fontSize: 12.5, marginTop: 4 }}>{m}</div> : null;

  if (state === "done") {
    return (
      <div style={{ ...box, textAlign: "center", padding: "26px 18px" }} role="status">
        <div aria-hidden="true" style={{ width: 52, height: 52, borderRadius: "50%", background: "#ECFDF5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Got it, we'll price your {brand} {f.model.trim()}</div>
        <div style={{ color: "#5B6472", fontSize: 14, lineHeight: 1.5 }}>We'll {isEmail(f.email) ? "email" : "message"} you as soon as it's on our price list, usually within one business day.</div>
        {onClose && <button type="button" onClick={onClose} style={{ marginTop: 14, border: "none", background: "none", color: "#2150C8", fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 44 }}>Back to search</button>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={box} noValidate aria-label="Ask us to price your device">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Can't find your device?</div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "#F1F3F7", borderRadius: 10, width: 36, height: 36, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>}
      </div>
      <div style={{ color: "#5B6472", fontSize: 13.5, marginBottom: 14, lineHeight: 1.5 }}>Tell us what you have. We'll add it to our price list and send you an offer, no obligation.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div>
          <label style={label} htmlFor="drq-brand">Brand</label>
          <select id="drq-brand" value={f.brand} onChange={set("brand")} style={input}>
            <option value="">Choose…</option>
            {BRAND_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {f.brand === "Other" && <input value={f.otherBrand} onChange={set("otherBrand")} placeholder="Brand name" aria-label="Brand name" style={{ ...input, marginTop: 8 }} />}
          {err(errors.brand)}
        </div>
        <div>
          <label style={label} htmlFor="drq-model">Model</label>
          <input id="drq-model" value={f.model} onChange={set("model")} placeholder="e.g. Galaxy Z Flip6" style={input} autoComplete="off" />
          {err(errors.model)}
        </div>
        <div>
          <label style={label} htmlFor="drq-storage">Storage <span style={{ fontWeight: 400, color: "#6B7280" }}>(if you know)</span></label>
          <input id="drq-storage" value={f.storage} onChange={set("storage")} placeholder="e.g. 256GB" style={input} autoComplete="off" />
        </div>
      </div>

      <div style={{ margin: "14px 0 4px", fontSize: 12.5, fontWeight: 700, color: "#374151" }}>Condition <span style={{ fontWeight: 400, color: "#6B7280" }}>(optional)</span></div>
      <div role="radiogroup" aria-label="Condition" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CONDITIONS.map((c) => (
          <button type="button" key={c} role="radio" aria-checked={f.condition === c} onClick={() => setF({ ...f, condition: f.condition === c ? "" : c })}
            style={{ minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${f.condition === c ? "#2150C8" : "#E2E6EC"}`, background: f.condition === c ? "#EEF3FF" : "#fff", color: f.condition === c ? "#2150C8" : "#111827", fontWeight: f.condition === c ? 700 : 500 }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 14 }}>
        <div>
          <label style={label} htmlFor="drq-name">Your name</label>
          <input id="drq-name" value={f.name} onChange={set("name")} autoComplete="name" style={input} />
        </div>
        <div>
          <label style={label} htmlFor="drq-email">Email</label>
          <input id="drq-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" inputMode="email" style={input} />
          {err(errors.email)}
        </div>
        <div>
          <label style={label} htmlFor="drq-phone">Mobile</label>
          <input id="drq-phone" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" style={input} />
        </div>
      </div>
      {err(errors.contact)}
      {/* Hidden from people; bots tend to fill every field. */}
      <input type="text" name="website" value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />

      <label style={{ ...label, marginTop: 14 }} htmlFor="drq-note">Anything else? <span style={{ fontWeight: 400, color: "#6B7280" }}>(optional)</span></label>
      <textarea id="drq-note" value={f.note} onChange={set("note")} rows={2} placeholder="e.g. cracked back, battery 85%" style={{ ...input, minHeight: 64, resize: "vertical" }} />

      <button type="submit" disabled={state === "sending"} className="fx-shimmer"
        style={{ marginTop: 14, width: "100%", minHeight: 50, border: "none", borderRadius: 12, background: "#2150C8", color: "#fff", fontWeight: 800, fontSize: 15.5, cursor: state === "sending" ? "default" : "pointer", fontFamily: "inherit", opacity: state === "sending" ? 0.7 : 1 }}>
        {state === "sending" ? "Sending…" : "Get my price"}
      </button>
      {state === "error" && <div role="alert" style={{ color: "#B42318", fontSize: 13, marginTop: 8 }}>That didn't go through. Check your connection and try again, or message us on WhatsApp.</div>}
      <div style={{ color: "#6B7280", fontSize: 12, marginTop: 8 }}>We only use your details to send this price.</div>
    </form>
  );
}

/* ------------------------------ Staff screen ------------------------------ */

const keyOf = (brand, model) => `${brand}|${model}`.toLowerCase().replace(/\s+/g, " ").trim();

export function DeviceRequestsTab({ catalog, onAddDevice, colors, prefill }) {
  const { panel2, paper, muted, brass, brassDim, red, green, line } = colors;
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null); // the device being added
  const [msg, setMsg] = useState("");
  const [showDone, setShowDone] = useState(false);

  useEffect(() => { (async () => setList(await loadList()))(); }, []);

  // Opened from the emailed one-click link (fill the form once, not after every save).
  const prefillUsed = useRef(false);
  useEffect(() => {
    if (!prefill || !list || prefillUsed.current) return;
    prefillUsed.current = true;
    const req = prefill.requestId ? list.find((r) => r.id === prefill.requestId) : null;
    startAdd(req || null, prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, list]);

  const inCatalog = (brand, model) => (catalog || []).find((d) => keyOf(d.brand, d.model) === keyOf(brand, model) || keyOf("", d.model) === keyOf("", model));

  function startAdd(req, suggestion) {
    const s = suggestion || (req && req.suggestion) || {};
    const retail = s.retail && typeof s.retail === "object" ? Object.entries(s.retail).map(([size, price]) => ({ size, price: String(price) })) : [{ size: (req && req.storage) || "", price: "" }];
    setForm({
      requestId: req ? req.id : s.requestId || null,
      brand: s.brand || (req && req.brand) || "", model: s.model || (req && req.model) || "",
      category: s.category || "phone", release: s.release || "",
      retail: retail.length ? retail : [{ size: "", price: "" }],
      sources: Array.isArray(s.sources) ? s.sources.slice(0, 5) : [], researched: !!(s.retail && Object.keys(s.retail).length), notes: s.notes || "",
    });
    setMsg("");
  }

  async function markRequest(id, patch) {
    const fresh = await loadList();
    const next = fresh.map((r) => (r.id === id ? { ...r, ...patch } : r));
    await saveList(next);
    setList(next);
  }

  async function tellCustomer(req, device) {
    if (!req || !isEmail(req.email)) return false;
    const url = `${window.location.origin}/quote?q=${encodeURIComponent(device.model)}`;
    const item = {
      id: "NTF-" + Date.now().toString(36).toUpperCase(), createdAt: new Date().toISOString(), status: "pending", type: "device_added", channel: "email",
      recipientEmail: req.email, recipientName: req.name || "",
      subject: `We now buy the ${device.brand === "Apple" ? device.model : `${device.brand} ${device.model}`}`,
      message: `Hi${req.name ? ` ${req.name.split(" ")[0]}` : ""}, thanks for asking. Your ${device.brand} ${device.model} is now on our price list. Get your instant price here: ${url}`,
      relatedId: req.id,
    };
    try {
      let q = [];
      try { const r = await window.storage.get("notification_queue", true); q = r ? JSON.parse(r.value) : []; } catch (e) { q = []; } // none queued yet
      await window.storage.set("notification_queue", JSON.stringify([item, ...(Array.isArray(q) ? q : [])]), true);
      return true;
    } catch (e) { return false; }
  }

  async function save() {
    const retail = {};
    for (const r of form.retail) {
      const size = r.size.trim().toUpperCase().replace(/\s+/g, "");
      const price = Math.round(parseFloat(String(r.price).replace(/[$,]/g, "")));
      if (size && price > 0) retail[size] = price;
    }
    if (!form.brand.trim() || !form.model.trim()) { setMsg("Brand and model are needed."); return; }
    if (!Object.keys(retail).length) { setMsg("Add at least one storage size with its new retail price (AUD)."); return; }
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(form.release)) { setMsg("Add the launch date (YYYY-MM or YYYY-MM-DD). It sets how much the price has dropped since launch."); return; }
    const existing = inCatalog(form.brand, form.model);
    if (existing) { setMsg(`${existing.brand} ${existing.model} is already on the website. Use the Catalog tab to change its prices.`); return; }
    const device = {
      brand: form.brand.trim(), model: form.model.trim(), category: form.category,
      release: form.release.length === 7 ? `${form.release}-01` : form.release, retail,
      addedFrom: form.requestId || "manual", marketCheckedAt: new Date().toISOString(),
    };
    setMsg("Saving…");
    const ok = await onAddDevice(device);
    if (!ok) { setMsg("Couldn't save. Try again."); return; }
    let told = false;
    if (form.requestId) {
      const req = (list || []).find((r) => r.id === form.requestId);
      told = await tellCustomer(req, device);
      await markRequest(form.requestId, { status: "added", addedAt: new Date().toISOString(), addedModel: `${device.brand} ${device.model}`, customerEmailed: told });
    }
    setForm(null);
    setMsg(`${device.brand} ${device.model} is live on the quote page.${told ? " The customer has been emailed." : form.requestId ? " No email on file: message them using the buttons on the request." : ""}`);
    try { const u = new URL(window.location.href); u.searchParams.delete("addDevice"); window.history.replaceState(null, "", u.toString()); } catch (e) { /* ignore */ }
  }

  const input = { padding: "8px 10px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
  const btn = (c, filled) => ({ padding: "7px 12px", borderRadius: 3, fontSize: 12.5, cursor: "pointer", border: `1px solid ${c}`, background: filled ? c : "transparent", color: filled ? "#fff" : c, fontFamily: "inherit" });

  if (!list) return <div style={{ color: muted, fontSize: 13 }}>Loading requests…</div>;
  const open = list.filter((r) => r.status === "open");
  const done = list.filter((r) => r.status !== "open");

  return (
    <div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14, lineHeight: 1.5 }}>
        Devices customers asked about that aren't on the website yet. Add one and it appears on the quote page straight away, priced by the same formula as everything else.
        When the daily Claude check is on, it researches the official Australian launch prices for new requests and emails you a link that fills this form in. Always check the prices before you save: they decide what we pay.
      </div>
      {msg && <div role="status" style={{ border: `1px solid ${line}`, borderRadius: 3, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: /live/.test(msg) ? green : paper }}>{msg}</div>}

      {form && (
        <div style={{ border: `1px solid ${brass}`, borderRadius: 4, padding: 14, marginBottom: 18, background: "#FAFBFF" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Add a device to the website</div>
          {form.researched && (
            <div style={{ fontSize: 12.5, color: brass, background: brassDim, borderRadius: 3, padding: "8px 10px", marginBottom: 10 }}>
              Prices below were researched by Claude{form.sources.length ? " from:" : "."} {form.sources.map((s, i) => <a key={i} href={s} target="_blank" rel="noopener noreferrer" style={{ color: brass, marginRight: 8, wordBreak: "break-all" }}>{(() => { try { return new URL(s).hostname; } catch (e) { return "source"; } })()}</a>)}
              {form.notes && <div style={{ color: paper, marginTop: 4 }}>{form.notes}</div>}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: muted }}>Brand<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} style={{ ...input, width: "100%" }} /></label>
            <label style={{ fontSize: 12, color: muted }}>Model<input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} style={{ ...input, width: "100%" }} /></label>
            <label style={{ fontSize: 12, color: muted }}>Type
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ ...input, width: "100%" }}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: muted }}>Launch date<input value={form.release} onChange={(e) => setForm({ ...form, release: e.target.value })} placeholder="YYYY-MM-DD" style={{ ...input, width: "100%" }} /></label>
          </div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>New retail price in Australia at launch (AUD), per storage size</div>
          {form.retail.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input value={r.size} onChange={(e) => { const retail = [...form.retail]; retail[i] = { ...r, size: e.target.value }; setForm({ ...form, retail }); }} placeholder="256GB" aria-label="Storage size" style={{ ...input, width: 100 }} />
              <input value={r.price} onChange={(e) => { const retail = [...form.retail]; retail[i] = { ...r, price: e.target.value }; setForm({ ...form, retail }); }} placeholder="1499" inputMode="decimal" aria-label="Retail price" style={{ ...input, width: 100 }} />
              {form.retail.length > 1 && <button type="button" onClick={() => setForm({ ...form, retail: form.retail.filter((_, j) => j !== i) })} style={btn(red)} aria-label="Remove size">Remove</button>}
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, retail: [...form.retail, { size: "", price: "" }] })} style={{ ...btn(brass), marginBottom: 12 }}>+ Size</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={save} style={btn(green, true)}>Add to website</button>
            <button type="button" onClick={() => { setForm(null); setMsg(""); }} style={btn(muted)}>Cancel</button>
          </div>
        </div>
      )}

      {!form && <button type="button" onClick={() => startAdd(null, null)} style={{ ...btn(brass), marginBottom: 14 }}>+ Add a device without a request</button>}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Open requests ({open.length})</div>
      {open.length === 0 && <div style={{ color: muted, fontSize: 13, marginBottom: 14 }}>Nothing waiting.</div>}
      {open.map((r) => {
        const have = inCatalog(r.brand, r.model);
        const smsBody = encodeURIComponent(`Hi${r.name ? ` ${r.name.split(" ")[0]}` : ""}, Mobile Recellr here. Your ${r.brand} ${r.model} is now on our price list: ${window.location.origin}/quote?q=${encodeURIComponent(have ? have.model : r.model)}`);
        return (
          <div key={r.id} style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>{r.brand} {r.model}{r.storage ? ` · ${r.storage}` : ""}</strong>
              <span style={{ fontSize: 12, color: muted }}>{new Date(r.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            <div style={{ fontSize: 12.5, color: muted, margin: "4px 0 8px" }}>
              {[r.condition, r.name, r.email, r.phone].filter(Boolean).join(" · ")}{r.note ? ` · "${r.note}"` : ""}
            </div>
            {have && <div style={{ fontSize: 12.5, color: green, marginBottom: 8 }}>Already on the website as {have.brand} {have.model}. Let the customer know.</div>}
            {r.suggestion && !have && <div style={{ fontSize: 12.5, color: brass, marginBottom: 8 }}>Claude has researched prices for this one.</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {!have && <button type="button" onClick={() => startAdd(r, null)} style={btn(green, true)}>Add to website</button>}
              {r.phone && <a href={`sms:${digits(r.phone)}?&body=${smsBody}`} style={{ ...btn(brass), textDecoration: "none" }}>Text</a>}
              {r.phone && <a href={`https://wa.me/${digits(r.phone).replace(/^0/, "61").replace(/^\+/, "")}?text=${smsBody}`} target="_blank" rel="noopener noreferrer" style={{ ...btn(brass), textDecoration: "none" }}>WhatsApp</a>}
              {r.email && <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Your ${r.brand} ${r.model}`)}&body=${smsBody}`} style={{ ...btn(brass), textDecoration: "none" }}>Email</a>}
              {have && <button type="button" onClick={() => markRequest(r.id, { status: "added", addedAt: new Date().toISOString(), addedModel: `${have.brand} ${have.model}` })} style={btn(green)}>Mark done</button>}
              <button type="button" onClick={() => markRequest(r.id, { status: "declined", closedAt: new Date().toISOString() })} style={btn(muted)}>We don't buy this</button>
            </div>
          </div>
        );
      })}

      {done.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => setShowDone(!showDone)} style={{ border: "none", background: "none", color: brass, fontSize: 13, cursor: "pointer", padding: 0 }}>
            {showDone ? "Hide" : "Show"} finished ({done.length})
          </button>
          {showDone && done.slice(0, 50).map((r) => (
            <div key={r.id} style={{ fontSize: 12.5, color: muted, padding: "6px 0", borderBottom: `1px solid ${line}` }}>
              {r.brand} {r.model} · {r.status === "added" ? `added${r.customerEmailed ? ", customer emailed" : ""}` : "not bought"} · {new Date(r.addedAt || r.closedAt || r.createdAt).toLocaleDateString("en-AU")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
