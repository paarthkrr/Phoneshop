// Repair Bench settings everyone shares: what each technician is good at and how many
// jobs a day they aim for, and job templates ("iPhone 13 screen": repair, price, time,
// part) that fill the New job form in one tap. Kept as id'd records in "bench_settings",
// so two people editing different things never overwrite each other.
import React, { useEffect, useState } from "react";

const KEY = "bench_settings";
export async function loadBench() { try { const r = await window.storage.get(KEY, true); return r ? (JSON.parse(r.value) || []).filter((x) => x && !x.deleted) : []; } catch (e) { return []; } }
async function saveRecord(rec) {
  let list = []; try { const r = await window.storage.get(KEY, true); list = r ? JSON.parse(r.value) || [] : []; } catch (e) { list = []; }
  const next = list.some((x) => x.id === rec.id) ? list.map((x) => (x.id === rec.id ? { ...x, ...rec } : x)) : [rec, ...list];
  await window.storage.set(KEY, JSON.stringify(next), true);
  return next.filter((x) => x && !x.deleted);
}
export const skillsOf = (bench, user) => (bench.find((x) => x.id === `tech:${user}`) || {}).skills || [];
export const targetOf = (bench, user) => Number((bench.find((x) => x.id === `tech:${user}`) || {}).target) || 0;
export const templatesOf = (bench) => bench.filter((x) => x.type === "template").sort((a, b) => String(a.name).localeCompare(String(b.name)));

// Who should take a job of this repair type: technicians with the skill, fewest open jobs first.
export function suggestTech({ bench, team, tickets, repairTypeId }) {
  if (!repairTypeId) return null;
  const open = (u) => tickets.filter((t) => t.assignedTo === u && !["completed", "not_repairable", "cancelled", "ready_for_pickup"].includes(t.status)).length;
  const fits = (team || []).map((u) => u.username).filter((u) => skillsOf(bench, u).includes(repairTypeId));
  if (!fits.length) return null;
  return fits.map((u) => ({ user: u, open: open(u) })).sort((a, b) => a.open - b.open)[0];
}

export function useBench() {
  const [bench, setBench] = useState([]);
  useEffect(() => { loadBench().then(setBench); }, []);
  const save = async (rec) => setBench(await saveRecord(rec));
  return [bench, save];
}

// Owner/manager: tick what each person repairs and set a daily target.
export function TeamSkills({ bench, onSave, team, repairTypes, canEdit }) {
  const [open, setOpen] = useState(false);
  const people = (team || []).filter((u) => ["technician", "admin", "manager", "staff"].includes(u.role));
  const chip = (on) => ({ padding: "4px 9px", borderRadius: 999, fontSize: 11.5, cursor: canEdit ? "pointer" : "default", fontFamily: "inherit", border: `1px solid ${on ? "var(--mr-brand)" : "var(--mr-line)"}`, background: on ? "var(--mr-brand-soft)" : "transparent", color: on ? "var(--mr-brand)" : "var(--mr-muted)" });
  return (
    <div style={{ border: "1px solid var(--mr-line)", borderRadius: 12, padding: 12, marginTop: 18, background: "var(--mr-surface)" }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", fontWeight: 800, fontSize: 14 }}>{open ? "▾" : "▸"} Team skills and daily targets</button>
      {open && <div style={{ marginTop: 10 }}>
        {!people.length && <div style={{ fontSize: 13, color: "var(--mr-muted)" }}>Add people in Team first.</div>}
        {people.map((u) => {
          const rec = bench.find((x) => x.id === `tech:${u.username}`) || { id: `tech:${u.username}`, type: "tech", user: u.username, skills: [], target: 0 };
          return (
            <div key={u.username} style={{ padding: "8px 0", borderTop: "1px solid var(--mr-line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13.5 }}>{u.username} <span style={{ color: "var(--mr-muted)", fontWeight: 400, fontSize: 12 }}>{u.role}</span></b>
                <label style={{ fontSize: 12, color: "var(--mr-muted)", display: "flex", gap: 6, alignItems: "center" }}>jobs a day
                  <input type="number" min="0" max="50" disabled={!canEdit} value={rec.target || ""} onChange={(e) => onSave({ ...rec, target: Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)) })}
                    style={{ width: 56, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--mr-line)", background: "transparent", color: "var(--mr-text)" }} /></label>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {repairTypes.filter((r) => r.id !== "other").map((r) => { const on = (rec.skills || []).includes(r.id); return (
                  <button key={r.id} type="button" disabled={!canEdit} aria-pressed={on} style={chip(on)} onClick={() => onSave({ ...rec, skills: on ? rec.skills.filter((x) => x !== r.id) : [...(rec.skills || []), r.id] })}>{on ? "✓ " : ""}{r.label}</button>); })}
              </div>
            </div>
          );
        })}
        {!canEdit && <div style={{ fontSize: 12, color: "var(--mr-muted)", marginTop: 6 }}>The owner or a manager sets these.</div>}
      </div>}
    </div>
  );
}

// New job: one tap fills the form from a template; save the current form as a new one.
export function TemplateBar({ bench, onSave, onApply, current, canDelete }) {
  const list = templatesOf(bench);
  const chip = { padding: "6px 11px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--mr-line)", background: "transparent", color: "var(--mr-text)" };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "var(--mr-muted)", marginBottom: 6 }}>Quick fill from a template</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {list.length === 0 && <span style={{ fontSize: 12.5, color: "var(--mr-muted)" }}>No templates yet.</span>}
        {list.map((t) => (
          <span key={t.id} style={{ display: "inline-flex", alignItems: "center" }}>
            <button type="button" style={chip} onClick={() => onApply(t)}>{t.name}</button>
            {canDelete && <button type="button" aria-label={`Delete template ${t.name}`} onClick={() => { if (window.confirm(`Delete the template "${t.name}"?`)) onSave({ ...t, deleted: true }); }} style={{ border: "none", background: "none", color: "var(--mr-muted)", cursor: "pointer" }}>×</button>}
          </span>
        ))}
        {current && current.repairTypeId && <button type="button" style={{ ...chip, color: "var(--mr-brand)", borderColor: "var(--mr-brand)" }} onClick={() => {
          const name = window.prompt("Name this template (e.g. iPhone 13 screen)", `${current.model || ""} ${current.repairLabel || ""}`.trim());
          if (name && name.trim()) onSave({ id: `tpl:${Date.now().toString(36)}`, type: "template", name: name.trim(), brand: current.brand, model: current.model, repairTypeId: current.repairTypeId, issue: current.issue, quotedPrice: current.quotedPrice, estimateMins: current.estimateMins, partLabel: current.partLabel || "" });
        }}>+ Save this as a template</button>}
      </div>
    </div>
  );
}
