// "My day" on the Repair Bench: a technician's own screen. Their jobs in the order they're
// promised (late first), when each came in and when the customer is collecting, what parts
// are still missing, one tap to the next step; jobs nobody has taken yet; and finished jobs
// waiting for the customer, with a one-tap pickup reminder.
import React from "react";
import { whenText, untilText } from "./tech-time.jsx";
import { waLink } from "./business-info.js";
import { repairMessages } from "./customer-messages.jsx";

const CLOSED = ["completed", "not_repairable", "cancelled"];
const ago = (iso) => { const m = Math.max(0, (Date.now() - Date.parse(iso || "")) / 60000); return isNaN(m) ? "" : m < 60 ? `${Math.round(m)} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`; };
const sameDay = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

export default function TechDay({ tickets, me, labels, nextStatus, partState, stock, repairName, onOpen, onUpdate, target = 0 }) {
  const open = tickets.filter((t) => !CLOSED.includes(t.status));
  const mine = open.filter((t) => t.assignedTo === me && t.status !== "ready_for_pickup");
  const free = open.filter((t) => !t.assignedTo && t.status !== "ready_for_pickup");
  const ready = open.filter((t) => t.status === "ready_for_pickup").sort((a, b) => String(a.pickupAt || "9").localeCompare(String(b.pickupAt || "9")));
  const order = (a, b) => (a.priority === "urgent") !== (b.priority === "urgent") ? (a.priority === "urgent" ? -1 : 1)
    : String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999")) || String(a.createdAt).localeCompare(String(b.createdAt));
  mine.sort(order); free.sort(order);
  const late = mine.filter((t) => t.dueAt && Date.parse(t.dueAt) < Date.now());
  const dueToday = mine.filter((t) => sameDay(t.dueAt));
  const doneToday = tickets.filter((t) => t.assignedTo === me && ["ready_for_pickup", "completed"].includes(t.status) && (t.statusLog || []).some((l) => l.status === "ready_for_pickup" && sameDay(l.at)));
  const minsToday = tickets.filter((t) => t.assignedTo === me).reduce((a, t) => a + (sameDay(t.timerStartedAt) ? Math.round((Date.now() - Date.parse(t.timerStartedAt)) / 60000) : 0), 0);

  const card = { border: "1px solid var(--mr-line)", borderRadius: 12, padding: 12, marginBottom: 10, background: "var(--mr-surface)" };
  const btn = (primary) => ({ padding: "8px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: primary ? "none" : "1px solid var(--mr-line)", background: primary ? "var(--mr-brand-fill)" : "transparent", color: primary ? "#fff" : "var(--mr-text)", textDecoration: "none", display: "inline-block" });
  const chip = (txt, tone) => <span key={txt} style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, border: `1px solid ${tone}`, color: tone }}>{txt}</span>;
  const h = { fontSize: 15, fontWeight: 800, margin: "18px 0 8px" };

  function partsChips(t) {
    const st = (t.partsNeeded || []).map((n) => partState(n, stock, t.device && t.device.model));
    const out = [];
    if (st.includes("arrived")) out.push(chip("✓ part arrived", "var(--mr-ok)"));
    if (st.includes("ordered")) out.push(chip("part on order", "var(--mr-brand)"));
    if (st.includes("need")) out.push(chip("part to order", "var(--mr-bad)"));
    return out;
  }
  function approval(t) {
    if (!t.approvalRequest) return null;
    const answered = t.customerApproval && Date.parse(t.customerApproval.at) >= Date.parse(t.approvalRequest.sentAt);
    return answered ? chip(t.customerApproval.decision === "approve" ? "✓ price approved" : "price declined", t.customerApproval.decision === "approve" ? "var(--mr-ok)" : "var(--mr-bad)") : chip("waiting on price answer", "var(--mr-muted)");
  }

  function Job({ t, take }) {
    const isLate = t.dueAt && Date.parse(t.dueAt) < Date.now();
    const next = nextStatus[t.status];
    const dev = `${(t.device && t.device.brand) || ""} ${(t.device && t.device.model) || ""}`.trim();
    return (
      <div style={{ ...card, borderColor: isLate ? "var(--mr-bad)" : "var(--mr-line)" }}>
        <button type="button" onClick={() => onOpen(t.id)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--mr-muted)" }}>
            <span>{t.id}{t.priority === "urgent" ? <b style={{ color: "var(--mr-bad)" }}> · URGENT</b> : ""}</span>
            <span>{labels[t.status] || t.status}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, margin: "3px 0 1px" }}>{dev}</div>
          <div style={{ fontSize: 13, color: "var(--mr-muted)" }}>{repairName(t)}{t.jobType === "shop" ? " · shop phone" : t.customer && t.customer.name ? ` · ${t.customer.name.split(" ")[0]}` : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6, fontSize: 12, marginTop: 8 }}>
            <span><span style={{ color: "var(--mr-muted)" }}>Came in</span><br />{whenText(t.createdAt)} · {ago(t.createdAt)} ago</span>
            <span><span style={{ color: "var(--mr-muted)" }}>Promised</span><br />{t.dueAt ? <b style={{ color: isLate ? "var(--mr-bad)" : "var(--mr-text)" }}>{whenText(t.dueAt)} ({untilText(t.dueAt)})</b> : "no time set"}</span>
            {Number(t.estimateMins) > 0 && <span><span style={{ color: "var(--mr-muted)" }}>Estimate</span><br />{t.estimateMins} min{t.timeSpentMins ? ` · ${t.timeSpentMins} done` : ""}</span>}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>{partsChips(t)}{approval(t)}{t.timerStartedAt && chip(`⏱ timer on since ${new Date(t.timerStartedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`, "var(--mr-bad)")}</div>
        </button>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {take ? <button type="button" style={btn(true)} onClick={() => onUpdate(t.id, { assignedTo: me, assignedAt: new Date().toISOString() })}>Take this job</button> : <>
            {next && <button type="button" style={btn(true)} onClick={() => (next === "completed" ? onOpen(t.id) : onUpdate(t.id, { status: next }, true))}>{labels[next]} →</button>}
            {!t.timerStartedAt ? <button type="button" style={btn(false)} onClick={() => onUpdate(t.id, { timerStartedAt: new Date().toISOString() })}>⏱ Start timer</button>
              : <button type="button" style={btn(false)} onClick={() => onUpdate(t.id, { timerStartedAt: null, timeSpentMins: (Number(t.timeSpentMins) || 0) + Math.max(1, Math.round((Date.now() - Date.parse(t.timerStartedAt)) / 60000)) })}>⏹ Stop timer</button>}
          </>}
          <button type="button" style={btn(false)} onClick={() => onOpen(t.id)}>Open</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 6 }}>
        {[["My jobs", mine.length, ""], ["Late", late.length, late.length ? "var(--mr-bad)" : ""], ["Due today", dueToday.length, ""], [target ? `Finished today (target ${target})` : "Finished today", target ? `${doneToday.length}/${target}` : doneToday.length, target && doneToday.length >= target ? "var(--mr-ok)" : target ? "var(--mr-text)" : "var(--mr-ok)"], ["Ready, not collected", ready.length, ""]].map(([k, v, c]) => (
          <div key={k} style={{ border: "1px solid var(--mr-line)", borderRadius: 12, padding: "10px 12px", background: "var(--mr-surface)" }}>
            <div style={{ fontSize: 12, color: "var(--mr-muted)" }}>{k}</div><div style={{ fontSize: 22, fontWeight: 800, color: c || "var(--mr-text)" }}>{v}</div>
          </div>
        ))}
      </div>
      {minsToday > 0 && <div style={{ fontSize: 12.5, color: "var(--mr-muted)" }}>Timer running on today's jobs: {minsToday} min so far.</div>}

      <div style={h}>My jobs, in the order they're promised</div>
      {mine.length === 0 && <div style={{ fontSize: 13, color: "var(--mr-muted)" }}>Nothing assigned to you. Take one from below.</div>}
      {mine.map((t) => <Job key={t.id} t={t} />)}

      <div style={h}>Not taken yet ({free.length})</div>
      {free.length === 0 && <div style={{ fontSize: 13, color: "var(--mr-muted)" }}>Every open job has a technician.</div>}
      {free.slice(0, 15).map((t) => <Job key={t.id} t={t} take />)}

      <div style={h}>Ready, waiting for the customer ({ready.length})</div>
      {ready.length === 0 && <div style={{ fontSize: 13, color: "var(--mr-muted)" }}>Nothing waiting to be collected.</div>}
      {ready.map((t) => {
        const readyAt = ((t.statusLog || []).filter((l) => l.status === "ready_for_pickup").pop() || {}).at;
        const msg = repairMessages(t).list.find((x) => x.id === "ready");
        const overdue = t.pickupAt && Date.parse(t.pickupAt) < Date.now();
        return (
          <div key={t.id} style={{ ...card, borderColor: overdue ? "var(--mr-bad)" : "var(--mr-line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <button type="button" onClick={() => onOpen(t.id)} style={{ all: "unset", cursor: "pointer", fontWeight: 700 }}>{t.id} · {(t.device && t.device.model) || ""} · {t.customer && t.customer.name}</button>
              <span style={{ fontSize: 12, color: "var(--mr-muted)" }}>ready {readyAt ? `${ago(readyAt)} ago` : ""}</span>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4, color: overdue ? "var(--mr-bad)" : "var(--mr-muted)" }}>
              {t.pickupAt ? `Collecting ${whenText(t.pickupAt)}${overdue ? " (didn't come)" : ""}` : "No pickup time agreed"}{t.notifiedAt ? ` · told ${whenText(t.notifiedAt)}` : " · not told yet"}{t.pickupReminders ? ` · ${t.pickupReminders} reminder${t.pickupReminders > 1 ? "s" : ""} sent` : ""}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {t.customer && t.customer.phone && msg && <a href={waLink(t.customer.phone, msg.text)} target="_blank" rel="noopener noreferrer" style={btn(true)}
                onClick={() => onUpdate(t.id, { notifiedAt: t.notifiedAt || new Date().toISOString(), contactLog: [...(t.contactLog || []), { at: new Date().toISOString(), how: "WhatsApp", template: "ready", by: me }] })}>{t.notifiedAt ? "Remind on WhatsApp" : "Tell them on WhatsApp"}</a>}
              {t.customer && t.customer.phone && <a href={`tel:${t.customer.phone.replace(/[^\d+]/g, "")}`} style={btn(false)}>Call</a>}
              <button type="button" style={btn(false)} onClick={() => onOpen(t.id)}>Open & take payment</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
