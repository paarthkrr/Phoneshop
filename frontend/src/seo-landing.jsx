// One page per real Sydney search (see seo-pages.js): the answer, live prices, how it
// works, FAQ, and the next step. The same text is written into the page's HTML at build.
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SEO_PAGES, pagePrices } from "./seo-pages.js";
import useRepairPrices from "./use-repair-prices.js";

const paper = "var(--mr-text)", muted = "var(--mr-muted)", brass = "var(--mr-brand)", line = "var(--mr-line)", panel = "var(--mr-surface)";

function InStock() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const r = window.storage && await window.storage.get("inventory", true);
        const list = r ? JSON.parse(r.value) : [];
        setItems((Array.isArray(list) ? list : []).filter((i) => i && i.status === "listed").sort((a, b) => (a.listedPrice || 0) - (b.listedPrice || 0)).slice(0, 6));
      } catch (e) { setItems([]); }
    })();
  }, []);
  if (!items) return null;
  if (!items.length) return <p style={{ color: muted, fontSize: 15 }}>New stock is being graded right now. <Link to="/contact" style={{ color: brass }}>Tell us what you're after</Link> and we'll let you know when it's in.</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, margin: "0 0 8px" }}>
      {items.map((i) => (
        <Link key={i.id} to={`/shop?item=${encodeURIComponent(i.id)}`} style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 12, background: panel, color: paper, textDecoration: "none" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{i.brand} {i.model}</div>
          <div style={{ fontSize: 12.5, color: muted }}>{i.storage}{i.gradeId ? ` · Grade ${i.gradeId}` : ""}</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>${Math.round(i.listedPrice).toLocaleString()}</div>
        </Link>
      ))}
    </div>
  );
}

export default function SeoLanding({ slug: fixed }) {
  const loc = useLocation();
  const slug = fixed || loc.pathname.replace(/^\/|\/$/g, "");
  const page = SEO_PAGES[slug];
  const prices = useRepairPrices();
  const [open, setOpen] = useState(0);
  if (!page) return null;
  const rows = pagePrices(page, prices);
  const h2 = { fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 21, margin: "34px 0 12px", letterSpacing: "-0.01em" };
  return (
    <div style={{ color: paper, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 16px 72px" }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: muted, marginBottom: 14 }}><Link to="/" style={{ color: muted }}>Home</Link> › {page.h1}</nav>
        <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: "clamp(28px, 5vw, 40px)", lineHeight: 1.1, margin: "0 0 14px", textWrap: "balance" }}>{page.h1}</h1>
        {page.intro.map((p, i) => <p key={i} style={{ fontSize: 16.5, lineHeight: 1.65, margin: "0 0 14px", color: i ? muted : paper }}>{p}</p>)}

        {rows.length > 0 && (
          <div style={{ border: `1px solid ${line}`, borderRadius: 16, overflow: "hidden", margin: "22px 0", background: panel }}>
            {rows.map((r, i) => (
              <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 18px", borderTop: i ? `1px solid ${line}` : "none" }}>
                <span style={{ fontWeight: 600 }}>{r.device} {r.name.toLowerCase()}</span>
                <span style={{ fontWeight: 800, fontSize: 18, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>from ${r.from}</span>
              </div>
            ))}
            <div style={{ padding: "10px 18px", fontSize: 12.5, color: muted, borderTop: `1px solid ${line}` }}>Starting prices. The exact price for your model and part is confirmed before any work.</div>
          </div>
        )}
        {page.stock && <><h2 style={h2}>In stock now</h2><InStock /></>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "22px 0 6px" }}>
          <Link to={page.cta[0]} className="cs-btn" style={{ padding: "14px 22px", borderRadius: 12, background: "var(--mr-brand-fill)", color: "#fff", fontWeight: 700, textDecoration: "none" }}>{page.cta[1]} →</Link>
          <Link to="/contact" style={{ padding: "14px 22px", borderRadius: 12, border: `1.5px solid ${line}`, color: paper, fontWeight: 700, textDecoration: "none" }}>Ask a question</Link>
        </div>

        {page.sections.map((s) => (
          <section key={s.h}>
            <h2 style={h2}>{s.h}</h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.65, fontSize: 15.5 }}>{s.list.map((x) => <li key={x} style={{ marginBottom: 8 }}>{x}</li>)}</ul>
          </section>
        ))}

        <h2 style={h2}>Questions people ask</h2>
        <div style={{ borderTop: `1px solid ${line}` }}>
          {page.faq.map(([q, a], i) => (
            <div key={q} style={{ borderBottom: `1px solid ${line}` }}>
              <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}
                style={{ width: "100%", textAlign: "left", padding: "14px 0", background: "none", border: "none", color: paper, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{q}</span><span aria-hidden="true" style={{ color: muted }}>{open === i ? "−" : "+"}</span>
              </button>
              {open === i && <p style={{ margin: "0 0 14px", color: muted, lineHeight: 1.65, fontSize: 15.5 }}>{a}</p>}
            </div>
          ))}
        </div>

        <h2 style={h2}>Related</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {page.links.map(([to, label]) => <Link key={to} to={to} style={{ padding: "9px 14px", borderRadius: 999, border: `1px solid ${line}`, color: paper, textDecoration: "none", fontSize: 14 }}>{label}</Link>)}
        </div>
      </div>
    </div>
  );
}
