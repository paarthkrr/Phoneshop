import React, { useState, useEffect } from "react";
import QRCode from "qrcode";

// Sign-in safety screens: the "finish securing your account" step after
// sign-in, two-step setup (authenticator app), and sign-in history.
const paper = "#111827", muted = "#5B6472", brass = "#2150C8", red = "#8B2E2E", green = "#3F6B34", line = "#E2E6EC", panel2 = "#F4F6F9";
const field = { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 15, marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" };
const btn = (bg, fg = "#fff") => ({ padding: "12px 18px", borderRadius: 10, border: "none", background: bg, color: fg, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const PASSWORD_HINT = "At least 12 characters. A short sentence is easiest, like “green kettle on tuesday”.";

async function api(path, opts = {}) {
  const res = await fetch(`${window.SHOP_API_BASE_URL}${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${window.shopAuth.authToken()}`, ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong");
  return body;
}
const Err = ({ text }) => text ? <div role="alert" style={{ color: red, fontSize: 14, marginBottom: 10 }}>{text}</div> : null;

// Shown instead of the portal until the account meets the rules.
export default function SecuritySetup({ limits, onDone }) {
  const needsPassword = limits.includes("password");
  return (
    <div style={{ maxWidth: 460, margin: "48px auto", padding: "0 16px", fontFamily: "'Archivo', system-ui, sans-serif", color: paper }}>
      <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontWeight: 400, fontSize: 24, margin: "0 0 8px" }}>Secure your account</h1>
      <p style={{ color: muted, fontSize: 15, lineHeight: 1.6, margin: "0 0 20px" }}>
        {needsPassword ? "The shop now needs longer passwords. Choose a new one to continue." : "Your role needs two-step sign-in: a 6-digit code from an app on your phone, as well as your password. It takes about a minute."}
      </p>
      {needsPassword ? <NewPassword onDone={onDone} /> : <TwoStepSetup onDone={onDone} />}
      <button onClick={() => { window.shopAuth.logout(window.SHOP_API_BASE_URL); window.location.reload(); }}
        style={{ ...btn("transparent", muted), padding: "10px 0", fontSize: 14, textDecoration: "underline" }}>Sign out</button>
    </div>
  );
}

function NewPassword({ onDone }) {
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function save() {
    setErr(""); setBusy(true);
    try { await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: cur, newPassword: next }) }); onDone(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <input style={field} type="password" placeholder="Current password" aria-label="Current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
      <input style={field} type="password" placeholder="New password" aria-label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <div style={{ fontSize: 13.5, color: muted, marginBottom: 12 }}>{PASSWORD_HINT}</div>
      <Err text={err} />
      <button style={btn(brass)} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save new password"}</button>
    </div>
  );
}

// Password → QR code → 6-digit code. Used for first setup and for moving to a new phone.
export function TwoStepSetup({ onDone }) {
  const [pw, setPw] = useState(""); const [setup, setSetup] = useState(null); const [qr, setQr] = useState(""); const [code, setCode] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function start() {
    setErr(""); setBusy(true);
    try { const s = await api("/auth/2fa/setup", { method: "POST", body: JSON.stringify({ password: pw }) }); setSetup(s); setQr(await QRCode.toDataURL(s.uri, { margin: 1, width: 220 })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function finish() {
    setErr(""); setBusy(true);
    try { await api("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code: code.trim() }) }); onDone(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  if (!setup) return (
    <div>
      <ol style={{ fontSize: 14.5, color: paper, lineHeight: 1.7, paddingLeft: 20, margin: "0 0 14px" }}>
        <li>Install an authenticator app on your phone: <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> (free).</li>
        <li>Enter your password below to get your QR code.</li>
      </ol>
      <input style={field} type="password" placeholder="Your password" aria-label="Your password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password"
        onKeyDown={(e) => { if (e.key === "Enter") start(); }} />
      <Err text={err} />
      <button style={btn(brass)} disabled={busy || !pw} onClick={start}>{busy ? "…" : "Show my QR code"}</button>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 10 }}>In the app, tap <strong>+</strong> → <strong>Scan a QR code</strong>, then point it at this:</div>
      {qr && <img src={qr} alt="QR code for your authenticator app" width="220" height="220" style={{ display: "block", border: `1px solid ${line}`, borderRadius: 10, marginBottom: 10 }} />}
      <details style={{ fontSize: 13.5, color: muted, marginBottom: 14 }}>
        <summary style={{ cursor: "pointer" }}>Can't scan? Type this key instead</summary>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, color: paper, wordBreak: "break-all", userSelect: "all", marginTop: 6 }}>{setup.secret.match(/.{1,4}/g).join(" ")}</div>
      </details>
      <div style={{ fontSize: 14.5, marginBottom: 8 }}>Then type the 6-digit code the app shows for <strong>Mobile Recellr</strong>:</div>
      <input style={{ ...field, fontSize: 22, letterSpacing: "0.3em", textAlign: "center" }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" aria-label="6-digit code"
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) finish(); }} />
      <Err text={err} />
      <button style={btn(green)} disabled={busy || code.length !== 6} onClick={finish}>{busy ? "Checking…" : "Turn on two-step sign-in"}</button>
      <div style={{ fontSize: 13, color: muted, marginTop: 12, lineHeight: 1.5 }}>Tip: also make a backup recovery code on the Team page. It's how you get back in if you lose this phone.</div>
    </div>
  );
}

export function TwoStepCard({ Card }) {
  const [st, setSt] = useState(null); const [changing, setChanging] = useState(false); const [err, setErr] = useState("");
  const load = async () => { try { setSt(await api("/auth/2fa")); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); }, []);
  async function turnOff() {
    const pw = window.prompt("Enter your password to turn off two-step sign-in:");
    if (!pw) return;
    try { await api("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password: pw }) }); load(); } catch (e) { setErr(e.message); }
  }
  return (
    <Card title="📱 Two-step sign-in">
      <div style={{ fontSize: 14.5, color: muted, lineHeight: 1.6, marginBottom: 12 }}>
        A 6-digit code from your phone as well as your password, so a leaked password alone can't get in.{st && st.required ? " Your role has to use it." : " Optional for your role, but recommended."}
      </div>
      {st && <div style={{ fontSize: 14.5, marginBottom: 12 }}>{st.enabled ? `✅ On since ${new Date(st.enabledAt).toLocaleDateString("en-AU")}.` : "⚠️ Off."}</div>}
      <Err text={err} />
      {changing ? <TwoStepSetup onDone={() => { setChanging(false); load(); }} /> : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btn(st && st.enabled ? "transparent" : brass, st && st.enabled ? brass : "#fff")} onClick={() => setChanging(true)}>{st && st.enabled ? "Move to a new phone" : "Turn on"}</button>
          {st && st.enabled && !st.required && <button style={btn("transparent", red)} onClick={turnOff}>Turn off</button>}
        </div>
      )}
    </Card>
  );
}

const RESULT_STYLE = { "signed in": green, "password reset with backup code": brass };
export function SignInHistory({ Card, everyone }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(""); const [onlyProblems, setOnlyProblems] = useState(false);
  useEffect(() => { (async () => { try { setRows((await api("/auth/login-log")).entries); } catch (e) { setErr(e.message); } })(); }, []);
  const shown = (rows || []).filter((r) => !onlyProblems || r.result !== "signed in" || r.new_device).slice(0, 100);
  return (
    <Card title={everyone ? "🕑 Sign-in history (everyone)" : "🕑 My sign-in history"}>
      <div style={{ fontSize: 14, color: muted, lineHeight: 1.6, marginBottom: 10 }}>Last 6 months. A sign-in from a new device, and an account getting locked, are also emailed to the owner.</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} style={{ width: 18, height: 18 }} /> Only failures and new devices
      </label>
      <Err text={err} />
      {!rows ? <div style={{ color: muted }}>…</div> : !shown.length ? <div style={{ color: muted, fontSize: 14.5 }}>Nothing to show.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ textAlign: "left", color: muted }}>
              <th style={{ padding: "6px 8px 6px 0" }}>When</th>{everyone && <th style={{ padding: "6px 8px" }}>Who</th>}<th style={{ padding: "6px 8px" }}>What</th><th style={{ padding: "6px 8px" }}>Device</th><th style={{ padding: "6px 0 6px 8px" }}>Network</th>
            </tr></thead>
            <tbody>{shown.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${line}` }}>
                <td style={{ padding: "8px 8px 8px 0", whiteSpace: "nowrap" }}>{new Date(r.at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}</td>
                {everyone && <td style={{ padding: 8, fontWeight: 700 }}>{r.username}</td>}
                <td style={{ padding: 8, color: RESULT_STYLE[r.result] || red, fontWeight: 600 }}>{r.result}{r.new_device ? " · new device" : ""}</td>
                <td style={{ padding: 8 }}>{r.device}</td>
                <td style={{ padding: "8px 0 8px 8px", fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>{r.ip}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
