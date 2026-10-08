import React, { useEffect, useRef, useState } from "react";

/* Camera barcode scanner for staff screens.
   - Uses the phone's back camera. Chrome/Android has a built-in reader
     (BarcodeDetector); Safari/iPhone does not, so the ZXing library is loaded
     only when needed (it never ships to customers' pages).
   - Reads normal product barcodes (EAN/UPC), Code 128, Code 39 (our IMEI
     labels) and QR codes.
   - A typed box is always there too: works with a USB/Bluetooth scanner gun
     (they type the code + Enter) or when camera permission is blocked. */

const WANTED = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code", "data_matrix"];

export function BarcodeScanner({ title = "Scan barcode", onResult, onClose }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState("");
  const [typed, setTyped] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    const finish = (code) => {
      if (cancelled || !code) return;
      cancelled = true;
      stop();
      try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) { /* no vibration */ }
      onResult(String(code).trim());
    };
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErr("This browser can't open the camera. Type or scan the code into the box below.");
        return;
      }
      try {
        let formats = [];
        if ("BarcodeDetector" in window) {
          try { formats = ((await window.BarcodeDetector.getSupportedFormats()) || []).filter((f) => WANTED.includes(f)); } catch (e) { formats = []; }
        }
        if (formats.length) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          const v = videoRef.current;
          v.srcObject = stream;
          await v.play();
          setReady(true);
          const detector = new window.BarcodeDetector({ formats });
          let timer = null;
          stop = () => { clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); };
          const tick = async () => {
            if (cancelled) return;
            try {
              const found = await detector.detect(v);
              if (found && found[0] && found[0].rawValue) return finish(found[0].rawValue);
            } catch (e) { /* frame not ready */ }
            timer = setTimeout(tick, 150);
          };
          tick();
          return;
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, videoRef.current, (result) => {
          if (result) finish(result.getText());
        });
        stop = () => { try { controls.stop(); } catch (e) { /* already stopped */ } };
        if (cancelled) stop(); else setReady(true);
      } catch (e) {
        setErr(e && e.name === "NotAllowedError"
          ? "Camera permission is blocked. Allow the camera for this site in your browser settings, or type the code below."
          : "Couldn't start the camera. Type or scan the code into the box below.");
      }
    })();
    return () => { cancelled = true; stop(); };
  }, []);

  const submitTyped = () => { if (typed.trim()) onResult(typed.trim()); };

  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,27,61,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#FFFFFF", borderRadius: 16, overflow: "hidden", fontFamily: "'Archivo', system-ui, sans-serif", color: "#111827" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button onClick={onClose} aria-label="Close scanner" style={{ border: "none", background: "#F1F3F7", borderRadius: 10, width: 40, height: 40, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ position: "relative", background: "#000", aspectRatio: "4 / 3" }}>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div aria-hidden="true" style={{ position: "absolute", left: "12%", right: "12%", top: "30%", bottom: "30%", border: "3px solid rgba(255,255,255,0.9)", borderRadius: 12, boxShadow: "0 0 0 2000px rgba(0,0,0,0.25)" }} />
          {!ready && !err && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 }}>Starting camera…</div>}
        </div>
        <div style={{ padding: 16 }}>
          {err ? <div style={{ color: "#8B2E2E", fontSize: 13.5, marginBottom: 10 }}>{err}</div>
            : <div style={{ color: "#5B6472", fontSize: 13.5, marginBottom: 10 }}>Hold the barcode inside the box. It reads automatically.</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitTyped(); }}
              placeholder="Or type / scanner gun" aria-label="Barcode or code"
              style={{ flex: 1, padding: "11px 12px", borderRadius: 10, border: "1px solid #E2E6EC", background: "#F4F6F9", fontSize: 15, fontFamily: "inherit", minWidth: 0 }} />
            <button onClick={submitTyped} disabled={!typed.trim()}
              style={{ padding: "11px 16px", borderRadius: 10, border: "none", background: typed.trim() ? "#2150C8" : "#C9CED6", color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: typed.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Use</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// A small "📷 Scan" button that opens the scanner and hands back the code.
export function ScanButton({ onScan, title, label = "Scan", style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={title || label}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", minHeight: 40, borderRadius: 10, border: "1px solid #2150C8", background: "rgba(33,80,200,0.08)", color: "#2150C8", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", ...style }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" /><path d="M8 8v8M11 8v8M14 8v8M17 8v8" /></svg>
        {label}
      </button>
      {open && <BarcodeScanner title={title || "Scan barcode"} onClose={() => setOpen(false)} onResult={(code) => { setOpen(false); onScan(code); }} />}
    </>
  );
}
