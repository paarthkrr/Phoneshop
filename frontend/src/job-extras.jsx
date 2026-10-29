// Extra pieces of a repair job: condition photos, the customer's signature on the
// intake terms, the shelf the phone sits on, a notes thread between staff, and the
// quality check before it's handed back. Photos and signatures are kept staff-only
// on the server (backend/job-photos.js), not in the job record.
import React, { useEffect, useRef, useState } from "react";

const api = () => (typeof window !== "undefined" && window.SHOP_API_BASE_URL) || "";
const auth = () => { try { const t = window.shopAuth && window.shopAuth.authToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch (e) { return {}; } };

// A phone photo is several MB: shrink it to at most 1280 px and JPEG before sending.
export function shrinkImage(file, max = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}
export async function uploadPhoto(subject, kind, imageBase64) {
  const r = await fetch(`${api()}/job-photos`, { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ subject, kind, imageBase64 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "upload failed");
  return j;
}
export async function loadPhotos(subjects) {
  const r = await fetch(`${api()}/job-photos?subject=${encodeURIComponent(subjects.join(","))}`, { headers: auth() });
  if (!r.ok) return [];
  return (await r.json()).photos || [];
}

const btn = (primary) => ({ padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: primary ? "none" : "1px solid var(--mr-line)", background: primary ? "var(--mr-brand-fill)" : "transparent", color: primary ? "#fff" : "var(--mr-text)" });
const box = { border: "1px solid var(--mr-line)", borderRadius: 10, padding: 12, marginBottom: 16, background: "var(--mr-surface)" };
const h = { fontSize: 13, fontWeight: 700, marginBottom: 8 };

// Condition photos: before (at intake) and after (when it's fixed), plus any the customer sent.
export function JobPhotos({ ticket, onCount }) {
  const [photos, setPhotos] = useState(null);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const [view, setView] = useState(null);
  const subjects = [`job:${ticket.id}`, ...(ticket.requestId ? [`request:${ticket.requestId}`] : [])];
  const refresh = async () => { const p = await loadPhotos(subjects); setPhotos(p.filter((x) => x.kind !== "signature")); onCount && onCount(p.filter((x) => x.kind !== "signature").length); };
  useEffect(() => { refresh(); }, [ticket.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (kind, files) => {
    setErr(""); setBusy(kind);
    try { for (const f of [...files].slice(0, 6)) await uploadPhoto(`job:${ticket.id}`, kind, await shrinkImage(f)); await refresh(); }
    catch (e) { setErr(e.message === "not an image" ? "That file isn't a photo." : "Couldn't save the photo. Check the connection and try again."); }
    finally { setBusy(""); }
  };
  const del = async (p) => { if (!window.confirm("Delete this photo?")) return; await fetch(`${api()}/job-photos/${p.id}`, { method: "DELETE", headers: auth() }); refresh(); };
  const group = (k) => (photos || []).filter((p) => p.kind === k);
  return (
    <div style={box}>
      <div style={h}>📷 Photos</div>
      {photos === null && <div style={{ fontSize: 12.5, color: "var(--mr-muted)" }}>Loading…</div>}
      {photos && [["before", "Before (as it came in)"], ["after", "After the repair"], ["damage", "Sent by the customer"]].map(([k, l]) => (k === "damage" && !group(k).length ? null : (
        <div key={k} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--mr-muted)", marginBottom: 6 }}>{l} ({group(k).length})</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {group(k).map((p) => (
              <span key={p.id} style={{ position: "relative" }}>
                <button type="button" onClick={() => setView(p)} style={{ all: "unset", cursor: "zoom-in" }}><img src={p.imageBase64} alt={`${l} photo`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--mr-line)" }} /></button>
                <button type="button" aria-label="Delete photo" onClick={() => del(p)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: "none", background: "var(--mr-bad)", color: "#fff", fontSize: 11, cursor: "pointer" }}>×</button>
              </span>
            ))}
            {k !== "damage" && <label style={{ ...btn(false), display: "inline-flex", alignItems: "center", gap: 6 }}>
              {busy === k ? "Saving…" : "+ Take / add photo"}
              <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { add(k, e.target.files); e.target.value = ""; }} />
            </label>}
          </div>
        </div>
      )))}
      {err && <div style={{ fontSize: 12.5, color: "var(--mr-bad)" }}>{err}</div>}
      {view && <div role="dialog" aria-label="Photo" onClick={() => setView(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
        <img src={view.imageBase64} alt="" style={{ maxWidth: "94vw", maxHeight: "90vh", borderRadius: 8 }} />
      </div>}
    </div>
  );
}

// Website: after sending a repair request, the customer can add up to 3 photos of the damage.
export function DamagePhotos({ requestId }) {
  const [n, setN] = useState(0); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const add = async (files) => {
    setBusy(true); setMsg("");
    try { for (const f of [...files].slice(0, 3 - n)) { await uploadPhoto(`request:${requestId}`, "damage", await shrinkImage(f)); setN((x) => x + 1); } setMsg("Thanks, we've got your photos."); }
    catch (e) { setMsg(/up to/.test(e.message) ? "That's the most photos we can take for one request." : "Couldn't send that photo. You can show us in store instead."); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ border: "1px dashed var(--mr-line)", borderRadius: 12, padding: 14, margin: "0 0 20px", textAlign: "center" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Add photos of the damage (optional)</div>
      <div style={{ fontSize: 13, color: "var(--mr-muted)", marginBottom: 10 }}>It helps us check the part and price before you come in. Up to 3 photos.</div>
      {n < 3 && <label style={{ display: "inline-block", padding: "10px 16px", borderRadius: 10, background: "var(--mr-brand-fill)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
        {busy ? "Sending…" : n ? "Add another photo" : "Take or choose a photo"}
        <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </label>}
      {(msg || n > 0) && <div style={{ fontSize: 13, marginTop: 8, color: "var(--mr-muted)" }}>{n} sent. {msg}</div>}
    </div>
  );
}

// The intake terms the customer agrees to, signed on the screen with a finger.
export const INTAKE_TERMS = "I agree to the repair quote and the shop's terms. I understand that data loss can happen during a repair and I have backed up my device. Devices not collected within 90 days of being ready may be disposed of. Parts carry the warranty stated on my job ticket.";
export function IntakeSignature({ ticket, onSigned }) {
  const canvas = useRef(null), drawing = useRef(false), drew = useRef(false);
  const [sig, setSig] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadPhotos([`job:${ticket.id}`]).then((p) => setSig(p.filter((x) => x.kind === "signature").pop() || null)); }, [ticket.id]);
  useEffect(() => {
    const c = canvas.current; if (!c || sig) return undefined;
    const ctx = c.getContext("2d"); const r = c.getBoundingClientRect(); c.width = r.width * 2; c.height = r.height * 2; ctx.scale(2, 2);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    const at = (e) => { const b = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return [t.clientX - b.left, t.clientY - b.top]; };
    const down = (e) => { e.preventDefault(); drawing.current = true; const [x, y] = at(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e) => { if (!drawing.current) return; e.preventDefault(); const [x, y] = at(e); ctx.lineTo(x, y); ctx.stroke(); drew.current = true; };
    const up = () => { drawing.current = false; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [sig]);
  if (sig === undefined) return null;
  if (sig) return <div style={{ ...box, fontSize: 12.5 }}><div style={h}>✍️ Customer signed the intake terms</div><img src={sig.imageBase64} alt="Customer signature" style={{ height: 60, background: "#fff", borderRadius: 6, border: "1px solid var(--mr-line)" }} /><div style={{ color: "var(--mr-muted)", marginTop: 4 }}>{new Date(sig.at).toLocaleString("en-AU")}</div></div>;
  return (
    <div style={box}>
      <div style={h}>✍️ Customer signs the intake terms</div>
      <div style={{ fontSize: 12.5, color: "var(--mr-muted)", marginBottom: 8, lineHeight: 1.5 }}>{INTAKE_TERMS}</div>
      <canvas ref={canvas} aria-label="Sign here" style={{ width: "100%", height: 130, background: "#fff", border: "1px dashed var(--mr-line)", borderRadius: 8, touchAction: "none", cursor: "crosshair" }} />
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" style={btn(true)} disabled={busy} onClick={async () => {
          if (!drew.current) { window.alert("Ask the customer to sign in the box first."); return; }
          setBusy(true);
          try { await uploadPhoto(`job:${ticket.id}`, "signature", canvas.current.toDataURL("image/png")); const p = await loadPhotos([`job:${ticket.id}`]); setSig(p.filter((x) => x.kind === "signature").pop() || null); onSigned && onSigned(); }
          catch (e) { window.alert("Couldn't save the signature. Try again."); } finally { setBusy(false); }
        }}>Save signature</button>
        <button type="button" style={btn(false)} onClick={() => { const c = canvas.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); drew.current = false; }}>Clear</button>
      </div>
    </div>
  );
}

// Where the phone is in the shop.
export function BinField({ value, onSave }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 6 }}>📦 Shelf / bin
      <input value={v} onChange={(e) => setV(e.target.value.toUpperCase().slice(0, 12))} onBlur={() => v !== (value || "") && onSave(v.trim())} placeholder="e.g. A3" aria-label="Shelf or bin"
        style={{ width: 90, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--mr-line)", background: "transparent", color: "var(--mr-text)", fontFamily: "ui-monospace, monospace" }} />
    </label>
  );
}

// Staff talking about the job: who said what, when. Never shown to the customer.
export function JobNotes({ ticket, me, onUpdate }) {
  const [t, setT] = useState("");
  const notes = ticket.notes || [];
  const add = () => { if (!t.trim()) return; onUpdate({ notes: [...notes, { at: new Date().toISOString(), by: me || "", text: t.trim() }] }); setT(""); };
  return (
    <div style={box}>
      <div style={h}>💬 Notes between staff ({notes.length})</div>
      {notes.map((n, i) => (
        <div key={n.at + i} style={{ fontSize: 13, padding: "6px 0", borderTop: i ? "1px solid var(--mr-line)" : "none" }}>
          <b>{n.by || "someone"}</b> <span style={{ color: "var(--mr-muted)", fontSize: 11.5 }}>{new Date(n.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
          <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a note (customer said…, found…, waiting for…)" aria-label="Add a note"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--mr-line)", background: "var(--mr-surface-2)", color: "var(--mr-text)", fontSize: 13, fontFamily: "inherit" }} />
        <button type="button" style={btn(true)} disabled={!t.trim()} onClick={add}>Add</button>
      </div>
    </div>
  );
}

// A second look before the phone goes back: the after-repair test and a quick checklist.
export const QC_ITEMS = ["Screen / touch all over", "Cameras and flash", "Speaker, mic, call test", "Charging and battery health", "Buttons, Face ID / fingerprint", "Cleaned, no marks or dust"];
export function QualityCheck({ ticket, me, onUpdate }) {
  const qc = ticket.qc || {};
  const done = QC_ITEMS.filter((k) => qc.items && qc.items[k]).length;
  const tick = (k) => onUpdate({ qc: { ...qc, items: { ...(qc.items || {}), [k]: !(qc.items && qc.items[k]) }, passedAt: null, passedBy: null } });
  const sameTech = ticket.assignedTo && me === ticket.assignedTo;
  return (
    <div style={{ ...box, borderColor: qc.passedAt ? "var(--mr-ok)" : "var(--mr-line)" }}>
      <div style={h}>✅ Quality check before it goes back {qc.passedAt ? <span style={{ color: "var(--mr-ok)" }}>· passed by {qc.passedBy}</span> : `· ${done}/${QC_ITEMS.length}`}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 4 }}>
        {QC_ITEMS.map((k) => <label key={k} style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!(qc.items && qc.items[k])} onChange={() => tick(k)} />{k}</label>)}
      </div>
      {!qc.passedAt && <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" style={btn(true)} disabled={done < QC_ITEMS.length} onClick={() => onUpdate({ qc: { ...qc, passedAt: new Date().toISOString(), passedBy: me || "" } })}>QC passed</button>
        {sameTech && <span style={{ fontSize: 12, color: "var(--mr-muted)" }}>Best done by someone other than {ticket.assignedTo}.</span>}
      </div>}
    </div>
  );
}
