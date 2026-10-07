// Activity log: who changed what in the staff portal, and an email to the
// owner for the changes that matter (money, prices, deletions, bank details,
// the team). Everything is logged; only "important" changes are emailed, and
// they're bundled so a burst of edits sends one email, not twenty.

// Values that must never be written into the log or an email.
const SENSITIVE = /bank|bsb|account|paypal|idowner|idnumber|idtype|password|secret|token|signature|imagebase64|dataurl/i;
const MAX_FIELDS = 12, MAX_EVENTS = 60;

const AREA_NAMES = {
  orders: "Trade-in orders", inventory: "Phone stock", sales: "Sales", repair_tickets: "Repairs", parts_stock: "Parts stock",
  "pricing-config": "Prices & business settings", "pricing-history": "Price history", price_match_requests: "Price match",
  expenses: "Expenses", till_records: "Till", accessories: "Accessories", accessory_orders: "Accessory orders",
  purchase_orders: "Phone orders", referrals: "Referrals", quote_leads: "Quote leads", support_queries: "Support messages",
  bulk_quote_requests: "Bulk quotes", repair_requests: "Repair requests", notification_queue: "Customer messages", team: "Team",
};
const areaName = (k) => AREA_NAMES[k] || k.replace(/[_-]/g, " ");

function show(v) {
  if (v === undefined || v === null || v === "") return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}
// Flatten a record to "a.b.c" paths (arrays are compared whole).
function flatten(obj, prefix = "", out = {}, depth = 0) {
  if (obj && typeof obj === "object" && !Array.isArray(obj) && depth < 3) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  } else out[prefix || "(value)"] = obj;
  return out;
}
function fieldChanges(before, after) {
  const a = flatten(before), b = flatten(after);
  const changes = [];
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (f === "statusLog" || f === "updatedAt") continue; // noise: these change with every edit
    if (JSON.stringify(a[f]) === JSON.stringify(b[f])) continue;
    changes.push(SENSITIVE.test(f) ? { field: f, hidden: true } : { field: f, from: show(a[f]), to: show(b[f]) });
  }
  return changes;
}
const parse = (json) => { try { return JSON.parse(json); } catch (e) { return null; } };
const label = (r) => {
  if (!r || typeof r !== "object") return "";
  const dev = r.device && typeof r.device === "object" ? [r.device.brand, r.device.model].filter(Boolean).join(" ") : "";
  return [r.id, r.name || (r.customer && r.customer.name) || r.customerName, dev || [r.brand, r.model].filter(Boolean).join(" ") || r.description || r.category].filter(Boolean).join(" · ");
};
const money = (n) => (Number.isFinite(Number(n)) ? `$${Number(n).toFixed(2).replace(/\.00$/, "")}` : "");

// Why a change deserves an email right away (null = log only). Several
// reasons can apply to one change; all are listed.
function importance(key, action, before, after, changes) {
  const has = (f) => changes.some((c) => c.field === f || c.field.startsWith(f + "."));
  const to = (f) => after && f.split(".").reduce((o, k) => (o == null ? o : o[k]), after);
  if (action === "removed") return "deleted";
  if (key === "pricing-config" || key === "pricing-history") return "prices or business settings changed";
  if (key === "expenses") return action === "added" ? `expense added ${money(after && after.amount)}` : "expense edited";
  const why = [];
  if (key === "orders" && action === "changed") {
    if (has("status") && to("status") === "approved_paid") why.push(`trade-in payout approved ${money((after.inspection && after.inspection.confirmedTotal) ?? after.quotedTotal)}`);
    else if (has("inspection.confirmedTotal") || has("quotedTotal")) why.push("trade-in amount changed");
  }
  if (changes.some((c) => c.hidden && /bank|bsb|account|paypal/i.test(c.field))) why.push("bank / payout details changed");
  if (key === "inventory" && action === "changed") {
    if (has("status") && to("status") === "written_off") why.push(`stock written off (cost ${money(after.costBasis)})`);
    if (has("costBasis")) why.push("stock buy price changed");
  }
  if (key === "sales" && action === "changed" && (has("salePrice") || has("costBasis"))) why.push("a recorded sale's amount changed");
  if (key === "repair_tickets" && action === "changed" && (has("techPay") || (before && before.status === "completed" && has("finalPrice")))) why.push("repair pay or final price changed");
  if (key === "till_records" && action === "changed" && has("closed") && to("closed") && Number(after.discrepancy)) why.push(`till closed ${Number(after.discrepancy) > 0 ? "over" : "short"} by ${money(Math.abs(after.discrepancy))}`);
  return why.length ? why.join("; ") : null;
}

// One save of a shared list → log events.
function diffSave(key, beforeJson, afterJson) {
  const before = parse(beforeJson), after = parse(afterJson);
  const events = [];
  const asList = (v) => Array.isArray(v) && v.every((r) => r && typeof r === "object" && r.id != null);
  if (asList(after) && (before == null || asList(before))) {
    const old = new Map((before || []).map((r) => [String(r.id), r]));
    const now = new Map(after.map((r) => [String(r.id), r]));
    for (const [id, r] of now) {
      const prev = old.get(id);
      if (!prev) { events.push({ recordId: id, action: "added", summary: label(r), changes: [], important: importance(key, "added", null, r, []) }); continue; }
      const changes = fieldChanges(prev, r);
      if (changes.length) events.push({ recordId: id, action: "changed", summary: label(r), changes: changes.slice(0, MAX_FIELDS), important: importance(key, "changed", prev, r, changes) });
    }
    for (const [id, r] of old) if (!now.has(id)) events.push({ recordId: id, action: "removed", summary: label(r), changes: [], important: importance(key, "removed", r, null, []) });
  } else {
    const changes = fieldChanges(before, after);
    if (changes.length) events.push({ recordId: "", action: before == null ? "added" : "changed", summary: "", changes: changes.slice(0, MAX_FIELDS), important: importance(key, "changed", before, after, changes) });
  }
  if (events.length > MAX_EVENTS) {
    const extra = events.length - MAX_EVENTS;
    const important = events.slice(MAX_EVENTS).some((e) => e.important);
    events.length = MAX_EVENTS;
    events.push({ recordId: "", action: "changed", summary: `…and ${extra} more records in the same save`, changes: [], important: important ? "many records changed at once" : null });
  }
  return events;
}

function describe(e) {
  const verb = { added: "added", changed: "changed", removed: "deleted", note: "" }[e.action] ?? e.action;
  const fields = (e.changes || []).map((c) => (c.hidden ? `${c.field} (changed, hidden)` : `${c.field}: ${c.from} → ${c.to}`)).join("; ");
  return `${verb}${e.summary ? `${verb ? " " : ""}${e.summary}` : ""}${fields ? ` — ${fields}` : ""}`;
}

// Bundles important changes into one email, sent ~90s after the first one.
function makeAlerter({ send, delayMs = 90 * 1000, max = 40, when = () => new Date().toISOString() }) {
  let pending = [], timer = null;
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending.length) return;
    const items = pending; pending = [];
    const who = [...new Set(items.map((i) => i.username))].join(", ");
    const subject = items.length === 1 ? `Portal change: ${items[0].reason} (${items[0].username})` : `Portal changes: ${items.length} important (${who})`;
    const lines = items.map((i) => `• ${i.time} — ${i.username} (${i.role}), ${areaName(i.area)}: ${i.reason}\n  ${describe(i.event)}`);
    send(subject, [`These changes were just made in the staff portal:`, lines.join("\n\n"), "Everything else is in Activity in the portal. If something here wasn't expected, check with the person straight away."]);
  }
  return {
    add(item) {
      pending.push({ ...item, time: item.time || when() });
      if (pending.length >= max) return flush();
      if (!timer) { timer = setTimeout(flush, delayMs); if (timer.unref) timer.unref(); }
    },
    flush,
  };
}

module.exports = { diffSave, describe, areaName, makeAlerter, importance, AREA_NAMES };
