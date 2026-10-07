import React, { useState } from "react";

// Repair tutorials. Videos are EMBEDDED from YouTube (permitted by YouTube's
// terms when the creator allows embedding) — never downloaded or re-hosted —
// so creators keep credit and views. Nothing loads from YouTube until a
// visitor taps play: fast on mobile data and better for privacy.
// To add a video: copy the ID after "v=" in its YouTube link.
const SECTIONS = [
  {
    title: "Screen replacement",
    blurb: "Cracked or unresponsive display. Usually the most common DIY repair.",
    videos: [
      { id: "NsogJw5praA", title: "iPhone 14 / 14 Plus screen replacement", source: "YouTube" },
      { id: "4KcbK2jEGMY", title: "iPhone 14 Pro Max screen replacement", source: "YouTube" },
      { id: "FNR0YoB5eM8", title: "iPhone X screen replacement", source: "YouTube" },
    ],
  },
  {
    title: "Back glass replacement",
    blurb: "Shattered rear glass. Harder than a screen on most models — heat and adhesive are involved.",
    videos: [
      { id: "XIRq8o4qEpA", title: "iPhone 13 back glass — step by step", source: "YouTube" },
      { id: "qu3UL1jm6k0", title: "iPhone 13 back glass — professional repair", source: "YouTube" },
    ],
  },
];

const ink = "#FFFFFF", panel = "#FFFFFF", paper = "#111827", muted = "#5B6472", brass = "#2150C8", red = "#8B2E2E", line = "#E2E6EC";

function Video({ v }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="cs-card" style={{ border: `1px solid ${line}`, background: panel, padding: 12, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden", background: "#1b1b1b" }}>
        {playing ? (
          <iframe src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`} title={v.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
        ) : (
          <button onClick={() => setPlaying(true)} aria-label={`Play: ${v.title}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, padding: 0, cursor: "pointer", background: "#1b1b1b" }}>
            <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.9 }} />
            <span aria-hidden="true" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 64, height: 64, borderRadius: "50%",
              background: "rgba(33,80,200,0.92)", color: "#fff", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>▶</span>
          </button>
        )}
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, margin: "12px 2px 6px" }}>{v.title}</div>
      <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener" style={{ fontSize: 12.5, color: muted, margin: "0 2px" }}>Watch on YouTube ↗</a>
    </div>
  );
}

export default function Tutorials() {
  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 16px 80px" }}>
        <h1 style={{ margin: 0, fontWeight: 400, fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em", marginBottom: 8 }}>Repair tutorials</h1>
        <div style={{ color: muted, fontSize: 15, lineHeight: 1.6, maxWidth: 680, marginBottom: 22 }}>
          Want to fix it yourself? These step-by-step videos show how screen and back glass repairs are done. Watch first — then decide whether to DIY or let us handle it.
        </div>

        <div role="note" style={{ border: `2px solid ${red}`, borderRadius: 14, background: "#FBF1EF", padding: 18, marginBottom: 30 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: red }}>⚠️ Before you start</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.75 }}>
            <li><strong>Batteries can catch fire</strong> if punctured or bent. Never pry against the battery.</li>
            <li><strong>Heat is needed</strong> to soften adhesive; too much damages cables and the display.</li>
            <li><strong>Water resistance is lost</strong> unless new adhesive seals are fitted properly.</li>
            <li><strong>Newer iPhones may show an "unknown part" message</strong> after some part swaps, and features like True Tone or Face ID can be affected.</li>
            <li>Opening the device yourself can affect any remaining manufacturer warranty. Back up your data first.</li>
          </ul>
        </div>

        {SECTIONS.map((s) => (
          <div key={s.title} style={{ marginBottom: 36 }}>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 21, marginBottom: 4 }}>{s.title}</div>
            <div style={{ color: muted, fontSize: 14, marginBottom: 14 }}>{s.blurb}</div>
            <div className="mv-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {s.videos.map((v) => <Video key={v.id} v={v} />)}
            </div>
          </div>
        ))}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 30 }}>
          <a href="/repairs" className="cs-card" style={{ display: "block", border: `2px solid ${brass}`, background: panel, padding: 20, textDecoration: "none", color: paper }}>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 6 }}>Rather we do it?</div>
            <div style={{ color: muted, fontSize: 13.5, marginBottom: 10 }}>Price match guarantee, genuine parts, done same day in store.</div>
            <span style={{ color: brass, fontWeight: 700 }}>Book a repair →</span>
          </a>
          <a href="/accessories" className="cs-card" style={{ display: "block", border: `1px solid ${line}`, background: panel, padding: 20, textDecoration: "none", color: paper }}>
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, marginBottom: 6 }}>Doing it yourself?</div>
            <div style={{ color: muted, fontSize: 13.5, marginBottom: 10 }}>DIY repair kits, tools and screen protectors in stock.</div>
            <span style={{ color: brass, fontWeight: 700 }}>Shop parts &amp; kits →</span>
          </a>
        </div>

        <div style={{ fontSize: 13.5, color: muted, lineHeight: 1.7 }}>
          <strong style={{ color: paper }}>Official written guides:</strong>{" "}
          <a href="https://support.apple.com/self-service-repair" target="_blank" rel="noopener" style={{ color: brass }}>Apple Self Service Repair manuals</a>{" · "}
          <a href="https://www.ifixit.com/Device/iPhone" target="_blank" rel="noopener" style={{ color: brass }}>iFixit iPhone repair guides</a>
          <br />Videos are made by independent creators and shown from YouTube. Mobile Recellr isn't responsible for third-party content, and following them is at your own risk.
        </div>
      </div>
    </div>
  );
}
