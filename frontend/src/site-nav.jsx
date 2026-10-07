import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MENU } from "./site-menu.js";

const ICONS = {
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  tag: <><circle cx="12" cy="12" r="9" /><path d="M14.6 9.3c-.4-.9-1.4-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2 0 2.8 5.2 1.3 5.2 4 0 1.2-1.2 2.1-2.7 2.1-1.3 0-2.4-.6-2.8-1.5M12 6.2v1.7m0 8.2v1.7" /></>,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  chip: <><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M19 9h3M19 15h3M2 9h3M2 15h3" /></>,
  help: <><circle cx="12" cy="12" r="9.5" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
};
export function Icon({ name, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name] || ICONS.phone}</svg>;
}

// Styles for the customer menu. Staff screens keep their own simple nav (see App.jsx).
export const NAV_CSS = `
  /* Buttons and links don't inherit the page font by default; keep the whole menu in the site font. */
  .dd-trigger, .dd-panel, .dd-panel *, .mm-quote-btn, .cs-burger, .mm-drawer, .mm-drawer * { font-family: 'Archivo', system-ui, sans-serif; }
  .mm-quote-btn { display: inline-block; padding: 9px 18px; border-radius: 999px; background: #2150C8; color: #fff !important; font-size: 13.5px; font-weight: 700; text-decoration: none; transition: transform .15s ease, box-shadow .15s ease, background-color .15s ease; }
  .mm-quote-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(33,80,200,.35); background: #1B43AA; }
  .mm-quote-btn:active { transform: scale(.97); }

  /* ---- Desktop dropdowns ---- */
  .dd { position: relative; }
  .dd::after { content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 16px; }
  .dd-trigger { display: inline-flex; align-items: center; gap: 7px; padding: 7px 13px; font-size: 13.5px; font-weight: 500; color: #111827; text-decoration: none; position: relative; }
  .dd-trigger.active { color: #2150C8; font-weight: 700; }
  .dd-trigger::before { content: ""; position: absolute; left: 13px; right: 13px; bottom: 2px; height: 2px; background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform .2s ease; }
  .dd:hover .dd-trigger::before, .dd:focus-within .dd-trigger::before, .dd-trigger.active::before { transform: scaleX(1); }
  .dd-caret { width: 6px; height: 6px; border-right: 1.6px solid currentColor; border-bottom: 1.6px solid currentColor; transform: rotate(45deg) translateY(-2px); transition: transform .2s ease; }
  .dd:hover .dd-caret, .dd:focus-within .dd-caret { transform: rotate(-135deg) translateY(-1px); }
  .dd-panel { position: absolute; left: -12px; top: calc(100% + 14px); display: flex; gap: 28px; padding: 22px; background: #fff; border: 1px solid #E2E6EC; border-radius: 20px; box-shadow: 0 28px 60px rgba(17,24,39,.16); opacity: 0; visibility: hidden; transform: translateY(10px) scale(.98); transform-origin: top left; transition: opacity .18s ease, transform .24s cubic-bezier(.16,1,.3,1), visibility .24s; z-index: 60; }
  .dd.right .dd-panel { left: auto; right: -12px; transform-origin: top right; }
  .dd:hover .dd-panel, .dd:focus-within .dd-panel { opacity: 1; visibility: visible; transform: none; }
  .dd-cols { display: flex; gap: 30px; }
  .dd-gt { font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: #5B6472; font-weight: 700; margin: 2px 0 8px 10px; white-space: nowrap; }
  .dd-links { display: grid; grid-template-columns: 1fr; gap: 1px; }
  .dd-links.two { grid-template-columns: 1fr 1fr; column-gap: 8px; }
  .dd-link { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 8px 10px; border-radius: 10px; font-size: 13.5px; color: #111827; text-decoration: none; white-space: nowrap; transition: background-color .15s ease, color .15s ease, transform .15s ease; }
  .dd-link small { font-size: 11.5px; color: #5B6472; }
  .dd-link:hover, .dd-link:focus-visible { background: #EEF3FF; color: #2150C8; transform: translateX(2px); outline: none; }
  .dd-promo { position: relative; overflow: hidden; width: 230px; border-radius: 16px; padding: 20px; color: #fff; background: linear-gradient(150deg, #0F1B3D 0%, #1B3A8F 55%, #2150C8 100%); display: flex; flex-direction: column; justify-content: flex-end; min-height: 200px; }
  .dd-promo::before { content: ""; position: absolute; right: -50px; top: -50px; width: 150px; height: 150px; border-radius: 50%; background: rgba(255,255,255,.10); }
  .dd-promo::after { content: ""; position: absolute; right: 24px; top: 70px; width: 70px; height: 70px; border-radius: 50%; background: rgba(255,255,255,.07); }
  .dd-promo-ic { position: absolute; left: 20px; top: 18px; width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,.16); display: flex; align-items: center; justify-content: center; }
  .dd-promo h4 { margin: 0 0 6px; font-size: 16px; line-height: 1.25; position: relative; }
  .dd-promo p { margin: 0 0 14px; font-size: 12.5px; line-height: 1.5; color: rgba(255,255,255,.82); position: relative; }
  .dd-promo-btn { align-self: flex-start; position: relative; padding: 9px 16px; border-radius: 999px; background: #fff; color: #1B43AA !important; font-size: 13px; font-weight: 700; text-decoration: none; transition: transform .15s ease, box-shadow .15s ease; }
  .dd-promo-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(0,0,0,.25); }

  /* ---- Animated hamburger ---- */
  .cs-burger { display: none; position: relative; width: 44px; height: 40px; border: 1px solid #E2E6EC; border-radius: 10px; background: #fff; cursor: pointer; padding: 0; -webkit-tap-highlight-color: transparent; }
  .cs-burger span { position: absolute; left: 12px; right: 12px; height: 2px; border-radius: 2px; background: #111827; transition: transform .3s cubic-bezier(.16,1,.3,1), opacity .2s ease, top .3s cubic-bezier(.16,1,.3,1); }
  .cs-burger span:nth-child(1) { top: 13px; } .cs-burger span:nth-child(2) { top: 19px; } .cs-burger span:nth-child(3) { top: 25px; }
  .cs-burger.open span:nth-child(1) { top: 19px; transform: rotate(45deg); }
  .cs-burger.open span:nth-child(2) { opacity: 0; transform: scaleX(.3); }
  .cs-burger.open span:nth-child(3) { top: 19px; transform: rotate(-45deg); }

  /* ---- Mobile drawer ---- */
  .mm-drawer, .mm-backdrop { display: none; }
  @keyframes mm-pop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
  @keyframes mm-shine { from { transform: translateX(-120%); } to { transform: translateX(220%); } }
  @media (max-width: 720px) {
    .cs-burger { display: block; }
    .mm-quote-btn.desk { display: none; }
    .mm-backdrop { display: block; position: fixed; inset: 0; background: rgba(17,24,39,.45); opacity: 0; visibility: hidden; transition: opacity .25s ease, visibility .25s; z-index: 40; }
    .mm-backdrop.open { opacity: 1; visibility: visible; }
    .mm-drawer { display: block; position: absolute; left: 0; right: 0; top: 100%; max-height: calc(100vh - 100px); max-height: calc(100dvh - 100px); overflow-y: auto; -webkit-overflow-scrolling: touch; background: #fff; border-radius: 0 0 24px 24px; box-shadow: 0 30px 60px rgba(17,24,39,.28); opacity: 0; visibility: hidden; transform: translateY(-12px); transition: opacity .25s ease, transform .32s cubic-bezier(.16,1,.3,1), visibility .32s; padding: 16px 16px calc(22px + env(safe-area-inset-bottom, 0px)); }
    .mm-drawer.open { opacity: 1; visibility: visible; transform: none; }
    .mm-drawer.open .mm-item { animation: cs-fade-up .45s cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--i, 0) * 50ms + 60ms); }
    .mm-cta { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 15px; border-radius: 16px; background: linear-gradient(135deg, #1B43AA, #2150C8); color: #fff; font-size: 16.5px; font-weight: 700; text-decoration: none; margin-bottom: 14px; box-shadow: 0 10px 24px rgba(33,80,200,.32); }
    .mm-cta::after { content: ""; position: absolute; top: 0; bottom: 0; width: 40%; background: linear-gradient(100deg, transparent, rgba(255,255,255,.28), transparent); transform: translateX(-120%); }
    .mm-drawer.open .mm-cta::after { animation: mm-shine 1.4s ease .5s 1 both; }
    .mm-cta:active { transform: scale(.98); }
    .mm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .mm-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; text-align: left; padding: 14px; border-radius: 18px; border: 1.5px solid #E7EBF3; background: #fff; cursor: pointer; font-family: inherit; color: #111827; transition: transform .15s ease, border-color .2s ease, background-color .2s ease, box-shadow .2s ease; -webkit-tap-highlight-color: transparent; }
    .mm-tile:active { transform: scale(.97); }
    .mm-tile .ic { width: 42px; height: 42px; border-radius: 13px; background: #EEF3FF; color: #2150C8; display: flex; align-items: center; justify-content: center; transition: background-color .2s ease, color .2s ease, transform .25s cubic-bezier(.16,1,.3,1); }
    .mm-tile b { display: block; font-size: 16px; line-height: 1.2; }
    .mm-tile small { display: block; font-size: 12px; color: #5B6472; margin-top: 2px; line-height: 1.35; }
    .mm-tile.sel { border-color: #2150C8; background: #F5F8FF; box-shadow: 0 8px 20px rgba(33,80,200,.14); }
    .mm-tile.sel .ic { background: #2150C8; color: #fff; transform: scale(1.06) rotate(-4deg); }
    /* finger-sized targets (about 44px) inside the phone menu */
    .mm-link { min-height: 44px; box-sizing: border-box; display: inline-flex; align-items: center; }
    .mm-all { min-height: 44px; }
    .mm-panel { margin-top: 12px; padding: 16px; border-radius: 18px; background: #F7F9FD; border: 1px solid #E7EBF3; animation: mm-pop .3s cubic-bezier(.16,1,.3,1) both; scroll-margin-bottom: 12px; }
    .mm-gt { font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: #5B6472; font-weight: 700; margin: 0 0 8px; }
    .mm-group { padding-bottom: 12px; }
    .mm-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .mm-link { padding: 10px 15px; border-radius: 999px; background: #fff; border: 1px solid #E2E6EC; color: #111827; font-size: 14px; text-decoration: none; transition: background-color .15s ease, transform .15s ease, border-color .15s ease; }
    .mm-link small { color: #5B6472; font-size: 11.5px; margin-left: 4px; }
    .mm-link:active { transform: scale(.95); background: #E8EEFF; border-color: #2150C8; }
    .mm-promo { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; margin: 2px 0 12px; color: #fff; text-decoration: none; background: linear-gradient(135deg, #0F1B3D, #2150C8); }
    .mm-promo .ic { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 11px; background: rgba(255,255,255,.16); display: flex; align-items: center; justify-content: center; }
    .mm-promo b { display: block; font-size: 14px; }
    .mm-promo span { display: block; font-size: 12px; color: rgba(255,255,255,.85); line-height: 1.4; }
    .mm-all { display: inline-flex; align-items: center; gap: 4px; font-size: 14.5px; font-weight: 700; color: #2150C8; text-decoration: none; }
    .mm-staff { display: block; padding: 16px 2px 12px; font-size: 13.5px; color: #5B6472; text-decoration: underline; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mm-drawer, .mm-backdrop, .cs-burger span, .dd-panel, .dd-caret, .mm-tile, .mm-tile .ic { transition: none !important; }
    .mm-drawer.open .mm-item, .mm-panel, .mm-drawer.open .mm-cta::after { animation: none !important; }
  }
`;

const matches = (pathname, list) => list.some((m) => pathname === m || pathname.startsWith(m + "/"));
const DESKTOP = MENU.filter((s) => !s.mobileOnly);

export function DesktopMenu({ pathname }) {
  return (
    <>
      {DESKTOP.map((s, i) => (
        <div className={`dd${i >= DESKTOP.length - 2 ? " right" : ""}`} key={s.id}>
          <Link to={s.to} className={`dd-trigger${matches(pathname, s.match) ? " active" : ""}`} aria-haspopup="true">
            {s.label}<span className="dd-caret" aria-hidden="true" />
          </Link>
          <div className="dd-panel" role="group" aria-label={`${s.label} menu`}>
            <div className="dd-cols">
              {s.groups.map((g) => (
                <div key={g.title}>
                  <div className="dd-gt">{g.title}</div>
                  <div className={`dd-links${g.cols === 2 ? " two" : ""}`}>
                    {g.links.map((l) => <Link key={l.label} to={l.to} className="dd-link">{l.label}{l.note && <small>{l.note}</small>}</Link>)}
                  </div>
                </div>
              ))}
            </div>
            {s.promo && (
              <div className="dd-promo">
                <div className="dd-promo-ic"><Icon name={s.promo.icon} size={22} /></div>
                <h4>{s.promo.title}</h4>
                <p>{s.promo.text}</p>
                <Link to={s.promo.to} className="dd-promo-btn">{s.promo.cta} →</Link>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

export function MobileBackdrop({ open, onClose }) {
  return <div className={`mm-backdrop${open ? " open" : ""}`} onClick={onClose} aria-hidden="true" />;
}

export function MobileDrawer({ open }) {
  const [sel, setSel] = useState("");
  const panelRef = useRef(null);
  const cur = MENU.find((s) => s.id === sel);
  useEffect(() => { if (!open) setSel(""); }, [open]);
  useEffect(() => { if (sel && panelRef.current && panelRef.current.scrollIntoView) panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [sel]);
  const tab = open ? 0 : -1;
  return (
    <div id="cs-mobile-menu" className={`mm-drawer${open ? " open" : ""}`} aria-hidden={!open}>
      <Link to="/quote" className="mm-cta mm-item" style={{ "--i": 0 }} tabIndex={tab}>Get an instant quote <span aria-hidden="true">→</span></Link>
      <div className="mm-grid">
        {MENU.map((s, i) => (
          <button key={s.id} className={`mm-tile mm-item${sel === s.id ? " sel" : ""}`} style={{ "--i": i + 1 }} aria-expanded={sel === s.id} tabIndex={tab} onClick={() => setSel(sel === s.id ? "" : s.id)}>
            <span className="ic"><Icon name={s.icon} /></span>
            <span><b>{s.label}</b><small>{s.blurb}</small></span>
          </button>
        ))}
      </div>
      {cur && (
        <div className="mm-panel" key={cur.id} ref={panelRef}>
          {cur.promo && (
            <Link to={cur.promo.to} className="mm-promo" tabIndex={tab}>
              <span className="ic"><Icon name={cur.promo.icon} size={20} /></span>
              <span><b>{cur.promo.title}</b><span>{cur.promo.text}</span></span>
            </Link>
          )}
          {cur.groups.map((g) => (
            <div className="mm-group" key={g.title}>
              <div className="mm-gt">{g.title}</div>
              <div className="mm-links">{g.links.map((l) => <Link key={l.label} to={l.to} className="mm-link" tabIndex={tab}>{l.label}{l.note && <small>{l.note}</small>}</Link>)}</div>
            </div>
          ))}
          <Link to={cur.to} className="mm-all" tabIndex={tab}>{cur.cta}</Link>
        </div>
      )}
    </div>
  );
}
