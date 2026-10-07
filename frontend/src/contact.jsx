import { withBusinessDefaults, waLink } from "./business-info.js";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

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
  brass = "#2150C8", line = "#E2E6EC";

export default function ContactUs() {
  const [businessSettings, setBusinessSettings] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const cfg = await loadJSON("pricing-config", true);
      setBusinessSettings(withBusinessDefaults(cfg && cfg.businessSettings));
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <div style={{ background: ink, color: muted, padding: 40, fontFamily: "'Archivo', sans-serif" }}>Loading…</div>;

  const phone = businessSettings?.phone;
  const email = businessSettings?.email;
  const address = businessSettings?.address;

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px 80px" }}>

        <h1 style={{ margin: 0, fontWeight: 400, fontFamily: "'Archivo Black', sans-serif", fontSize: 32, letterSpacing: "-0.01em", marginBottom: 10 }}>Get in touch</h1>
        <div style={{ color: muted, fontSize: 15, marginBottom: 34 }}>Questions about a repair, an order, or anything else — here's how to reach us.</div>

        <div style={{ display: "grid", gap: 14, marginBottom: 36 }}>
          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 20, background: panel }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: muted, marginBottom: 6 }}>PHONE</div>
            {phone ? (
              <>
                <a href={`tel:${phone.replace(/\s/g, "")}`} className="cs-btn" style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, color: brass, textDecoration: "none" }}>{phone}</a>
                <a href={waLink(businessSettings.whatsapp, "Hi Mobile Recellr, ")} target="_blank" rel="noopener" className="cs-btn"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, padding: "12px 18px", background: "#25D366", color: "#fff", fontWeight: 800, borderRadius: 12, textDecoration: "none", fontSize: 15 }}>
                  💬 Chat on WhatsApp
                </a>
                <div style={{ fontSize: 12.5, color: "#5B6472", marginTop: 6 }}>Fastest way to reach us. Send photos of your phone for a quick check.</div>
              </>
            ) : (
              <div style={{ color: muted, fontSize: 14 }}>Phone number coming soon — check back shortly.</div>
            )}
          </div>

          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 20, background: panel }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: muted, marginBottom: 6 }}>EMAIL</div>
            {email ? (
              <a href={`mailto:${email}`} className="cs-btn" style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, color: brass, textDecoration: "none", wordBreak: "break-all" }}>{email}</a>
            ) : (
              <div style={{ color: muted, fontSize: 14 }}>Email coming soon — check back shortly.</div>
            )}
          </div>

          <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 20, background: panel }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: muted, marginBottom: 6 }}>VISIT US</div>
            {address ? (
              <div style={{ fontSize: 15, lineHeight: 1.6 }}>{address}</div>
            ) : (
              <div style={{ fontSize: 15, lineHeight: 1.6 }}>Drop-off and collection are arranged by message. {businessSettings.whatsapp ? <a href={waLink(businessSettings.whatsapp, "Hi Mobile Recellr, I'd like to arrange a drop-off. ")} target="_blank" rel="noopener" style={{ color: "#2150C8", fontWeight: 700 }}>WhatsApp us</a> : "Message us"} and we'll confirm the place and time — or book a free home collection anywhere in Sydney.</div>
            )}
          </div>

          {businessSettings?.hours && (
            <div style={{ border: `1px solid ${line}`, borderRadius: 3, padding: 20, background: panel }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: muted, marginBottom: 6 }}>OPENING HOURS</div>
              <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-line" }}>{businessSettings.hours}</div>
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${line}`, paddingTop: 24 }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 12 }}>Already have an order?</div>
          <div style={{ color: muted, fontSize: 14, marginBottom: 16 }}>You can check its status yourself without waiting for a reply — usually faster than emailing us.</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/quote" className="cs-btn" style={{ padding: "12px 22px", background: brass, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Track a Trade-In</Link>
            <Link to="/shop" className="cs-btn" style={{ padding: "12px 22px", border: `1px solid ${line}`, color: paper, fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Track a Purchase</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
