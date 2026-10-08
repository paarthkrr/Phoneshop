import React, { useState, useEffect, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { withBusinessDefaults, waLink } from "./business-info.js";

// Floating "Ask us" button on every customer page. The chat panel itself loads only when first opened.
const ChatPanel = React.lazy(() => import("./chat-panel.jsx"));
const teaserFor = (p) => p.startsWith("/repairs") ? "Want a repair price? Ask me, I know them." : p.startsWith("/shop") ? "Not sure which phone to pick? I can help you find one." : p.startsWith("/quote") || p.startsWith("/sell") ? "Questions about selling your phone? Ask here." : p.startsWith("/parts") || p.startsWith("/accessories") ? "Looking for the right part? Ask me." : "Questions about a repair or selling your phone? Ask us here.";
const isStaffPath = (p) => /^\/(portal|staff)(\/|$)/.test(p);

const CSS = `
  .rc-launch { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 39; display: flex; align-items: center; gap: 10px; flex-direction: row-reverse; }
  body.has-mobile-cta .rc-launch { bottom: calc(86px + env(safe-area-inset-bottom, 0px)); }
  .rc-launch.low { bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
  .rc-fab { position: relative; width: 58px; height: 58px; border-radius: 50%; border: none; cursor: pointer; background: linear-gradient(135deg, #1B43AA, #2150C8); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 28px rgba(33,80,200,.45); animation: rc-in .5s cubic-bezier(.16,1,.3,1) both .6s; -webkit-tap-highlight-color: transparent; transition: transform .15s ease; }
  .rc-fab:hover { transform: translateY(-2px) scale(1.04); }
  .rc-fab:active { transform: scale(.95); }
  .rc-fab::before { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(33,80,200,.55); animation: rc-ring 2.4s ease-out 2.2s 3; }
  .rc-wa { position: fixed; right: 24px; bottom: calc(86px + env(safe-area-inset-bottom, 0px)); z-index: 39; width: 44px; height: 44px; border-radius: 50%; background: #25D366; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(0,0,0,.24); text-decoration: none; transition: transform .15s ease; animation: rc-in .5s cubic-bezier(.16,1,.3,1) both .9s; }
  .rc-wa:hover { transform: scale(1.08); }
  body.has-mobile-cta .rc-wa { bottom: calc(154px + env(safe-area-inset-bottom, 0px)); }
  .rc-wa.low { bottom: calc(164px + env(safe-area-inset-bottom, 0px)); }
  @media (min-width: 721px) { body.has-mobile-cta .rc-wa { bottom: calc(86px + env(safe-area-inset-bottom, 0px)); } }
  .rc-dot { position: absolute; top: 4px; right: 4px; width: 13px; height: 13px; border-radius: 50%; background: #E5484D; border: 2px solid #fff; animation: rc-pop .35s cubic-bezier(.16,1,.3,1) both; }
  .rc-tease { max-width: 210px; padding: 10px 14px; background: #fff; color: #0F1B3D; border-radius: 16px 16px 4px 16px; font: 500 13.5px/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; box-shadow: 0 10px 28px rgba(17,24,39,.18); animation: rc-tease .45s cubic-bezier(.16,1,.3,1) both; cursor: pointer; }
  .rc-fab { animation: rc-in .5s cubic-bezier(.16,1,.3,1) both .6s, rc-wiggle 14s ease-in-out 9s infinite; }
  @keyframes rc-wiggle { 0%, 4%, 100% { transform: none; } 1% { transform: rotate(-9deg); } 2% { transform: rotate(8deg); } 3% { transform: rotate(-4deg); } }
  @keyframes rc-in { from { opacity: 0; transform: translateY(14px) scale(.8); } to { opacity: 1; transform: none; } }
  @keyframes rc-ring { from { transform: scale(1); opacity: .9; } to { transform: scale(1.7); opacity: 0; } }
  @keyframes rc-pop { from { transform: scale(0); } to { transform: scale(1); } }
  @keyframes rc-tease { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
  @media print { .rc-launch { display: none; } }
  @media (prefers-reduced-motion: reduce) { .rc-fab, .rc-tease, .rc-dot { animation: none !important; } .rc-fab::before { display: none; } }
`;

export default function ChatWidget() {
  const loc = useLocation();
  const path = loc.pathname.replace(/\/+$/, "") || "/";
  const [open, setOpen] = useState(false);
  const [dot, setDot] = useState(false);
  const [tease, setTease] = useState(false);
  const [biz, setBiz] = useState(() => withBusinessDefaults(null));
  useEffect(() => { (async () => { try { const r = window.storage && (await window.storage.get("pricing-config", true)); if (r) setBiz(withBusinessDefaults(JSON.parse(r.value).businessSettings)); } catch (e) { /* keep defaults */ } })(); }, []);
  const staff = isStaffPath(path);

  useEffect(() => {
    if (staff) return undefined;
    let seen = false;
    try { seen = sessionStorage.getItem("rc_seen") === "1"; } catch (e) { /* private mode */ }
    if (seen) return undefined;
    const t1 = setTimeout(() => setTease(true), 7000);
    const t2 = setTimeout(() => { setTease(false); setDot(true); }, 15000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [staff]);
  // Warm up the panel code shortly after load so the first tap feels instant.
  useEffect(() => { if (staff) return undefined; const t = setTimeout(() => import("./chat-panel.jsx"), 4000); return () => clearTimeout(t); }, [staff]);

  if (staff) return null;
  const openChat = () => { setOpen(true); setTease(false); setDot(false); try { sessionStorage.setItem("rc_seen", "1"); } catch (e) { /* ignore */ } };
  const low = path === "/quote" || path === "/sell";
  return (
    <>
      <style>{CSS}</style>
      {!open && (
        <a className={`rc-wa${low ? " low" : ""}`} href={waLink(biz.whatsapp, "Hi Mobile Recellr, ")} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-1.3-.6-2.2-1.2-3-2.7-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.5l-.8-1.8c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.8.8-1 1.7-.7 2.8.4 1.6 1.4 2.9 2.7 4 1.7 1.4 3.2 2 4.9 1.9.9-.1 1.7-.7 2-1.5.1-.3.1-.6 0-.7l-.8-.4z" /></svg>
        </a>
      )}
      {!open && (
        <div className={`rc-launch${low ? " low" : ""}`}>
          <button className="rc-fab" onClick={openChat} aria-label="Chat with Mobile Recellr" aria-haspopup="dialog">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5z" /><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth="2.4" /></svg>
            {dot && <span className="rc-dot" aria-hidden="true" />}
          </button>
          {tease && <div className="rc-tease" role="status" onClick={openChat}>{teaserFor(path)}</div>}
        </div>
      )}
      {open && <Suspense fallback={null}><ChatPanel path={path} onClose={() => setOpen(false)} /></Suspense>}
    </>
  );
}
