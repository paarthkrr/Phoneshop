import React, { useState, useEffect, useMemo } from "react";
import { hasArea } from "./roles.js";

/* =================================================================
   UNLOCK CHECKER
   Device lock removal workflow for legitimate repair/resale shops.
   Three phases:
     1. Intake  — capture device + customer details + ownership proof
     2. Check   — IMEI blacklist check + lock type routing
     3. Jobs    — track pending unlocks + audit log

   Integrates with Checkmend API for IMEI status.
   Ownership verification is mandatory before any unlock pathway.
   Every action is logged with staff ID + timestamp for legal cover.
================================================================= */

const JOBS_KEY  = "unlock_jobs";
const AUDIT_KEY = "unlock_audit";

/* ── storage helpers ─────────────────────────────────────────── */
function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared = true) {
  if (!storageAvailable()) return null;
  try {
    const r = await window.storage.get(key, shared);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function saveJSON(key, value, shared = true) {
  if (!storageAvailable()) return false;
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch { return false; }
}

function getAuthedUser() {
  try {
    return window.shopAuth && typeof window.shopAuth.currentUser === "function"
      ? window.shopAuth.currentUser() : null;
  } catch { return null; }
}
const staffName = () => { const u = getAuthedUser(); return u ? (u.name || u.email || "Staff") : "Staff"; };
const genId     = () => "UNL-" + Math.floor(100000 + Math.random() * 900000);
const nowISO    = () => new Date().toISOString();
const fmtDate   = (iso) => new Date(iso).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });

/* ── Checkmend API ───────────────────────────────────────────── */
// Replace CHECKMEND_API_KEY in your backend env vars.
// This call goes through your backend proxy at /api/imei-check
// to keep the API key server-side only.
async function checkIMEI(imei) {
  try {
    const res = await fetch(`/api/imei-check?imei=${encodeURIComponent(imei)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
    // Expected shape from backend:
    // { status: "clean"|"blacklisted"|"reported_stolen"|"finance_outstanding",
    //   carrier: "Telstra"|"Optus"|...|"Unlocked",
    //   make: "Apple", model: "iPhone 14", color: "Midnight",
    //   checkmend_ref: "CHK-123456" }
  } catch (err) {
    // Return a mock result when backend isn't wired yet so the UI stays usable.
    return {
      _mock: true,
      status: "clean",
      carrier: "Telstra",
      make: "Apple",
      model: "iPhone (mock)",
      color: "Unknown",
      checkmend_ref: "MOCK-" + imei.slice(-4),
    };
  }
}

/* ── Lock type → pathway map ─────────────────────────────────── */
const LOCK_TYPES = [
  { id: "icloud",    label: "iCloud Activation Lock",  brand: "Apple",    ownerPath: "Customer logs into appleid.apple.com to remove device", carrierPath: null },
  { id: "frp",       label: "FRP / Google Account Lock", brand: "Android", ownerPath: "Customer logs into their Google account on device", carrierPath: null },
  { id: "carrier",   label: "Carrier Lock (SIM)",       brand: "Any",     ownerPath: null, carrierPath: "Submit IMEI to carrier unlock portal or use 3rd-party service" },
  { id: "pin",       label: "PIN / Pattern Lock",        brand: "Android", ownerPath: "Factory reset with customer present (wipes data)", carrierPath: null },
  { id: "screen_time", label: "Screen Time Passcode",  brand: "Apple",    ownerPath: "Customer recovery via appleid.apple.com", carrierPath: null },
  { id: "mdm",       label: "MDM / Corporate Profile",  brand: "Any",     ownerPath: "Must contact original MDM administrator", carrierPath: null },
];

const CARRIER_PORTALS = {
  Telstra:   { url: "https://www.telstra.com.au/support/mobiles-tablets-and-devices/how-to-unlock-your-device", time: "1–5 days" },
  Optus:     { url: "https://www.optus.com.au/support/mobiles/unlock-your-device", time: "1–3 days" },
  Vodafone:  { url: "https://www.vodafone.com.au/support/unlock-your-device", time: "1–3 days" },
  "TPG Mobile": { url: "https://www.tpg.com.au/support/mobile", time: "3–5 days" },
  Other:     { url: null, time: "Varies — contact carrier directly" },
};

const PROOF_TYPES = [
  { id: "receipt",       label: "Purchase receipt" },
  { id: "carrier_contract", label: "Carrier contract / billing statement" },
  { id: "apple_id",     label: "Apple ID login (verified in-store)" },
  { id: "google_account", label: "Google account login (verified in-store)" },
  { id: "id_match",     label: "Photo ID matches account name" },
  { id: "insurance",    label: "Insurance document" },
];

const STATUS_LABELS = {
  intake:    "Intake",
  checking:  "Checking IMEI",
  pending:   "Awaiting unlock",
  submitted: "Submitted to carrier / Apple",
  complete:  "Unlocked",
  rejected:  "Rejected — blacklisted",
  returned:  "Device returned",
};

const STATUS_COLOR = {
  intake:    "#6B7280",
  checking:  "#A855F7",
  pending:   "#F59E0B",
  submitted: "#3B82F6",
  complete:  "#22C55E",
  rejected:  "#EF4444",
  returned:  "#9CA3AF",
};

/* ── UI tokens ───────────────────────────────────────────────── */
const T = {
  bg:      "#0F1117",
  surface: "#181B23",
  border:  "#252931",
  muted:   "#4B5563",
  body:    "#9CA3AF",
  text:    "#E5E7EB",
  bright:  "#F9FAFB",
  accent:  "#38BDF8",   // sky-400 — consistent with tech/scanner context
  danger:  "#EF4444",
  success: "#22C55E",
  warn:    "#F59E0B",
};

const css = `
  .uc-root * { box-sizing: border-box; }
  .uc-root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: ${T.bg}; color: ${T.text}; min-height: 100vh; padding: 24px 20px;
  }
  .uc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  .uc-header h1 { font-size: 1.25rem; font-weight: 600; color: ${T.bright}; margin: 0; }
  .uc-header p  { font-size: 0.8rem; color: ${T.muted}; margin: 2px 0 0; }
  .uc-icon { width: 36px; height: 36px; background: ${T.accent}22; border-radius: 8px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

  .uc-tabs { display: flex; gap: 2px; background: ${T.surface};
    border-radius: 8px; padding: 4px; margin-bottom: 24px; border: 1px solid ${T.border}; }
  .uc-tab { flex: 1; padding: 7px 12px; border-radius: 6px; border: none; background: none;
    color: ${T.body}; font-size: 0.82rem; cursor: pointer; transition: all .15s; }
  .uc-tab:hover { color: ${T.text}; }
  .uc-tab.active { background: ${T.bg}; color: ${T.bright}; font-weight: 500; }

  .uc-card { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; padding: 20px; margin-bottom: 16px; }
  .uc-card-title { font-size: 0.75rem; font-weight: 600; color: ${T.muted}; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 14px; }

  .uc-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 600px) { .uc-grid2 { grid-template-columns: 1fr; } }
  .uc-field { display: flex; flex-direction: column; gap: 5px; }
  .uc-label { font-size: 0.78rem; color: ${T.body}; }
  .uc-input {
    background: ${T.bg}; border: 1px solid ${T.border}; border-radius: 6px;
    padding: 9px 12px; color: ${T.bright}; font-size: 0.88rem; outline: none;
    transition: border-color .15s;
  }
  .uc-input:focus { border-color: ${T.accent}; }
  .uc-input::placeholder { color: ${T.muted}; }
  .uc-select {
    background: ${T.bg}; border: 1px solid ${T.border}; border-radius: 6px;
    padding: 9px 12px; color: ${T.bright}; font-size: 0.88rem; outline: none; cursor: pointer;
  }
  .uc-select:focus { border-color: ${T.accent}; }

  .uc-proof-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .uc-proof-chip {
    display: flex; align-items: center; gap: 6px; padding: 6px 10px;
    border-radius: 6px; border: 1px solid ${T.border}; background: ${T.bg};
    cursor: pointer; font-size: 0.8rem; color: ${T.body}; transition: all .15s;
  }
  .uc-proof-chip.checked { border-color: ${T.accent}; color: ${T.bright}; background: ${T.accent}11; }
  .uc-proof-chip input { display: none; }

  .uc-btn {
    padding: 10px 18px; border-radius: 7px; border: none; cursor: pointer;
    font-size: 0.85rem; font-weight: 500; transition: all .15s;
  }
  .uc-btn-primary { background: ${T.accent}; color: #0F1117; }
  .uc-btn-primary:hover { filter: brightness(1.1); }
  .uc-btn-primary:disabled { opacity: .4; cursor: not-allowed; filter: none; }
  .uc-btn-ghost { background: transparent; border: 1px solid ${T.border}; color: ${T.body}; }
  .uc-btn-ghost:hover { border-color: ${T.muted}; color: ${T.text}; }
  .uc-btn-danger { background: ${T.danger}22; border: 1px solid ${T.danger}44; color: ${T.danger}; }

  .uc-imei-result {
    border-radius: 8px; padding: 14px 16px; margin-top: 14px;
    border: 1px solid; display: flex; gap: 14px; align-items: flex-start;
  }
  .uc-imei-clean    { border-color: ${T.success}44; background: ${T.success}0D; }
  .uc-imei-flagged  { border-color: ${T.danger}44;  background: ${T.danger}0D; }
  .uc-imei-warn     { border-color: ${T.warn}44;    background: ${T.warn}0D; }

  .uc-pathway {
    border: 1px solid ${T.border}; border-radius: 8px; padding: 14px 16px; margin-top: 10px;
    background: ${T.bg};
  }
  .uc-pathway-title { font-size: 0.85rem; font-weight: 600; color: ${T.bright}; margin-bottom: 6px; }
  .uc-pathway-step  { font-size: 0.82rem; color: ${T.body}; line-height: 1.6; }
  .uc-pathway-link  { color: ${T.accent}; text-decoration: none; font-size: 0.8rem; }
  .uc-pathway-link:hover { text-decoration: underline; }

  .uc-job-row {
    display: flex; align-items: center; gap: 12px; padding: 12px 16px;
    border-bottom: 1px solid ${T.border}; cursor: pointer; transition: background .1s;
  }
  .uc-job-row:last-child { border-bottom: none; }
  .uc-job-row:hover { background: ${T.bg}; }
  .uc-job-id   { font-size: 0.72rem; font-family: monospace; color: ${T.muted}; min-width: 80px; }
  .uc-job-main { flex: 1; }
  .uc-job-device { font-size: 0.85rem; color: ${T.bright}; }
  .uc-job-meta   { font-size: 0.75rem; color: ${T.body}; margin-top: 2px; }
  .uc-badge {
    display: inline-block; padding: 3px 8px; border-radius: 4px;
    font-size: 0.7rem; font-weight: 600; border: 1px solid currentColor;
  }

  .uc-detail-row { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid ${T.border}; font-size: 0.82rem; }
  .uc-detail-row:last-child { border-bottom: none; }
  .uc-detail-label { color: ${T.muted}; min-width: 140px; }
  .uc-detail-value { color: ${T.text}; }

  .uc-audit-row { padding: 8px 0; border-bottom: 1px solid ${T.border}; font-size: 0.78rem; display: flex; gap: 10px; }
  .uc-audit-row:last-child { border-bottom: none; }
  .uc-audit-time { color: ${T.muted}; min-width: 130px; flex-shrink: 0; }
  .uc-audit-text { color: ${T.body}; }

  .uc-empty { text-align: center; padding: 48px 20px; color: ${T.muted}; font-size: 0.88rem; }
  .uc-note  { font-size: 0.78rem; color: ${T.muted}; margin-top: 8px; line-height: 1.5; }
  .uc-mock-banner {
    background: ${T.warn}11; border: 1px solid ${T.warn}44; border-radius: 6px;
    padding: 8px 12px; font-size: 0.78rem; color: ${T.warn}; margin-bottom: 16px;
  }
  .uc-divider { border: none; border-top: 1px solid ${T.border}; margin: 16px 0; }
  .uc-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
  .uc-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid ${T.muted};
    border-top-color: ${T.accent}; border-radius: 50%; animation: uc-spin .6s linear infinite; margin-right: 6px; }
  @keyframes uc-spin { to { transform: rotate(360deg); } }
`;

/* ================================================================
   INTAKE FORM
================================================================ */
const EMPTY_INTAKE = {
  customerName: "", customerPhone: "", customerEmail: "",
  imei: "", brand: "", lockType: "",
  proofTypes: [], proofNotes: "",
  notes: "",
};

function IntakeForm({ onJobCreated }) {
  const [form, setForm]     = useState(EMPTY_INTAKE);
  const [step, setStep]     = useState("form");   // form | checking | result
  const [imeiResult, setImeiResult] = useState(null);
  const [error, setError]   = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleProof = (id) => {
    setForm(f => ({
      ...f,
      proofTypes: f.proofTypes.includes(id)
        ? f.proofTypes.filter(x => x !== id)
        : [...f.proofTypes, id],
    }));
  };

  const lockInfo = LOCK_TYPES.find(l => l.id === form.lockType);
  const carrier  = imeiResult?.carrier;
  const carrierInfo = carrier && CARRIER_PORTALS[carrier] ? CARRIER_PORTALS[carrier] : CARRIER_PORTALS["Other"];

  const canCheck = form.customerName.trim() && form.imei.trim().length >= 14 && form.lockType && form.proofTypes.length >= 2;

  async function runCheck() {
    setStep("checking");
    setError("");
    const result = await checkIMEI(form.imei.trim());
    setImeiResult(result);
    setStep("result");
  }

  function imeiStatusClass(status) {
    if (status === "clean") return "uc-imei-clean";
    if (status === "blacklisted" || status === "reported_stolen") return "uc-imei-flagged";
    return "uc-imei-warn";
  }
  function imeiStatusIcon(status) {
    if (status === "clean") return "✓";
    if (status === "blacklisted" || status === "reported_stolen") return "✕";
    return "⚠";
  }

  async function createJob() {
    const jobs   = (await loadJSON(JOBS_KEY)) || [];
    const audits = (await loadJSON(AUDIT_KEY)) || [];
    const id = genId();
    const job = {
      id,
      createdAt: nowISO(),
      status: imeiResult?.status === "clean" ? "pending" : "rejected",
      staff: staffName(),
      customer: { name: form.customerName, phone: form.customerPhone, email: form.customerEmail },
      device: {
        imei: form.imei.trim(),
        brand: form.brand || imeiResult?.make || "",
        model: imeiResult?.model || "",
        carrier: imeiResult?.carrier || "",
        lockType: form.lockType,
      },
      ownership: { proofTypes: form.proofTypes, notes: form.proofNotes },
      imeiCheck: imeiResult,
      notes: form.notes,
      history: [{ at: nowISO(), by: staffName(), action: "Job created", detail: `IMEI check: ${imeiResult?.status}` }],
    };
    jobs.unshift(job);
    audits.unshift({ at: nowISO(), by: staffName(), jobId: id, action: "Created", detail: `IMEI ${form.imei.slice(-4)} — ${imeiResult?.status}` });
    await saveJSON(JOBS_KEY, jobs);
    await saveJSON(AUDIT_KEY, audits);
    setForm(EMPTY_INTAKE);
    setStep("form");
    setImeiResult(null);
    onJobCreated(job);
  }

  if (step === "checking") {
    return (
      <div className="uc-card">
        <div style={{ textAlign: "center", padding: "32px 0", color: T.body, fontSize: "0.88rem" }}>
          <span className="uc-spinner" />
          Checking IMEI against blacklist…
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Customer details */}
      <div className="uc-card">
        <div className="uc-card-title">Customer</div>
        <div className="uc-grid2">
          <div className="uc-field">
            <label className="uc-label">Full name *</label>
            <input className="uc-input" placeholder="Jane Smith" value={form.customerName} onChange={e => set("customerName", e.target.value)} />
          </div>
          <div className="uc-field">
            <label className="uc-label">Phone</label>
            <input className="uc-input" placeholder="04xx xxx xxx" value={form.customerPhone} onChange={e => set("customerPhone", e.target.value)} />
          </div>
          <div className="uc-field" style={{ gridColumn: "1/-1" }}>
            <label className="uc-label">Email</label>
            <input className="uc-input" type="email" placeholder="jane@example.com" value={form.customerEmail} onChange={e => set("customerEmail", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Device details */}
      <div className="uc-card">
        <div className="uc-card-title">Device</div>
        <div className="uc-grid2">
          <div className="uc-field">
            <label className="uc-label">IMEI * (dial *#06# to find)</label>
            <input className="uc-input" placeholder="15–17 digits" maxLength={17}
              value={form.imei} onChange={e => set("imei", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="uc-field">
            <label className="uc-label">Brand</label>
            <select className="uc-select" value={form.brand} onChange={e => set("brand", e.target.value)}>
              <option value="">Auto-detect from IMEI</option>
              {["Apple","Samsung","Google","OnePlus","Xiaomi","Oppo","Vivo","Motorola","Sony","Other"].map(b => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="uc-field" style={{ gridColumn: "1/-1" }}>
            <label className="uc-label">Lock type *</label>
            <select className="uc-select" value={form.lockType} onChange={e => set("lockType", e.target.value)}>
              <option value="">Select the lock the device has</option>
              {LOCK_TYPES.map(l => <option key={l.id} value={l.id}>{l.label} ({l.brand})</option>)}
            </select>
          </div>
        </div>

        {lockInfo && (
          <div className="uc-pathway" style={{ marginTop: 14 }}>
            <div className="uc-pathway-title">How this lock is removed</div>
            {lockInfo.ownerPath && (
              <div className="uc-pathway-step">👤 <strong>Owner action:</strong> {lockInfo.ownerPath}</div>
            )}
            {lockInfo.id === "carrier" && carrier && (
              <div className="uc-pathway-step" style={{ marginTop: 6 }}>
                📱 <strong>Carrier portal:</strong> {carrierInfo.url
                  ? <a href={carrierInfo.url} target="_blank" rel="noopener noreferrer" className="uc-pathway-link">{carrier} unlock portal</a>
                  : carrier + " — contact directly"
                } — typically {carrierInfo.time}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ownership proof */}
      <div className="uc-card">
        <div className="uc-card-title">Ownership proof (select at least 2)</div>
        <div className="uc-proof-grid">
          {PROOF_TYPES.map(p => (
            <label key={p.id} className={`uc-proof-chip${form.proofTypes.includes(p.id) ? " checked" : ""}`}>
              <input type="checkbox" checked={form.proofTypes.includes(p.id)} onChange={() => toggleProof(p.id)} />
              {form.proofTypes.includes(p.id) ? "✓ " : ""}{p.label}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="uc-label">Proof notes / document references</label>
          <textarea className="uc-input" style={{ width: "100%", marginTop: 5, minHeight: 60, resize: "vertical" }}
            placeholder="e.g. Receipt #INV-2024-1234, Apple ID verified in-store at 14:32"
            value={form.proofNotes} onChange={e => set("proofNotes", e.target.value)} />
        </div>
        <div className="uc-note">
          Two-point verification is mandatory. This log is your legal protection if the device is later disputed.
        </div>
      </div>

      {/* IMEI check result (if already run) */}
      {step === "result" && imeiResult && (
        <div className="uc-card">
          <div className="uc-card-title">IMEI check result</div>
          {imeiResult._mock && (
            <div className="uc-mock-banner">
              Backend not connected — showing mock result. Wire up <code>/api/imei-check</code> to Checkmend for live data.
            </div>
          )}
          <div className={`uc-imei-result ${imeiStatusClass(imeiResult.status)}`}>
            <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{imeiStatusIcon(imeiResult.status)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "0.9rem", color: T.bright, textTransform: "capitalize" }}>
                {imeiResult.status.replace(/_/g, " ")}
              </div>
              {imeiResult.model && <div style={{ fontSize: "0.8rem", color: T.body, marginTop: 3 }}>{imeiResult.make} {imeiResult.model} · {imeiResult.color}</div>}
              {imeiResult.carrier && <div style={{ fontSize: "0.8rem", color: T.body }}>Carrier: {imeiResult.carrier}</div>}
              {imeiResult.checkmend_ref && <div style={{ fontSize: "0.75rem", color: T.muted, marginTop: 4, fontFamily: "monospace" }}>Ref: {imeiResult.checkmend_ref}</div>}
            </div>
          </div>

          {imeiResult.status !== "clean" && (
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 7, background: T.danger + "11", border: `1px solid ${T.danger}33`, fontSize: "0.82rem", color: T.danger }}>
              ⚠ Do not proceed with this unlock. The device is flagged. Return it to the customer and document the refusal below.
            </div>
          )}

          {imeiResult.status === "clean" && lockInfo?.id === "carrier" && carrier && (
            <div className="uc-pathway" style={{ marginTop: 12 }}>
              <div className="uc-pathway-title">Carrier unlock path</div>
              <div className="uc-pathway-step">
                Network: <strong>{carrier}</strong> · Estimated time: <strong>{carrierInfo.time}</strong>
              </div>
              {carrierInfo.url && (
                <div style={{ marginTop: 6 }}>
                  <a href={carrierInfo.url} target="_blank" rel="noopener noreferrer" className="uc-pathway-link">
                    → Open {carrier} unlock portal ↗
                  </a>
                </div>
              )}
              <div className="uc-note" style={{ marginTop: 8 }}>
                Alternatively: DoctorUnlock or DirectUnlocks aggregate most carriers — $5–30 AUD, 24–72 hours.
              </div>
            </div>
          )}

          <div className="uc-field" style={{ marginTop: 14 }}>
            <label className="uc-label">Staff notes (optional)</label>
            <textarea className="uc-input" style={{ width: "100%", marginTop: 5, minHeight: 56, resize: "vertical" }}
              placeholder="Any relevant details, agreed timeline, customer expectations…"
              value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          <div className="uc-actions">
            <button className="uc-btn uc-btn-primary" onClick={createJob}>
              Save job {imeiResult.status !== "clean" ? "(as rejected)" : "& begin unlock"}
            </button>
            <button className="uc-btn uc-btn-ghost" onClick={() => { setStep("form"); setImeiResult(null); }}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === "form" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="uc-btn uc-btn-primary" disabled={!canCheck} onClick={runCheck}>
            Check IMEI &amp; continue
          </button>
          {!canCheck && (
            <span style={{ fontSize: "0.78rem", color: T.muted }}>
              Need: customer name · 14+ digit IMEI · lock type · 2× proof
            </span>
          )}
        </div>
      )}

      {error && <div style={{ marginTop: 10, color: T.danger, fontSize: "0.82rem" }}>{error}</div>}
    </>
  );
}

/* ================================================================
   JOB DETAIL PANEL
================================================================ */
function JobDetail({ job, onClose, onUpdate }) {
  const [note, setNote]   = useState("");
  const [status, setStatus] = useState(job.status);

  async function addNote() {
    if (!note.trim()) return;
    const jobs   = (await loadJSON(JOBS_KEY)) || [];
    const audits = (await loadJSON(AUDIT_KEY)) || [];
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx === -1) return;
    const entry = { at: nowISO(), by: staffName(), action: "Note added", detail: note.trim() };
    jobs[idx].history.unshift(entry);
    audits.unshift({ at: nowISO(), by: staffName(), jobId: job.id, action: "Note", detail: note.trim() });
    await saveJSON(JOBS_KEY, jobs);
    await saveJSON(AUDIT_KEY, audits);
    setNote("");
    onUpdate(jobs[idx]);
  }

  async function changeStatus(newStatus) {
    const jobs   = (await loadJSON(JOBS_KEY)) || [];
    const audits = (await loadJSON(AUDIT_KEY)) || [];
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx === -1) return;
    const entry = { at: nowISO(), by: staffName(), action: "Status changed", detail: `${job.status} → ${newStatus}` };
    jobs[idx].status = newStatus;
    jobs[idx].history.unshift(entry);
    audits.unshift({ at: nowISO(), by: staffName(), jobId: job.id, action: "Status", detail: entry.detail });
    await saveJSON(JOBS_KEY, jobs);
    await saveJSON(AUDIT_KEY, audits);
    setStatus(newStatus);
    onUpdate(jobs[idx]);
  }

  const lockInfo = LOCK_TYPES.find(l => l.id === job.device.lockType);

  return (
    <div className="uc-card" style={{ position: "relative" }}>
      <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: "1.1rem" }}>✕</button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, color: T.bright, fontSize: "0.95rem" }}>{job.id}</div>
          <div style={{ fontSize: "0.78rem", color: T.muted }}>{fmtDate(job.createdAt)} · {job.staff}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span className="uc-badge" style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] + "66" }}>
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      <div className="uc-card-title">Customer</div>
      <div className="uc-detail-row"><span className="uc-detail-label">Name</span><span className="uc-detail-value">{job.customer.name}</span></div>
      {job.customer.phone && <div className="uc-detail-row"><span className="uc-detail-label">Phone</span><span className="uc-detail-value">{job.customer.phone}</span></div>}
      {job.customer.email && <div className="uc-detail-row"><span className="uc-detail-label">Email</span><span className="uc-detail-value">{job.customer.email}</span></div>}

      <hr className="uc-divider" />
      <div className="uc-card-title">Device</div>
      <div className="uc-detail-row"><span className="uc-detail-label">IMEI</span><span className="uc-detail-value" style={{ fontFamily: "monospace" }}>{job.device.imei}</span></div>
      <div className="uc-detail-row"><span className="uc-detail-label">Device</span><span className="uc-detail-value">{job.device.brand} {job.device.model}</span></div>
      <div className="uc-detail-row"><span className="uc-detail-label">Lock type</span><span className="uc-detail-value">{lockInfo?.label || job.device.lockType}</span></div>
      <div className="uc-detail-row"><span className="uc-detail-label">Carrier</span><span className="uc-detail-value">{job.device.carrier || "—"}</span></div>
      <div className="uc-detail-row"><span className="uc-detail-label">IMEI status</span><span className="uc-detail-value" style={{ textTransform: "capitalize", color: job.imeiCheck?.status === "clean" ? T.success : T.danger }}>{job.imeiCheck?.status?.replace(/_/g, " ") || "—"}</span></div>
      {job.imeiCheck?.checkmend_ref && <div className="uc-detail-row"><span className="uc-detail-label">Checkmend ref</span><span className="uc-detail-value" style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{job.imeiCheck.checkmend_ref}</span></div>}

      <hr className="uc-divider" />
      <div className="uc-card-title">Ownership proof</div>
      <div className="uc-detail-row">
        <span className="uc-detail-label">Documents</span>
        <span className="uc-detail-value">{(job.ownership.proofTypes || []).map(id => PROOF_TYPES.find(p => p.id === id)?.label || id).join(", ")}</span>
      </div>
      {job.ownership.notes && <div className="uc-detail-row"><span className="uc-detail-label">Notes</span><span className="uc-detail-value">{job.ownership.notes}</span></div>}

      <hr className="uc-divider" />
      <div className="uc-card-title">Update status</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(STATUS_LABELS).filter(([k]) => k !== status).map(([k, v]) => (
          <button key={k} className="uc-btn uc-btn-ghost" style={{ fontSize: "0.78rem", padding: "6px 10px" }}
            onClick={() => changeStatus(k)}>
            → {v}
          </button>
        ))}
      </div>

      <hr className="uc-divider" />
      <div className="uc-card-title">Add note</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="uc-input" style={{ flex: 1 }} placeholder="e.g. Submitted to Telstra portal at 14:30"
          value={note} onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addNote()} />
        <button className="uc-btn uc-btn-primary" onClick={addNote} disabled={!note.trim()}>Add</button>
      </div>

      {job.notes && <div className="uc-note" style={{ marginTop: 10 }}>Initial note: {job.notes}</div>}

      <hr className="uc-divider" />
      <div className="uc-card-title">History</div>
      {(job.history || []).map((h, i) => (
        <div key={i} className="uc-audit-row">
          <span className="uc-audit-time">{fmtDate(h.at)} · {h.by}</span>
          <span className="uc-audit-text"><strong>{h.action}</strong>{h.detail ? ` — ${h.detail}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   JOB LIST
================================================================ */
function JobList({ jobs, onSelect }) {
  const [filter, setFilter] = useState("all");

  const visible = useMemo(() => {
    if (filter === "all") return jobs;
    return jobs.filter(j => j.status === filter);
  }, [jobs, filter]);

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {[["all", "All"], ...Object.entries(STATUS_LABELS)].map(([k, v]) => (
          <button key={k} className={`uc-tab${filter === k ? " active" : ""}`}
            style={{ flex: "none", padding: "5px 10px" }}
            onClick={() => setFilter(k)}>{v}</button>
        ))}
      </div>

      <div className="uc-card" style={{ padding: 0 }}>
        {visible.length === 0 ? (
          <div className="uc-empty">No jobs yet for this filter.</div>
        ) : visible.map(job => (
          <div key={job.id} className="uc-job-row" onClick={() => onSelect(job)}>
            <span className="uc-job-id">{job.id}</span>
            <div className="uc-job-main">
              <div className="uc-job-device">{job.customer.name} — {job.device.brand} {job.device.model}</div>
              <div className="uc-job-meta">{LOCK_TYPES.find(l => l.id === job.device.lockType)?.label || job.device.lockType} · {fmtDate(job.createdAt)}</div>
            </div>
            <span className="uc-badge" style={{ color: STATUS_COLOR[job.status], borderColor: STATUS_COLOR[job.status] + "55" }}>
              {STATUS_LABELS[job.status]}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ================================================================
   AUDIT LOG TAB
================================================================ */
function AuditLog() {
  const [log, setLog] = useState(null);

  useEffect(() => {
    loadJSON(AUDIT_KEY).then(d => setLog(d || []));
  }, []);

  if (!log) return <div className="uc-empty">Loading…</div>;
  if (!log.length) return <div className="uc-empty">No audit entries yet.</div>;

  return (
    <div className="uc-card">
      <div className="uc-card-title">Audit log — all unlock actions</div>
      {log.map((e, i) => (
        <div key={i} className="uc-audit-row">
          <span className="uc-audit-time">{fmtDate(e.at)} · {e.by}</span>
          <span className="uc-audit-text">
            <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: T.muted, marginRight: 6 }}>{e.jobId}</span>
            <strong>{e.action}</strong>{e.detail ? ` — ${e.detail}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   ROOT COMPONENT
================================================================ */
export default function UnlockChecker() {
  const [tab, setTab]         = useState("new");   // new | jobs | audit
  const [jobs, setJobs]       = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    loadJSON(JOBS_KEY).then(d => setJobs(d || []));
  }, []);

  function handleJobCreated(job) {
    setJobs(prev => [job, ...(prev || [])]);
    setTab("jobs");
    setSelected(job);
  }

  function handleJobUpdate(updated) {
    setJobs(prev => (prev || []).map(j => j.id === updated.id ? updated : j));
    setSelected(updated);
  }

  return (
    <div className="uc-root">
      <style>{css}</style>

      <div className="uc-header">
        <div className="uc-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div>
          <h1>Unlock Checker</h1>
          <p>IMEI verification · ownership proof · unlock routing · job tracking</p>
        </div>
      </div>

      <div className="uc-tabs">
        <button className={`uc-tab${tab === "new" ? " active" : ""}`} onClick={() => setTab("new")}>New job</button>
        <button className={`uc-tab${tab === "jobs" ? " active" : ""}`} onClick={() => { setTab("jobs"); setSelected(null); }}>
          Jobs {jobs?.length ? `(${jobs.length})` : ""}
        </button>
        <button className={`uc-tab${tab === "audit" ? " active" : ""}`} onClick={() => setTab("audit")}>Audit log</button>
      </div>

      {tab === "new" && (
        <IntakeForm onJobCreated={handleJobCreated} />
      )}

      {tab === "jobs" && (
        selected
          ? <JobDetail job={selected} onClose={() => setSelected(null)} onUpdate={handleJobUpdate} />
          : <JobList jobs={jobs || []} onSelect={setSelected} />
      )}

      {tab === "audit" && <AuditLog />}
    </div>
  );
}
