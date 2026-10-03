import React, { useState, useEffect } from "react";

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

const muted = "#6B6560", brass = "#2150C8", line = "#201C18";

// One shared footer for every customer-facing page — previously each page
// either had its own duplicated copy (storefront, calculator) or none at
// all (every page added since), meaning About/FAQ/Help/Contact had no
// consistent path back to them except an increasingly cluttered top nav.
export default function SiteFooter() {
  const [businessSettings, setBusinessSettings] = useState(null);

  useEffect(() => {
    (async () => {
      const cfg = await loadJSON("pricing-config", true);
      setBusinessSettings((cfg && cfg.businessSettings) || null);
    })();
  }, []);

  return (
    <footer style={{ marginTop: 50, paddingTop: 30, borderTop: `2px solid ${line}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 24, fontSize: 13, maxWidth: 720, marginLeft: "auto", marginRight: "auto", padding: "30px 16px 40px" }}>
      <div>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, marginBottom: 8 }}>Mobile Vault</div>
        <div style={{ color: muted, lineHeight: 1.7 }}>
          {businessSettings?.address || "Address on file at checkout"}<br />
          {businessSettings?.phone && <>{businessSettings.phone}<br /></>}
          {businessSettings?.email || "Contact us through the site"}
          {businessSettings?.hours && <><br /><span style={{ whiteSpace: "pre-line" }}>{businessSettings.hours}</span></>}
          {businessSettings?.abn && <><br />ABN {businessSettings.abn}</>}
          {businessSettings?.dealerLicence && <><br />Licensed second-hand dealer · Licence {businessSettings.dealerLicence}</>}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Company</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <a href="/about" style={{ color: muted, textDecoration: "none" }}>About us</a>
          <a href="/blog" style={{ color: muted, textDecoration: "none" }}>Guides</a>
          <a href="/tutorials" style={{ color: muted, textDecoration: "none" }}>Repair tutorials</a>
          <a href="/faq" style={{ color: muted, textDecoration: "none" }}>FAQ</a>
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Sell</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <a href="/sell/apple" style={{ color: muted, textDecoration: "none" }}>Sell iPhone</a>
          <a href="/sell/samsung" style={{ color: muted, textDecoration: "none" }}>Sell Samsung</a>
          <a href="/sell/google" style={{ color: muted, textDecoration: "none" }}>Sell Google Pixel</a>
          <a href="/quote" style={{ color: muted, textDecoration: "none" }}>All devices</a>
        </div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Support</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <a href="/help" style={{ color: muted, textDecoration: "none" }}>Help / Ask a question</a>
          <a href="/contact" style={{ color: muted, textDecoration: "none" }}>Contact us</a>
          <a href="/terms#returns" style={{ color: muted, textDecoration: "none" }}>30-day returns</a>
          <a href="/terms#warranty" style={{ color: muted, textDecoration: "none" }}>Warranty</a>
          <a href="/terms#shipping" style={{ color: muted, textDecoration: "none" }}>Shipping &amp; postage</a>
          <a href="/terms" style={{ color: muted, textDecoration: "none" }}>Terms</a>
          <a href="/privacy" style={{ color: muted, textDecoration: "none" }}>Privacy policy</a>
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Why Mobile Vault</div>
        <div style={{ color: muted, lineHeight: 1.9 }}>
          ✓ Genuine parts only<br />
          ✓ Price match guarantee<br />
          ✓ 1-year warranty on devices<br />
          ✓ Free express shipping<br />
          ✓ Same-day repairs in store<br />
          ✓ Phones, tablets, laptops &amp; watches
        </div>
      </div>
      <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: muted, borderTop: "1px solid rgba(32,28,24,0.1)", paddingTop: 14 }}>
        Stock photography from <a href="https://www.pexels.com" target="_blank" rel="noopener" style={{ color: muted }}>Pexels</a>.
      </div>
    </footer>
  );
}
