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

  const b = businessSettings || {};
  const why = [
    ["Genuine or premium parts", "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z M9 12l2 2 4-4"],
    ["Price match guarantee", "M20 12l-8 8-9-9V3h8l9 9z M7.5 7.5h.01"],
    ["1-year warranty on devices", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 7v5l3 2"],
    ["Free express shipping over $100", "M3 7h11v9H3z M14 10h4l3 3v3h-7 M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
    ["Same-day repairs in store", "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z"],
    ["Phones, tablets, laptops & watches", "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2"],
  ];
  const col = (title, links) => (
    <nav aria-label={title} className="sf-col">
      <div className="sf-h">{title}</div>
      {links.map(([label, to]) => <a key={label} href={to} className="sf-link">{label}</a>)}
    </nav>
  );

  return (
    <footer className="sf">
      <style>{`
        .sf { margin-top: 56px; background: #F6F8FC; border-top: 1px solid ${line}; font-family: 'Archivo', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; font-size: 14px; }
        .sf-in { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
        .sf-why { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 24px; padding: 26px 0; border-bottom: 1px solid ${line}; }
        .sf-why div { display: flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 600; color: #1F2937; }
        .sf-why svg { flex: none; color: ${brass}; }
        .sf-main { display: grid; grid-template-columns: minmax(0, 1.6fr) repeat(4, minmax(0, 1fr)); gap: 32px; padding: 34px 0 30px; }
        .sf-col { display: flex; flex-direction: column; gap: 9px; }
        .sf-h { font-weight: 700; font-size: 14px; margin-bottom: 4px; color: #111827; }
        .sf-link { color: ${muted}; text-decoration: none; line-height: 1.35; width: fit-content; transition: color .15s ease; }
        .sf-link:hover { color: ${brass}; }
        .sf-contact { display: flex; flex-direction: column; gap: 7px; color: ${muted}; line-height: 1.4; }
        .sf-contact a { color: #1F2937; text-decoration: none; }
        .sf-contact a:hover { color: ${brass}; }
        .sf-wa { display: inline-flex; align-items: center; gap: 8px; width: fit-content; margin-top: 6px; padding: 9px 14px; border-radius: 999px; background: #25D366; color: #fff !important; font-weight: 700; font-size: 13.5px; }
        .sf-bar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 16px 0 22px; border-top: 1px solid ${line}; font-size: 12.5px; color: ${muted}; }
        @media (max-width: 900px) { .sf-main { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 20px; } .sf-brand { grid-column: 1 / -1; } .sf-why { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 720px) { .sf-in { padding: 0 16px; } .sf-why { gap: 12px 14px; } .sf-why div { font-size: 12.5px; align-items: flex-start; } }
        @media (prefers-reduced-motion: reduce) { .sf-link { transition: none; } }
      `}</style>
      <div className="sf-in">
        <div className="sf-why" aria-label="Why Mobile Recellr">
          {why.map(([t, d]) => (
            <div key={t}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>{t}</div>
          ))}
        </div>
        <div className="sf-main">
          <div className="sf-brand">
            <div style={{ fontFamily: "'Outfit', 'Archivo', sans-serif", fontSize: 22, letterSpacing: "-0.015em", marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
              <img src="/logo-mark.svg" alt="" width="21" height="29" /><span><span style={{ fontWeight: 400 }}>Mobile</span> <span style={{ fontWeight: 800, color: brass }}>Recellr</span></span>
            </div>
            <div className="sf-contact">
              <span>{b.address || "Sydney, NSW"}</span>
              {b.phone && <a href={`tel:${b.phone.replace(/\s/g, "")}`}>{b.phone}</a>}
              {b.email && <a href={mailLink(b.email)}>{b.email}</a>}
              {b.hours && <span style={{ whiteSpace: "pre-line" }}>{b.hours}</span>}
              {b.abn && <span>ABN {b.abn}</span>}
              {b.dealerLicence && <span>Licensed second-hand dealer · Licence {b.dealerLicence}</span>}
              <a className="sf-wa" href={waLink(b.whatsapp, "Hi Mobile Recellr, ")} target="_blank" rel="noopener">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-1.3-.6-2.2-1.2-3-2.7-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.5l-.8-1.8c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.8.8-1 1.7-.7 2.8.4 1.6 1.4 2.9 2.7 4 1.7 1.4 3.2 2 4.9 1.9.9-.1 1.7-.7 2-1.5.1-.3.1-.6 0-.7l-.8-.4z" /></svg>
                WhatsApp us
              </a>
            </div>
          </div>
          {col("Shop", FOOTER_SHOP.map((l) => [l.label, l.to]))}
          {col("Sell", [["Sell iPhone", "/sell/apple"], ["Sell Samsung", "/sell/samsung"], ["Sell Google Pixel", "/sell/google"], ["All devices", "/quote"]])}
          {col("Company", [["About us", "/about"], ["Guides", "/blog"], ["Repair tutorials", "/tutorials"], ["FAQ", "/faq"]])}
          {col("Support", [["Help / Ask a question", "/help"], ["Contact us", "/contact"], ["30-day returns", "/terms#returns"], ["Warranty", "/terms#warranty"], ["Shipping & postage", "/terms#shipping"], ["Terms", "/terms"], ["Privacy policy", "/privacy"]])}
        </div>
        <div className="sf-bar">
          <span>© {new Date().getFullYear()} Mobile Recellr · Sydney, Australia · Prices in AUD</span>
          <span style={{ fontWeight: 700, color: brass }}>More life. Less landfill.</span>
        </div>
      </div>
    </footer>
  );
}
