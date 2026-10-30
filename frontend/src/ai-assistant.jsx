// "Ask AI" on every staff screen (button, or Ctrl/⌘+K). Type or speak what you want, in
// English or Hinglish ("Ann 0400 111 222 ka iPhone 13 screen $189, kal 5 baje, dev ko do");
// the server's assistant (backend/ai.js) turns it into one action, shown here as an editable
// preview. Nothing is saved until "Do it", which uses the same screens and records as by hand.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const api = () => (typeof window !== "undefined" && window.SHOP_API_BASE_URL) || "";
const auth = () => { try { const t = window.shopAuth && window.shopAuth.authToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch (e) { return {}; } };
const me = () => { try { return (window.shopAuth.currentUser() || {}).username || ""; } catch (e) { return ""; } };
async function load(key) { try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) || [] : []; } catch (e) { return []; } }
async function save(key, v) { await window.storage.set(key, JSON.stringify(v), true); }
const SCREEN_PATH = { dashboard: "/portal", repairs: "/portal/repairs", my_day: "/portal/repairs", new_job: "/portal/repairs", visits: "/portal/repairs", parts: "/portal/repairs",
  register: "/portal/pos", sell: "/portal/pos", sales: "/portal/pos", inventory: "/portal/pos", accessories: "/portal/pos", inspection: "/portal/inspect", till: "/portal/till",
  customers: "/portal/crm", reports: "/portal/crm", pricing: "/portal/pricing", team: "/portal/team" };
const LABEL = { new_repair: "Book in a repair", add_customer: "Add a customer", reminder: "Set a reminder", expense: "Record an expense", find: "Search", open: "Open a screen", none: "Not sure" };
const EXAMPLES = ["Ann 0400 111 222 ka iPhone 13 screen, $189, kal 5 baje tak, dev ko de do", "Remind me to call Raj tomorrow 11am about his iPad", "Rent $1800 paid today", "Find Sam Lee", "Open the till"];

export default function AiAssistant() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);
  const [done, setDone] = useState("");
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-AU");
  const team = useRef([]);
  const rec = useRef(null);

  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (!open || team.current.length) return;
    fetch(`${api()}/auth/team`, { headers: auth() }).then((r) => (r.ok ? r.json() : { team: [] })).then((j) => { team.current = (j.team || []).map((u) => u.username); }).catch(() => {});
  }, [open]);

  const Speech = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  function listen() {
    if (!Speech) return;
    if (listening && rec.current) { rec.current.stop(); return; }
    const r = new Speech(); r.lang = lang; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => setText([...e.results].map((x) => x[0].transcript).join(" "));
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  }

  async function ask() {
    if (!text.trim()) return;
    setBusy(true); setErr(""); setRes(null); setDone("");
    try {
      const r = await fetch(`${api()}/ai/command`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ text, team: team.current }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The assistant isn't available right now.");
      setRes(j.result);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const set = (part, k, v) => setRes((x) => ({ ...x, [part]: { ...(x[part] || {}), [k]: v } }));

  async function doIt() {
    const a = res; if (!a) return;
    try {
      if (a.action === "new_repair") {
        const r = a.repair || {};
        sessionStorage.setItem("mr-intake-prefill", JSON.stringify({ fromCustomer: true, id: `ai-${Date.now()}`, name: r.name || "", phone: r.phone || "", email: r.email || "",
          brand: r.brand || "", model: r.model || "", issue: r.issue || "", repairTypeId: r.repairType || null, quotedPrice: r.price ?? null,
          dueAt: r.promisedAt ? new Date(r.promisedAt).toISOString() : "", assignedTo: r.assignTo || "", partLabel: r.partNeeded || "", passcode: r.passcode || "" }));
        navigate("/portal/repairs"); setDone("Opened New job with the details filled in. Check it and press Create."); setTimeout(() => setOpen(false), 900);
      } else if (a.action === "add_customer" || a.action === "reminder") {
        const c = a.customer || {}, rm = a.reminder || {};
        const list = await load("customers"); const at = new Date().toISOString();
        const who = (a.action === "reminder" ? rm.customer : c.name) || "";
        const hit = list.find((p) => p && !p.deleted && who && (String(p.name || "").toLowerCase().includes(who.toLowerCase()) || (who.replace(/\D/g, "").length >= 6 && String(p.phone || "").replace(/\D/g, "").includes(who.replace(/\D/g, "")))));
        const reminder = a.action === "reminder" && rm.text ? [{ id: Math.random().toString(36).slice(2, 9), text: rm.text, dueAt: rm.when ? new Date(rm.when).toISOString() : at, done: false, at, by: me() }] : [];
        const next = hit
          ? list.map((p) => (p.id === hit.id ? { ...p, reminders: [...(p.reminders || []), ...reminder], updatedAt: at } : p))
          : [{ id: "CUS-" + Math.random().toString(36).slice(2, 8).toUpperCase(), createdAt: at, createdBy: me(), name: c.name || who || "New customer", phone: c.phone || "", email: c.email || "",
              notes: c.note ? [{ at, by: me(), text: c.note }] : [], reminders: reminder, alsoKnownAs: [] }, ...list];
        await save("customers", next);
        setDone(a.action === "reminder" ? `Reminder saved${hit ? ` on ${hit.name}` : ""}. It shows on the Dashboard when due.` : "Customer saved. Find them in Customers.");
      } else if (a.action === "expense") {
        const e = a.expense || {};
        if (!(Number(e.amount) > 0)) { setErr("How much was it?"); return; }
        const list = await load("expenses");
        await save("expenses", [{ id: "EXP-" + Date.now().toString(36), category: e.category || "Other", description: e.description || "Expense", amount: Number(e.amount), date: e.date || new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }) }, ...list]);
        setDone("Expense saved. It's in Customers & reports > Expenses.");
      } else if (a.action === "find") {
        sessionStorage.setItem("mr-customer-search", a.query || ""); navigate("/portal/crm"); setOpen(false);
      } else if (a.action === "open") {
        navigate(SCREEN_PATH[a.screen] || "/portal"); setOpen(false);
      }
    } catch (e) { setErr("Couldn't save that. Check the connection and try again."); }
  }

  const inp = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--mr-line)", background: "var(--mr-surface-2)", color: "var(--mr-text)", fontSize: 13.5, fontFamily: "inherit" };
  const btn = (primary) => ({ padding: "9px 14px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: primary ? "none" : "1px solid var(--mr-line)", background: primary ? "var(--mr-brand-fill)" : "transparent", color: primary ? "#fff" : "var(--mr-text)" });
  const field = (part, k, label, type = "text") => (
    <label key={part + k} style={{ fontSize: 11.5, color: "var(--mr-muted)" }}>{label}
      <input type={type} value={(res[part] && res[part][k]) ?? ""} onChange={(e) => set(part, k, type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} style={inp} />
    </label>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Ask AI (Ctrl+K)" title="Ask AI (Ctrl+K)"
        style={{ position: "fixed", right: "max(16px, env(safe-area-inset-right, 0px))", bottom: "calc(84px + env(safe-area-inset-bottom, 0px))", zIndex: 900, padding: "11px 16px", borderRadius: 999, border: "none", background: "linear-gradient(135deg, var(--mr-brand-fill), #7A1F2B)", color: "#fff", fontWeight: 800, fontSize: 14, boxShadow: "0 8px 24px rgba(0,0,0,.25)", cursor: "pointer", fontFamily: "inherit" }}>✨ Ask AI</button>
      {open && (
        <div role="dialog" aria-label="Ask AI" onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 2500, background: "rgba(10,10,20,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "max(16px, 8vh) 16px 16px" }}>
          <div style={{ width: "min(640px, 100%)", maxHeight: "84vh", overflowY: "auto", background: "var(--mr-surface)", color: "var(--mr-text)", borderRadius: 16, padding: 16, boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <b style={{ fontSize: 16 }}>✨ What do you want to do?</b>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ all: "unset", cursor: "pointer", fontSize: 18, color: "var(--mr-muted)" }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} autoFocus aria-label="What do you want to do?"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
                placeholder="e.g. Ann 0400 111 222 ka iPhone 13 screen, $189, kal 5 baje tak" style={{ ...inp, resize: "vertical", fontSize: 14.5 }} />
              {Speech && <button type="button" onClick={listen} aria-label={listening ? "Stop listening" : "Speak"} title="Speak" style={{ ...btn(listening), minWidth: 46 }}>{listening ? "■" : "🎤"}</button>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}>
              {Speech && <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Speech language" style={{ ...inp, width: "auto", padding: "5px 8px", fontSize: 12 }}><option value="en-AU">English</option><option value="hi-IN">Hindi</option></select>}
              <button type="button" onClick={ask} disabled={busy || !text.trim()} style={btn(true)}>{busy ? "Thinking…" : "Go"}</button>
            </div>
            {!res && !busy && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setText(x)} style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid var(--mr-line)", background: "transparent", color: "var(--mr-muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>{x}</button>)}</div>}
            {err && <div style={{ color: "var(--mr-bad)", fontSize: 13, marginTop: 8 }}>{err}</div>}
            {res && (
              <div style={{ border: "1px solid var(--mr-line)", borderRadius: 12, padding: 12, marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "var(--mr-muted)" }}>{LABEL[res.action] || res.action}</div>
                <div style={{ fontSize: 14.5, fontWeight: 700, margin: "2px 0 10px" }}>{res.summary}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
                  {res.action === "new_repair" && [field("repair", "name", "Customer"), field("repair", "phone", "Phone"), field("repair", "email", "Email"), field("repair", "brand", "Brand"), field("repair", "model", "Model"),
                    field("repair", "repairType", "Repair (screen, battery…)"), field("repair", "issue", "What's wrong"), field("repair", "price", "Price $", "number"), field("repair", "promisedAt", "Promised by", "datetime-local"),
                    field("repair", "assignTo", "Technician"), field("repair", "partNeeded", "Part needed")]}
                  {res.action === "add_customer" && [field("customer", "name", "Name"), field("customer", "phone", "Phone"), field("customer", "email", "Email"), field("customer", "note", "Note")]}
                  {res.action === "reminder" && [field("reminder", "customer", "Customer"), field("reminder", "text", "What to do"), field("reminder", "when", "When", "datetime-local")]}
                  {res.action === "expense" && [field("expense", "category", "Category"), field("expense", "description", "What for"), field("expense", "amount", "Amount $", "number"), field("expense", "date", "Date", "date")]}
                  {res.action === "find" && <label style={{ fontSize: 11.5, color: "var(--mr-muted)" }}>Search for<input value={res.query || ""} onChange={(e) => setRes({ ...res, query: e.target.value })} style={inp} /></label>}
                </div>
                {res.action !== "none" && <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={doIt} style={btn(true)}>Do it</button>
                  <button type="button" onClick={() => setRes(null)} style={btn(false)}>Change what I said</button>
                </div>}
                {done && <div style={{ color: "var(--mr-ok)", fontSize: 13, marginTop: 8 }}>✓ {done}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
