import { withBusinessDefaults, waLink, mailLink } from "./business-info.js";
import React, { useState, useRef, useEffect } from "react";

const brass = "#2150C8", ink = "#FFFFFF", panel = "#FFFFFF", paper = "#111827", muted = "#5B6472", line = "#E2E6EC";

const KNOWLEDGE = [
  { keywords: ["price match", "cheaper", "match", "guarantee"], a: "Yes — find the same repair or device cheaper elsewhere and we'll match it. Submit a price match request through our quote tool and a real person reviews it." },
  { keywords: ["genuine", "parts", "fake", "aftermarket"], a: "Always genuine parts, never unmarked aftermarket substitutes. We built this business specifically because other shops were overcharging for simple fixes using cheap parts." },
  { keywords: ["what devices", "repair", "tablet", "laptop", "watch", "types"], a: "Phones, tablets, laptops, and watches — not just one brand." },
  { keywords: ["how long", "turnaround", "wait", "same day", "quick", "fast"], a: "In store, most repairs are done the same day, often while you wait, if the part is in stock. Mail-in repairs are usually back with you within 3–5 business days of arriving, plus postage time." },
  { keywords: ["sell", "trade", "trade-in", "quote"], a: "Answer a few questions about your device, get an instant quote, and we inspect it once we receive it to confirm the price — no surprise deductions." },
  { keywords: ["warranty", "guarantee period", "1 year", "90 day", "12 month"], a: "Devices we sell have a 1-year warranty. Repairs have 90 days, and parts and accessories 6 months. Physical or liquid damage isn't covered." },
  { keywords: ["tested", "graded", "condition", "refurbished"], a: "Every device is graded (A, B, or C) based on a real inspection before it's listed." },
  { keywords: ["track", "order", "status", "where is my"], a: "You can track your order yourself — tap 'Track an order' or 'Track a purchase' at the bottom of the homepage or shop page, no waiting on a reply." },
];

function findAnswer(text) {
  const q = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const entry of KNOWLEDGE) {
    const score = entry.keywords.filter((k) => q.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return bestScore > 0 ? best.a : null;
}

const QUICK_ACTIONS = [
  { label: "Track my order", href: "/quote" },
  { label: "Get a quote to sell my phone", href: "/quote" },
  { label: "Browse refurbished stock", href: "/shop" },
  { label: "See all FAQs", href: "/faq" },
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hey — ask me anything about repairs, trade-ins, or an order. I'll do my best, and I'll point you to a real person if I can't help." },
  ]);
  const [input, setInput] = useState("");
  const [biz, setBiz] = useState(() => withBusinessDefaults(null));
  useEffect(() => {
    (async () => {
      try { const r = window.storage && (await window.storage.get("pricing-config", true)); if (r) setBiz(withBusinessDefaults(JSON.parse(r.value).businessSettings)); } catch (e) { /* keep defaults */ }
    })();
  }, []);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    const answer = findAnswer(text);
    const userMsg = { from: "user", text };
    const botMsg = answer
      ? { from: "bot", text: answer }
      : { from: "bot", text: "I'm not sure on that one, but our team can help right away. Message us on WhatsApp (fastest) or email:", escalate: true, originalQuestion: text };
    setMessages((m) => [...m, userMsg, botMsg]);
    setInput("");
  }

  return (
    <>
      <style>{`
        .cs-chat-fab { position: fixed; bottom: 20px; right: 20px; z-index: 1000; width: 56px; height: 56px; border-radius: 50%;
          background: ${brass}; color: #fff; border: none; cursor: pointer; font-size: 24px; box-shadow: 0 4px 16px rgba(32,28,24,0.25);
          display: flex; align-items: center; justify-content: center; transition: transform 0.15s ease; }
        .cs-chat-fab:hover { transform: scale(1.08); }
        .cs-chat-panel { position: fixed; bottom: 88px; right: 20px; z-index: 1000; width: min(340px, calc(100vw - 32px)); max-height: 460px;
          background: ${panel}; border: 1px solid ${line}; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 8px 30px rgba(32,28,24,0.3); font-family: 'Archivo', system-ui, sans-serif; }
        .has-mobile-cta .cs-chat-fab { bottom: 88px; } .has-mobile-cta .cs-chat-panel { bottom: 156px; }
        @media (min-width: 721px) { .has-mobile-cta .cs-chat-fab { bottom: 20px; } .has-mobile-cta .cs-chat-panel { bottom: 88px; } }
        @media (prefers-reduced-motion: no-preference) { .cs-chat-panel { animation: cs-fade-up 0.2s ease both; } }
        .cs-wa-fab { position: fixed; bottom: 86px; right: 24px; z-index: 1000; width: 48px; height: 48px; border-radius: 50%; background: #25D366; color: #fff;
          display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.22); text-decoration: none; transition: transform 0.15s ease; }
        .cs-wa-fab:hover { transform: scale(1.08); }
        .has-mobile-cta .cs-wa-fab { bottom: 154px; }
        @media (min-width: 721px) { .has-mobile-cta .cs-wa-fab { bottom: 86px; } }
        .cs-chat-open .cs-wa-fab { display: none; }
        .cs-contact-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; border-radius: 999px; text-decoration: none; }
      `}</style>

      {!open && (
        <a className="cs-wa-fab" href={waLink(biz.whatsapp, "Hi Mobile Recellr, ")} target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg>
        </a>
      )}
      <button className="cs-chat-fab" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close chat" : "Open chat"} aria-expanded={open}>
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div className="cs-chat-panel" role="dialog" aria-label="Chat with Mobile Recellr">
          <div style={{ background: paper, color: ink, padding: "12px 16px", fontWeight: 700, fontSize: 14 }}>Mobile Recellr Help</div>
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${line}`, background: "#F8FAFC" }}>
            <a className="cs-contact-btn" href={waLink(biz.whatsapp, "Hi Mobile Recellr, ")} target="_blank" rel="noopener" style={{ background: "#25D366", color: "#fff" }}><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg> WhatsApp us</a>
            <a className="cs-contact-btn" href={mailLink(biz.email)} style={{ border: `1.5px solid ${line}`, color: paper, background: "#fff" }}>✉️ Email us</a>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, minHeight: 200, maxHeight: 260 }}>
            {messages.map((m, i) => (
              <div key={i}>
                <div style={{
                  maxWidth: "85%", marginLeft: m.from === "user" ? "auto" : 0, padding: "9px 12px", borderRadius: 10,
                  background: m.from === "user" ? brass : "#F4F6F9", color: m.from === "user" ? "#fff" : paper, fontSize: 13, lineHeight: 1.5,
                }}>
                  {m.text}
                </div>
                {m.escalate && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    <a className="cs-contact-btn" href={waLink(biz.whatsapp, `Hi Mobile Recellr, ${m.originalQuestion}`)} target="_blank" rel="noopener" style={{ background: "#25D366", color: "#fff" }}><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg> Ask us on WhatsApp</a>
                    <a className="cs-contact-btn" href={mailLink(biz.email, "Question from the website", m.originalQuestion)} style={{ border: `1.5px solid ${brass}`, color: brass }}>✉️ Email us</a>
                    <a className="cs-contact-btn" href={`/help?q=${encodeURIComponent(m.originalQuestion)}`} style={{ color: muted }}>Leave a message →</a>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: "8px 12px", borderTop: "1px solid #eee", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {QUICK_ACTIONS.map((qa) => (
              <a key={qa.label} href={qa.href} style={{ fontSize: 12, padding: "5px 9px", border: `1px solid ${line}`, borderRadius: 999, color: paper, textDecoration: "none" }}>
                {qa.label}
              </a>
            ))}
          </div>

          <div style={{ display: "flex", borderTop: `1px solid ${line}` }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              placeholder="Type a question…" aria-label="Type a question"
              style={{ flex: 1, padding: "11px 12px", border: "none", outline: "none", fontSize: 13, fontFamily: "inherit" }} />
            <button onClick={handleSend} style={{ padding: "0 16px", border: "none", background: brass, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}
