import React, { useState } from "react";

const ink = "#F7F4EC", panel = "#FFFFFF", paper = "#201C18", muted = "#6B6560",
  brass = "#2150C8", line = "#201C18";

// Real questions a phone repair/trade-in customer actually has, answered
// honestly against what this system actually does — not generic filler.
// Each answer ties back to a real, working feature (price match, warranty,
// grading) rather than making claims the business can't back up.
const FAQS = [
  {
    q: "How does the price match guarantee actually work?",
    a: "Find the same repair or the same device cheaper somewhere else? Show us the quote and we'll match it. This isn't a marketing line — you can submit a price match request directly through our quote tool, and a real person reviews it, not an algorithm.",
  },
  {
    q: "Do you really only use genuine parts?",
    a: "Yes. We started this business specifically because other shops were quoting expensive part replacements for problems that were often just dust or debris — a dishonest markup on something simple. We diagnose honestly first, and when a part genuinely needs replacing, it's a genuine part, never an unmarked aftermarket substitute.",
  },
  {
    q: "What devices do you repair?",
    a: "Phones, tablets, laptops, and watches — not just one brand. Screens, batteries, charging ports, and more, most done same day.",
  },
  {
    q: "How long does a repair take?",
    a: "Most common repairs — screens, batteries, charging ports — are done same day. Your exact quote and turnaround depends on the model and what's actually wrong, which we'll tell you honestly before we start.",
  },
  {
    q: "How does selling my old phone work?",
    a: "Answer a few questions about your device's condition, get an instant quote, and if you accept it, we inspect the device once we receive it to confirm the price. If anything doesn't match what you described, we'll tell you before finalizing anything — never a surprise deduction after the fact.",
  },
  {
    q: "Is the refurbished stock actually tested?",
    a: "Every device is graded (A, B, or C) based on a real inspection before it's listed, and comes with a 12-month warranty — the same warranty whether you're buying a phone or getting one repaired.",
  },
  {
    q: "What if I'm not happy with a repair or a device I bought?",
    a: "Every repair and every device we sell carries a 12-month warranty. If something's genuinely wrong, bring it back.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');`}</style>
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": FAQS.map((f) => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a },
        })),
      })}</script>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 16px 80px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 32, letterSpacing: "-0.01em", marginBottom: 30 }}>
          Frequently asked questions
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAQS.map((f, i) => {
            const open = openIndex === i;
            return (
              <div key={i} style={{ border: `2px solid ${line}`, borderRadius: 3, background: panel, overflow: "hidden" }}>
                <button onClick={() => setOpenIndex(open ? null : i)} aria-expanded={open}
                  style={{ width: "100%", textAlign: "left", padding: "16px 18px", background: "none", border: "none", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 700, color: paper }}>
                  {f.q}
                  <span style={{ color: brass, fontSize: 20, flexShrink: 0, transition: "transform 0.2s ease", transform: open ? "rotate(45deg)" : "none" }}>+</span>
                </button>
                {open && (
                  <div className="cs-fade" style={{ padding: "0 18px 18px", color: muted, fontSize: 14, lineHeight: 1.7 }}>
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 40, borderTop: `2px solid ${line}`, paddingTop: 24, textAlign: "center" }}>
          <div style={{ color: muted, fontSize: 14, marginBottom: 14 }}>Still have a question?</div>
          <a href="/contact" className="cs-btn" style={{ padding: "12px 24px", background: brass, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", borderRadius: 3, display: "inline-block" }}>Contact Us</a>
        </div>
      </div>
    </div>
  );
}
