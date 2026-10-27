// The staff portal's frame: a sidebar on wide screens, a top bar and a thumb-reach
// tab bar on phones. Every portal screen renders inside it, so they all share one
// layout. "bare" is for the sign-in and two-step setup screens (no menu yet).
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { PORTAL_ITEMS, PORTAL_GROUPS, TAB_ITEMS, PIcon } from "./portal-nav.jsx";
import { canSeeScreen, currentRole, ROLE_LABELS } from "./roles.js";
import ThemeToggle from "./theme.jsx";

const CSS = `
.ps{min-height:100vh;background:var(--mr-surface-2);color:var(--mr-text);font-family:'Archivo',system-ui,sans-serif}
.ps-side{position:fixed;inset:0 auto 0 0;width:244px;background:#0F1626;color:#C9D2E3;display:flex;flex-direction:column;padding:18px 14px;z-index:40;overflow-y:auto}
.ps-brand{display:flex;align-items:center;gap:9px;color:#fff;text-decoration:none;padding:4px 8px 18px}
.ps-brand b{font-family:'Outfit','Archivo',sans-serif;font-size:20px;letter-spacing:-.01em;font-weight:800}
.ps-brand span{font-family:'Outfit','Archivo',sans-serif;font-size:20px;font-weight:400}
.ps-brand i{font-style:normal;font-size:10.5px;letter-spacing:.16em;color:#8A97B1;margin-left:2px}
.ps-grp{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#6B7893;padding:14px 10px 6px}
.ps-link{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:10px;color:#C9D2E3;text-decoration:none;font-size:14px;font-weight:500;margin-bottom:2px}
.ps-link:hover{background:rgba(255,255,255,.06);color:#fff}
.ps-link.on{background:var(--mr-brand);color:#fff;font-weight:700;box-shadow:0 6px 16px rgba(33,80,200,.35)}
.ps-me{margin-top:auto;border-top:1px solid #1E2940;padding:14px 6px 2px;display:flex;flex-direction:column;gap:6px}
.ps-me-name{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;font-size:14px}
.ps-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--mr-brand),#7A1F2B);display:grid;place-items:center;color:#fff;font-weight:800;font-size:14px;flex:none}
.ps-me small{display:block;color:#8A97B1;font-weight:500;font-size:12px}
.ps-act{display:flex;align-items:center;gap:9px;background:none;border:0;color:#AEB9CE;font-size:13px;padding:7px 4px;cursor:pointer;text-decoration:none;font-family:inherit}
.ps-act:hover{color:#fff}
.ps-main{margin-left:244px;min-width:0;overflow-x:clip}
.ps-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:12px;padding:14px 28px;background:var(--mr-glass);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--mr-line)}
.ps-title{font-family:'Archivo',sans-serif;font-weight:700;font-size:15px;margin:0;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ps-crumb{color:#8A93A3;font-weight:500}
.ps-crumb::after{content:"›";margin:0 8px}
.ps-chip{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mr-muted)}
.ps-mlogo{display:none}
.ps-gridbtn{display:none}
.ps-mtheme{display:none}
.ps-body{min-width:0}
.ps-tabs{display:none}
@media (max-width:980px){
  .ps-side{display:none}
  .ps-main{margin-left:0}
  .ps-top{padding:10px 14px;background:#0F1626;border-bottom:0;color:#fff}
  .ps-title{font-size:16px;color:#fff}
  .ps-crumb{display:none}
  .ps-chip{display:none}
  .ps-mlogo{display:flex}
  .ps-mtheme{display:inline-flex}
  .ps-gridbtn{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14);text-decoration:none}
  .ps-body{padding-bottom:calc(76px + env(safe-area-inset-bottom))}
  .ps-tabs{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:45;background:var(--mr-surface);border-top:1px solid var(--mr-line);padding:6px 4px calc(6px + env(safe-area-inset-bottom));box-shadow:0 -6px 20px rgba(15,22,38,.06)}
  .ps-tab{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--mr-muted);text-decoration:none;padding:6px 2px;border-radius:12px}
  .ps-tab.on{color:var(--mr-brand)}
  .ps-tab.on svg{background:rgba(33,80,200,.1);border-radius:10px}
}
.ps-bare{max-width:none}
/* The portal screens were drawn as narrow single columns with square corners. Give them the
   dashboard's width and shapes here, without touching each screen's own code. */
.ps-body > div > div[style*="margin: 0px auto"]{max-width:1000px !important}
.ps-body button,.ps-body select,.ps-body textarea,.ps-body input:not([type=checkbox]):not([type=radio]):not([type=range]){border-radius:10px !important}
.ps-body input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),.ps-body select{min-height:40px}
.ps-body div[style*="border-left: 3px solid"]{border-radius:12px !important;background:var(--mr-surface)}
`;

// Legacy /staff/... addresses show the same screens; light up the matching item.
const LEGACY = { "/staff": "/portal", "/staff/admin": "/portal/pricing" };
const canonical = (p) => LEGACY[p] || (p.startsWith("/staff/") ? "/portal/" + p.slice(7) : p);

function me() { try { return window.shopAuth && window.shopAuth.currentUser(); } catch (e) { return null; } }
function logOut() { window.shopAuth.logout(window.SHOP_API_BASE_URL); window.location.reload(); }

function Brand() {
  return (
    <Link to="/portal" className="ps-brand" aria-label="Mobile Recellr staff dashboard">
      <img src="/logo-mark.svg" alt="" width="22" height="30" /><span>Mobile</span><b>Recellr</b><i>STAFF</i>
    </Link>
  );
}

export default function PortalShell({ children, bare = false, path }) {
  const location = useLocation();
  const here = canonical(path || location.pathname);
  const role = currentRole();
  const user = me();
  const items = PORTAL_ITEMS.filter((it) => canSeeScreen(it.to, role));
  const current = PORTAL_ITEMS.find((it) => it.to === here);
  const title = bare ? "Staff sign in" : current ? current.label : "Staff portal";
  const tabs = TAB_ITEMS.map((to) => items.find((it) => it.to === to)).filter(Boolean);

  if (bare) {
    return (
      <div className="ps">
        <style>{CSS}</style>
        <div className="ps-top" style={{ background: "#0F1626", color: "#fff", borderBottom: 0 }}><div style={{ flex: 1 }}><Brand /></div></div>
        <div className="ps-body">{children}</div>
      </div>
    );
  }

  return (
    <div className="ps">
      <style>{CSS}</style>
      <aside className="ps-side" aria-label="Staff menu">
        <Brand />
        {PORTAL_GROUPS.map((g) => {
          const list = items.filter((it) => it.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <div className="ps-grp">{g}</div>
              {list.map((it) => (
                <Link key={it.to} to={it.to} className={`ps-link${here === it.to ? " on" : ""}`} aria-current={here === it.to ? "page" : undefined}>
                  <PIcon k={it.icon} size={19} />{it.label}
                </Link>
              ))}
            </div>
          );
        })}
        {user && (
          <div className="ps-me">
            <div className="ps-me-name"><span className="ps-av">{String(user.username || "?").slice(0, 1).toUpperCase()}</span>
              <span>{user.username}<small>{ROLE_LABELS[role] || role}</small></span></div>
            <button type="button" className="ps-act" onClick={logOut}><PIcon k="logout" size={17} />Log out</button>
            <Link to="/" className="ps-act"><PIcon k="site" size={17} />View the website</Link>
            <ThemeToggle showLabel style={{ alignSelf: "flex-start", marginTop: 4, background: "transparent", color: "#C9D2E3", borderColor: "#2A3550" }} />
          </div>
        )}
      </aside>
      <div className="ps-main">
        <header className="ps-top">
          <Link to="/portal" className="ps-mlogo" aria-label="Dashboard"><img src="/logo-mark.svg" alt="" width="20" height="27" /></Link>
          <h1 className="ps-title">{current && current.to !== "/portal" && <span className="ps-crumb">Staff portal</span>}{title}</h1>
          {user && <div className="ps-chip"><span className="ps-av" style={{ width: 30, height: 30, fontSize: 13 }}>{String(user.username || "?").slice(0, 1).toUpperCase()}</span>{user.username} · {ROLE_LABELS[role] || role}</div>}
          <span className="ps-mtheme"><ThemeToggle style={{ background: "rgba(255,255,255,.08)", color: "#fff", borderColor: "rgba(255,255,255,.14)", height: 40 }} /></span>
          <Link to="/portal#tools" className="ps-gridbtn" aria-label="All tools"><PIcon k="grid" size={19} /></Link>
        </header>
        <div className="ps-body">{children}</div>
      </div>
      <nav className="ps-tabs" aria-label="Quick tools" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, 1fr)` }}>
        {tabs.map((it) => (
          <Link key={it.to} to={it.to} className={`ps-tab${here === it.to ? " on" : ""}`} aria-current={here === it.to ? "page" : undefined}>
            <PIcon k={it.icon} size={22} />{it.to === "/portal" ? "Home" : it.label}
          </Link>
        ))}
        <Link to="/portal#tools" className="ps-tab"><PIcon k="grid" size={22} />All tools</Link>
      </nav>
    </div>
  );
}
