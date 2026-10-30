// AI assistant for staff (portal command bar).
//   POST /ai/command { text }  -> one structured action the portal shows as an editable preview
//                                 (new repair, customer, reminder, expense, search, open a screen).
//                                 Nothing is saved here: staff check it and press "Do it".
//   POST /ai/ask { question }  -> a short answer about the business, from totals worked out
//                                 here (sales, repairs, stock, expenses by month, top models).
//                                 No customer names, phones or emails are sent to the model.
// Claude via the Anthropic SDK when ANTHROPIC_API_KEY is set; otherwise Groq (GROQ_API_KEY),
// the same keys the website chat uses. Without either, both answer 503.
const { z } = require("zod");

const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
const REPAIR_TYPES = ["screen", "battery", "charge_port", "back_glass", "camera", "speaker_mic", "water_damage", "software", "other"];
const SCREENS = ["dashboard", "repairs", "my_day", "new_job", "visits", "parts", "register", "sell", "sales", "inventory", "accessories", "inspection", "till", "customers", "reports", "pricing", "team"];
const EXPENSE_CATEGORIES = ["Rent", "Wages", "Utilities", "Supplies", "Marketing", "Insurance", "Other"];

const S = z.string().nullable();
const Action = z.object({
  action: z.enum(["new_repair", "add_customer", "reminder", "expense", "find", "open", "none"]),
  summary: z.string().describe("One short line, in the language the staff member used, saying what will happen"),
  repair: z.object({
    name: S, phone: S, email: S, brand: S, model: S,
    repairType: z.enum(REPAIR_TYPES).nullable(), issue: S, price: z.number().nullable(),
    promisedAt: S.describe("ISO 8601 date-time in Sydney local time, e.g. 2026-10-31T17:00"),
    assignTo: S, partNeeded: S, passcode: S,
  }).nullable(),
  customer: z.object({ name: S, phone: S, email: S, note: S }).nullable(),
  reminder: z.object({ customer: S, text: S, when: S.describe("ISO 8601 date-time, Sydney local") }).nullable(),
  expense: z.object({ category: z.enum(EXPENSE_CATEGORIES).nullable(), description: S, amount: z.number().nullable(), date: S }).nullable(),
  query: S.describe("What to search for, for action find"),
  screen: z.enum(SCREENS).nullable(),
});

function provider() {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  return null;
}
let client = null;
function anthropic() {
  if (!client) { const Anthropic = require("@anthropic-ai/sdk"); client = new Anthropic(); }
  return client;
}
const sydneyNow = () => new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

const COMMAND_SYSTEM = `You turn a phone repair shop staff member's instruction into one action for their system. They may write in English, Hindi or Hinglish, with typos.
Actions:
- new_repair: book in a repair (customer, device, what's wrong, price, when it's promised, technician, part needed, passcode).
- add_customer: save a new customer.
- reminder: a reminder to call or follow up a customer at a time.
- expense: record a shop expense (rent, wages, supplies...).
- find: search for a customer, job, phone or sale.
- open: go to a screen.
- none: anything else, or when it's unclear; say what's missing in summary.
Rules: fill only what was said or clearly implied; leave the rest null. Never invent phone numbers, emails or prices. Times are Sydney local; turn "kal 5 baje" / "tomorrow 5pm" into an ISO date-time. A brand can be inferred from the model (iPhone -> Apple, Galaxy -> Samsung, Pixel -> Google). repairType must be one of the listed ids. Write summary in the same language the staff member used.`;

async function parseCommand(text, ctx) {
  const context = `Now: ${sydneyNow()} (Sydney). Team: ${ctx.team.join(", ") || "unknown"}. Screens: ${SCREENS.join(", ")}.`;
  if (provider() === "anthropic") {
    const { zodOutputFormat } = require("@anthropic-ai/sdk/helpers/zod");
    const res = await anthropic().messages.parse({
      model: MODEL, max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Action) },
      system: COMMAND_SYSTEM,
      messages: [{ role: "user", content: `${context}\n\nInstruction: ${text}` }],
    });
    if (res.stop_reason === "refusal") return { action: "none", summary: "Can't help with that one." };
    if (!res.parsed_output) throw new Error("no structured output");
    return res.parsed_output;
  }
  // Groq: JSON mode, then the same schema check.
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ model: process.env.CHAT_MODEL || "llama-3.3-70b-versatile", temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "system", content: `${COMMAND_SYSTEM}\nReply with JSON only, with these keys: action, summary, repair, customer, reminder, expense, query, screen (null when not used). repair has: name, phone, email, brand, model, repairType, issue, price, promisedAt, assignTo, partNeeded, passcode. customer: name, phone, email, note. reminder: customer, text, when. expense: category, description, amount, date.` },
        { role: "user", content: `${context}\n\nInstruction: ${text}` }] }),
  });
  if (!r.ok) throw new Error(`groq ${r.status}`);
  const j = await r.json();
  const parsed = Action.safeParse(JSON.parse(j.choices[0].message.content));
  if (!parsed.success) throw new Error("bad shape");
  return parsed.data;
}

// Totals for "ask your data": numbers only, no personal details.
function businessSummary({ sales = [], tickets = [], inventory = [], expenses = [], orders = [] }) {
  const month = (iso) => String(iso || "").slice(0, 7);
  const months = {};
  const m = (k) => (months[k] = months[k] || { revenue: 0, sales: 0, refunds: 0, repairsDone: 0, repairRevenue: 0, phonesSold: 0, accessoriesSold: 0, expenses: 0, tradeInsPaid: 0 });
  for (const s of sales) { if (!s || !s.soldAt) continue; const r = m(month(s.soldAt)); const v = Number(s.salePrice) || 0; r.revenue += v; if (s.refundOf) r.refunds += -v; else { r.sales += 1; if (s.channel === "repair") r.repairRevenue += v; else if (s.brand === "Accessory") r.accessoriesSold += 1; else r.phonesSold += 1; } }
  for (const t of tickets) if (t && !t.deleted && t.status === "completed" && t.completedAt) m(month(t.completedAt)).repairsDone += 1;
  for (const e of expenses) if (e && e.date) m(month(e.date)).expenses += Number(e.amount) || 0;
  for (const o of orders) if (o && o.status === "approved_paid") m(month(o.paidAt || o.createdAt)).tradeInsPaid += 1;
  const count = (arr, key) => { const c = {}; arr.forEach((x) => { const k = key(x); if (k) c[k] = (c[k] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10); };
  const live = tickets.filter((t) => t && !t.deleted);
  return {
    byMonth: Object.fromEntries(Object.entries(months).sort().slice(-13).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Math.round(b)]))])),
    repairsOpen: live.filter((t) => !["completed", "not_repairable", "cancelled"].includes(t.status)).length,
    repairsByStatus: count(live, (t) => t.status),
    topRepairedModels: count(live, (t) => t.device && `${t.device.brand || ""} ${t.device.model || ""}`.trim()),
    topRepairTypes: count(live, (t) => t.repairTypeId),
    technicians: count(live.filter((t) => t.status === "completed"), (t) => t.assignedTo),
    stock: { phones: inventory.filter((i) => i && ["in_stock", "listed", "in_repair", "reserved"].includes(i.status)).length,
      atCost: Math.round(inventory.filter((i) => i && ["in_stock", "listed"].includes(i.status)).reduce((a, i) => a + (Number(i.costBasis) || 0), 0)) },
  };
}

function register(app, { requireAuth, hasArea, makeLimiter, loadSharedList }) {
  const limit = makeLimiter(60, 60 * 60 * 1000);
  const fail = (res, e) => { console.error("ai:", e && e.message); res.status(502).json({ error: "The assistant couldn't answer just now. Try again, or do it by hand." }); };

  app.post("/ai/command", requireAuth, async (req, res) => {
    if (!provider()) return res.status(503).json({ error: "The AI assistant needs ANTHROPIC_API_KEY (or GROQ_API_KEY) on the server." });
    if (!limit(req)) return res.status(429).json({ error: "Too many requests this hour." });
    const text = String((req.body && req.body.text) || "").trim().slice(0, 600);
    if (!text) return res.status(400).json({ error: "Say what you want to do." });
    try {
      const team = Array.isArray(req.body.team) ? req.body.team.map(String).slice(0, 30) : [];
      res.json({ ok: true, result: await parseCommand(text, { team }) });
    } catch (e) { fail(res, e); }
  });

  app.post("/ai/ask", requireAuth, async (req, res) => {
    if (!provider()) return res.status(503).json({ error: "The AI assistant needs ANTHROPIC_API_KEY (or GROQ_API_KEY) on the server." });
    if (!hasArea(req.user, "reports")) return res.status(403).json({ error: "Owner and managers only." });
    if (!limit(req)) return res.status(429).json({ error: "Too many requests this hour." });
    const q = String((req.body && req.body.question) || "").trim().slice(0, 400);
    if (!q) return res.status(400).json({ error: "Ask a question." });
    try {
      const [sales, tickets, inventory, expenses, orders] = await Promise.all(["sales", "repair_tickets", "inventory", "expenses", "orders"].map((k) => loadSharedList(k)));
      const data = businessSummary({ sales, tickets, inventory, expenses, orders });
      const system = "You answer a phone repair shop owner's questions about their business from the numbers given (AUD, months as YYYY-MM, Sydney). Answer in the language they asked in, in 2 to 5 short sentences or a few bullet points. Use only these numbers; if they don't cover the question, say what's missing. End with one practical suggestion when it helps.";
      const user = `Now: ${sydneyNow()}.\nNumbers:\n${JSON.stringify(data)}\n\nQuestion: ${q}`;
      let answer = "";
      if (provider() === "anthropic") {
        const r = await anthropic().messages.create({ model: MODEL, max_tokens: 4000, output_config: { effort: "low" }, system, messages: [{ role: "user", content: user }] });
        answer = r.stop_reason === "refusal" ? "I can't answer that one." : r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      } else {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
          body: JSON.stringify({ model: process.env.CHAT_MODEL || "llama-3.3-70b-versatile", temperature: 0.2, max_tokens: 500, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
        if (!r.ok) throw new Error(`groq ${r.status}`);
        answer = ((await r.json()).choices[0].message.content || "").trim();
      }
      res.json({ ok: true, answer, data });
    } catch (e) { fail(res, e); }
  });
}

module.exports = { register, businessSummary, Action };
