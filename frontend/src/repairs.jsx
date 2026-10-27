import AddressInput from "./address-input.jsx";
import DeviceArt from "./device-art.jsx";
import Photo from "./photo.jsx";
// Friendly validation shared by the customer forms
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());
const digits = (v) => (v || "").replace(/[\s-]/g, "");
const isBsb = (v) => /^\d{6}$/.test(digits(v));
const isAccount = (v) => /^\d{6,10}$/.test(digits(v));

import React, { useState, useMemo } from "react";
import { DOORSTEP, zoneForPostcode, doorstepFee, slotDays, expressAvailable } from "./doorstep.js";
import { REPAIRS_BY_DEVICE } from "./repair-prices.js";

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

const ink = "#FFFFFF", panel = "#FFFFFF", panel2 = "#F4F6F9", paper = "#111827", muted = "#5B6472",
  brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", red = "#8B2E2E", green = "#3F6B34", line = "#E2E6EC";

const DEVICE_TYPES = ["Phone", "Tablet", "Laptop", "Watch"];


export default function Repairs() {
  const [deviceType, setDeviceType] = useState("Phone");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [model, setModel] = useState("");
  const [issue, setIssue] = useState("");
  const [method, setMethod] = useState("instore");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [express, setExpress] = useState(false);
  const [slotDate, setSlotDate] = useState("");
  const [slotWin, setSlotWin] = useState("");
  const days = useMemo(() => slotDays(), []);
  const canExpress = useMemo(() => expressAvailable(), []);
  const zone = zoneForPostcode(postcode);
  const fee = doorstepFee(zone, express && canExpress);
  const door = method === "doorstep";
  const doorOk = !door || (address.trim().length > 5 && zone && phone.trim().length >= 8 && (express && canExpress ? true : slotDate && slotWin));
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
    if (!name.trim() || !isEmail(email) || !model.trim() || !issue.trim() || !doorOk) return;
    setSubmitting(true);
    setError("");
    try {
      const list = (await loadJSON("repair_requests", true)) || [];
      const entry = {
        id: genId(), createdAt: new Date().toISOString(), status: "new",
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        deviceType, model: model.trim(), issue: issue.trim(), method,
      };
      if (door) {
        const isExp = express && canExpress;
        const win = DOORSTEP.windows.find((w) => w.id === slotWin);
        Object.assign(entry, { address: address.trim(), postcode: postcode.trim(), zone, travelFee: fee, express: isExp,
          slotDate: isExp ? "" : slotDate, slotWindow: isExp ? "Express, within about 2 hours" : (win ? win.range : "") });
      }
      const ok = await saveJSON("repair_requests", [entry, ...list], true);
      if (!ok) throw new Error("Couldn't submit — check your connection and try again.");
      await queueNotification({
        type: "repair_request", channel: "email", recipientEmail: entry.email, recipientName: entry.name,
        subject: `Repair request ${entry.id} received`,
        message: door
          ? `We've received your at-your-door repair request for your ${entry.deviceType.toLowerCase()} (${entry.model}). Requested time: ${entry.express ? "express, within about 2 hours" : `${entry.slotDate}, ${entry.slotWindow}`}. ${entry.zone === "ask" ? "We'll confirm your area and travel fee by message before booking it in." : `Travel fee: $${entry.travelFee}, taken off your repair price if you go ahead.`} We'll message you to confirm the time and tell you which technician is coming. Nothing is booked until we confirm.`
          : `We've received your repair request for your ${entry.deviceType.toLowerCase()} (${entry.model}). We'll reach out shortly to confirm details and turnaround.`,
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
          <div style={{ color: muted, fontSize: 14, marginBottom: 24 }}>We'll reach out at {submitted.email} to confirm details for your {submitted.deviceType.toLowerCase()}. {submitted.method === "doorstep" ? "This is a request, not a confirmed booking yet. We'll message you shortly to confirm the time slot and the technician who is coming." : submitted.method === "mailin" ? "We'll email you the postal address for your mail-in repair." : "Pop in any time during opening hours — most repairs are done the same day."}</div>
          <a href="/" className="cs-btn" style={{ padding: "12px 22px", background: brass, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Back to homepage</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px 80px" }}>

        <Photo banner name="microscope" height={220} eager style={{ marginBottom: 26 }} />
        <h1 style={{ margin: 0, fontWeight: 400, fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em", marginBottom: 8 }}>Repairs — any gadget, honest parts</h1>
        <div style={{ color: muted, fontSize: 14, marginBottom: 8 }}>Phones, tablets, laptops, watches. Genuine or premium parts (your choice, always labelled), low prices with a price match guarantee (found it cheaper? we'll match it), done <strong>same day in store</strong>, and every repair carries a 90-day warranty. Not nearby? Send it by post — usually back within 3–5 business days. Prefer DIY? See our <a href="/tutorials" style={{ color: brass }}>repair tutorials</a>.</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>Prices below are a starting point — your exact quote depends on the model and what's actually wrong, which we'll tell you honestly before we start anything.</div>

        <button onClick={() => { setTrackOpen((o) => !o); setTrackResult(undefined); }} style={{ background: "none", border: "none", padding: 0, color: brass, cursor: "pointer", fontSize: 13, textDecoration: "underline", marginBottom: trackOpen ? 16 : 28, display: "block" }}>
          {trackOpen ? "← Back to requesting a repair" : "Already submitted a request? Track it here"}
        </button>

        {trackOpen ? (
          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 20, background: panel, marginBottom: 28 }}>
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

        <div className="mv-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 32 }}>
          {REPAIRS_BY_DEVICE[deviceType].map((r) => (
            <div key={r.name} className="cs-card" style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 14, background: panel }}>
              <div style={{ marginBottom: 8 }}><DeviceArt type={deviceType.toLowerCase()} size={36} /></div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: muted }}>From ${r.from}</div>
            </div>
          ))}
        </div>

        <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 22, background: panel }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 16 }}>Request a repair</div>

          <div role="group" aria-label="Repair method" style={{ display: "flex", gap: 8, marginBottom: 12 }}>

            {[["instore", "In store — same day"], ["doorstep", "At my door"], ["mailin", "Mail-in — 3–5 days"]].map(([k, lbl]) => (

              <button key={k} type="button" onClick={() => setMethod(k)} aria-pressed={method === k}

                style={{ flex: 1, padding: "11px 8px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",

                  border: `1.5px solid ${method === k ? brass : line}`, background: method === k ? brassDim : "transparent", color: method === k ? brass : paper }}>{lbl}</button>

            ))}

          </div>

          {method === "mailin" && <div style={{ fontSize: 12.5, color: muted, marginBottom: 12, lineHeight: 1.5 }}>We'll email you our postal address and a reference number. Post it tracked from any Australia Post outlet; it's usually back with you within 3–5 business days of arriving.</div>}

          {door && (
            <div style={{ border: `1px solid ${line}`, borderRadius: 10, padding: 14, marginBottom: 12, background: panel2 }}>
              <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.5, marginBottom: 10 }}>A technician comes to you in Sydney, repairs on the spot, you pay after. {DOORSTEP.creditNote} Inner zone ${DOORSTEP.zones.A.fee} (about 10 km of Sydney CBD, Blacktown or Macquarie Park), outer zone ${DOORSTEP.zones.B.fee}. Not every repair can be done at a doorstep (some need the bench); we'll tell you honestly before we come.</div>
              <AddressInput value={address} onChange={setAddress} placeholder="Street address — start typing" ariaLabel="Street address"
                onPick={(a) => { if (/^\d{4}$/.test(a.postcode || "")) setPostcode(a.postcode); }}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
              <input value={postcode} onChange={(e) => setPostcode(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Postcode" aria-label="Postcode" inputMode="numeric" autoComplete="postal-code"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel, color: paper, fontSize: 14, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
              {postcode.length === 4 && (
                <div role="status" style={{ fontSize: 13, marginBottom: 10, color: zone === "ask" ? red : green, fontWeight: 600 }}>
                  {zone === "ask" ? "Outside our Sydney zones. Send the request and we'll tell you honestly if and what we can do." : `${DOORSTEP.zones[zone].label}: travel fee $${DOORSTEP.zones[zone].fee}${express && canExpress ? ` + $${DOORSTEP.expressExtra} express` : ""}, credited to your repair.`}
                </div>
              )}
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginBottom: 10, opacity: canExpress ? 1 : 0.55 }}>
                <input type="checkbox" checked={express && canExpress} disabled={!canExpress} onChange={(e) => setExpress(e.target.checked)} style={{ marginTop: 3 }} />
                <span><strong>Emergency, come now</strong> (+${DOORSTEP.expressExtra}). Technician on the way within about 2 hours.{!canExpress && " Available 9am to 5pm today only."}</span>
              </label>
              {!(express && canExpress) && (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Pick a day</div>
                  <div role="group" aria-label="Day" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {days.filter((d) => d.windows.length).map((d) => (
                      <button key={d.date} type="button" aria-pressed={slotDate === d.date} onClick={() => { setSlotDate(d.date); setSlotWin(""); }}
                        style={{ padding: "8px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${slotDate === d.date ? brass : line}`, background: slotDate === d.date ? brassDim : panel, color: slotDate === d.date ? brass : paper }}>{d.label}</button>
                    ))}
                  </div>
                  {slotDate && (
                    <div role="group" aria-label="Time window" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(days.find((d) => d.date === slotDate) || { windows: [] }).windows.map((w) => (
                        <button key={w.id} type="button" aria-pressed={slotWin === w.id} onClick={() => setSlotWin(w.id)}
                          style={{ padding: "8px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${slotWin === w.id ? brass : line}`, background: slotWin === w.id ? brassDim : panel, color: slotWin === w.id ? brass : paper }}>{w.label} · {w.range}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {phone.trim().length < 8 && <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>A phone number is needed so the technician can reach you on the day.</div>}
            </div>
          )}

          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" type="email" autoComplete="email" inputMode="email"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          {email && !isEmail(email) && <div role="alert" style={{ fontSize: 12, color: "#8B2E2E", margin: "-4px 0 10px" }}>That email address doesn't look right — we need it to reply to you.</div>}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={door ? "Mobile number (needed for doorstep)" : "Phone number (optional)"} aria-label="Phone number" type="tel" autoComplete="tel" inputMode="tel"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={`${deviceType} model, e.g. "iPhone 14 Pro"`} aria-label="Device model"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
          <textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="What's wrong with it?" aria-label="Describe the issue" rows={4}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 3, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 14, marginBottom: 6, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />

          {error && <div style={{ color: red, fontSize: 13, marginBottom: 10 }}>{error}</div>}

          <button className="cs-btn" onClick={handleSubmit} disabled={!name.trim() || !isEmail(email) || !model.trim() || !issue.trim() || !doorOk || submitting}
            style={{ width: "100%", padding: "13px", borderRadius: 3, border: "none", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: name.trim() && isEmail(email) && model.trim() && issue.trim() && doorOk ? brass : line, color: name.trim() && isEmail(email) && model.trim() && issue.trim() && doorOk ? "#fff" : muted,
              fontSize: 14, fontWeight: 600, cursor: name.trim() && isEmail(email) && model.trim() && issue.trim() && doorOk ? "pointer" : "default" }}>
            {submitting && <span className="cs-spinner"></span>}
            {submitting ? "Sending…" : door ? "Request a doorstep repair" : "Request this repair"}
          </button>
        </div>

        <div style={{ marginTop: 30, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/shop" style={{ flex: 1, minWidth: 200, border: `1px solid ${line}`, borderRadius: 3, padding: 16, textDecoration: "none", color: paper, background: panel }} className="cs-card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Need a whole new device instead?</div>
            <div style={{ fontSize: 12.5, color: muted }}>Browse graded refurbished stock →</div>
          </a>
          <a href="/parts" style={{ flex: 1, minWidth: 200, border: `1px solid ${line}`, borderRadius: 3, padding: 16, textDecoration: "none", color: paper, background: panel }} className="cs-card">
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
