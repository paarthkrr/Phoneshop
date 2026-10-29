// Register helpers: discounts with a reason (counter staff up to a limit the owner sets),
// receipts by email, and the quick-sell row for the accessories that sell most.
import React from "react";
import { hasArea } from "./roles.js";

export const DISCOUNT_REASONS = ["Price match", "Repeat customer", "Bundle (bought with a phone/repair)", "Small mark / no box", "Staff / family", "Other"];
export const staffDiscountLimitPct = (bs) => (bs && Number.isFinite(Number(bs.staffDiscountLimitPct)) && bs.staffDiscountLimitPct !== "" ? Number(bs.staffDiscountLimitPct) : 10);

// { ok, pct, message }: owner and managers can give any discount; others up to the limit.
export function checkDiscount(list, price, bs) {
  const l = Number(list) || 0, p = Number(price) || 0;
  if (!l || p >= l) return { ok: true, pct: 0 };
  const pct = Math.round(((l - p) / l) * 1000) / 10, limit = staffDiscountLimitPct(bs);
  if (hasArea("reports") || pct <= limit) return { ok: true, pct };
  return { ok: false, pct, message: `That's ${pct}% off. Counter staff can give up to ${limit}%: ask the owner or a manager.` };
}

export function DiscountReason({ value, onChange, pct, colors }) {
  const { line, paper, brass, red } = colors;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, color: brass, marginBottom: 6 }}>{pct ? `${pct}% off the listed price. Why?` : "Why the discount?"}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {DISCOUNT_REASONS.map((r) => <button key={r} type="button" aria-pressed={value === r} onClick={() => onChange(r)}
          style={{ padding: "5px 10px", borderRadius: 3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${value === r ? brass : line}`, background: "transparent", color: value === r ? brass : paper }}>{r}</button>)}
      </div>
      {!value && <div style={{ fontSize: 12, color: red, marginTop: 4 }}>Pick a reason to give a discount.</div>}
    </div>
  );
}

export function receiptText(sale, bs = {}) {
  const gst = !!bs.gstRegistered;
  const m = (n) => `$${(Math.round(Number(n) * 100) / 100).toFixed(2)}`;
  const lines = [
    `${gst ? "Tax invoice" : "Receipt"} ${sale.id}`,
    `${new Date(sale.soldAt || Date.now()).toLocaleString("en-AU")}`,
    "",
    `${[sale.brand !== "Accessory" ? sale.brand : "", sale.model, sale.storage && sale.brand !== "Accessory" ? sale.storage : ""].filter(Boolean).join(" ")}`,
    ...(sale.discount && sale.discount.amount ? [`Listed ${m(sale.salePrice + sale.discount.amount)}, discount −${m(sale.discount.amount)} (${sale.discount.reason})`] : []),
    `Total ${m(sale.salePrice)}${gst ? ` (includes GST ${m(sale.salePrice / 11)})` : ""}`,
    `Paid by ${sale.payMethod || "cash"}`,
    ...(bs.abn ? [`ABN ${bs.abn}`] : []),
  ];
  return lines.join("\n");
}

// Queue the receipt as an email; the server sends it (backend notification_queue).
export async function emailReceipt(sale, bs) {
  if (!sale.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sale.customerEmail)) return false;
  try {
    let list = [];
    try { const r = await window.storage.get("notification_queue", true); list = r ? JSON.parse(r.value) || [] : []; } catch (e) { list = []; } // none queued yet

    list.unshift({ id: "NTF-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), status: "pending", type: "receipt", channel: "email",
      recipientEmail: sale.customerEmail, recipientName: sale.customerName || "", subject: `Your receipt from Mobile Recellr (${sale.id})`, message: receiptText(sale, bs), relatedId: sale.id });
    await window.storage.set("notification_queue", JSON.stringify(list), true);
    return true;
  } catch (e) { return false; }
}

// The accessories sold most in the last 60 days, as one-tap buttons.
export function topAccessories(accessories, sales, n = 6) {
  const since = Date.now() - 60 * 864e5, count = {};
  for (const s of sales || []) if (s && s.brand === "Accessory" && !s.refundOf && Date.parse(s.soldAt) >= since) count[s.itemId] = (count[s.itemId] || 0) + 1;
  return (accessories || []).filter((a) => a && !a.archived && Number(a.qtyOnHand) > 0)
    .sort((a, b) => (count[b.id] || 0) - (count[a.id] || 0)).slice(0, n);
}
