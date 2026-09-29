import DeviceArt from "./device-art.jsx";
import Photo from "./photo.jsx";
import React, { useState } from "react";

async function findPublicRecord(key, query, localList, fields = ["id", "email"]) {
  const q = query.trim().toLowerCase();
  if (typeof window !== "undefined" && window.SHOP_API_BASE_URL) {
    for (const field of fields) {
      try {
        const res = await fetch(`${window.SHOP_API_BASE_URL}/public/find/${encodeURIComponent(key)}?field=${field}&value=${encodeURIComponent(q)}`);
        if (res.ok) return (await res.json()).record;
      } catch (e) { /* try the next field */ }
    }
    return null;
  }
  return (localList || []).find((r) => fields.some((field) => {
    const v = field.split(".").reduce((o, k) => (o ? o[k] : undefined), r);
    return typeof v === "string" && v.toLowerCase() === q;
  })) || null;
}

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
async function saveJSON(key, value, shared) {
  if (!storageAvailable()) return false;
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch (e) {
    return false;
  }
}
async function queueNotification(entry) {
  if (!storageAvailable()) return false;
  try {
    const list = (await loadJSON("notification_queue", true)) || [];
    list.unshift({ id: "NTF-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), status: "pending", ...entry });
    await window.storage.set("notification_queue", JSON.stringify(list), true);
    return true;
  } catch (e) {
    return false;
  }
}
const genId = () => "RPR-" + Math.floor(100000 + Math.random() * 900000);

const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
  brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

const DEVICE_TYPES = ["Phone", "Tablet", "Laptop", "Watch"];

const REPAIRS_BY_DEVICE = {
  Phone: [
    { name: "Screen replacement", from: 150 },
    { name: "Battery replacement", from: 60 },
    { name: "Charging port", from: 80 },
    { name: "Camera repair", from: 90 },
    { name: "Water damage diagnosis", from: 50 },
  ],
  Tablet: [
    { name: "Screen replacement", from: 170 },
    { name: "Battery replacement", from: 90 },
    { name: "Charging port", from: 90 },
  ],
  Laptop: [
    { name: "Screen replacement", from: 180 },
    { name: "Keyboard replacement", from: 120 },
    { name: "Battery replacement", from: 110 },
    { name: "Charging port", from: 100 },
  ],
  Watch: [
    { name: "Screen replacement", from: 90 },
    { name: "Battery replacement", from: 70 },
  ],
};

export default function Repairs() {
  const [deviceType, setDeviceType] = useState("Phone");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [model, setModel] = useState("");
  const [issue, setIssue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState("");
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResult, setTrackResult] = useState(undefined);

  async function handleTrackSearch() {
    const q = trackQuery.trim();
    if (!q) return;
    const localList = window.SHOP_API_BASE_URL ? null : await loadJSON("repair_requests", true);
    const found = await findPublicRecord("repair_requests", q, localList);
    setTrackResult(found || null);
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !model.trim() || !issue.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const list = (await loadJSON("repair_requests", true)) || [];
      const entry = {
        id: genId(), createdAt: new Date().toISOString(), status: "new",
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        deviceType, model: model.trim(), issue: issue.trim(),
      };
      const ok = await saveJSON("repair_requests", [entry, ...list], true);
      if (!ok) throw new Error("Couldn't submit — check your connection and try again.");
      await queueNotification({
        type: "repair_request", channel: "email", recipientEmail: entry.email,
        subject: `Repair request ${entry.id} received`,
        message: `We've received your repair request for your ${entry.deviceType.toLowerCase()} (${entry.model}). We'll reach out shortly to confirm details and turnaround.`,
        relatedId: entry.id,
      });
      setSubmitted(entry);
    } catch (e) {
      setError(e.message || "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
        <div style={{ maxWidth: 480, margin: "60px auto", padding: "0 16px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, marginBottom: 10 }}>Got it — {submitted.id}</div>
          <div style={{ color: muted, fontSize: 14, marginBottom: 24 }}>We'll reach out at {submitted.email} to confirm details and turnaround for your {submitted.deviceType.toLowerCase()}.</div>
          <a href="/" className="cs-btn" style={{ padding: "12px 22px", background: brass, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Back to homepage</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px 80px" }}>

        <Photo name="microscope" height={220} eager style={{ marginBottom: 26 }} />
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em", marginBottom: 8 }}>Repairs — any gadget, genuine parts</div>
        <div style={{ color: muted, fontSize: 14, marginBottom: 8 }}>Phones, tablets, laptops, watches. Genuine parts only, every repair carries a 6-month warranty, and if you find it cheaper elsewhere, we'll match it.</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>Prices below are a starting point — your exact quote depends on the model and what's actually wrong, which we'll tell you honestly before we start anything.</div>

        <button onClick={() => { setTrackOpen((o) => !o); setTrackResult(undefined); }} style={{ background: "none", border: "none", padding: 0, color: brass, cursor: "pointer", fontSize: 13, textDecoration: "underline", marginBottom: trackOpen ? 16 : 28, display: "block" }}>
          {trackOpen ? "← Back to requesting a repair" : "Already submitted a request? Track it here"}
        </button>

        {trackOpen ? (
          <div style={{ border: `2px solid ${line}`, borderRadius: 3, padding: 20, background: panel, marginBottom: 28 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} placeholder="Request number or email" aria-label="Request number or email to track your repair"
                style={{ flex: 1, padding: "11px 12px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              <button onClick={handleTrackSearch} className="cs-btn" style={{ padding: "0 18px", borderRadius: 3, border: "none", background: brass, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Find</button>
            </div>
            {trackResult === null && <div style={{ color: red, fontSize: 13 }}>No request found with that number or email.</div>}
            {trackResult && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{trackResult.deviceType}: {trackResult.model}</div>
                <div style={{ fontSize: 13, color: muted, marginBottom: 4 }}>{trackResult.issue}</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  Status: <strong>{trackResult.status === "new" ? "Received — we'll be in touch shortly" : trackResult.status === "contacted" ? "We've reached out to you" : trackResult.status}</strong>
                </div>
              </div>
            )}
          </div>
        ) : (
        <>
        <div role="group" aria-label="Device type" style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {DEVICE_TYPES.map((d) => (
            <button key={d} onClick={() => setDeviceType(d)} aria-pressed={deviceType === d}
              style={{ padding: "9px 16px", borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${deviceType === d ? brass : line}`, background: deviceType === d ? brassDim : "transparent", color: deviceType === d ? brass : paper }}>
              {d}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 32 }}>
          {REPAIRS_BY_DEVICE[deviceType].map((r) => (
            <div key={r.name} className="cs-card" style={{ border: `2px solid ${line}`, borderRadius: 3, padding: 14, background: panel }}>
              <div style={{ marginBottom: 8 }}><DeviceArt type={deviceType.toLowerCase()} size={36} /></div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: muted }}>From ${r.from}</div>
            </div>
          ))}
        </div>

        <div style={{ border: `2px solid ${line}`, borderRadius: 3, padding: 22, background: panel }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 16 }}>Request a repair</div>

          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" type="email"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number (optional)" aria-label="Phone number"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={`${deviceType} model, e.g. "iPhone 14 Pro"`} aria-label="Device model"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="What's wrong with it?" aria-label="Describe the issue" rows={4}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 6, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />

          {error && <div style={{ color: red, fontSize: 13, marginBottom: 10 }}>{error}</div>}

          <button className="cs-btn" onClick={handleSubmit} disabled={!name.trim() || !email.trim() || !model.trim() || !issue.trim() || submitting}
            style={{ width: "100%", padding: "13px", borderRadius: 3, border: "none", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: name.trim() && email.trim() && model.trim() && issue.trim() ? brass : line, color: name.trim() && email.trim() && model.trim() && issue.trim() ? "#fff" : muted,
              fontSize: 14, fontWeight: 600, cursor: name.trim() && email.trim() && model.trim() && issue.trim() ? "pointer" : "default" }}>
            {submitting && <span className="cs-spinner"></span>}
            {submitting ? "Sending…" : "Request this repair"}
          </button>
        </div>

        <div style={{ marginTop: 30, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/shop" style={{ flex: 1, minWidth: 200, border: `2px solid ${line}`, borderRadius: 3, padding: 16, textDecoration: "none", color: paper, background: panel }} className="cs-card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Need a whole new device instead?</div>
            <div style={{ fontSize: 12.5, color: muted }}>Browse graded refurbished stock →</div>
          </a>
          <a href="/parts" style={{ flex: 1, minWidth: 200, border: `2px solid ${line}`, borderRadius: 3, padding: 16, textDecoration: "none", color: paper, background: panel }} className="cs-card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>DIY fix?</div>
            <div style={{ fontSize: 12.5, color: muted }}>Check parts &amp; accessories in stock →</div>
          </a>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
