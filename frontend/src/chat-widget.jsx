import React, { useState, useRef, useEffect } from "react";

const brass = "#2150C8", ink = "#F7F4EC", panel = "#FFFFFF", paper = "#201C18", muted = "#6B6560", line = "#201C18";

const KNOWLEDGE = [
  { keywords: ["price match", "cheaper", "match", "guarantee"], a: "Yes — find the same repair or device cheaper elsewhere and we'll match it. Submit a price match request through our quote tool and a real person reviews it." },
  { keywords: ["genuine", "parts", "fake", "aftermarket"], a: "Always genuine parts, never unmarked aftermarket substitutes. We built this business specifically because other shops were overcharging for simple fixes using cheap parts." },
  { keywords: ["what devices", "repair", "tablet", "laptop", "watch", "types"], a: "Phones, tablets, laptops, and watches — not just one brand." },
  { keywords: ["how long", "turnaround", "wait", "same day", "quick", "fast"], a: "Most common repairs — screens, batteries, charging ports — are done same day." },
  { keywords: ["sell", "trade", "trade-in", "quote"], a: "Answer a few questions about your device, get an instant quote, and we inspect it once we receive it to confirm the price — no surprise deductions." },
  { keywords: ["warranty", "guarantee period", "12 month"], a: "Every repair and every device we sell carries a 12-month warranty." },
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
  { label: "Track my order", href: "/" },
  { label: "Get a quote to sell my phone", href: "/" },
  { label: "Browse refurbished stock", href: "/shop" },
  { label: "See all FAQs", href: "/faq" },
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hey — ask me anything about repairs, trade-ins, or an order. I'll do my best, and I'll point you to a real person if I can't help." },
  ]);
  const [input, setInput] = useState("");
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
      : { from: "bot", text: "I'm not sure on that one — but a real person can help.", escalate: true, originalQuestion: text };
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
          background: ${panel}; border: 2px solid ${line}; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 8px 30px rgba(32,28,24,0.3); font-family: 'Archivo', system-ui, sans-serif; }
        @media (prefers-reduced-motion: no-preference) { .cs-chat-panel { animation: cs-fade-up 0.2s ease both; } }
      `}</style>

      <button className="cs-chat-fab" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close chat" : "Open chat"} aria-expanded={open}>
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div className="cs-chat-panel" role="dialog" aria-label="Chat with Mobile Vault">
          <div style={{ background: paper, color: ink, padding: "12px 16px", fontWeight: 700, fontSize: 14 }}>Mobile Vault Help</div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, minHeight: 200, maxHeight: 260 }}>
            {messages.map((m, i) => (
              <div key={i}>
                <div style={{
                  maxWidth: "85%", marginLeft: m.from === "user" ? "auto" : 0, padding: "9px 12px", borderRadius: 10,
                  background: m.from === "user" ? brass : "#F0EBE0", color: m.from === "user" ? "#fff" : paper, fontSize: 13, lineHeight: 1.5,
                }}>
                  {m.text}
                </div>
                {m.escalate && (
                  <a href={`/help?q=${encodeURIComponent(m.originalQuestion)}`} className="cs-btn"
                    style={{ display: "inline-block", marginTop: 6, padding: "7px 12px", fontSize: 12, fontWeight: 700, color: brass, border: `1.5px solid ${brass}`, borderRadius: 3, textDecoration: "none" }}>
                    Ask a real person →
                  </a>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: "8px 12px", borderTop: "1px solid #eee", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {QUICK_ACTIONS.map((qa) => (
              <a key={qa.label} href={qa.href} style={{ fontSize: 11, padding: "5px 9px", border: `1px solid ${line}`, borderRadius: 999, color: paper, textDecoration: "none" }}>
                {qa.label}
              </a>
            ))}
          </div>

          <div style={{ display: "flex", borderTop: `2px solid ${line}` }}>
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
