import { withBusinessDefaults, waLink, mailLink } from "./business-info.js";
import React, { useState, useEffect } from "react";
import { FOOTER_SHOP } from "./site-menu.js";

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

const muted = "#5B6472", brass = "#2150C8", line = "#E2E6EC";

// One shared footer for every customer-facing page — previously each page
// either had its own duplicated copy (storefront, calculator) or none at
// all (every page added since), meaning About/FAQ/Help/Contact had no
// consistent path back to them except an increasingly cluttered top nav.
export default function SiteFooter() {
  const [businessSettings, setBusinessSettings] = useState(null);

  useEffect(() => {
    (async () => {
      const cfg = await loadJSON("pricing-config", true);
      setBusinessSettings(withBusinessDefaults(cfg && cfg.businessSettings));
    })();
  }, []);

  return (
    <footer style={{ marginTop: 50, paddingTop: 30, borderTop: `1px solid ${line}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 26, fontSize: 13.5, maxWidth: 820, fontFamily: "'Archivo', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#111827", marginLeft: "auto", marginRight: "auto", padding: "30px 16px 40px" }}>
      <style>{`
        .sf-link { color: #5B6472; text-decoration: none; display: inline-block; transition: color .15s ease, transform .15s ease; }
        .sf-link:hover { color: #2150C8; transform: translateX(3px); }
        .sf-h { font-weight: 700; margin-bottom: 10px; color: #111827; }
        @media (prefers-reduced-motion: reduce) { .sf-link { transition: none; } .sf-link:hover { transform: none; } }
      `}</style>
      <div>
        <div style={{ fontFamily: "'Outfit', 'Archivo', sans-serif", fontSize: 20, letterSpacing: "-0.015em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><img src="/logo-mark.svg" alt="" width="19" height="26" /><span><span style={{ fontWeight: 400 }}>Mobile</span> <span style={{ fontWeight: 800, color: "#2150C8" }}>Recellr</span></span></div>
        <div style={{ color: muted, lineHeight: 1.7 }}>
          {businessSettings?.address || "Address on file at checkout"}<br />
          {businessSettings?.phone && <><a href={`tel:${businessSettings.phone.replace(/\s/g, "")}`} style={{ color: "inherit" }}>{businessSettings.phone}</a><br /></>}
          <a href={waLink(businessSettings?.whatsapp, "Hi Mobile Recellr, ")} target="_blank" rel="noopener" style={{ color: "#047857", fontWeight: 700 }}>WhatsApp us</a><br />
          <a href={mailLink(businessSettings?.email)} style={{ color: "inherit" }}>{businessSettings?.email}</a>
          {businessSettings?.hours && <><br /><span style={{ whiteSpace: "pre-line" }}>{businessSettings.hours}</span></>}
          {businessSettings?.abn && <><br />ABN {businessSettings.abn}</>}
          {businessSettings?.dealerLicence && <><br />Licensed second-hand dealer · Licence {businessSettings.dealerLicence}</>}
        </div>
      </div>
      <div>
        <div className="sf-h">Shop</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FOOTER_SHOP.map((l) => <a key={l.label} href={l.to} className="sf-link">{l.label}</a>)}
        </div>
      </div>
      <div>
        <div className="sf-h">Company</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <a href="/about" className="sf-link">About us</a>
          <a href="/blog" className="sf-link">Guides</a>
          <a href="/tutorials" className="sf-link">Repair tutorials</a>
          <a href="/faq" className="sf-link">FAQ</a>
        </div>
      </div>
      <div>
        <div className="sf-h">Sell</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <a href="/sell/apple" className="sf-link">Sell iPhone</a>
          <a href="/sell/samsung" className="sf-link">Sell Samsung</a>
          <a href="/sell/google" className="sf-link">Sell Google Pixel</a>
          <a href="/quote" className="sf-link">All devices</a>
        </div>
        <div className="sf-h">Support</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <a href="/help" className="sf-link">Help / Ask a question</a>
          <a href="/contact" className="sf-link">Contact us</a>
          <a href="/terms#returns" className="sf-link">30-day returns</a>
          <a href="/terms#warranty" className="sf-link">Warranty</a>
          <a href="/terms#shipping" className="sf-link">Shipping &amp; postage</a>
          <a href="/terms" className="sf-link">Terms</a>
          <a href="/privacy" className="sf-link">Privacy policy</a>
        </div>
      </div>
      <div>
        <div className="sf-h">Why Mobile Recellr</div>
        <div style={{ color: muted, lineHeight: 1.9 }}>
          ✓ Genuine or premium parts<br />
          ✓ Price match guarantee<br />
          ✓ 1-year warranty on devices<br />
          ✓ Free express shipping on phones &amp; accessory orders $100+<br />
          ✓ Same-day repairs in store<br />
          ✓ Phones, tablets, laptops &amp; watches
        </div>
      </div>
      <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: muted, borderTop: "1px solid rgba(32,28,24,0.1)", paddingTop: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>© {new Date().getFullYear()} Mobile Recellr · Sydney, Australia · Prices in AUD</span>
        <span style={{ fontWeight: 700, color: "#2150C8" }}>More life. Less landfill. ♻</span>
      </div>
    </footer>
  );
}
