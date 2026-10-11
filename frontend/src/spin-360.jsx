import React, { useEffect, useRef, useState } from "react";

/* Real-photo 360° view for listed phones.
   No 3D engine: staff photograph the actual unit going around it, the page swaps
   between those photos as you drag. Nothing downloads until the customer taps
   "Rotate 360°", so product pages stay as light as before.
   Needs 8 to 36 photos; fewer than 8 and the viewer is simply not shown. */

export const SPIN_MIN = 8, SPIN_MAX = 36;
export const hasSpin = (item) => !!item && Array.isArray(item.spinUrls) && item.spinUrls.length >= SPIN_MIN;
const reduced = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function SpinViewer({ frames, alt, poster }) {
  const [state, setState] = useState("idle"); // idle | loading | ready
  const [loaded, setLoaded] = useState(0);
  const [idx, setIdx] = useState(0);
  const box = useRef(null);
  const drag = useRef(null);
  const n = frames.length;

  async function start() {
    setState("loading"); setLoaded(0);
    let done = 0;
    await Promise.all(frames.map((src) => new Promise((ok) => {
      const i = new Image();
      i.onload = i.onerror = () => { done += 1; setLoaded(done); ok(); };
      i.decoding = "async"; i.src = src;
    })));
    setState("ready");
    if (!reduced()) { // one gentle turn so people see it is interactive, then stop
      const t0 = performance.now(), dur = 1800;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        if (drag.current) return;
        setIdx(Math.floor(t * (n - 1)) % n);
        if (t < 1) requestAnimationFrame(step); else setIdx(0);
      };
      requestAnimationFrame(step);
    }
  }

  const onDown = (e) => { drag.current = { x: e.clientX, i: idx }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } };
  const onMove = (e) => {
    if (!drag.current) return;
    const w = (box.current && box.current.clientWidth) || 320;
    const per = w / n * 1.4; // a full turn takes a bit under one screen width
    const d = Math.round((e.clientX - drag.current.x) / per);
    setIdx((((drag.current.i - d) % n) + n) % n);
  };
  const onUp = () => { drag.current = null; };
  const onKey = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setIdx((i) => (i + 1) % n); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setIdx((i) => (i - 1 + n) % n); }
  };

  return (
    <div style={{ margin: "0 0 16px", textAlign: "center" }}>
      <div ref={box} style={{ position: "relative", maxWidth: 360, margin: "0 auto", borderRadius: 16, background: "#F4F6F9", overflow: "hidden", touchAction: "pan-y", userSelect: "none", cursor: state === "ready" ? "grab" : "default" }}
        onPointerDown={state === "ready" ? onDown : undefined} onPointerMove={state === "ready" ? onMove : undefined} onPointerUp={onUp} onPointerCancel={onUp}
        tabIndex={state === "ready" ? 0 : -1} onKeyDown={state === "ready" ? onKey : undefined} role="img" aria-label={`${alt}, 360 degree view. Use left and right arrow keys to rotate.`}>
        <img src={state === "ready" ? frames[idx] : (poster || frames[0])} alt="" draggable={false} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "3 / 4", objectFit: "contain" }} />
        {state !== "ready" && (
          <button type="button" onClick={start} disabled={state === "loading"}
            style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", padding: "11px 20px", minHeight: 44, borderRadius: 999, border: "none", background: "#2150C8", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 8px 22px rgba(33,80,200,.35)" }}>
            {state === "loading" ? `Loading ${Math.round((loaded / n) * 100)}%` : "Rotate 360°"}
          </button>
        )}
      </div>
      {state === "ready" && (
        <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Rotate phone"
          style={{ width: "min(360px, 90%)", marginTop: 10 }} />
      )}
      <div style={{ fontSize: 12, color: "#5B6472", marginTop: 6 }}>Photos of the exact phone you would receive{state === "ready" ? ". Drag to turn it." : "."}</div>
    </div>
  );
}

/* ---- Staff side: add photos to one stock unit ---- */
async function resize(file, max, q) {
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return cv.toDataURL("image/jpeg", q);
}
async function upload(file, max, q) {
  const dataUrl = await resize(file, max, q);
  if (!window.SHOP_API_BASE_URL || !window.shopAuth) return dataUrl; // preview mode
  const res = await fetch(`${window.SHOP_API_BASE_URL}/product-images`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${window.shopAuth.authToken()}` }, body: JSON.stringify({ dataUrl }) });
  const body = await res.json(); if (!res.ok) throw new Error(body.error || "Upload failed");
  return body.url;
}

export function UnitPhotos({ item, colors, onSave, onClose }) {
  const { paper, muted, brass, brassDim, green, line, red } = colors;
  const [main, setMain] = useState(item.photoUrl || "");
  const [spin, setSpin] = useState(Array.isArray(item.spinUrls) ? item.spinUrls : []);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const btn = { padding: "8px 12px", borderRadius: 2, fontSize: 12.5, border: `1px solid ${line}`, background: "transparent", color: paper, cursor: "pointer" };

  async function pickMain(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    setErr(""); setBusy("Uploading photo…");
    try { setMain(await upload(f, 1000, 0.82)); } catch (x) { setErr(x.message || "Couldn't upload that photo."); } finally { setBusy(""); e.target.value = ""; }
  }
  async function pickSpin(e) {
    const files = Array.from(e.target.files || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, SPIN_MAX);
    e.target.value = ""; if (!files.length) return;
    setErr("");
    const urls = new Array(files.length); let done = 0, next = 0;
    try {
      await Promise.all([0, 1, 2].map(async () => {
        while (next < files.length) {
          const i = next++; urls[i] = await upload(files[i], 720, 0.74); done += 1; setBusy(`Uploading ${done} of ${files.length}…`);
        }
      }));
      setSpin(urls);
    } catch (x) { setErr(x.message || "A photo failed to upload. Try again."); } finally { setBusy(""); }
  }
  const ok = spin.length === 0 || spin.length >= SPIN_MIN;

  return (
    <div style={{ marginTop: 10, padding: 12, border: `1px solid ${line}`, borderRadius: 6, background: "#F8FAFC" }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Photos for this phone</div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 10, lineHeight: 1.5 }}>These must be photos of this exact unit. Main photo: front or back, plain background. 360° set: {SPIN_MIN} to {SPIN_MAX} photos taken while walking around the phone (or turning it on a plain surface), same distance and light. Name them 01, 02, 03… so they stay in order.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        {main && <img src={main} alt="" style={{ width: 54, height: 72, objectFit: "cover", borderRadius: 6, border: `1px solid ${line}` }} />}
        <label style={{ ...btn, display: "inline-block" }}>{main ? "Replace main photo" : "Add main photo"}<input type="file" accept="image/*" onChange={pickMain} style={{ display: "none" }} /></label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <label style={{ ...btn, display: "inline-block" }}>{spin.length ? "Replace 360° set" : "Add 360° set"}<input type="file" accept="image/*" multiple onChange={pickSpin} style={{ display: "none" }} /></label>
        <span style={{ fontSize: 12.5, color: spin.length && spin.length < SPIN_MIN ? red : green }}>{spin.length ? `${spin.length} photos${spin.length < SPIN_MIN ? ` (need at least ${SPIN_MIN})` : ""}` : "none yet"}</span>
        {spin.length > 0 && <button type="button" onClick={() => setSpin([])} style={btn}>Remove 360° set</button>}
      </div>
      {busy && <div role="status" style={{ fontSize: 12.5, color: brass, marginBottom: 6 }}>{busy}</div>}
      {err && <div role="alert" style={{ fontSize: 12.5, color: red, marginBottom: 6 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={!!busy || !ok} onClick={() => { onSave({ photoUrl: main || undefined, spinUrls: spin.length >= SPIN_MIN ? spin : undefined }); onClose(); }}
          style={{ ...btn, border: `1px solid ${brass}`, background: brassDim, color: brass, opacity: busy || !ok ? 0.5 : 1 }}>Save photos</button>
        <button type="button" onClick={onClose} style={btn}>Cancel</button>
      </div>
    </div>
  );
}
