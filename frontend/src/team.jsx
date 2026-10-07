import React, { useState, useEffect } from "react";
import { ROLE_LABELS, ROLE_HELP, ROLE_ORDER } from "./roles.js";
import { TwoStepCard, SignInHistory } from "./security.jsx";

// Team: admins add staff, reset forgotten passwords and remove people who've
// left. Everyone can change their own password here too.
const ink = "#FFFFFF", panel = "#FFFFFF", panel2 = "#F4F6F9", paper = "#111827", muted = "#5B6472", brass = "#2150C8", red = "#8B2E2E", green = "#3F6B34", line = "#E2E6EC";
const field = { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${line}`, background: panel2, color: paper, fontSize: 15, marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" };
const btn = (bg, fg = "#fff") => ({ padding: "12px 18px", borderRadius: 10, border: "none", background: bg, color: fg, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

async function api(path, opts = {}) {
  const res = await fetch(`${window.SHOP_API_BASE_URL}${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${window.shopAuth.authToken()}`, ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong");
  return body;
}

export default function Team() {
  const auth = typeof window !== "undefined" && window.shopAuth && window.SHOP_API_BASE_URL ? window.shopAuth : null;
  const me = auth && auth.currentUser();
  const isAdmin = me && me.role === "admin";
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [nu, setNu] = useState({ username: "", password: "", role: "staff" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const flash = (text, ok = true) => setMsg({ text, ok });

  async function refresh() { try { setUsers((await api("/auth/users")).users); } catch (e) { flash(e.message, false); } }
  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  if (!auth) return <Wrap><div style={{ color: muted }}>Team management needs the live server (not available in this preview).</div></Wrap>;

  async function addUser() {
    if (!nu.username.trim() || nu.password.length < 12) return flash("Enter a username and a password of at least 12 characters.", false);
    try { await auth.register(window.SHOP_API_BASE_URL, nu.username.trim(), nu.password, nu.role, auth.authToken()); flash(`Account "${nu.username.trim()}" created. Give them their username and password.`); setNu({ username: "", password: "", role: "staff" }); refresh(); }
    catch (e) { flash(e.message, false); }
  }
  async function changeRole(u, role) {
    if (!window.confirm(`Change ${u} to ${ROLE_LABELS[role]}? They'll be signed out and get the new access when they sign in again.`)) return;
    try { await api(`/auth/users/${encodeURIComponent(u)}/role`, { method: "POST", body: JSON.stringify({ role }) }); flash(`${u} is now ${ROLE_LABELS[role]}.`); refresh(); }
    catch (e) { flash(e.message, false); refresh(); }
  }
  async function resetPw(u) {
    const p = window.prompt(`New password for ${u} (12+ characters):`);
    if (!p) return;
    if (p.length < 12) return flash("Password must be at least 12 characters.", false);
    try { await api(`/auth/users/${encodeURIComponent(u)}/password`, { method: "POST", body: JSON.stringify({ newPassword: p }) }); flash(`Password reset for ${u}. They've been signed out everywhere.`); }
    catch (e) { flash(e.message, false); }
  }
  async function resetTwoStep(u) {
    if (!window.confirm(`Reset two-step sign-in for ${u}? Use this if they lost their phone. They'll be signed out and set it up again next time.`)) return;
    try { await api(`/auth/users/${encodeURIComponent(u)}/2fa-reset`, { method: "POST" }); flash(`Two-step reset for ${u}.`); refresh(); }
    catch (e) { flash(e.message, false); }
  }
  async function remove(u) {
    if (!window.confirm(`Remove ${u}? They'll be signed out immediately and can't log in again.`)) return;
    try { await api(`/auth/users/${encodeURIComponent(u)}`, { method: "DELETE" }); flash(`${u} removed.`); refresh(); }
    catch (e) { flash(e.message, false); }
  }
  async function changeMine() {
    if (pw.next.length < 12) return flash("New password must be at least 12 characters.", false);
    try { await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) }); flash("Your password has been changed."); setPw({ current: "", next: "" }); }
    catch (e) { flash(e.message, false); }
  }

  return (
    <Wrap>
      {msg.text && <div role="status" style={{ padding: "12px 14px", borderRadius: 10, marginBottom: 18, fontSize: 15, background: msg.ok ? "#EEF5EC" : "#FBF1EF", color: msg.ok ? green : red, border: `1px solid ${msg.ok ? green : red}` }}>{msg.text}</div>}
      {isAdmin ? (
        <>
          <Card title="Add a team member">
            <input style={field} placeholder="Username (e.g. their first name)" aria-label="New username" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} autoComplete="off" />
            <input style={field} placeholder="Temporary password (12+ characters)" aria-label="Temporary password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} autoComplete="new-password" />
            <div role="group" aria-label="Role" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
              {ROLE_ORDER.map((k) => [k, `${ROLE_LABELS[k]} — ${ROLE_HELP[k]}`]).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={nu.role === k} onClick={() => setNu({ ...nu, role: k })}
                  style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${nu.role === k ? brass : line}`, background: nu.role === k ? "rgba(33,80,200,0.10)" : "transparent", color: nu.role === k ? brass : paper }}>{l}</button>
              ))}
            </div>
            <button style={btn(brass)} onClick={addUser}>Create account</button>
          </Card>
          <Card title={`Team (${users ? users.length : "…"})`}>
            {(users || []).map((u) => (
              <div key={u.username} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: "1px solid rgba(32,28,24,0.1)", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{u.username}{u.username === me.username ? " (you)" : ""}</div>
                  <div style={{ fontSize: 13.5, color: muted }}>{ROLE_LABELS[u.role] || u.role} · added {new Date(u.created_at).toLocaleDateString("en-AU")} · {u.two_step ? "📱 two-step on" : "two-step off"}</div>
                </div>
                {u.username !== me.username && <>
                  <select aria-label={`Role for ${u.username}`} value={u.role} onChange={(e) => changeRole(u.username, e.target.value)}
                    style={{ padding: "11px 10px", borderRadius: 10, border: `1px solid ${line}`, background: "#fff", fontSize: 14.5, fontFamily: "inherit", color: paper }}>
                    {ROLE_ORDER.map((k) => <option key={k} value={k}>{ROLE_LABELS[k]}</option>)}
                  </select>
                  <button style={btn("transparent", brass)} onClick={() => resetPw(u.username)}>Reset password</button>
                  {u.two_step && <button style={btn("transparent", brass)} onClick={() => resetTwoStep(u.username)}>Reset two-step</button>}
                  <button style={btn("transparent", red)} onClick={() => remove(u.username)}>Remove</button>
                </>}
              </div>
            ))}
          </Card>
        </>
      ) : (
        <Card title="Team"><div style={{ fontSize: 15, color: muted }}>Only the Owner can add, remove or change team members. Ask the Owner if you need an account for someone.</div></Card>
      )}
      <TwoStepCard Card={Card} />
      <BackupCode />
      <Card title="Change my password">
        <input style={field} type="password" placeholder="Current password" aria-label="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
        <input style={field} type="password" placeholder="New password (12+ characters, a short sentence works)" aria-label="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
        <button style={btn(paper)} onClick={changeMine}>Change password</button>
      </Card>
      <SignInHistory Card={Card} everyone={isAdmin} />
    </Wrap>
  );
}

function Wrap({ children }) {
  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 16px 60px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, marginBottom: 6 }}>Team</div>
        <div style={{ color: muted, fontSize: 15, marginBottom: 22 }}>Who can sign in to the staff portal.</div>
        {children}
      </div>
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div style={{ background: panel, border: "1px solid rgba(32,28,24,0.14)", borderRadius: 14, padding: 18, marginBottom: 18 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

// Personal backup code: the permanent way to reset a forgotten password.
function BackupCode() {
  const [status, setStatus] = useState(null); const [code, setCode] = useState(""); const [err, setErr] = useState(""); const [copied, setCopied] = useState(false);
  useEffect(() => { (async () => { try { setStatus(await api("/auth/recovery-code")); } catch (e) { setErr(e.message); } })(); }, []);
  async function make() {
    if (status && status.hasCode && !window.confirm("Make a new backup code? Your old one will stop working.")) return;
    try { const r = await api("/auth/recovery-code", { method: "POST" }); setCode(r.code); setStatus({ hasCode: true, createdAt: new Date().toISOString() }); } catch (e) { setErr(e.message); }
  }
  return (
    <Card title="🔑 Backup recovery code">
      <div style={{ fontSize: 14.5, color: muted, lineHeight: 1.6, marginBottom: 12 }}>
        If you ever forget your password, use this code on the sign-in screen ("Forgot password?"). Save it somewhere safe — your phone's notes or password manager. Each code works once; afterwards, make a new one here.
      </div>
      {code ? (
        <div style={{ background: "#EEF5EC", border: `1px solid ${green}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: green, fontWeight: 700, marginBottom: 6 }}>Your new backup code — save it now, it won't be shown again:</div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 20, fontWeight: 800, letterSpacing: "0.06em", marginBottom: 10, userSelect: "all" }}>{code}</div>
          <button style={btn(green)} onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch (e) {} }}>{copied ? "✓ Copied" : "Copy code"}</button>
        </div>
      ) : (
        <div style={{ fontSize: 14.5, marginBottom: 10 }}>{status ? (status.hasCode ? `✅ You have a backup code (made ${new Date(status.createdAt).toLocaleDateString("en-AU")}).` : "⚠️ You don't have a backup code yet.") : "…"}</div>
      )}
      {err && <div style={{ color: red, fontSize: 14, marginBottom: 8 }}>{err}</div>}
      <button style={btn(status && status.hasCode ? "transparent" : brass, status && status.hasCode ? paper : "#fff", status && status.hasCode ? { border: `1px solid ${line}` } : {})} onClick={make}>
        {status && status.hasCode ? "Make a new code" : "Create my backup code"}
      </button>
    </Card>
  );
}
