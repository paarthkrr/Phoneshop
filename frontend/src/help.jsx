import React, { useState } from "react";

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
const genId = () => "HLP-" + Math.floor(100000 + Math.random() * 900000);

const ink = "#F7F4EC", panel = "#FFFFFF", panel2 = "#F0EBE0", paper = "#201C18", muted = "#6B6560",
  brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#201C18";

const CATEGORIES = ["Question about a repair", "Question about an order", "Question about a device I'm selling", "Something else"];

export default function Help() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState(() => {
    // Pre-fills from the chat widget's escalation link (?q=...) — the
    // widget does a real navigation (<a href>), not component composition,
    // so this has to read the URL directly rather than accept a prop.
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("q") || "";
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const list = (await loadJSON("support_queries", true)) || [];
      const entry = {
        id: genId(), createdAt: new Date().toISOString(), status: "open",
        name: name.trim(), email: email.trim(), category, message: message.trim(),
      };
      const ok = await saveJSON("support_queries", [entry, ...list], true);
      if (!ok) throw new Error("Couldn't submit — check your connection and try again.");
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
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, marginBottom: 10 }}>We've got it — {submitted.id}</div>
          <div style={{ color: muted, fontSize: 14, marginBottom: 24 }}>We'll get back to you at {submitted.email}. Keep this reference number if you follow up.</div>
          <a href="/" className="cs-btn" style={{ padding: "12px 22px", background: brass, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Back to homepage</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 16px 80px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em", marginBottom: 8 }}>Ask us anything</div>
        <div style={{ color: muted, fontSize: 14, marginBottom: 28 }}>A real person reads every one of these — usually much faster than you'd expect.</div>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" type="email"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />

        <div role="group" aria-label="What's this about" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c}
              style={{ padding: "7px 12px", borderRadius: 3, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${category === c ? brass : line}`, background: category === c ? brassDim : "transparent", color: category === c ? brass : paper }}>
              {c}
            </button>
          ))}
        </div>

        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's up?" aria-label="Your message" rows={5}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 6, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />

        {error && <div style={{ color: red, fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <button className="cs-btn" onClick={handleSubmit} disabled={!name.trim() || !email.trim() || !message.trim() || submitting}
          style={{ width: "100%", padding: "13px", borderRadius: 3, border: "none", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: name.trim() && email.trim() && message.trim() ? brass : line, color: name.trim() && email.trim() && message.trim() ? "#fff" : muted,
            fontSize: 14, fontWeight: 600, cursor: name.trim() && email.trim() && message.trim() ? "pointer" : "default" }}>
          {submitting && <span className="cs-spinner"></span>}
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
