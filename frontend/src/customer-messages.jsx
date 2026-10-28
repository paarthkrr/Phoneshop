// One-tap messages to a customer: pick what to say, send it by WhatsApp, text or email
// from staff's own phone/computer (no SMS provider needed). Every send is noted on the
// record (contactLog) so the next person can see who was told what, and when.
import React, { useState } from "react";
import { waLink, GOOGLE_REVIEW_URL, DEFAULT_BUSINESS } from "./business-info.js";

const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";
const SHOP = "Mobile Recellr";
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;

// The customer's link to approve a repair price (see repair-approval.jsx).
export const approvalLink = (t) => (t.approvalRequest && t.approvalRequest.key && typeof window !== "undefined"
  ? `${window.location.origin}/approve/${encodeURIComponent(t.id)}?k=${t.approvalRequest.key}` : "");

// Templates by situation. Each returns { id, label, subject, text }.
export function repairMessages(t) {
  const n = first(t.customer?.name), dev = `${t.device?.brand || ""} ${t.device?.model || ""}`.trim() || "device";
  const price = t.finalPrice ?? t.quotedPrice;
  const list = [
    { id: "received", label: "Got it", subject: `We've got your ${dev} — ${t.id}`, text: `Hi ${n}, it's ${SHOP}. We've got your ${dev} and we're on it. Your job number is ${t.id}; we'll message you as soon as it's ready.` },
    { id: "quote", label: "Price to approve", subject: `Repair price for your ${dev} — ${t.id}`, text: t.approvalRequest && approvalLink(t)
      ? `Hi ${n}, it's ${SHOP}. We've checked your ${dev}: the repair comes to ${money(t.approvalRequest.price)}. Approve or decline here: ${approvalLink(t)} (job ${t.id}).`
      : `Hi ${n}, it's ${SHOP}. We've checked your ${dev}: the repair comes to ${money(price)}. Reply YES and we'll go ahead, or call us with any questions. Job ${t.id}.` },
    { id: "parts", label: "Waiting on parts", subject: `Update on your ${dev} — ${t.id}`, text: `Hi ${n}, quick update from ${SHOP}: we're waiting on a part for your ${dev}. We'll let you know as soon as it arrives. Job ${t.id}.` },
    { id: "ready", label: "Ready to collect", subject: `Your ${dev} is ready to collect — ${t.id}`, text: `Good news ${n}! Your ${dev} is fixed and ready to collect from ${SHOP}${price != null ? ` (${money(price)}${Number(t.deposit) > 0 ? `, ${money(Math.max(0, price - Number(t.deposit)))} left to pay` : ""})` : ""}. Job ${t.id}.` },
    { id: "not_repairable", label: "Can't be fixed", subject: `About your ${dev} — ${t.id}`, text: `Hi ${n}, it's ${SHOP}. Sorry, we weren't able to repair your ${dev}. You can collect it any time, and we're happy to make you an offer on it or show you a replacement. Job ${t.id}.` },
    { id: "review", label: "Ask for a review", subject: `How did we go, ${n}?`, text: `Hi ${n}, thanks for choosing ${SHOP}! If we looked after you, a quick Google review helps a small local shop a lot: ${GOOGLE_REVIEW_URL}` },
  ];
  const waiting = t.approvalRequest && !(t.customerApproval && Date.parse(t.customerApproval.at) >= Date.parse(t.approvalRequest.sentAt));
  const best = waiting && !["completed", "not_repairable"].includes(t.status) ? "quote" : { dropped_off: "received", diagnosing: "quote", awaiting_parts: "parts", in_repair: "ready", ready_for_pickup: "ready", completed: "review", not_repairable: "not_repairable" }[t.status];
  return { list, best };
}

export function tradeInMessages(o, amount) {
  const n = first(o.customerName || o.customer?.name), dev = `${o.device?.brand || o.brand || ""} ${o.device?.model || o.model || ""}`.trim() || "phone";
  const id = o.orderId || o.id;
  const list = [
    { id: "received", label: "Phone arrived", subject: `We've received your ${dev} — ${id}`, text: `Hi ${n}, it's ${SHOP}. Your ${dev} has arrived and we'll check it shortly. Order ${id}.` },
    { id: "paid", label: "Paid", subject: `You've been paid for your ${dev} — ${id}`, text: `Hi ${n}, all done: we've paid you ${money(amount)} for your ${dev}. Thanks for selling to ${SHOP}! Order ${id}.` },
    { id: "revised", label: "Offer changed", subject: `Your offer for the ${dev} — ${id}`, text: `Hi ${n}, it's ${SHOP}. We've checked your ${dev} and found something that wasn't in the quote, so the offer has changed. You can accept or decline from the link in your email, or just reply here. Order ${id}.` },
    { id: "review", label: "Ask for a review", subject: `How did we go, ${n}?`, text: `Hi ${n}, thanks for selling your ${dev} to ${SHOP}! A quick Google review would really help us: ${GOOGLE_REVIEW_URL}` },
  ];
  const best = { awaiting_shipment: "received", received_inspecting: "received", revised_pending_customer: "revised", approved_paid: "review" }[o.status];
  return { list, best };
}

export function orderMessages(o) {
  const n = first(o.customer?.name || o.customerName), what = o.item ? `${o.item.brand} ${o.item.model}` : "order";
  const id = o.orderId || o.id;
  const list = [
    { id: "thanks", label: "Order received", subject: `Thanks for your order — ${id}`, text: `Hi ${n}, thanks for ordering from ${SHOP}! We're getting your ${what} ready. Order ${id}.` },
    { id: "ready", label: "Ready / on its way", subject: `Your ${what} is on its way — ${id}`, text: `Hi ${n}, your ${what} is ready${o.trackingNumber ? ` and on its way (tracking ${o.trackingNumber})` : ""}. Order ${id}. Any questions, just reply.` },
    { id: "review", label: "Ask for a review", subject: `How's your ${what}, ${n}?`, text: `Hi ${n}, hope you're enjoying your ${what}! A quick Google review would really help ${SHOP}: ${GOOGLE_REVIEW_URL}` },
  ];
  return { list, best: o.status === "completed" || o.status === "delivered" ? "review" : "ready" };
}

const smsLink = (phone, text) => `sms:${String(phone || "").replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
const mailto = (email, subject, text) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

export default function MessageCustomer({ phone, email, templates, contactLog = [], onSent, title = "Message the customer" }) {
  const { list, best } = templates;
  const [pick, setPick] = useState(best || list[0].id);
  const t = list.find((x) => x.id === pick) || list[0];
  const [text, setText] = useState(null); // null = use the template as is
  const body = text ?? t.text;
  if (!phone && !email) return null;
  const sent = (how) => onSent && onSent({ at: new Date().toISOString(), how, template: t.id });
  const chip = (on) => ({ padding: "6px 11px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${on ? "var(--mr-brand)" : "var(--mr-line)"}`, background: on ? "var(--mr-brand-soft)" : "var(--mr-surface)", color: on ? "var(--mr-brand)" : "var(--mr-text)" });
  const go = { flex: "1 1 110px", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" };
  const last = contactLog[contactLog.length - 1];
  return (
    <div style={{ border: "1px solid var(--mr-line)", borderRadius: 12, padding: 14, marginBottom: 16, background: "var(--mr-surface)" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>💬 {title}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {list.map((x) => <button key={x.id} type="button" onClick={() => { setPick(x.id); setText(null); }} style={chip(x.id === t.id)}>{x.label}{x.id === best ? " ★" : ""}</button>)}
      </div>
      <textarea value={body} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Message"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--mr-line)", background: "var(--mr-surface-2)", color: "var(--mr-text)", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {phone && <a href={waLink(phone, body)} target="_blank" rel="noopener noreferrer" onClick={() => sent("WhatsApp")} style={{ ...go, background: "#25D366", color: "#fff" }}>WhatsApp</a>}
        {phone && <a href={smsLink(phone, body)} onClick={() => sent("Text")} style={{ ...go, border: "1.5px solid var(--mr-line)", color: "var(--mr-text)" }}>Text</a>}
        {email && <a href={mailto(email, t.subject, body)} onClick={() => sent("Email")} style={{ ...go, border: "1.5px solid var(--mr-line)", color: "var(--mr-text)" }}>Email</a>}
      </div>
      {last && <div style={{ fontSize: 12, color: "var(--mr-muted)", marginTop: 8 }}>
        Last contact: {(list.find((x) => x.id === last.template) || { label: last.template }).label} by {last.how}, {new Date(last.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{last.by ? ` (${last.by})` : ""}{contactLog.length > 1 ? ` · ${contactLog.length} messages in all` : ""}
      </div>}
    </div>
  );
}

// Printable repair ticket: the customer's copy (what we took in, the price, the terms)
// and a tear-off bench tag with the job number to stick on the phone.
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function printRepairTicket(t, { repairLabel = "", business = {} } = {}) {
  business = { ...DEFAULT_BUSINESS, ...business };
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return false;
  const price = t.finalPrice ?? t.quotedPrice;
  const row = (k, v) => (v || v === 0 ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : "");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.id)}</title><style>
    body{font:14px/1.45 system-ui,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0}small{color:#555}
    table{width:100%;border-collapse:collapse;margin:14px 0}th{text-align:left;width:150px;color:#555;font-weight:600;padding:5px 0;vertical-align:top}td{padding:5px 0}
    .id{font:800 26px ui-monospace,monospace;letter-spacing:1px}.box{border:1px solid #ccc;border-radius:8px;padding:12px;margin-top:10px;font-size:12.5px;color:#333}
    .sig{display:flex;gap:30px;margin-top:28px}.sig div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:12px;color:#555}
    .tag{margin-top:34px;border-top:2px dashed #999;padding-top:16px;display:flex;justify-content:space-between;align-items:center}
    @media print{button{display:none}body{margin:12mm}}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>${esc(business.name || "Mobile Recellr")}</h1>
    <small>${esc(business.phone || "")}${business.email ? " · " + esc(business.email) : ""}</small></div><div style="text-align:right"><div class="id">${esc(t.id)}</div><small>${new Date(t.createdAt || Date.now()).toLocaleString("en-AU")}</small></div></div>
    <table>${row("Customer", t.customer?.name)}${row("Phone", t.customer?.phone)}${row("Device", `${t.device?.brand || ""} ${t.device?.model || ""} ${t.device?.storage || ""}`.trim())}
    ${row("IMEI / serial", t.device?.imei)}${row("Colour", t.device?.colour)}${row("Condition on arrival", t.device?.condition)}${row("Repair", repairLabel)}${row("What's wrong", t.issue)}
    ${row("Price", price != null ? `$${Number(price).toLocaleString()}` : "To be confirmed")}${Number(t.deposit) > 0 ? row("Deposit paid", `$${Number(t.deposit).toLocaleString()}`) : ""}
    ${row("Ready by", t.dueAt ? new Date(t.dueAt).toLocaleDateString("en-AU") : "")}${row("Warranty", t.warrantyDays ? `${t.warrantyDays} days on the repair` : "")}</table>
    <div class="box">Please back up your data before a repair. We'll contact you before doing anything that costs more than the price above. Bring this ticket (or your job number) to collect.</div>
    <div class="sig"><div>Customer signature</div><div>Staff</div></div>
    <div class="tag"><div><div class="id">${esc(t.id)}</div><div>${esc(t.customer?.name || "")} · ${esc(t.customer?.phone || "")}</div></div><div style="text-align:right">${esc(`${t.device?.brand || ""} ${t.device?.model || ""}`)}<br><small>${esc(repairLabel)}</small></div></div>
    <button onclick="print()" style="margin-top:20px;padding:10px 16px">Print</button>
    <script>setTimeout(function(){print()},300)</script></body></html>`);
  w.document.close();
  return true;
}
