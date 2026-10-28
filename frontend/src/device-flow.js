// One phone's journey through the shop: trade-in → stock → (repair) → listed → sold.
// Inspection, Register and Repairs all create stock items and shop repair jobs from
// here, so a phone looks the same wherever it was bought and moves between screens
// without anyone retyping it.

const rnd = () => Math.floor(100000 + Math.random() * 900000);

// IMEIs carry a Luhn check digit, which catches most typos before they reach stock.
export function imeiProblem(raw) {
  const s = String(raw || "").replace(/\s|-/g, "");
  if (!s) return "Enter the IMEI (dial *#06# on the phone)";
  if (!/^\d{15}$/.test(s)) return "An IMEI is 15 digits";
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(s[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0 ? "" : "That IMEI doesn't check out — read it again";
}
export const cleanImei = (raw) => String(raw || "").replace(/\s|-/g, "");

// A stock item for a phone the shop now owns. faults: labels of what's wrong with it.
export function newStockItem({ brand, model, storage, imei, costBasis, region = "AU", currency, sourceOrderId = null, faults = [], staff, needsRepair = false }) {
  const now = new Date().toISOString();
  return {
    id: `INV-${rnd()}`, sourceOrderId, brand, model, storage, imei: cleanImei(imei), gradeId: null,
    costBasis: Math.round((Number(costBasis) || 0) * 100) / 100, currency, region,
    status: needsRepair ? "in_repair" : "in_stock", listedPrice: null, faults,
    receivedAt: now, soldAt: null, staffHandled: staff || "unattributed",
  };
}

// A repair job on the shop's own phone (no customer, no payment). Same shape the
// Repairs screen creates, so it shows in its "shop phones" list and, when finished,
// adds parts and labour to the phone's cost and puts it back in stock.
export function newShopRepairJob({ item, issue, staff }) {
  const now = new Date().toISOString();
  const by = staff || "unattributed";
  return {
    id: `RPR-${rnd()}`, createdAt: now, status: "dropped_off", jobType: "shop",
    customer: { name: "Shop stock", phone: "", email: "" },
    device: { brand: item.brand, model: item.model, imei: item.imei || "", storage: item.storage || "", colour: item.colour || "", condition: "" },
    inventoryItemId: item.id, symptoms: [], partsNeeded: [], priority: "normal", dueAt: null,
    assignedTo: null, assignedAt: null, issue: issue || "Fix up to sell", repairTypeId: null, estimateMins: 0,
    quotedPrice: 0, deposit: 0, depositPayMethod: null, depositAt: null,
    parts: [], finalPrice: null, warrantyDays: 90, warrantyOf: null,
    staffHandled: by, notifiedAt: null, completedAt: null,
    statusLog: [{ status: "dropped_off", at: now, by }],
  };
}

// Prepend one record to a shared list. The server merges shared lists by id, so a
// record added here is never lost to someone else saving the same list meanwhile.
export async function addToSharedList(key, record) {
  if (typeof window === "undefined" || !window.storage) return false;
  try {
    const r = await window.storage.get(key, true);
    const list = r ? JSON.parse(r.value) : [];
    await window.storage.set(key, JSON.stringify([record, ...(Array.isArray(list) ? list : [])]), true);
    return true;
  } catch (e) {
    return false;
  }
}

// ---- Grades, sources and the price standard ----
// The shop's standard: a phone of a grade should sell for its cost × markup.
// Cost here is the FULL cost (what we paid plus every repair's parts and labour).
export const GRADES = [
  { id: "A", label: "Grade A — Excellent", markup: 1.35 },
  { id: "B", label: "Grade B — Good", markup: 1.20 },
  { id: "C", label: "Grade C — Fair", markup: 1.08 },
  { id: "parts", label: "Parts only", markup: 0.5 },
];
export const SOURCES = ["Walk-in", "Facebook Marketplace", "Gumtree", "eBay", "Wholesale / auction", "Online trade-in", "Other"];
export const sourceOf = (item) => item.source || (item.sourceOrderId ? "Online trade-in" : item.id && String(item.id).startsWith("QA-") ? "Quick Add (scanner)" : "Walk-in");

// A shop price ending in 9 at the top of its ten ($742 → $749, $1,000 → $999).
export const shopPrice = (n) => (n > 0 ? Math.max(9, Math.ceil(n / 10) * 10 - 1) : 0);
export function targetPrice(cost, gradeId) {
  const g = GRADES.find((x) => x.id === gradeId);
  return g && cost > 0 ? shopPrice(cost * g.markup) : null;
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ---- Phones that aren't selling ----
// After AGED_DAYS in stock, suggest a ~5% drop to the next price ending in 9, never
// below cost. null when it's not aged, has no price, or a drop would go under cost.
export const AGED_DAYS = 30;
export function agedDrop(item, now = new Date()) {
  const price = Number(item && item.listedPrice), cost = Number(item && item.costBasis) || 0;
  const since = item && (item.listedAt || item.receivedAt);
  if (!since || !(price > 0) || !["in_stock", "listed"].includes(item.status)) return null;
  const age = Math.floor((now - new Date(since)) / 864e5);
  if (!(age > AGED_DAYS)) return null;
  const suggested = Math.max(9, Math.floor((price * 0.95 + 1) / 10) * 10 - 1);
  if (suggested >= price || suggested <= cost) return null;
  return { days: age, suggested };
}

// A ready-to-paste listing for Facebook Marketplace / Gumtree.
export function marketplaceListing(item, { site = "https://mobilerecellr.com.au", suburb = "Sydney" } = {}) {
  const g = GRADES.find((x) => x.id === item.gradeId);
  const name = [item.brand, item.model, item.storage].filter(Boolean).join(" ");
  const title = `${name}${g ? ` - ${g.label.split("— ")[1] || g.label}` : ""} - 12 month warranty`;
  const lines = [
    `${name}${item.colour ? `, ${item.colour}` : ""}. ${g ? `${g.label.replace(" — ", ": ")}.` : ""}`.trim(),
    "Tested by our technicians, IMEI checked (not blocked, not stolen), factory reset and ready to use.",
    "12-month warranty and 30-day returns from Mobile Recellr, a real shop, not a private seller.",
    `Pick up in ${suburb} or we can post it. Pay by cash or bank transfer.`,
    `See photos and buy online: ${site}/shop?item=${encodeURIComponent(item.id)}`,
  ];
  return { title, price: Math.round(Number(item.listedPrice) || 0), text: `${title}\n$${Math.round(Number(item.listedPrice) || 0)}\n\n${lines.join("\n")}` };
}
const days = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5)) : null);
const partsOf = (t) => (Array.isArray(t.parts) ? t.parts.reduce((s, p) => s + n(p && p.cost), 0) : 0);

// Everything that happened to one phone, in order, with its money. Pure: give it
// the stock item and the shared lists; it doesn't read or write storage.
export function phoneStory(item, { tickets = [], sales = [], orders = [] } = {}, now = new Date()) {
  const jobs = tickets.filter((t) => t && t.inventoryItemId === item.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const sale = sales.find((s) => s && s.itemId === item.id && s.channel !== "repair") || null;
  const order = item.sourceOrderId ? orders.find((o) => o && o.id === item.sourceOrderId) || null : null;
  const repairs = jobs.map((t) => ({
    id: t.id, status: t.status, issue: t.issue, technician: t.assignedTo || "", opened: t.createdAt, finished: t.completedAt || null,
    parts: (t.parts || []).map((p) => ({ name: p.name, cost: n(p.cost) })), partsCost: partsOf(t), labour: n(t.techPay),
    labourPaid: !!t.techPaidAt, minutes: n(t.timeSpentMins),
  }));
  const repairCost = repairs.reduce((s, r) => s + r.partsCost + r.labour, 0);
  // costBasis already includes repair costs that were added when a job finished;
  // jobs still open (or whose cost couldn't be added) are counted on top.
  const added = (item.refurbJobs || []).reduce((s, j) => s + n(j.cost), 0);
  const addedIds = new Set((item.refurbJobs || []).map((j) => j.jobId));
  const pending = repairs.filter((r) => !addedIds.has(r.id)).reduce((s, r) => s + r.partsCost + r.labour, 0);
  const bought = n(item.costBasis) - added;
  const totalCost = n(item.costBasis) + pending; // = bought + every repair's parts and labour
  const readyAt = item.listedAt || item.repairedAt || (repairs.length ? repairs[repairs.length - 1].finished : null) || null;
  const target = targetPrice(totalCost, item.gradeId);
  const soldFor = sale ? n(sale.salePrice) : null;
  const askingFor = item.listedPrice != null ? n(item.listedPrice) : null;
  const price = soldFor ?? askingFor;
  const events = [
    { at: item.receivedAt, kind: "bought", text: `Bought ${order ? `online trade-in ${order.id}` : `from ${sourceOf(item)}`}${item.sellerName || item.sellerIdOwnerName ? ` (${item.sellerName || item.sellerIdOwnerName})` : ""}`, amount: -bought },
    ...repairs.flatMap((r) => [
      { at: r.opened, kind: "repair", text: `Repair ${r.id} opened: ${r.issue || "fix up"}` },
      ...(r.finished ? [{ at: r.finished, kind: "repair", text: `Repair ${r.id} done${r.technician ? ` by ${r.technician}` : ""}`, amount: -(r.partsCost + r.labour) }] : []),
    ]),
    ...(item.gradedAt ? [{ at: item.gradedAt, kind: "graded", text: `Graded ${item.gradeId}` }] : []),
    ...(item.listedAt ? [{ at: item.listedAt, kind: "listed", text: `Listed online at $${n((item.priceHistory || [])[0]?.price ?? item.listedPrice)}` }] : []),
    ...((item.priceHistory || []).slice(1).map((h) => ({ at: h.from, kind: "price", text: `Price changed to $${n(h.price)}` }))),
    ...(sale ? [{ at: sale.soldAt, kind: "sold", text: `Sold${sale.customerName ? ` to ${sale.customerName}` : ""}${sale.channel === "web" ? " online" : " in store"}`, amount: soldFor }] : []),
    ...(item.status === "written_off" ? [{ at: item.writeOffAt, kind: "writeoff", text: `Written off: ${item.writeOffReason || ""}`, amount: 0 }] : []),
  ].filter((e) => e.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return {
    source: sourceOf(item), order, sale, repairs, bought, repairCost, totalCost, target, askingFor, soldFor,
    profit: price != null ? price - totalCost : null, margin: price ? (price - totalCost) / price : null,
    belowStandard: target != null && price != null && price < target,
    daysToReady: days(item.receivedAt, readyAt), daysInShop: days(item.receivedAt, sale ? sale.soldAt : item.status === "sold" ? item.soldAt : now.toISOString()),
    events,
  };
}
