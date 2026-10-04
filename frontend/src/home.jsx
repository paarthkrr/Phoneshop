import React, { useState, useEffect } from "react";
import DeviceArt from "./device-art.jsx";
import Photo from "./photo.jsx";
import DeviceArtCard, { inferDeviceType } from "./device-art.jsx";
import { PHONE_FAULT_GROUPS, BLOCKERS } from "./instant-quote-calculator.jsx";
import { mergeCatalog } from "./device-catalog.js";

// The real inspection checklist used by staff — so the "N-point check" number
// is always true, and updates itself if the checklist ever changes.
const CHECK_GROUPS = PHONE_FAULT_GROUPS.map((g) => ({ name: g.group || g.title || g.name, n: g.faults.length }));
const CHECK_COUNT = CHECK_GROUPS.reduce((n, g) => n + g.n, 0) + BLOCKERS.length;

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
  brass = "#2150C8", brassDim = "rgba(33,80,200,0.10)", line = "#E2E6EC";

// The three things people actually come here to do — each gets equal,
// prominent billing up top, the way PhoneExchange and Mobile Monster lead
// with their core actions rather than burying them.
const ACTIONS = [
  { href: "/quote", icon: "💰", title: "Sell your device", desc: "Instant quote, then we collect from your door anywhere in Sydney and pay you in cash.", cta: "Get a quote" },
  { href: "/shop", icon: "📱", title: "Buy refurbished", desc: "Graded, tested, 1-year warranty and free express shipping.", cta: "Shop now" },
  { href: "/repairs", icon: "🔧", title: "Get it repaired", desc: "Cheapest prices, genuine parts, done same day in store.", cta: "Book a repair" },
];

const POPULAR = ["iPhone 16 Pro", "iPhone 15 Pro", "iPhone 14", "Galaxy S24 Ultra", "Pixel 9 Pro", "iPhone 13"];

const TRUST = [
  { title: "Home collection across Sydney", desc: "We come to you, check your phone on the spot, and pay you — in cash if you like." },
  { title: "Genuine parts only", desc: "Never unmarked aftermarket substitutes." },
  { title: "Price match guarantee", desc: "Found it cheaper? We'll match it." },
  { title: "1-year warranty", desc: "On every device we sell. Repairs 90 days, parts & accessories 6 months." },
  { title: "Every gadget", desc: "Phones, tablets, laptops and watches." },
  { title: "Any condition", desc: "Cracked, dead or water-damaged — we still make an offer." },
  { title: "Data wiped securely", desc: "Every device is fully erased before it's resold." },
  { title: "30-day returns", desc: "Changed your mind? Return online purchases within 30 days. Conditions apply." },
  { title: "Battery 80%+ guaranteed", desc: "Every refurbished phone we sell. Conditions apply." },
];

const STEPS = [
  { n: "1", title: "Get your quote", desc: "Tell us the model and condition. Your price appears instantly." },
  { n: "2", title: "Send or drop it off", desc: "Post it to us or bring it in store — whichever suits you." },
  { n: "3", title: "Get paid", desc: "We inspect it and pay by bank transfer or PayPal. If anything differs, you choose whether to accept." },
];

const GUIDES = [
  { href: "/blog/charging-port-dust-or-real-fault", title: "Your charging port probably isn't broken" },
  { href: "/blog/refurbished-grades-explained", title: "What Grade A, B, or C actually means" },
  { href: "/blog/how-much-is-my-old-phone-worth", title: "How much is your old phone worth?" },
];

export default function Home() {
  const [stats, setStats] = useState([]);
  const [biz, setBiz] = useState({});
  const [featured, setFeatured] = useState(null);
  const [photos, setPhotos] = useState({});

  useEffect(() => {
    (async () => {
      const cfg = await loadJSON("pricing-config", true);
      const b = (cfg && cfg.businessSettings) || {};
      setBiz(b);
      setPhotos(Object.fromEntries(mergeCatalog(cfg && cfg.catalog).filter((d) => d.imageUrl).map((d) => [`${d.brand}|${d.model}`, d.imageUrl])));
      // Featured deal: the highest-value device actually listed for sale right now.
      try {
        const r = window.storage && await window.storage.get("inventory", true);
        const listed = r ? JSON.parse(r.value).filter((i) => i.status === "listed" && i.listedPrice > 0) : [];
        setFeatured(listed.sort((a, x) => x.listedPrice - a.listedPrice)[0] || null);
      } catch (e) { /* no stock yet */ }
      // Only show numbers the owner has actually entered — never invented ones.
      const s = [];
      if (b.yearsInBusiness) s.push({ value: `${b.yearsInBusiness}+`, label: "Years in business" });
      if (b.devicesSoldCount) s.push({ value: Number(b.devicesSoldCount).toLocaleString(), label: "Devices sold" });
      if (b.googleRating) s.push({ value: `${b.googleRating}★`, label: "Google rating" });
      setStats(s);
    })();
  }, []);

  const section = { maxWidth: 1000, margin: "0 auto", padding: "0 16px" };
  const heading = { fontFamily: "'Archivo Black', sans-serif", fontSize: 24, letterSpacing: "-0.01em", marginBottom: 18, textAlign: "center" };

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');
        @keyframes mv-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mv-glow { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.06); } }
        .mv-rise { animation: mv-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .mv-hero { position: relative; overflow: hidden; }
        .mv-hero::before { content: ""; position: absolute; top: -140px; left: 50%; width: 620px; height: 620px; margin-left: -310px;
          background: radial-gradient(circle, rgba(33,80,200,0.16) 0%, rgba(33,80,200,0) 65%); animation: mv-glow 7s ease-in-out infinite; pointer-events: none; }
        .mv-hero > * { position: relative; }
        .mv-action:hover { border-color: #2150C8 !important; }
        .mv-action:hover .mv-arrow { transform: translateX(5px); }
        .mv-arrow { display: inline-block; transition: transform 0.2s ease; }
        @keyframes mv-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        .mv-float { animation: mv-float 4.5s ease-in-out infinite; }
        .mv-chip { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; background: #fff;
          border: 1px solid rgba(32,28,24,0.16); color: #111827; text-decoration: none; font-size: 14px; font-weight: 600;
          transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease; }
        .mv-chip:hover { border-color: #2150C8; color: #2150C8; transform: translateY(-1px); }
        @media (prefers-reduced-motion: reduce) { .mv-rise, .mv-hero::before, .mv-float { animation: none !important; } }
      `}</style>

      {/* ---- Hero ---- */}
      <div className="mv-hero" style={{ ...section, textAlign: "center", padding: "56px 16px 34px" }}>
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 6, marginBottom: 18 }}>
          {[["watch", 34, "0s"], ["phone", 52, "0.6s"], ["laptop", 70, "1.2s"], ["tablet", 50, "1.8s"]].map(([t, sz, d]) => (
            <div key={t} className="mv-float" style={{ animationDelay: d }}><DeviceArt type={t} size={sz} /></div>
          ))}
        </div>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(30px, 6vw, 48px)", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 14 }}>
          Sell, buy, or fix your phone —<br /><span style={{ color: brass }}>honestly priced.</span>
        </div>
        <div style={{ color: muted, fontSize: 16, maxWidth: 560, margin: "0 auto 30px", lineHeight: 1.6 }}>
          Genuine parts, a real price match guarantee, and no inflated quotes for five-minute fixes. That's the whole idea.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, textAlign: "left" }}>
          {ACTIONS.map((a, i) => (
            <a key={a.href} href={a.href} className="cs-card mv-action mv-rise"
              style={{ animationDelay: `${0.15 + i * 0.1}s`, display: "block", border: `1px solid ${line}`, borderRadius: 4, padding: 22, background: panel, color: paper, textDecoration: "none" }}>
              <div style={{ fontSize: 30, marginBottom: 10 }} aria-hidden="true">{a.icon}</div>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 19, marginBottom: 6 }}>{a.title}</div>
              <div style={{ color: muted, fontSize: 13.5, marginBottom: 16, lineHeight: 1.5 }}>{a.desc}</div>
              <span style={{ color: brass, fontWeight: 700, fontSize: 14 }}>{a.cta} <span className="mv-arrow">→</span></span>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12.5, color: muted, marginBottom: 10, letterSpacing: "0.04em" }}>POPULAR RIGHT NOW — TAP FOR AN INSTANT QUOTE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {POPULAR.map((m) => (
              <a key={m} href={`/quote?q=${encodeURIComponent(m)}`} className="mv-chip">{m}</a>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: muted, marginTop: 14 }}>
            ✓ Home collection across Sydney &nbsp;·&nbsp; ✓ Paid in cash or bank transfer &nbsp;·&nbsp; ✓ Price held 14 days &nbsp;·&nbsp; ✓ Paid by bank transfer or PayPal
          </div>
        </div>

        {stats.length > 0 && (
          <div style={{ display: "flex", gap: 34, justifyContent: "center", flexWrap: "wrap", marginTop: 34 }}>
            {stats.map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, color: brass }}>{s.value}</div>
                <div style={{ fontSize: 12, color: muted }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Featured deal (only when stock is listed) ---- */}
      {featured && (
        <div style={{ ...section, marginBottom: 34 }}>
          <a href="/shop" className="cs-card" style={{ display: "flex", alignItems: "center", gap: 18, border: "2px solid #2150C8", background: panel, padding: 18, color: paper, textDecoration: "none", flexWrap: "wrap" }}>
            <DeviceArtCard type={inferDeviceType(featured.model, featured.category)} size={78} brand={featured.brand} model={featured.model}
              imageUrl={featured.photoUrl || photos[`${featured.brand}|${featured.model}`]} label={`${featured.brand} ${featured.model}`} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: brass, letterSpacing: "0.06em", marginBottom: 4 }}>FEATURED DEAL</div>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 20 }}>{featured.brand} {featured.model}</div>
              <div style={{ color: muted, fontSize: 13.5 }}>{featured.storage} · Graded, tested, 1-year warranty, free express shipping</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, color: brass }}>${Math.round(featured.listedPrice).toLocaleString()}</div>
              <div style={{ color: brass, fontWeight: 700, fontSize: 13.5 }}>Shop now →</div>
            </div>
          </a>
        </div>
      )}

      {/* ---- Trust strip ---- */}
      <div style={{ borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}`, background: panel, padding: "26px 16px", marginBottom: 50 }}>
        <div style={{ ...section, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
          {TRUST.map((t, i) => (
            <div key={t.title} className="mv-rise" style={{ animationDelay: `${0.45 + i * 0.08}s` }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}><span style={{ color: brass }}>✓</span> {t.title}</div>
              <div style={{ color: muted, fontSize: 13 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Photo feature band ---- */}
      <div style={{ ...section, marginBottom: 50 }}>
        <Photo name="workshop" height={320} overlay="linear-gradient(90deg, rgba(20,24,40,0.82) 0%, rgba(20,24,40,0.55) 55%, rgba(20,24,40,0.1) 100%)">
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 clamp(20px, 5vw, 44px)", maxWidth: 480, color: "#fff" }}>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "clamp(22px, 4vw, 30px)", lineHeight: 1.15, marginBottom: 10 }}>Real technicians.<br />Genuine parts.</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.6, opacity: 0.92, marginBottom: 18 }}>We diagnose first and tell you honestly what's wrong, before quoting anything.</div>
            <a href="/repairs" className="cs-btn" style={{ alignSelf: "flex-start", padding: "12px 22px", background: "#fff", color: "#111827", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 10 }}>Book a repair →</a>
          </div>
        </Photo>
      </div>

      {/* ---- How selling works ---- */}
      <div style={{ ...section, marginBottom: 50 }}>
        <div style={heading}>Selling your phone takes three steps</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} className="mv-rise" style={{ animationDelay: `${0.1 + i * 0.1}s`, border: `1px solid ${line}`, borderRadius: 4, padding: 20, background: panel }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: brass, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginBottom: 12 }}>{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{s.title}</div>
              <div style={{ color: muted, fontSize: 13.5, lineHeight: 1.55 }}>{s.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 22 }}>
          <a href="/quote" className="cs-btn" style={{ padding: "13px 26px", background: brass, color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Get your instant quote</a>
        </div>
      </div>

      {/* ---- Before you sell ---- */}
      <div style={{ ...section, marginBottom: 50 }}>
        <div style={heading}>Before you sell: 2 minutes of prep</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          {[{"i": "💾", "t": "Back it up", "d": "iCloud, Google, or your computer."}, {"i": "🔓", "t": "Sign out & turn off Find My", "d": "Settings → your name → Find My (iPhone), or remove your Google/Samsung account (Android). Locked phones can't be accepted."}, {"i": "🧹", "t": "Erase it", "d": "Settings → General → Transfer or Reset → Erase All Content (iPhone), or Factory reset (Android)."}, {"i": "📶", "t": "Remove your SIM", "d": "And any memory card."}].map((c) => (
            <div key={c.t} style={{ background: panel, border: "1px solid rgba(32,28,24,0.12)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 24, marginBottom: 6 }} aria-hidden="true">{c.i}</div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>{c.t}</div>
              <div style={{ color: muted, fontSize: 13, lineHeight: 1.5 }}>{c.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Our inspection checklist ---- */}
      <div style={{ ...section, marginBottom: 50 }}>
        <div style={heading}>Every device passes our {CHECK_COUNT}-point check</div>
        <div style={{ color: muted, fontSize: 14, textAlign: "center", maxWidth: 620, margin: "-8px auto 18px", lineHeight: 1.6 }}>
          The same checklist we use to inspect every trade-in, so you know exactly what's been tested.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {[...CHECK_GROUPS, { name: "Security & lock checks", n: BLOCKERS.length }].map((g) => (
            <div key={g.name} style={{ background: panel, border: "1px solid rgba(32,28,24,0.12)", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.name}</span>
              <span style={{ fontSize: 12.5, color: brass, fontWeight: 800, whiteSpace: "nowrap" }}>{g.n} checks</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Repairs ---- */}
      <div style={{ ...section, marginBottom: 50 }}>
        <div style={heading}>Cheapest repairs, done same day in store</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {[["📱", "Screen replacement", "From $85", "Cracked or unresponsive display."], ["🔋", "Battery replacement", "From $59", "Phone dying by lunchtime?"],
            ["🔌", "Charging port", "From $55", "Often just dust — we check and clean first."], ["📷", "Camera repair", "From $75", "Blurry, cracked or not focusing."]].map(([i, t, p, d]) => (
            <a key={t} href="/repairs" className="cs-card" style={{ display: "block", border: "1px solid #E2E6EC", background: panel, padding: 16, color: paper, textDecoration: "none" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }} aria-hidden="true">{i}</div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t}</div>
              <div style={{ color: brass, fontWeight: 700, fontSize: 14, margin: "3px 0 6px" }}>{p}</div>
              <div style={{ color: muted, fontSize: 13 }}>{d}</div>
            </a>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13.5 }}>
          Cheapest prices · Same day in store · Mail-in Australia-wide · 90-day warranty · <a href="/repairs" style={{ color: brass, fontWeight: 700 }}>See all repairs →</a> · <a href="/tutorials" style={{ color: brass }}>DIY tutorials</a>
        </div>
      </div>

      {/* ---- Brands ---- */}
      <div style={{ ...section, marginBottom: 50, textAlign: "center" }}>
        <div style={{ color: muted, fontSize: 12.5, marginBottom: 12, letterSpacing: "0.04em" }}>WE BUY, SELL AND REPAIR</div>
        <div style={{ display: "flex", justifyContent: "center", gap: "clamp(18px, 5vw, 44px)", flexWrap: "wrap" }}>
          {[["Apple", "apple"], ["Samsung", "samsung"], ["Google", "google"], ["OPPO", "oppo"], ["Motorola", "motorola"], ["Xiaomi", "xiaomi"]].map(([b, slug]) => (
            <a key={b} href={`/sell/${slug}`} title={`Sell your ${b === "Apple" ? "iPhone" : b}`} style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 17, color: muted, textDecoration: "none" }}>{b}</a>
          ))}
        </div>
      </div>

      {/* ---- Why we exist ---- */}
      <div style={{ ...section, marginBottom: 50 }}>
        <div style={{ border: `1px solid ${line}`, borderRadius: 4, padding: 28, background: brassDim }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 21, marginBottom: 10 }}>Why we started this</div>
          <div style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 14, maxWidth: 700 }}>
            We kept seeing people charged $150 for a "broken" charging port that was really just full of dust. So we built a shop that checks the simple explanation first — and only charges for a real repair when one's actually needed.
          </div>
          <a href="/about" style={{ color: brass, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Read our story →</a>
        </div>
      </div>

      {/* ---- Visit us (only once the address is set in Business settings) ---- */}
      {biz.address && (
        <div style={{ ...section, marginBottom: 50 }}>
          <div style={{ border: "1px solid #E2E6EC", borderRadius: 14, background: panel, padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 21, marginBottom: 8 }}>Visit us in store</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>{biz.address}</div>
              {biz.hours && <div style={{ color: muted, fontSize: 13.5, lineHeight: 1.6, marginTop: 4, whiteSpace: "pre-line" }}>{biz.hours}</div>}
              <div style={{ color: muted, fontSize: 13, marginTop: 8 }}>Bring your phone in for a free check and an instant offer. Negotiation? We're listening.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.address)}`} target="_blank" rel="noopener" className="cs-btn"
                style={{ padding: "13px 20px", background: brass, color: "#fff", fontWeight: 700, textDecoration: "none", borderRadius: 10, textAlign: "center" }}>📍 Get directions</a>
              {biz.phone && <a href={`tel:${biz.phone.replace(/\s/g, "")}`} className="cs-btn"
                style={{ padding: "13px 20px", border: "1.5px solid #E2E6EC", color: paper, fontWeight: 700, textDecoration: "none", borderRadius: 10, textAlign: "center" }}>📞 Call {biz.phone}</a>}
            </div>
          </div>
        </div>
      )}

      {/* ---- Guides ---- */}
      <div style={{ ...section, marginBottom: 50 }}>
        <div style={heading}>Straight answers</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {GUIDES.map((g) => (
            <a key={g.href} href={g.href} className="cs-card"
              style={{ display: "block", border: `1px solid ${line}`, borderRadius: 4, padding: 18, background: panel, color: paper, textDecoration: "none", fontWeight: 600, fontSize: 14.5, lineHeight: 1.4 }}>
              {g.title} <span style={{ color: brass }}>→</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
