// /areas-we-serve: how each part of Sydney (and the rest of Australia) can get a repair,
// with a postcode check that uses the same zones and fees as the doorstep booking.
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { DOORSTEP, zoneForPostcode, doorstepFee } from "./doorstep.js";

const paper = "var(--mr-text)", muted = "var(--mr-muted)", line = "var(--mr-line)", panel = "var(--mr-surface)", brand = "var(--mr-brand)";

export default function Areas() {
  const [pc, setPc] = useState("");
  const zone = pc.length === 4 ? zoneForPostcode(pc) : null;
  const fee = zone ? doorstepFee(zone, false) : null;
  const h2 = { fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 21, margin: "30px 0 10px" };
  const card = { border: `1px solid ${line}`, borderRadius: 16, padding: 18, background: panel };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 16px 72px", color: paper, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: "clamp(28px, 5vw, 40px)", lineHeight: 1.1, margin: "0 0 12px" }}>Phone repairs across Sydney</h1>
      <p style={{ fontSize: 16.5, lineHeight: 1.65, margin: "0 0 18px" }}>Come in, have a technician come to you, or post it in from anywhere in Australia.</p>

      <div style={card}>
        <label htmlFor="area-pc" style={{ fontWeight: 700, fontSize: 15 }}>Can a technician come to me?</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <input id="area-pc" value={pc} onChange={(e) => setPc(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="Your postcode, e.g. 2150" autoComplete="postal-code"
            style={{ flex: "1 1 200px", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: `1px solid ${line}`, background: "var(--mr-surface-2)", color: paper }} />
        </div>
        <div aria-live="polite" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.55, minHeight: 24 }}>
          {pc.length === 4 && fee != null && <span><b style={{ color: "var(--mr-ok)" }}>Yes.</b> {DOORSTEP.zones[zone].label}: ${fee} travel fee, taken off the repair if you go ahead. <Link to="/repairs#book" style={{ color: brand, fontWeight: 700 }}>Book a repair at your door →</Link></span>}
          {pc.length === 4 && zone === "ask" && <span>We may be able to come to you: <Link to="/contact" style={{ color: brand, fontWeight: 700 }}>message us</Link> and we'll confirm the area and fee before anyone drives out. Or use mail-in below.</span>}
          {pc.length > 0 && pc.length < 4 && <span style={{ color: muted }}>Type all 4 digits.</span>}
        </div>
      </div>

      <h2 style={h2}>Three ways to get it fixed</h2>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 15.5 }}>
        <li><b>In store:</b> most screens, batteries and charging ports are done the same day, often while you wait, when the part is in stock.</li>
        <li><b>At your door:</b> inner zone ${DOORSTEP.zones.A.fee} ({DOORSTEP.zones.A.km}), outer zone ${DOORSTEP.zones.B.fee} ({DOORSTEP.zones.B.km}). {DOORSTEP.creditNote} Some repairs need the bench; we'll tell you honestly before we come.</li>
        <li><b>Mail-in, Australia-wide:</b> usually back within 3 to 5 business days of arriving, plus postage.</li>
      </ul>

      <h2 style={h2}>Popular repairs</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[["/iphone-screen-repair-sydney", "iPhone screen"], ["/iphone-battery-replacement-sydney", "iPhone battery"], ["/samsung-screen-repair-sydney", "Samsung screen"], ["/ipad-screen-repair-sydney", "iPad screen"], ["/charging-port-repair-sydney", "Charging port"], ["/water-damage-phone-repair-sydney", "Water damage"], ["/laptop-repair-sydney", "Laptop"], ["/apple-watch-repair-sydney", "Apple Watch"]].map(([to, t]) => (
          <Link key={to} to={to} style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${line}`, color: paper, textDecoration: "none", fontSize: 14 }}>{t}</Link>
        ))}
      </div>
    </div>
  );
}
