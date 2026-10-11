import React from "react";
import { DOORSTEP } from "./doorstep.js";

const paper = "#111827", muted = "#5B6472", brass = "#2150C8", line = "#E2E6EC";

// One page, three clearly separate offers: selling to us, buying from us, repairs.
const CARDS = [
  { tag: "SELL", title: "We come and buy your phone", price: "Free", note: "anywhere in Sydney",
    body: "Get a price online, book a time, we check the phone in front of you and pay you before we leave. Photo ID is checked, as the law requires for second-hand dealers.",
    cta: "Get my price", href: "/quote" },
  { tag: "BUY", title: "Checked refurbished phones, with warranty", price: "Free", note: "express delivery Australia-wide",
    body: "Order any phone on our website and it is sent to you free anywhere in Australia. Or choose click and collect. Every phone passed our 49-point check and has a warranty.",
    cta: "Shop phones", href: "/shop" },
  { tag: "REPAIR", title: "A technician fixes it at your door", price: `$${DOORSTEP.zones.A.fee} – $${DOORSTEP.zones.B.fee}`, note: "travel fee, taken off your repair",
    body: `Pick a day and a time window, or choose emergency (+$${DOORSTEP.expressExtra}). Some repairs need the bench, and we tell you honestly before we come. Prefer to drop it in? In-store repairs have no travel fee.`,
    cta: "Book a doorstep repair", href: "/repairs" },
];

export default function HomeService() {
  return (
    <div style={{ background: "#fff", color: paper, minHeight: "100%", fontFamily: "'Outfit', 'Archivo', system-ui, sans-serif" }}>
      <style>{`.hs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}@media(max-width:860px){.hs-grid{grid-template-columns:1fr}}
        .hs-card{display:flex;flex-direction:column;border:1px solid ${line};border-radius:18px;padding:22px;background:#fff}
        .hs-cta{margin-top:auto;display:block;text-align:center;padding:13px;border-radius:12px;background:${brass};color:#fff;text-decoration:none;font-weight:700;font-size:15px}`}</style>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "44px 16px 80px" }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>Mobile Recellr, at your door</h1>
        <p style={{ color: muted, fontSize: 16, lineHeight: 1.55, maxWidth: 640, margin: "10px 0 28px" }}>Collection and repairs across Sydney, delivery Australia-wide. Three different services, each with its own price, so you know exactly what you pay before we turn up.</p>
        <div className="hs-grid">
          {CARDS.map((c) => (
            <div key={c.tag} className="hs-card">
              <div style={{ fontSize: 12, letterSpacing: ".2em", color: brass, fontWeight: 700 }}>{c.tag}</div>
              <div style={{ fontSize: 21, fontWeight: 700, margin: "8px 0 4px", lineHeight: 1.2 }}>{c.title}</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{c.price} <span style={{ fontSize: 13, fontWeight: 500, color: muted }}>{c.note}</span></div>
              <p style={{ color: muted, fontSize: 14.5, lineHeight: 1.55, margin: "12px 0 18px" }}>{c.body}</p>
              <a href={c.href} className="hs-cta">{c.cta}</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
