// Website chat assistant: POST /public/chat
// - Works only when ANTHROPIC_API_KEY is set (otherwise answers { mode: "faq" } and the page uses its built-in answers).
// - Cost and abuse limits: per-visitor limits, a daily cap for the whole site, short inputs, short outputs.
// - Answers come only from chat-knowledge.js (site policies) plus the live refurbished stock list.
const { buildSystemPrompt, ALLOWED_PATH } = require("./chat-knowledge.js");

const ALLOWED_EXTERNAL = (href, waNum) => href === `https://wa.me/${waNum}` || href.startsWith(`https://wa.me/${waNum}?`);
const GRADE = { A: "grade A", B: "grade B", C: "grade C" };

// Keep only links the site really has; anything else becomes plain text.
function cleanReply(text, waNum) {
  let handoff = false;
  let out = String(text || "").replace(/\[\[HANDOFF\]\]/gi, () => { handoff = true; return ""; });
  out = out.replace(/\[([^\]]{1,80})\]\(([^)\s]{1,200})\)/g, (m, label, href) => ((ALLOWED_PATH.test(href) || ALLOWED_EXTERNAL(href, waNum)) ? `[${label}](${href})` : label));
  out = out.replace(/https?:\/\/(?!wa\.me\/)\S+/gi, "").replace(/<[^>]*>/g, "");
  out = out.replace(/\n{3,}/g, "\n\n").trim().slice(0, 1200);
  return { reply: out, handoff };
}

function register(app, { loadSharedList, loadSharedValue, makeLimiter, clientKey }) {
  const shortLimit = makeLimiter(parseInt(process.env.CHAT_PER_5MIN || "15", 10), 5 * 60 * 1000);
  const dayLimit = makeLimiter(parseInt(process.env.CHAT_PER_DAY || "80", 10), 24 * 60 * 60 * 1000);
  let day = "", used = 0;
  let ctx = { at: 0, business: {}, stock: [] };

  async function liveContext() {
    if (Date.now() - ctx.at < 60 * 1000) return ctx;
    try {
      const cfg = (await loadSharedValue("pricing-config")) || {};
      const inv = await loadSharedList("inventory");
      const stock = inv.filter((i) => i && i.status === "listed" && i.model).slice(0, 40)
        .map((i) => `${i.brand || ""} ${i.model}${i.storage ? " " + i.storage : ""}, ${GRADE[i.gradeId] || "graded"}${Number.isFinite(Number(i.listedPrice)) ? `, $${Math.round(Number(i.listedPrice))}` : ""}`.trim());
      ctx = { at: Date.now(), business: cfg.businessSettings || {}, stock };
    } catch (e) { ctx = { ...ctx, at: Date.now() }; }
    return ctx;
  }

  // Thumbs up/down on AI answers. Only counted and logged (no text), so we can see how it is doing.
  const feedbackLimit = makeLimiter(30, 24 * 60 * 60 * 1000);
  const feedback = { up: 0, down: 0 };
  app.post("/public/chat/feedback", (req, res) => {
    if (!feedbackLimit(req)) return res.status(429).json({ error: "too_many" });
    const rating = req.body && req.body.rating;
    if (rating !== "up" && rating !== "down") return res.status(400).json({ error: "bad_request" });
    feedback[rating] += 1;
    console.log(`chat feedback: ${rating} (since last restart: up=${feedback.up}, down=${feedback.down})`);
    return res.json({ ok: true });
  });

  app.post("/public/chat", async (req, res) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.json({ mode: "faq", reply: null });
    if (!shortLimit(req) || !dayLimit(req)) return res.status(429).json({ mode: "limited", error: "too_many_messages" });

    const raw = req.body && Array.isArray(req.body.messages) ? req.body.messages : null;
    if (!raw || !raw.length || raw.length > 40) return res.status(400).json({ error: "bad_request" });
    let msgs = raw.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.trim().slice(0, m.role === "user" ? 500 : 1200) })).slice(-10);
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "bad_request" });

    const today = new Date().toISOString().slice(0, 10);
    if (day !== today) { day = today; used = 0; }
    const cap = parseInt(process.env.CHAT_DAILY_LIMIT || "600", 10);
    if (used >= cap) return res.json({ mode: "faq", reply: null, capped: true });
    used += 1;

    const c = await liveContext();
    const waDigits = String(c.business.whatsapp || c.business.phone || "0411 931 999").replace(/\D/g, "");
    const waNum = waDigits.startsWith("0") ? "61" + waDigits.slice(1) : waDigits;
    const page = typeof req.body.page === "string" && /^\/[A-Za-z0-9/_?=&%.-]{0,60}$/.test(req.body.page) ? req.body.page : "";
    if (process.env.CHAT_LOG === "1") console.log("chat question:", msgs[msgs.length - 1].content.replace(/\d/g, "#").slice(0, 160));
    const started = Date.now();
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.CHAT_MODEL || "claude-haiku-4-5-20251001", max_tokens: 420, temperature: 0.3, system: buildSystemPrompt({ business: c.business, stock: c.stock, page }), messages: msgs }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await r.text();
      if (!r.ok) { console.error("chat model error:", r.status, body.slice(0, 200)); return res.status(502).json({ mode: "faq", reply: null, error: "unavailable" }); }
      const data = JSON.parse(body);
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const { reply, handoff } = cleanReply(text, waNum);
      if (!reply) return res.json({ mode: "faq", reply: null });
      console.log(`chat reply ${Date.now() - started}ms in=${data.usage && data.usage.input_tokens} out=${data.usage && data.usage.output_tokens}`);
      return res.json({ mode: "ai", reply, handoff });
    } catch (e) {
      console.error("chat error:", e.message);
      return res.status(502).json({ mode: "faq", reply: null, error: "unavailable" });
    }
  });
}

module.exports = { register, cleanReply };
