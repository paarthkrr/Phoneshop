import React, { useEffect } from "react";
import { useParams } from "react-router-dom";

const ink = "#F7F4EC", panel = "#FFFFFF", paper = "#201C18", muted = "#6B6560",
  brass = "#2150C8", line = "#201C18";

// Real, useful guides tied to actual expertise and actual site features —
// each one written to genuinely help the reader, not just stuff keywords.
// slug doubles as the URL fragment and the schema's identifier.
const POSTS = [
  {
    slug: "charging-port-dust-or-real-fault",
    title: "Your charging port probably isn't broken — here's how to tell",
    excerpt: "Before you pay for a part replacement, check for the single most common (and cheapest) cause of charging problems.",
    date: "2026-01-15",
    body: [
      "If your phone has suddenly become fussy about charging — you have to hold the cable at a weird angle, or it just won't connect at all — the instinctive assumption is that the charging port itself is broken and needs replacing. Most of the time, that's wrong.",
      "The single most common cause of charging problems is lint and dust packed into the port. Pockets are dusty places, and a charging port is a small, wide-open cavity that collects debris every time your phone sits in one. Over months, that buildup is enough to block the pins from making a clean connection.",
      "Before paying anyone for a repair, try this: power off the phone, and shine a flashlight into the port. If you see a grey or dark fuzzy buildup rather than clean metal, that's your answer. A wooden toothpick (never metal, and never while the phone is charging) can gently clear visible debris. A can of compressed air held at a slight angle also works well and is genuinely the safer option.",
      "If the port is clean and the problem persists — the cable has to be held at an exact angle, or charging cuts in and out even with a known-good cable — that's when it's actually a hardware fault, and a real part replacement is the right call.",
      "We built this business because too many shops don't bother checking the simple explanation first, and quote a full port replacement — often $150 or more — for what's really a five-minute clean. We check first, always, and only charge for a genuine repair when one is actually needed.",
    ],
  },
  {
    slug: "refurbished-grades-explained",
    title: "What 'Grade A, B, or C' actually means when buying refurbished",
    excerpt: "Every refurbished phone gets a grade. Here's what each one actually looks like in person, so you know what you're buying.",
    date: "2026-01-22",
    body: [
      "Grading exists because 'refurbished' on its own tells you almost nothing — a phone with a hairline scratch and a phone with a cracked back panel could both technically be called refurbished. A grade is a shorthand for cosmetic condition, checked and assigned by a real person before the device is ever listed.",
      "Grade A means the device looks close to new — no visible scratches at typical viewing distance, screen and body both clean. Grade B means light, honest wear: small marks that don't affect the screen or function, the kind you'd expect from a phone that's had a case on it for a year. Grade C means more visible wear — noticeable scratches or small dings — but still fully functional and tested.",
      "What grading is never about is function. Every device we list, regardless of grade, has been tested the same way: battery health checked, all ports and buttons confirmed working, screen checked for dead pixels. Grade is purely cosmetic. A Grade C phone works exactly as well as a Grade A one — you're choosing how much cosmetic wear you're comfortable with, not how reliable the phone is.",
      "Every grade also carries the same 1-year warranty. If you're comfortable with a bit of visible wear, a Grade C device is usually the best value in the shop.",
    ],
  },
  {
    slug: "how-much-is-my-old-phone-worth",
    title: "How much is your old phone actually worth right now?",
    excerpt: "Trade-in values move constantly. Here's what actually drives the number, so a quote makes sense instead of feeling arbitrary.",
    date: "2026-02-03",
    body: [
      "Trade-in quotes can feel like they're pulled out of thin air, but they're driven by a small number of concrete factors, and knowing them makes any quote easier to sanity-check.",
      "Age is the biggest factor by far — resale value drops fastest in a device's first year, then levels off. A phone released 18 months ago is worth meaningfully less than the same phone at 6 months old, independent of condition.",
      "Condition is the second factor: a cracked screen, a swollen or degraded battery, or a non-working button all reduce the offer, because those are real costs someone has to cover before the device can be resold. This is exactly why we inspect every device after it arrives — the online quote is our best estimate sight-unseen, and the confirmed price reflects what we actually find.",
      "Storage capacity matters too — a 256GB phone is worth more than the same model at 64GB, though the gap narrows as the model ages, since demand shifts toward whatever configuration is still commonly needed.",
      "If a quote doesn't match what you expected, ask why — a fair shop can explain the number in terms of these factors. And if you ever get a lower number after we inspect your device than what we quoted, you can decline and we'll return it to you. No pressure to accept.",
    ],
  },
];

export default function Blog() {
  const { slug } = useParams();
  const post = POSTS.find((p) => p.slug === slug);
  useEffect(() => { if (post) document.title = `${post.title} | Mobile Vault`; }, [post]);

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
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": post.title,
          "datePublished": post.date,
          "author": { "@type": "Organization", "name": "Mobile Vault" },
        })}</script>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px 80px" }}>
          <a href="/blog" style={{ color: brass, fontSize: 13, marginBottom: 20, display: "inline-block", textDecoration: "none" }}>← All guides</a>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 26, lineHeight: 1.15, marginBottom: 10 }}>{post.title}</div>
          <div style={{ color: muted, fontSize: 12.5, marginBottom: 26 }}>{new Date(post.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</div>
          {post.body.map((para, i) => (
            <p key={i} style={{ fontSize: 15, lineHeight: 1.75, marginBottom: 18 }}>{para}</p>
          ))}
          <div style={{ marginTop: 30, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/repairs" className="cs-btn" style={{ padding: "11px 20px", background: brass, color: "#fff", fontSize: 13.5, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Book a repair</a>
            <a href="/quote" className="cs-btn" style={{ padding: "11px 20px", border: `2px solid ${line}`, color: paper, fontSize: 13.5, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Get a trade-in quote</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 16px 80px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em", marginBottom: 8 }}>Guides</div>
        <div style={{ color: muted, fontSize: 14, marginBottom: 30 }}>Straight answers on repairs, trade-ins, and buying refurbished — no fluff.</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {POSTS.map((p) => (
            <a key={p.slug} href={`/blog/${p.slug}`} className="cs-card"
              style={{ textAlign: "left", padding: 18, border: `2px solid ${line}`, borderRadius: 3, background: panel, cursor: "pointer", color: paper, textDecoration: "none", display: "block" }}>
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
