// Customers: everyone we've dealt with, matched by phone or email across repairs,
// requests, trade-ins, purchases and orders. Open one to see the whole history, edit
// their details, keep notes, set a reminder to call them back, message them, start a
// new repair, merge a duplicate or remove them.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MessageCustomer, { customerMessages } from "./customer-messages.jsx";
import { buildCustomers, customersCsv, normPhone, normEmail } from "./customers.js";
import TimePick, { whenText } from "./tech-time.jsx";

const KEY = "customers";
async function load(key) { try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) || [] : []; } catch (e) { return []; } }
async function save(key, v) { try { await window.storage.set(key, JSON.stringify(v), true); return true; } catch (e) { return false; } }
const newId = () => "CUS-" + Math.random().toString(36).slice(2, 8).toUpperCase();
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const day = (iso) => { const d = new Date(iso || ""); return isNaN(d) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); };
const KIND = { repair: "🔧", request: "📝", tradein: "📥", purchase: "🛒", payment: "💳", weborder: "🌐", accessory: "🎧", message: "💬" };
const SEGMENTS = [
  ["all", "Everyone"], ["open", "Job open"], ["ready", "Ready to collect"], ["remind", "Reminder due"],
  ["repeat", "Repeat"], ["lapsed", "Not seen 6+ months"], ["consent", "OK to market"],
];

export default function CustomersTab({ me = "" }) {
  const navigate = useNavigate();
  const [src, setSrc] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("all");
  const [openKey, setOpenKey] = useState(null);
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState(40);

  useEffect(() => {
    (async () => {
      const [tickets, requests, orders, sales, webOrders, accessoryOrders, queries, prof] = await Promise.all(
        ["repair_tickets", "repair_requests", "orders", "sales", "purchase_orders", "accessory_orders", "support_queries", KEY].map(load));
      setSrc({ tickets, requests, orders, sales, webOrders, accessoryOrders, queries });
      setProfiles(prof);
    })();
  }, []);

  const all = useMemo(() => (src ? buildCustomers(src, profiles) : []), [src, profiles]);
  const now = Date.now();
  const remindDue = (c) => c.reminders.some((r) => Date.parse(r.dueAt) <= now + 864e5);
  const inSeg = (c) => segTest(seg, c, now, remindDue);
  const needle = q.trim().toLowerCase(), digits = q.replace(/\D/g, "");
  const list = all.filter(inSeg).filter((c) => !needle || `${c.name} ${c.email} ${c.devices.join(" ")} ${c.tags.join(" ")} ${c.timeline.map((t) => t.ref).join(" ")}`.toLowerCase().includes(needle)
    || (digits.length >= 3 && normPhone(c.phone).includes(digits.replace(/^0/, ""))));
  const open = openKey && all.find((c) => c.key === openKey || c.keys.includes(openKey));

  // Saves a change to someone's profile, creating the profile on their first edit.
  async function upsert(c, patch) {
    const latest = await load(KEY);
    const at = new Date().toISOString();
    let next, id = c && c.profileId;
    if (id && latest.some((p) => p.id === id)) next = latest.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: at, updatedBy: me } : p));
    else {
      id = newId();
      next = [{ id, createdAt: at, createdBy: me, anchor: c ? c.anchor : undefined, alsoKnownAs: c ? c.keys : [], name: c ? c.name : "", phone: c ? c.phone : "", email: c ? c.email : "", ...patch, updatedAt: at, updatedBy: me }, ...latest];
    }
    setProfiles(next);
    await save(KEY, next);
    return id;
  }
  async function merge(a, b) { // b's records join a's profile
    const latest = await load(KEY);
    const keys = [...new Set([...a.keys, ...b.keys])];
    let next = latest.filter((p) => p.id !== b.profileId);
    const bp = latest.find((p) => p.id === b.profileId) || {};
    if (a.profileId && next.some((p) => p.id === a.profileId)) next = next.map((p) => (p.id === a.profileId ? { ...p, alsoKnownAs: keys, notes: [...(p.notes || []), ...(bp.notes || [])], reminders: [...(p.reminders || []), ...(bp.reminders || [])], updatedAt: new Date().toISOString() } : p));
    else next = [{ id: newId(), createdAt: new Date().toISOString(), createdBy: me, anchor: a.anchor, alsoKnownAs: keys, name: a.name, phone: a.phone, email: a.email, notes: bp.notes || [], reminders: bp.reminders || [] }, ...next];
    setProfiles(next); await save(KEY, next);
  }
  function exportCsv() {
    const blob = new Blob([customersCsv(list)], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }
  function newRepair(c) {
    try { sessionStorage.setItem("mr-intake-prefill", JSON.stringify({ fromCustomer: true, id: `cust-${c.key}`, name: c.name, phone: c.phone, email: c.email, model: c.devices[0] || "" })); } catch (e) { /* the form just starts empty */ }
    navigate("/portal/repairs");
  }

  const chip = (on) => ({ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", border: `1.5px solid ${on ? "var(--mr-brand)" : "var(--mr-line)"}`, background: on ? "var(--mr-brand-soft)" : "transparent", color: on ? "var(--mr-brand)" : "var(--mr-text)" });
  const btn = (primary) => ({ padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: primary ? "none" : "1px solid var(--mr-line)", background: primary ? "var(--mr-brand-fill)" : "transparent", color: primary ? "#fff" : "var(--mr-text)", textDecoration: "none", display: "inline-block" });
  const input = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--mr-line)", background: "var(--mr-surface-2)", color: "var(--mr-text)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10 };

  if (!src) return <div style={{ color: "var(--mr-muted)", fontSize: 13, padding: 12 }}>Loading customers…</div>;

  if (open) return <Profile c={open} all={all} me={me} onBack={() => setOpenKey(null)} upsert={upsert} merge={merge} newRepair={newRepair} navigate={navigate} btn={btn} input={input} chip={chip} onOpen={setOpenKey} />;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setShown(40); }} placeholder="Search name, phone, email, device or job number" aria-label="Search customers" style={{ ...input, flex: "1 1 260px", marginBottom: 0 }} />
        <button type="button" style={btn(true)} onClick={() => setAdding(true)}>+ Add customer</button>
        <button type="button" style={btn(false)} onClick={exportCsv} disabled={!list.length}>Export CSV</button>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 10 }}>
        {SEGMENTS.map(([k, l]) => <button key={k} type="button" style={chip(seg === k)} onClick={() => { setSeg(k); setShown(40); }}>{l} ({all.filter((c) => segTest(k, c, now, remindDue)).length})</button>)}
      </div>
      {adding && <AddCustomer input={input} btn={btn} all={all} onCancel={() => setAdding(false)} onOpen={(k) => { setAdding(false); setOpenKey(k); }}
        onSave={async (f) => { const id = await upsert(null, { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), address: f.address.trim(), consent: f.marketing ? { marketing: true, at: new Date().toISOString(), by: me } : null, notes: f.note.trim() ? [{ at: new Date().toISOString(), by: me, text: f.note.trim() }] : [] }); setAdding(false); setOpenKey(id); }} />}
      {list.length === 0 && <div style={{ color: "var(--mr-muted)", fontSize: 13.5, padding: "18px 4px" }}>{all.length ? "No one matches." : "No customers yet. They appear here automatically from repairs, requests and sales, or add one yourself."}</div>}
      {list.slice(0, shown).map((c) => (
        <button key={c.key} type="button" onClick={() => setOpenKey(c.key)} style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "block", width: "100%", border: "1px solid var(--mr-line)", borderRadius: 12, padding: "12px 14px", marginBottom: 8, background: "var(--mr-surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--mr-text)" }}>{c.name}</span>
            <span style={{ fontSize: 12, color: "var(--mr-muted)", whiteSpace: "nowrap" }}>{c.lastActivity ? day(c.lastActivity) : ""}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--mr-muted)", marginTop: 2 }}>{[c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email"}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, fontSize: 11.5 }}>
            {c.repairs > 0 && <Tag>{c.repairs} repair{c.repairs > 1 ? "s" : ""}</Tag>}
            {c.openJobs > 0 && <Tag tone="var(--mr-brand)">{c.openJobs} open</Tag>}
            {c.ready > 0 && <Tag tone="var(--mr-ok)">Ready to collect</Tag>}
            {remindDue(c) && <Tag tone="var(--mr-bad)">⏰ Reminder due</Tag>}
            {c.spent > 0 && <Tag>spent {money(c.spent)}</Tag>}
            {c.tags.map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
        </button>
      ))}
      {list.length > shown && <button type="button" style={{ ...btn(false), width: "100%" }} onClick={() => setShown(shown + 40)}>Show more ({list.length - shown} left)</button>}
    </div>
  );
}

function segTest(k, c, now, remindDue) {
  return k === "all" || (k === "open" && c.openJobs > 0) || (k === "ready" && c.ready > 0) || (k === "remind" && remindDue(c))
    || (k === "repeat" && c.visits > 1) || (k === "lapsed" && !!c.lastActivity && now - Date.parse(c.lastActivity) > 182 * 864e5)
    || (k === "consent" && !!(c.consent && c.consent.marketing));
}

function Tag({ children, tone = "var(--mr-muted)" }) {
  return <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${tone}`, color: tone, fontWeight: 600 }}>{children}</span>;
}

function AddCustomer({ input, btn, all, onCancel, onSave, onOpen }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", note: "", marketing: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // Already on file? Say so before a duplicate is made.
  const dup = all.find((c) => (normPhone(f.phone) && normPhone(c.phone) === normPhone(f.phone)) || (normEmail(f.email) && normEmail(c.email) === normEmail(f.email)));
  const ok = f.name.trim() && (normPhone(f.phone) || normEmail(f.email));
  return (
    <div style={{ border: "1.5px solid var(--mr-brand)", borderRadius: 14, padding: 14, marginBottom: 14, background: "var(--mr-surface)" }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>New customer</div>
      <input value={f.name} onChange={set("name")} placeholder="Name" aria-label="Name" style={input} autoFocus />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0 10px" }}>
        <input value={f.phone} onChange={set("phone")} placeholder="Mobile" type="tel" aria-label="Mobile" style={input} />
        <input value={f.email} onChange={set("email")} placeholder="Email" type="email" aria-label="Email" style={input} />
      </div>
      <input value={f.address} onChange={set("address")} placeholder="Address (optional)" aria-label="Address" style={input} />
      <textarea value={f.note} onChange={set("note")} placeholder="Note (optional)" aria-label="Note" rows={2} style={{ ...input, resize: "vertical" }} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 10 }}><input type="checkbox" checked={f.marketing} onChange={(e) => setF({ ...f, marketing: e.target.checked })} /> They said yes to offers and news by message</label>
      {dup && <div style={{ fontSize: 13, color: "var(--mr-bad)", marginBottom: 10 }}>{dup.name} already has this {normPhone(f.phone) && normPhone(dup.phone) === normPhone(f.phone) ? "number" : "email"}. <button type="button" onClick={() => onOpen(dup.key)} style={{ all: "unset", cursor: "pointer", color: "var(--mr-brand)", fontWeight: 700 }}>Open them instead</button></div>}
      {!ok && (f.name || f.phone || f.email) && <div style={{ fontSize: 12.5, color: "var(--mr-muted)", marginBottom: 10 }}>A name and a mobile or email are needed.</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={btn(true)} disabled={!ok} onClick={() => onSave(f)}>Save customer</button>
        <button type="button" style={btn(false)} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Profile({ c, all, me, onBack, upsert, merge, newRepair, navigate, btn, input, chip, onOpen }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(null);
  const [note, setNote] = useState("");
  const [rem, setRem] = useState({ dueAt: null, text: "" });
  const [mergeQ, setMergeQ] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const startEdit = () => { setF({ name: c.name, phone: c.phone, email: c.email, address: c.address, tags: c.tags.join(", "), marketing: !!(c.consent && c.consent.marketing) }); setEditing(true); };
  const card = { border: "1px solid var(--mr-line)", borderRadius: 14, padding: 14, marginBottom: 14, background: "var(--mr-surface)" };
  const h = { fontSize: 14, fontWeight: 700, marginBottom: 8 };
  const stamp = () => ({ at: new Date().toISOString(), by: me });
  const others = mergeQ.trim().length >= 2 ? all.filter((x) => x.key !== c.key && `${x.name} ${x.phone} ${x.email}`.toLowerCase().includes(mergeQ.trim().toLowerCase())).slice(0, 6) : [];

  return (
    <div>
      <button type="button" onClick={onBack} style={{ all: "unset", cursor: "pointer", color: "var(--mr-brand)", fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>← All customers</button>

      <div style={card}>
        {!editing ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{c.name}</div>
                <div style={{ fontSize: 13.5, color: "var(--mr-muted)", marginTop: 2 }}>{[c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email yet"}</div>
                {c.address && <div style={{ fontSize: 13, color: "var(--mr-muted)" }}>{c.address}</div>}
                <div style={{ fontSize: 12, color: "var(--mr-muted)", marginTop: 4 }}>Customer since {day(c.firstSeen) || "today"}{c.consent && c.consent.marketing ? " · ✓ OK to send offers" : " · no marketing consent"}</div>
                {c.tags.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 6, fontSize: 11.5 }}>{c.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} style={btn(false)}>📞 Call</a>}
                <button type="button" style={btn(false)} onClick={startEdit}>✏️ Edit</button>
                <button type="button" style={btn(true)} onClick={() => newRepair(c)}>+ New repair</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginTop: 12 }}>
              {[["Repairs", c.repairs], ["Open now", c.openJobs], ["They've paid us", money(c.spent)], ["We've paid them", money(c.paidToThem)], ["Visits", c.visits]].map(([k, v]) => (
                <div key={k} style={{ background: "var(--mr-surface-2)", borderRadius: 10, padding: "8px 10px" }}><div style={{ fontSize: 11.5, color: "var(--mr-muted)" }}>{k}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div></div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={h}>Edit details</div>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" aria-label="Name" style={input} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0 10px" }}>
              <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Mobile" type="tel" aria-label="Mobile" style={input} />
              <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" type="email" aria-label="Email" style={input} />
            </div>
            <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Address" aria-label="Address" style={input} />
            <input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="Tags, comma separated (e.g. VIP, business, pays late)" aria-label="Tags" style={input} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 10 }}><input type="checkbox" checked={f.marketing} onChange={(e) => setF({ ...f, marketing: e.target.checked })} /> They said yes to offers and news by message</label>
            <div style={{ fontSize: 12, color: "var(--mr-muted)", marginBottom: 10 }}>Changes here update this profile. Old job cards keep the details they were booked with.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={btn(true)} disabled={!f.name.trim()} onClick={async () => {
                const consent = f.marketing ? (c.consent && c.consent.marketing ? c.consent : { marketing: true, ...stamp() }) : (c.consent && c.consent.marketing ? { marketing: false, ...stamp() } : c.consent);
                await upsert(c, { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), address: f.address.trim(), tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), consent,
                  alsoKnownAs: [...new Set([...c.keys, ...(normPhone(f.phone) ? [`p:${normPhone(f.phone)}`] : []), ...(normEmail(f.email) ? [`e:${normEmail(f.email)}`] : [])])] });
                setEditing(false);
              }}>Save</button>
              <button type="button" style={btn(false)} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>

      <MessageCustomer key={c.key} phone={c.phone} email={c.email} templates={customerMessages(c)} title={`Message ${c.name.split(" ")[0]}`}
        onSent={(e) => upsert(c, { notes: [...c.notes, { ...stamp(), text: `Sent "${e.template}" by ${e.how}`, auto: true }] })} />

      <div style={card}>
        <div style={h}>⏰ Reminders</div>
        {c.allReminders.length === 0 && <div style={{ fontSize: 13, color: "var(--mr-muted)", marginBottom: 8 }}>None. Set one to call them back, chase a part, or check in after a repair.</div>}
        {c.allReminders.map((r) => {
          const due = !r.done && Date.parse(r.dueAt) <= Date.now();
          return (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--mr-line)", fontSize: 13.5 }}>
              <span style={{ textDecoration: r.done ? "line-through" : "none", color: r.done ? "var(--mr-muted)" : due ? "var(--mr-bad)" : "var(--mr-text)" }}>{r.text} <span style={{ fontSize: 12, color: "var(--mr-muted)" }}>· {whenText(r.dueAt)}{r.by ? ` · ${r.by}` : ""}</span></span>
              <span style={{ display: "flex", gap: 6 }}>
                {!r.done && <button type="button" style={{ ...btn(false), padding: "5px 10px" }} onClick={() => upsert(c, { reminders: c.allReminders.map((x) => (x.id === r.id ? { ...x, done: true, doneAt: new Date().toISOString(), doneBy: me } : x)) })}>Done</button>}
                <button type="button" aria-label="Delete reminder" style={{ ...btn(false), padding: "5px 10px" }} onClick={() => upsert(c, { reminders: c.allReminders.filter((x) => x.id !== r.id) })}>✕</button>
              </span>
            </div>
          );
        })}
        <div style={{ borderTop: "1px solid var(--mr-line)", paddingTop: 10, marginTop: 4 }}>
          <input value={rem.text} onChange={(e) => setRem({ ...rem, text: e.target.value })} placeholder="What to do, e.g. Call about the screen price" aria-label="Reminder" style={input} />
          <TimePick label="When" value={rem.dueAt} onChange={(v) => setRem({ ...rem, dueAt: v })} inputStyle={input} />
          <button type="button" style={btn(true)} disabled={!rem.text.trim() || !rem.dueAt} onClick={async () => {
            await upsert(c, { reminders: [...c.allReminders, { id: Math.random().toString(36).slice(2, 9), text: rem.text.trim(), dueAt: rem.dueAt, done: false, ...stamp() }] });
            setRem({ dueAt: null, text: "" });
          }}>Add reminder</button>
        </div>
      </div>

      <div style={card}>
        <div style={h}>📝 Notes</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the next person should know (preferences, what was promised, how they like to be contacted)" aria-label="New note" rows={2} style={{ ...input, resize: "vertical" }} />
        <button type="button" style={btn(true)} disabled={!note.trim()} onClick={async () => { await upsert(c, { notes: [...c.notes, { ...stamp(), text: note.trim() }] }); setNote(""); }}>Add note</button>
        {[...c.notes].reverse().map((n, i) => (
          <div key={n.at + i} style={{ borderTop: "1px solid var(--mr-line)", padding: "8px 0", fontSize: 13.5, marginTop: i ? 0 : 10, display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: n.auto ? "var(--mr-muted)" : "var(--mr-text)" }}>{n.text}<span style={{ fontSize: 12, color: "var(--mr-muted)" }}> · {whenText(n.at)}{n.by ? ` · ${n.by}` : ""}</span></span>
            <button type="button" aria-label="Delete note" style={{ all: "unset", cursor: "pointer", color: "var(--mr-muted)" }} onClick={() => { if (window.confirm("Delete this note?")) upsert(c, { notes: c.notes.filter((x) => x !== n) }); }}>✕</button>
          </div>
        ))}
      </div>

      {c.devices.length > 0 && (
        <div style={card}>
          <div style={h}>📱 Devices</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}>{c.devices.map((d) => <Tag key={d} tone="var(--mr-text)">{d}</Tag>)}</div>
        </div>
      )}

      <div style={card}>
        <div style={h}>History ({c.timeline.length})</div>
        {c.timeline.length === 0 && <div style={{ fontSize: 13, color: "var(--mr-muted)" }}>Nothing yet.</div>}
        {c.timeline.map((t, i) => (
          <button key={t.ref + i} type="button" onClick={() => t.link && navigate(t.link)} style={{ all: "unset", boxSizing: "border-box", cursor: t.link ? "pointer" : "default", display: "flex", justifyContent: "space-between", gap: 10, width: "100%", padding: "9px 0", borderTop: i ? "1px solid var(--mr-line)" : "none" }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{KIND[t.kind] || "•"} {t.title}</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--mr-muted)" }}>{day(t.date)} · {t.ref}{t.status ? ` · ${String(t.status).replace(/_/g, " ")}` : ""}{t.sub ? ` · ${t.sub}` : ""}</span>
            </span>
            {t.amount != null && <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", color: t.kind === "tradein" ? "var(--mr-bad)" : "var(--mr-text)" }}>{money(t.amount)}</span>}
          </button>
        ))}
      </div>

      <div style={card}>
        <div style={h}>Tidy up</div>
        {!showMerge ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn(false)} onClick={() => setShowMerge(true)}>Same person as someone else? Merge</button>
            <button type="button" style={{ ...btn(false), color: "var(--mr-bad)", borderColor: "var(--mr-bad)" }} onClick={async () => {
              if (!window.confirm(`Remove ${c.name} from the customer list? Their repairs, sales and orders stay on record; only this profile (notes, reminders, tags) is deleted.`)) return;
              await upsert(c, { deleted: true, deletedAt: new Date().toISOString(), deletedBy: me, alsoKnownAs: c.keys, anchor: c.anchor });
              onBack();
            }}>Remove customer</button>
          </div>
        ) : (
          <>
            <input value={mergeQ} onChange={(e) => setMergeQ(e.target.value)} placeholder="Find the other record: name, phone or email" aria-label="Find duplicate" style={input} autoFocus />
            {others.map((o) => (
              <div key={o.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--mr-line)", fontSize: 13.5 }}>
                <span>{o.name} <span style={{ color: "var(--mr-muted)", fontSize: 12 }}>{[o.phone, o.email].filter(Boolean).join(" · ")} · {o.timeline.length} records</span></span>
                <button type="button" style={{ ...btn(true), padding: "6px 10px" }} onClick={async () => { if (window.confirm(`Merge ${o.name} into ${c.name}? Their history, notes and reminders will show here.`)) { await merge(c, o); setShowMerge(false); setMergeQ(""); onOpen(c.key); } }}>Merge into {c.name.split(" ")[0]}</button>
              </div>
            ))}
            <button type="button" style={{ ...btn(false), marginTop: 8 }} onClick={() => setShowMerge(false)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
