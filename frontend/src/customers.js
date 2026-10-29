// One customer record built from everything they've done with us: repairs, repair
// requests, trade-ins, purchases, web and accessory orders, messages. The same person
// is matched by phone or email (either is enough), and staff edits, notes, reminders
// and merges live in the "customers" list, so the underlying job records are never changed.

export function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("0061")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("0")) d = "61" + d.slice(1);
  if (d.length === 9 && d.startsWith("4")) d = "61" + d;
  return d.length >= 8 ? d : "";
}
export const normEmail = (e) => { const s = String(e || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ""; };
const GENERIC = /^(walk[- ]?in|unknown|shop stock|customer|n\/?a|-|guest)?$/i;
const ids = (phone, email) => [normPhone(phone) && `p:${normPhone(phone)}`, normEmail(email) && `e:${normEmail(email)}`].filter(Boolean);

const money = (n) => Number(n) || 0;
const DONE = ["completed", "not_repairable", "cancelled"];

// sources: { tickets, requests, orders, sales, webOrders, accessoryOrders, queries }, profiles: the "customers" list.
export function buildCustomers(src, profiles = []) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  const join = (list) => { list.forEach(add); for (let i = 1; i < list.length; i++) { const a = find(list[0]), b = find(list[i]); if (a !== b) parent.set(b, a); } };

  const events = []; // { keys, name, phone, email, ev }
  const push = (name, phone, email, ev) => {
    let keys = ids(phone, email);
    if (!keys.length) { const n = String(name || "").trim(); if (GENERIC.test(n)) return; keys = [`n:${n.toLowerCase()}`]; }
    join(keys);
    events.push({ keys, name: String(name || "").trim(), phone: String(phone || "").trim(), email: String(email || "").trim(), ev });
  };

  for (const t of src.tickets || []) {
    if (!t || t.deleted || t.jobType === "shop" || !t.customer) continue;
    const dev = `${(t.device && t.device.brand) || ""} ${(t.device && t.device.model) || ""}`.trim();
    push(t.customer.name, t.customer.phone, t.customer.email, { kind: "repair", date: t.createdAt, title: `Repair: ${dev}`, sub: `${t.issue || ""}`.slice(0, 80), status: t.status,
      amount: t.finalPrice ?? t.quotedPrice, ref: t.id, device: dev, open: !DONE.includes(t.status), ready: t.status === "ready_for_pickup", link: `/portal/repairs?job=${encodeURIComponent(t.id)}` });
  }
  for (const r of src.requests || []) {
    if (!r) continue;
    push(r.name, r.phone, r.email, { kind: "request", date: r.createdAt, title: `Repair request: ${r.model || r.deviceType || ""}`, sub: r.method === "doorstep" ? "At their door" : r.method === "mailin" ? "Mail-in" : "In store", status: r.status, ref: r.id, device: r.model, link: "/portal/repairs" });
  }
  for (const o of src.orders || []) {
    if (!o || !o.customer) continue;
    const dev = o.device ? `${o.device.brand || ""} ${o.device.model || ""} ${o.device.storage || ""}`.trim() : "";
    const paid = o.status === "approved_paid" ? money(o.inspection && o.inspection.confirmedTotal != null ? o.inspection.confirmedTotal : o.quotedTotal) : 0;
    push(o.customer.name, o.customer.phone, o.customer.email, { kind: "tradein", date: o.createdAt, title: `Sold us: ${dev}`, status: o.status, amount: paid || o.quotedTotal, paidToThem: paid, ref: o.id, device: dev, link: "/portal/inspect" });
  }
  const ticketById = new Map((src.tickets || []).filter((t) => t && t.customer).map((t) => [t.id, t]));
  for (const s of src.sales || []) {
    if (!s) continue;
    const repairPay = s.channel === "repair";
    const t = repairPay && ticketById.get(s.itemId); // a repair payment belongs to whoever the job is for
    const c = t ? t.customer : { name: s.customerName, phone: s.customerPhone, email: s.customerEmail };
    push(c.name, c.phone, c.email, { kind: repairPay ? "payment" : "purchase", date: s.soldAt, title: repairPay ? `Paid for repair ${s.itemId || ""}`.trim() : `Bought: ${`${s.brand || ""} ${s.model || ""} ${s.storage || ""}`.trim()}`,
      amount: money(s.salePrice), paidByThem: money(s.salePrice), ref: s.id, link: "/portal/pos" });
  }
  for (const w of src.webOrders || []) {
    if (!w || !w.customer) continue;
    push(w.customer.name, w.customer.phone, w.customer.email, { kind: "weborder", date: w.createdAt, title: `Web order: ${`${w.brand || ""} ${w.model || ""} ${w.storage || ""}`.trim() || w.itemId || ""}`, status: w.status, amount: w.price, device: `${w.brand || ""} ${w.model || ""}`.trim(), ref: w.id, link: "/portal/pos" });
  }
  for (const a of src.accessoryOrders || []) {
    if (!a || !a.customer) continue;
    push(a.customer.name, a.customer.phone, a.customer.email, { kind: "accessory", date: a.createdAt, title: "Accessories order", status: a.status, amount: a.total, ref: a.id, link: "/portal/pos" });
  }
  for (const q of src.queries || []) {
    if (!q) continue;
    push(q.name, q.phone, q.email, { kind: "message", date: q.createdAt, title: "Asked a question", sub: String(q.message || q.question || "").slice(0, 80), status: q.status, ref: q.id, link: "/portal/crm" });
  }

  // Staff profiles: their contact details join the group too, plus any merges.
  const live = (profiles || []).filter((p) => p && !p.deleted);
  for (const p of live) {
    const keys = [...ids(p.phone, p.email), ...(p.alsoKnownAs || []), ...(p.anchor ? [p.anchor] : [])];
    if (!keys.length) keys.push(`c:${p.id}`);
    join(keys);
    p._keys = keys;
  }
  const hidden = new Set((profiles || []).filter((p) => p && p.deleted).flatMap((p) => [...(p.alsoKnownAs || []), ...(p.anchor ? [p.anchor] : [])]));

  const groups = new Map();
  const group = (root) => { if (!groups.has(root)) groups.set(root, { key: root, events: [], names: [], phones: [], emails: [], keys: new Set() }); return groups.get(root); };
  for (const e of events) {
    const g = group(find(e.keys[0]));
    g.events.push(e.ev); e.keys.forEach((k) => g.keys.add(k));
    if (e.name && !GENERIC.test(e.name)) g.names.push([e.ev.date || "", e.name]);
    if (e.phone) g.phones.push([e.ev.date || "", e.phone]);
    if (e.email) g.emails.push([e.ev.date || "", e.email]);
  }
  for (const p of live) { const g = group(find(p._keys[0])); g.profile = p; p._keys.forEach((k) => g.keys.add(k)); }

  const latest = (arr) => arr.sort((a, b) => String(b[0]).localeCompare(String(a[0])))[0]?.[1] || "";
  const out = [];
  for (const g of groups.values()) {
    if (!g.profile && [...g.keys].some((k) => hidden.has(k))) continue;
    const p = g.profile || {};
    const ev = g.events.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const reminders = (p.reminders || []).filter((r) => !r.done);
    out.push({
      key: p.id || g.key, profileId: p.id || null, anchor: g.key, keys: [...g.keys],
      name: p.name || latest(g.names) || "No name", phone: p.phone || latest(g.phones), email: p.email || latest(g.emails),
      address: p.address || "", notes: p.notes || [], tags: p.tags || [], consent: p.consent || null, reminders, allReminders: p.reminders || [],
      timeline: ev, lastActivity: ev[0]?.date || p.updatedAt || p.createdAt || "", firstSeen: ev[ev.length - 1]?.date || p.createdAt || "",
      repairs: ev.filter((x) => x.kind === "repair").length, openJobs: ev.filter((x) => x.open).length, ready: ev.filter((x) => x.ready).length,
      spent: ev.reduce((a, x) => a + money(x.paidByThem), 0), paidToThem: ev.reduce((a, x) => a + money(x.paidToThem), 0),
      devices: [...new Set(ev.map((x) => x.device).filter(Boolean))],
      visits: ev.filter((x) => ["repair", "tradein", "purchase", "weborder", "accessory"].includes(x.kind)).length,
    });
  }
  out.sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
  return out;
}

// Rows for a spreadsheet.
export function customersCsv(list) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Phone", "Email", "Repairs", "Open jobs", "Spent", "Paid to them", "First seen", "Last activity", "Devices", "Tags", "Marketing OK"];
  return [head, ...list.map((c) => [c.name, c.phone, c.email, c.repairs, c.openJobs, c.spent, c.paidToThem, (c.firstSeen || "").slice(0, 10), (c.lastActivity || "").slice(0, 10), c.devices.join("; "), c.tags.join("; "), c.consent && c.consent.marketing ? "yes" : ""])]
    .map((r) => r.map(esc).join(",")).join("\n");
}
