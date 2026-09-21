import React from "react";
import { Link } from "react-router-dom";

// Same palette every other customer-facing page uses — kept as local
// constants (not imported) to match the established pattern in this
// codebase, where each route file is self-contained.
const ink = "#F7F4EC", panel = "#FFFFFF", paper = "#201C18", muted = "#6B6560",
  brass = "#2150C8", line = "#201C18";

export default function AboutUs() {
  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px 80px" }}>

        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 32, lineHeight: 1.08, letterSpacing: "-0.01em", marginBottom: 24 }}>
          Why Mobile Vault exists
        </div>

        <div style={{ fontSize: 16, lineHeight: 1.75, marginBottom: 20 }}>
          We started Mobile Vault after watching the same thing happen to person after person: a phone that had stopped charging properly, taken in for what should've been a two-minute clean-out, and handed back with a bill for $150 — sometimes more.
        </div>

        <div style={{ fontSize: 16, lineHeight: 1.75, marginBottom: 20 }}>
          Most of the time, a charging port that's stopped working isn't broken at all. It's just full of dust and lint. A proper clean fixes it. But plenty of shops don't tell customers that — they quote a full part replacement anyway, because most people have no way to know the difference, and $150 for a five-minute job is good business if nobody's checking.
        </div>

        <div style={{ fontSize: 16, lineHeight: 1.75, marginBottom: 20 }}>
          We got tired of watching it happen. So we built a shop that does the opposite: we tell you honestly what's actually wrong, we only use genuine parts when a part genuinely needs replacing, and we back every price with a real guarantee — if you find the same repair cheaper elsewhere, we'll match it.
        </div>

        <div style={{ border: `2px solid ${line}`, borderRadius: 3, padding: 24, margin: "36px 0", background: panel }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 14 }}>What that actually means for you</div>
          <div style={{ lineHeight: 2 }}>
            ✓ Honest diagnosis first — we tell you what's actually wrong before we quote you<br />
            ✓ Genuine parts only — never unmarked aftermarket substitutes<br />
            ✓ Price match guarantee — found it cheaper? We'll match it, no argument<br />
            ✓ Every gadget — phones, tablets, laptops, and watches, not just one brand<br />
            ✓ 12-month warranty on every repair and every device we sell
          </div>
        </div>

        <div style={{ fontSize: 16, lineHeight: 1.75, marginBottom: 30 }}>
          That's the whole idea. Not the cheapest-sounding quote up front and a surprise later — an honest one from the start.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/" className="cs-btn" style={{ padding: "12px 22px", background: brass, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Get an Instant Quote</Link>
          <Link to="/shop" className="cs-btn" style={{ padding: "12px 22px", border: `2px solid ${line}`, color: paper, fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Shop Refurbished</Link>
          <Link to="/contact" className="cs-btn" style={{ padding: "12px 22px", border: `2px solid ${line}`, color: paper, fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Contact Us</Link>
        </div>
      </div>
    </div>
  );
}
