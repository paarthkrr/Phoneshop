import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { POSTS } from "./blog-posts.js";

const ink = "var(--mr-bg)", panel = "var(--mr-surface)", paper = "var(--mr-text)", muted = "var(--mr-muted)",
  brass = "var(--mr-brand)", line = "var(--mr-line)";

// Real, useful guides tied to actual expertise and actual site features —
// each one written to genuinely help the reader, not just stuff keywords.
// slug doubles as the URL fragment and the schema's identifier.


// Each guide points to the page that answers the search behind it.
const RELATED = {
  "iphone-screen-repair-cost-sydney": ["/iphone-screen-repair-sydney", "iPhone screen repair in Sydney: prices and same-day booking"],
  "charging-port-dust-or-real-fault": ["/phone-repair-sydney", "Phone repair in Sydney, diagnosed before we quote"],
  "refurbished-grades-explained": ["/used-phones-sydney", "Used and refurbished phones in Sydney, graded and tested"],
  "how-much-is-my-old-phone-worth": ["/quote", "Get an instant quote for your phone"],
  "sell-phone-or-trade-in-with-apple-samsung": ["/quote", "Get an instant quote for your phone"],
  "how-to-prepare-your-phone-before-selling": ["/quote", "Ready? Get an instant quote"],
  "iphone-battery-health-when-to-replace": ["/iphone-battery-replacement-sydney", "iPhone battery replacement in Sydney, from $59"],
  "genuine-vs-premium-screen": ["/iphone-screen-repair-sydney", "iPhone screen repair in Sydney: genuine or premium, your choice"],
  "phone-dropped-in-water-what-to-do": ["/water-damage-phone-repair-sydney", "Water damaged phone repair in Sydney"],
  "repair-or-replace-your-phone": ["/phone-repair-sydney", "Phone repair in Sydney, diagnosed before we quote"],
};

export default function Blog() {
  const { slug } = useParams();
  const post = POSTS.find((p) => p.slug === slug);
  useEffect(() => { if (post) document.title = `${post.title} | Mobile Recellr`; }, [post]);

  if (slug && !post) {
    return (
      <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif", padding: 60, textAlign: "center" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, marginBottom: 10 }}>Guide not found</div>
        <a href="/blog" style={{ color: brass }}>← Back to all guides</a>
      </div>
    );
  }

  if (post) {
    return (
      <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=optional');`}</style>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": post.title,
          "datePublished": post.date,
          "author": { "@type": "Organization", "name": "Mobile Recellr" },
          "publisher": { "@type": "Organization", "name": "Mobile Recellr", "logo": { "@type": "ImageObject", "url": "https://mobilerecellr.com.au/logo-512.png" } },
          "mainEntityOfPage": `https://mobilerecellr.com.au/blog/${post.slug}`,
        })}</script>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px 80px" }}>
          <a href="/blog" style={{ color: brass, fontSize: 13, marginBottom: 20, display: "inline-block", textDecoration: "none" }}>← All guides</a>
          <h1 style={{ margin: 0, fontWeight: 400, fontFamily: "'Archivo Black', sans-serif", fontSize: 26, lineHeight: 1.15, marginBottom: 10 }}>{post.title}</h1>
          <div style={{ color: muted, fontSize: 12.5, marginBottom: 26 }}>{new Date(post.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</div>
          {post.body.map((para, i) => (
            <p key={i} style={{ fontSize: 15, lineHeight: 1.75, marginBottom: 18 }}>{para}</p>
          ))}
          {RELATED[post.slug] && (
            <p style={{ fontSize: 15, lineHeight: 1.75, marginBottom: 18 }}>
              Related: <a href={RELATED[post.slug][0]} style={{ color: brass }}>{RELATED[post.slug][1]}</a>
            </p>
          )}
          <div style={{ marginTop: 30, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/repairs" className="cs-btn" style={{ padding: "11px 20px", background: "var(--mr-brand-fill)", color: "#fff", fontSize: 13.5, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Book a repair</a>
            <a href="/quote" className="cs-btn" style={{ padding: "11px 20px", border: `1px solid ${line}`, color: paper, fontSize: 13.5, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Get a trade-in quote</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=optional');`}</style>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 16px 80px" }}>
        <h1 style={{ margin: 0, fontWeight: 400, fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em", marginBottom: 8 }}>Guides</h1>
        <div style={{ color: muted, fontSize: 14, marginBottom: 30 }}>Straight answers on repairs, trade-ins, and buying refurbished — no fluff.</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {POSTS.map((p) => (
            <a key={p.slug} href={`/blog/${p.slug}`} className="cs-card"
              style={{ textAlign: "left", padding: 18, border: `1px solid ${line}`, borderRadius: 3, background: panel, cursor: "pointer", color: paper, textDecoration: "none", display: "block" }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{p.title}</div>
              <div style={{ fontSize: 13.5, color: muted, marginBottom: 8 }}>{p.excerpt}</div>
              <div style={{ fontSize: 11.5, color: muted }}>{new Date(p.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
