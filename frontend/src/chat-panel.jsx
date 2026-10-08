import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FAQ, matchFaq } from "./chat-faq.js";
import { REPAIRS_BY_DEVICE } from "./repair-prices.js";
import { withBusinessDefaults, waLink, mailLink } from "./business-info.js";
import { Icon } from "./site-nav.jsx";

// The chat window. Tiles, quick-reply buttons and built-in answers work with no AI at all; free typing goes
// to the AI (POST /public/chat) when it's switched on, and falls back to the built-in answers otherwise.

const SAVE_KEY = "rc_chat_v2";
const uid = () => Math.random().toString(36).slice(2, 9);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());
const phoneOk = (v) => (v || "").replace(/\D/g, "").length >= 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSmall = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
const ALLOWED_LINK = /^(\/(?:[A-Za-z0-9\-_/]*)(?:\?[A-Za-z0-9=&%+_.-]*)?(?:#[a-z-]+)?|https:\/\/wa\.me\/\d{8,15}(?:\?[^\s]*)?|tel:\+?[\d\s]{6,20}|mailto:[^\s]+@[^\s]+)$/;
const GRADES = { A: "Excellent", B: "Good", C: "Fair" };
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-AU")}`;

const CSS = `
  .rc-wrap { position: fixed; z-index: 1000; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); width: 396px; height: min(660px, calc(100dvh - 32px)); display: flex; flex-direction: column; background: #fff; border-radius: 24px; box-shadow: 0 30px 80px rgba(15,27,61,.34), 0 0 0 1px rgba(15,27,61,.06); overflow: hidden; transform-origin: bottom right; animation: rc-open .34s cubic-bezier(.16,1,.3,1) both; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #0F1B3D; }
  .rc-scrim { display: none; }
  .rc-head { display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 16px; color: #fff; background: radial-gradient(120% 140% at 0% 0%, #2150C8 0%, #1B3A8F 45%, #0F1B3D 100%); position: relative; overflow: hidden; }
  .rc-head::after { content: ""; position: absolute; right: -40px; top: -60px; width: 150px; height: 150px; border-radius: 50%; background: rgba(255,255,255,.08); pointer-events: none; }
  .rc-av { position: relative; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 14px; background: #fff; padding: 4px; box-sizing: border-box; }
  .rc-av img { width: 100%; height: 100%; display: block; }
  .rc-av.busy::before { content: ""; position: absolute; inset: -4px; border-radius: 17px; border: 2px solid rgba(255,255,255,.85); border-top-color: transparent; animation: rc-spin 1s linear infinite; }
  .rc-head b { display: block; font-size: 16px; }
  .rc-head small { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,.85); }
  .rc-live { width: 8px; height: 8px; border-radius: 50%; background: #3DDC84; box-shadow: 0 0 0 0 rgba(61,220,132,.7); animation: rc-live 2s infinite; }
  .rc-head .sp { flex: 1; }
  .rc-ib { position: relative; z-index: 1; width: 36px; height: 36px; border-radius: 11px; border: none; background: rgba(255,255,255,.15); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background-color .15s ease, transform .15s ease; -webkit-tap-highlight-color: transparent; }
  .rc-ib:hover { background: rgba(255,255,255,.28); } .rc-ib:active { transform: scale(.92); }
  .rc-log { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 16px 14px 8px; background: linear-gradient(180deg, #F3F6FD, #EDF2FC); scroll-behavior: smooth; }
  .rc-row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 10px; animation: rc-up .38s cubic-bezier(.16,1,.3,1) both; }
  .rc-row.user { justify-content: flex-end; }
  .rc-mini { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 9px; background: #fff; padding: 3px; box-sizing: border-box; box-shadow: 0 1px 3px rgba(15,27,61,.15); }
  .rc-mini img { width: 100%; height: 100%; display: block; }
  .rc-bub { max-width: 84%; padding: 10px 13px; border-radius: 18px; font-size: 14.5px; line-height: 1.5; word-wrap: break-word; overflow-wrap: anywhere; }
  .rc-row.bot .rc-bub { background: #fff; border-bottom-left-radius: 6px; box-shadow: 0 1px 3px rgba(15,27,61,.08); }
  .rc-row.user .rc-bub { background: linear-gradient(135deg, #1B43AA, #2150C8); color: #fff; border-bottom-right-radius: 6px; box-shadow: 0 4px 12px rgba(33,80,200,.28); }
  .rc-bub p { margin: 0 0 6px; } .rc-bub p:last-child { margin-bottom: 0; }
  .rc-bub ul { margin: 4px 0 6px; padding-left: 18px; } .rc-bub li { margin: 2px 0; }
  .rc-bub a { color: #2150C8; font-weight: 600; text-decoration: underline; }
  .rc-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .rc-pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px; border-radius: 999px; border: 1.5px solid #2150C8; background: #fff; color: #2150C8 !important; font: 600 13.5px/1 inherit; text-decoration: none !important; cursor: pointer; transition: background-color .15s ease, color .15s ease, transform .15s ease, box-shadow .15s ease; }
  .rc-pill:hover { background: #2150C8; color: #fff !important; } .rc-pill:active { transform: scale(.96); }
  .rc-pill.solid { background: #2150C8; color: #fff !important; box-shadow: 0 4px 12px rgba(33,80,200,.28); } .rc-pill.solid:hover { background: #1B43AA; }
  .rc-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin: 2px 0 10px; }
  .rc-tile { display: flex; align-items: center; gap: 10px; padding: 11px 12px; text-align: left; border-radius: 16px; border: 1.5px solid #DCE5F8; background: #fff; color: #0F1B3D; font: 600 13.5px/1.2 inherit; cursor: pointer; animation: rc-up .45s cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--i, 0) * 55ms + 120ms); transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; -webkit-tap-highlight-color: transparent; }
  .rc-tile:hover { border-color: #2150C8; box-shadow: 0 8px 18px rgba(33,80,200,.14); transform: translateY(-1px); } .rc-tile:active { transform: scale(.96); }
  .rc-tile .ic { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 11px; background: #EEF3FF; color: #2150C8; display: flex; align-items: center; justify-content: center; transition: background-color .15s ease, color .15s ease; }
  .rc-tile:hover .ic { background: #2150C8; color: #fff; }
  .rc-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 12px; animation: rc-up .4s cubic-bezier(.16,1,.3,1) both .15s; }
  .rc-chip { padding: 9px 14px; border-radius: 999px; border: 1.5px solid #D5DEF5; background: #fff; color: #0F1B3D; font: 500 13.5px/1.2 inherit; cursor: pointer; transition: border-color .15s ease, background-color .15s ease, transform .15s ease; -webkit-tap-highlight-color: transparent; }
  .rc-chip:hover { border-color: #2150C8; background: #EEF3FF; } .rc-chip:active { transform: scale(.96); }
  .rc-card { margin-top: 10px; padding: 12px 14px; border-radius: 14px; background: #EEF3FF; border: 1px solid #D5DEF5; }
  .rc-card .sm { font-size: 12.5px; color: #4A5568; margin-top: 6px; line-height: 1.45; }
  .rc-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; box-sizing: border-box; margin-top: 7px; padding: 11px 13px; border-radius: 12px; border: 1.5px solid #D5DEF5; background: #fff; color: #0F1B3D; font: 500 14px/1.2 inherit; cursor: pointer; text-align: left; transition: border-color .15s ease, background-color .15s ease, transform .15s ease; }
  .rc-opt:first-child { margin-top: 0; }
  .rc-opt:hover { border-color: #2150C8; } .rc-opt:active { transform: scale(.985); }
  .rc-opt.on { border-color: #2150C8; background: #fff; box-shadow: 0 0 0 3px rgba(33,80,200,.14); }
  .rc-opt b { color: #1B43AA; font-size: 15px; white-space: nowrap; }
  .rc-reveal { animation: rc-up .3s cubic-bezier(.16,1,.3,1) both; }
  .rc-ph { display: flex; align-items: center; gap: 11px; margin-top: 8px; padding: 10px; border-radius: 14px; background: #fff; border: 1.5px solid #E1E8F8; text-decoration: none !important; color: #0F1B3D !important; transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease; animation: rc-up .4s cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--i, 0) * 70ms); }
  .rc-ph:first-of-type { margin-top: 0; }
  .rc-ph:hover { border-color: #2150C8; box-shadow: 0 8px 18px rgba(33,80,200,.14); transform: translateY(-1px); }
  .rc-ph .th { flex: 0 0 auto; width: 48px; height: 48px; border-radius: 12px; background: #EEF3FF; color: #2150C8; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .rc-ph .th img { width: 100%; height: 100%; object-fit: contain; }
  .rc-ph .nm { flex: 1; min-width: 0; font-weight: 700; font-size: 14px; line-height: 1.25; }
  .rc-ph .nm small { display: block; margin-top: 3px; font-weight: 500; font-size: 12px; color: #5B6472; }
  .rc-ph .pr { font-weight: 800; color: #1B43AA; font-size: 16px; }
  .rc-gr { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #E8EEFF; color: #1B43AA; font-size: 11px; font-weight: 700; margin-right: 6px; }
  .rc-tl { display: flex; align-items: flex-start; margin: 12px 0 4px; }
  .rc-tl .st { flex: 1; text-align: center; position: relative; font-size: 11.5px; line-height: 1.3; color: #6B7689; }
  .rc-tl .st i { display: block; margin: 0 auto 6px; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid #C9D5F2; position: relative; z-index: 1; transition: background-color .4s ease, border-color .4s ease; }
  .rc-tl .st::before { content: ""; position: absolute; top: 7px; left: -50%; width: 100%; height: 2px; background: #C9D5F2; }
  .rc-tl .st:first-child::before { display: none; }
  .rc-tl .st.done i { background: #2150C8; border-color: #2150C8; } .rc-tl .st.done::before { background: #2150C8; }
  .rc-tl .st.now { color: #0F1B3D; font-weight: 700; } .rc-tl .st.now i { box-shadow: 0 0 0 4px rgba(33,80,200,.2); }
  .rc-stat { font-size: 15px; font-weight: 800; color: #0F1B3D; }
  .rc-form { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .rc-form input, .rc-form textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1.5px solid #D5DEF5; font: 16px/1.3 inherit; background: #fff; color: #0F1B3D; outline: none; transition: border-color .15s ease; }
  .rc-form input:focus, .rc-form textarea:focus { border-color: #2150C8; }
  .rc-form textarea { resize: none; min-height: 70px; }
  .rc-err { color: #B3261E; font-size: 12.5px; }
  .rc-fb { display: flex; gap: 6px; margin-top: 8px; align-items: center; color: #6B7689; font-size: 12px; }
  .rc-fb button { width: 30px; height: 30px; border-radius: 9px; border: 1px solid #E1E8F8; background: #fff; color: #5B6472; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background-color .15s ease, color .15s ease, transform .15s ease; }
  .rc-fb button:hover { background: #EEF3FF; color: #2150C8; } .rc-fb button:active { transform: scale(.9); } .rc-fb button.on { background: #2150C8; color: #fff; border-color: #2150C8; }
  .rc-tick { width: 38px; height: 38px; }
  .rc-tick circle { fill: #2150C8; transform-origin: center; animation: rc-pop .4s cubic-bezier(.16,1,.3,1) both; }
  .rc-tick path { stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; fill: none; stroke-dasharray: 26; stroke-dashoffset: 26; animation: rc-draw .5s ease .25s forwards; }
  .rc-typing { display: inline-flex; gap: 4px; padding: 13px 14px; }
  .rc-typing i { width: 7px; height: 7px; border-radius: 50%; background: #9AA8C7; animation: rc-bounce 1.1s infinite; }
  .rc-typing i:nth-child(2) { animation-delay: .15s; } .rc-typing i:nth-child(3) { animation-delay: .3s; }
  .rc-foot { background: #fff; border-top: 1px solid #E2E6EC; padding: 10px 12px calc(8px + env(safe-area-inset-bottom, 0px)); }
  .rc-input { display: flex; align-items: flex-end; gap: 8px; }
  .rc-input textarea { flex: 1; resize: none; max-height: 96px; padding: 11px 14px; border-radius: 22px; border: 1.5px solid #D5DEF5; background: #F7F9FD; font: 16px/1.3 inherit; color: #0F1B3D; outline: none; transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease; }
  .rc-input textarea:focus { border-color: #2150C8; background: #fff; box-shadow: 0 0 0 4px rgba(33,80,200,.1); }
  .rc-send, .rc-mic { flex: 0 0 auto; width: 42px; height: 42px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform .15s ease, background-color .15s ease, opacity .15s ease; -webkit-tap-highlight-color: transparent; }
  .rc-send { background: #2150C8; color: #fff; } .rc-send:disabled { opacity: .35; cursor: default; } .rc-send:not(:disabled):active { transform: scale(.9); }
  .rc-mic { background: #EEF3FF; color: #2150C8; } .rc-mic.on { background: #E5484D; color: #fff; animation: rc-rec 1.2s infinite; }
  .rc-note { font-size: 11px; color: #6B7689; text-align: center; margin: 7px 0 0; line-height: 1.4; }
  @keyframes rc-open { from { opacity: 0; transform: translateY(18px) scale(.96); } to { opacity: 1; transform: none; } }
  @keyframes rc-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes rc-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-5px); opacity: 1; } }
  @keyframes rc-live { 0% { box-shadow: 0 0 0 0 rgba(61,220,132,.6); } 70% { box-shadow: 0 0 0 7px rgba(61,220,132,0); } 100% { box-shadow: 0 0 0 0 rgba(61,220,132,0); } }
  @keyframes rc-spin { to { transform: rotate(360deg); } }
  @keyframes rc-pop { from { transform: scale(0); } to { transform: scale(1); } }
  @keyframes rc-draw { to { stroke-dashoffset: 0; } }
  @keyframes rc-rec { 0%, 100% { box-shadow: 0 0 0 0 rgba(229,72,77,.5); } 50% { box-shadow: 0 0 0 9px rgba(229,72,77,0); } }
  @keyframes rc-slide { from { transform: translateY(100%); } to { transform: none; } }
  @keyframes rc-fade { from { opacity: 0; } to { opacity: 1; } }
  @media (max-width: 720px) {
    .rc-scrim { display: block; position: fixed; inset: 0; z-index: 999; background: rgba(15,27,61,.45); animation: rc-fade .25s ease both; }
    .rc-wrap { left: 0; right: 0; bottom: 0; width: auto; height: min(88dvh, 720px); border-radius: 24px 24px 0 0; transform-origin: bottom center; animation: rc-slide .38s cubic-bezier(.16,1,.3,1) both; }
  }
  @media (prefers-reduced-motion: reduce) { .rc-wrap, .rc-row, .rc-chips, .rc-scrim, .rc-tile, .rc-ph, .rc-reveal { animation: none !important; } .rc-typing i, .rc-live, .rc-av.busy::before, .rc-mic.on, .rc-tick circle, .rc-tick path { animation: none !important; } .rc-tick path { stroke-dashoffset: 0; } .rc-log { scroll-behavior: auto; } }
`;

// ---- tiny, safe text renderer: **bold**, [label](link), "- " bullets. Never injects HTML. ----
const TOKEN = /\[[^\]]{1,80}\]\([^)\s]{1,200}\)|\*\*[^*]+\*\*|\s+|\S+/g;
function inline(text, onLink, keyBase) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]{1,80})\]\(([^)\s]{1,200})\)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${keyBase}b${i++}`}>{m[1]}</strong>);
    else if (ALLOWED_LINK.test(m[3])) out.push(<a key={`${keyBase}l${i++}`} href={m[3]} onClick={(e) => onLink(e, m[3])} target={m[3].startsWith("http") ? "_blank" : undefined} rel={m[3].startsWith("http") ? "noopener noreferrer" : undefined}>{m[2]}</a>);
    else out.push(m[2]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function Rich({ text, onLink }) {
  const blocks = String(text || "").split(/\n{2,}/);
  return blocks.map((b, bi) => {
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-•]\s+/, ""), onLink, `${bi}-${li}`)}</li>)}</ul>;
    return <p key={bi}>{lines.map((l, li) => <React.Fragment key={li}>{li > 0 && <br />}{inline(l, onLink, `${bi}-${li}`)}</React.Fragment>)}</p>;
  });
}
// AI answers appear word by word (links and bold count as one word). Tap to show it all at once.
function Reveal({ text, onLink, onTick, onDone }) {
  const tokens = useRef((String(text || "").match(TOKEN) || [])).current;
  const [n, setN] = useState(reduced() ? tokens.length : 0);
  useEffect(() => {
    if (n >= tokens.length) { if (onDone) onDone(); return undefined; }
    const t = setTimeout(() => { setN((c) => Math.min(tokens.length, c + 3)); if (onTick) onTick(); }, 34);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  return <span onClick={() => setN(tokens.length)}><Rich text={tokens.slice(0, n).join("")} onLink={onLink} /></span>;
}

// ---- storage helpers (same pattern as the Help form) ----
const storageOk = () => typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
async function loadList(key) {
  if (!storageOk()) return [];
  try { const r = await window.storage.get(key, true); const v = r ? JSON.parse(r.value) : []; return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
async function saveSupportQuery({ name, contact, message }) {
  if (!storageOk()) throw new Error("offline");
  const email = isEmail(contact) ? contact.trim() : "";
  const entry = { id: "HLP-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), status: "open", name: name.trim(), email, phone: email ? "" : contact.trim(), category: "Chat", message: message.trim() };
  const list = await loadList("support_queries");
  await window.storage.set("support_queries", JSON.stringify([entry, ...list]), true);
  if (email) {
    try {
      const q = await loadList("notification_queue");
      q.unshift({ id: "NTF-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), status: "pending", type: "support_query", channel: "email", recipientEmail: entry.email, recipientName: entry.name,
        subject: `We've received your question — ${entry.id}`, message: "Thanks for reaching out. We've received your message and will get back to you shortly.", relatedId: entry.id });
      await window.storage.set("notification_queue", JSON.stringify(q), true);
    } catch (e) { /* the saved message is what matters */ }
  }
  return entry;
}

// ---- order tracking (reference numbers only; email lookups stay on the Track pages) ----
const PURCHASE = { steps: ["Order placed", "Paid", "Completed"], idx: { pending_payment: 0, pending_pickup: 0, paid: 1, completed: 2 }, label: { pending_payment: "Awaiting payment", pending_pickup: "Ready to be collected", paid: "Paid, getting it ready", completed: "Completed", cancelled: "Cancelled" } };
const TRACKERS = [
  { key: "orders", noun: "Trade-in", steps: ["Awaiting your device", "Inspecting", "Paid"], idx: { awaiting_shipment: 0, received_inspecting: 1, revised_pending_customer: 1, approved_paid: 2, returned: 2 },
    label: { awaiting_shipment: "Awaiting your device", received_inspecting: "Received, we're inspecting it", revised_pending_customer: "Revised offer, waiting for your response", approved_paid: "Approved, payment sent", returned: "Returned to you" },
    note: { revised_pending_customer: "We sent you a revised offer. Please accept or decline it on the Track page.", awaiting_shipment: "Bring it in, hand it over at collection or post it, then we'll inspect it." }, page: "/quote" },
  { key: "repair_requests", noun: "Repair request", steps: ["Received", "We've been in touch"], idx: { new: 0, contacted: 1 }, label: { new: "Received, we'll be in touch shortly", contacted: "We've reached out to you" }, page: "/repairs" },
  { key: "purchase_orders", noun: "Purchase", ...PURCHASE, page: "/shop" },
  { key: "accessory_orders", noun: "Accessories order", ...PURCHASE, page: "/accessories?dept=accessories" },
  { key: "price_match_requests", noun: "Price match request", steps: ["Under review", "Decision"], idx: { pending: 0, approved: 1, denied: 1 }, label: { pending: "Under review, we respond within 1 business day", approved: "Approved, we'll match this price", denied: "Not matched" }, page: "/quote" },
];
async function findByReference(ref) {
  const prefix = ref.slice(0, 3).toUpperCase();
  const order = [...TRACKERS].sort((a, b) => (prefix === "ORD" && a.key === "orders" ? -1 : prefix === "ORD" && b.key === "orders" ? 1 : prefix === "REP" && a.key === "repair_requests" ? -1 : prefix === "REP" && b.key === "repair_requests" ? 1 : 0));
  for (const t of order) {
    try {
      const r = await fetch(`${window.SHOP_API_BASE_URL}/public/find/${t.key}?field=id&value=${encodeURIComponent(ref)}`);
      if (r.status === 429) return { limited: true };
      if (r.ok) { const j = await r.json(); if (j && j.record) return { tracker: t, record: j.record }; }
    } catch (e) { return { error: true }; }
  }
  return null;
}

function menuFor(path) {
  const T = (label, icon, k, v) => ({ label, icon, k, v });
  const talk = T("Talk to a person", "chat", "flow", "person");
  const faq = (id, label, icon) => T(label || FAQ.find((f) => f.id === id).label, icon, "faq", id);
  const chip = (label, k, v) => ({ label, k, v });
  const fchip = (id, label) => chip(label || FAQ.find((f) => f.id === id).label, "faq", id);
  if (path.startsWith("/repairs")) return { tiles: [T("Repair price", "wrench", "flow", "repair"), faq("repair-time", "How long it takes", "zap"), faq("price-match", "Price match", "tag"), faq("mail-in", "Mail-in repairs", "box")], chips: [fchip("genuine"), fchip("warranty"), chip("Track my request", "flow", "track"), chip("Talk to a person", "flow", "person")] };
  if (path.startsWith("/shop")) return { tiles: [T("Find me a phone", "phone", "flow", "find"), faq("grades", "What conditions mean", "shield"), faq("warranty", "Warranty", "shield"), faq("shipping", "Shipping", "box")], chips: [fchip("returns"), fchip("battery"), chip("Track my order", "flow", "track"), chip("Talk to a person", "flow", "person")] };
  if (path.startsWith("/quote") || path.startsWith("/sell")) return { tiles: [faq("sell-how", "How selling works", "tag"), faq("sell-pay", "How I get paid", "zap"), faq("sell-id", "Do I need ID?", "shield"), faq("sell-locked", "Cracked or locked?", "phone")], chips: [fchip("collection"), chip("Track my trade-in", "flow", "track"), chip("Talk to a person", "flow", "person")] };
  if (path.startsWith("/parts") || path.startsWith("/accessories")) return { tiles: [faq("parts", "Parts and DIY kits", "chip"), T("Repair price", "wrench", "flow", "repair"), faq("warranty", "Warranty", "shield"), faq("shipping", "Shipping", "box")], chips: [chip("Track my order", "flow", "track"), chip("Talk to a person", "flow", "person")] };
  return { tiles: [T("Repair price", "wrench", "flow", "repair"), T("Sell my phone", "tag", "flow", "sell"), T("Find me a phone", "phone", "flow", "find"), T("Track my order", "search", "flow", "track"), faq("warranty", "Warranty & returns", "shield"), talk], chips: [fchip("shipping"), fchip("sell-id", "Do I need ID to sell?"), chip("All FAQs", "go", "/faq")] };
}

function HandoffForm({ initialMessage, onSend, onCancel }) {
  const [name, setName] = useState(""); const [contact, setContact] = useState(""); const [message, setMessage] = useState(initialMessage || ""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Please add your name.");
    if (!isEmail(contact) && !phoneOk(contact)) return setErr("Add an email or a mobile number so we can reply.");
    if (message.trim().length < 3) return setErr("What would you like to ask?");
    setErr(""); setBusy(true);
    try { await onSend({ name, contact, message }); } catch (x) { setErr("Couldn't send just now. Please try WhatsApp or call us."); setBusy(false); }
  }
  return (
    <form className="rc-form" onSubmit={submit} noValidate>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" aria-label="Your name" />
      <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email or mobile number" autoComplete="email" aria-label="Email or mobile number" />
      <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 600))} placeholder="Your question" aria-label="Your question" />
      {err && <div className="rc-err" role="alert">{err}</div>}
      <div className="rc-links" style={{ marginTop: 0 }}>
        <button type="submit" className="rc-pill solid" disabled={busy}>{busy ? "Sending…" : "Send to the team"}</button>
        <button type="button" className="rc-pill" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// Tap a repair to see its price; the exact quote is always confirmed first.
function RepairPicker({ device, go }) {
  const list = REPAIRS_BY_DEVICE[device] || [];
  const [sel, setSel] = useState(-1);
  const cur = list[sel];
  return (
    <div className="rc-card">
      {list.map((r, i) => (
        <button key={r.name} className={`rc-opt${sel === i ? " on" : ""}`} onClick={() => setSel(i)} aria-pressed={sel === i}><span>{r.name}</span><b>from ${r.from}</b></button>
      ))}
      {cur ? (
        <div className="rc-reveal" key={sel}>
          <div className="sm"><strong>{device} {cur.name.toLowerCase()}</strong> starts from <strong>${cur.from}</strong>. The exact price depends on your model and what's actually wrong. We diagnose first and confirm your quote before any work starts. Found it cheaper? We'll price match.</div>
          <div className="rc-links"><a className="rc-pill solid" href="/repairs" onClick={(e) => go(e, "/repairs")}>Book this repair</a></div>
        </div>
      ) : <div className="sm">Tap a repair to see more.</div>}
    </div>
  );
}

function PhoneCards({ items, more, go }) {
  return (
    <div>
      {items.map((it, i) => (
        <a key={it.id} className="rc-ph" style={{ "--i": i }} href={`/shop?item=${encodeURIComponent(it.id)}`} onClick={(e) => go(e, `/shop?item=${encodeURIComponent(it.id)}`)}>
          <span className="th">{it.photoUrl ? <img src={it.photoUrl} alt="" loading="lazy" /> : <Icon name="phone" size={24} />}</span>
          <span className="nm">{it.brand} {it.model}<small><span className="rc-gr">{GRADES[it.gradeId] || "Graded"}</span>{it.storage || ""}</small></span>
          <span className="pr">{money(it.listedPrice)}</span>
        </a>
      ))}
      <div className="rc-links"><a className="rc-pill" href={more} onClick={(e) => go(e, more)}>See all in the shop</a></div>
    </div>
  );
}

function TrackCard({ tracker, record, go }) {
  const i = tracker.idx[record.status];
  const known = i !== undefined;
  const dev = record.device ? `${record.device.brand || ""} ${record.device.model || ""}`.trim() : [record.brand, record.model].filter(Boolean).join(" ");
  const when = record.createdAt ? new Date(record.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
  return (
    <div className="rc-card">
      <div className="sm" style={{ marginTop: 0 }}>{tracker.noun} <strong>{record.id}</strong>{when ? ` · ${when}` : ""}{dev ? ` · ${dev}` : ""}</div>
      <div className="rc-stat" style={{ marginTop: 6 }}>{tracker.label[record.status] || (record.status ? String(record.status).replace(/_/g, " ") : "In progress")}</div>
      {known && <div className="rc-tl" aria-hidden="true">{tracker.steps.map((s, k) => <div key={s} className={`st${k <= i ? " done" : ""}${k === i ? " now" : ""}`}><i />{s}</div>)}</div>}
      {tracker.note && tracker.note[record.status] && <div className="sm">{tracker.note[record.status]}</div>}
      <div className="rc-links"><a className="rc-pill" href={tracker.page} onClick={(e) => go(e, tracker.page)}>Open the Track page</a></div>
    </div>
  );
}

export default function ChatPanel({ path, onClose }) {
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState(() => { try { const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null"); return Array.isArray(s) ? s : []; } catch (e) { return []; } });
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [aiOn, setAiOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [biz, setBiz] = useState(withBusinessDefaults(null));
  const logRef = useRef(null), inputRef = useRef(null), msgsRef = useRef(msgs), modeRef = useRef(""), finderRef = useRef({}), recRef = useRef(null);
  msgsRef.current = msgs;
  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  useEffect(() => { (async () => { try { if (!storageOk()) return; const r = await window.storage.get("pricing-config", true); if (r) setBiz(withBusinessDefaults(JSON.parse(r.value).businessSettings)); } catch (e) { /* defaults */ } })(); }, []);
  useEffect(() => { try { sessionStorage.setItem(SAVE_KEY, JSON.stringify(msgs.slice(-40).map(({ fresh, ...m }) => m))); } catch (e) { /* private mode */ } }, [msgs]);
  const toBottom = () => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; };
  useEffect(toBottom, [msgs, typing]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    if (isSmall()) document.body.style.overflow = "hidden"; else if (inputRef.current) inputRef.current.focus();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; if (recRef.current) try { recRef.current.abort(); } catch (e) { /* ignore */ } };
  }, [onClose]);

  const add = (m) => setMsgs((cur) => [...cur, { id: uid(), ...m }]);
  async function botSay(m, delay = 550) { setTyping(true); await sleep(delay); setTyping(false); add({ role: "bot", ...m }); }
  const menu = () => menuFor(path);
  const wa = (text) => waLink(biz.whatsapp, text || "Hi Mobile Recellr, I have a question.");

  useEffect(() => { // first open: greet
    if (msgsRef.current.length === 0) botSay({ text: "Hi! I'm the Mobile Recellr assistant (an AI). I can price a repair, help you pick a phone, track an order, or answer questions about selling, warranty and shipping. What do you need?", ...menu() }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(e, href) { if (href.startsWith("/")) { e.preventDefault(); goTo(href); } }
  function goTo(href) { navigate(href); if (isSmall()) onClose(); }
  const lastUserText = () => { const u = [...msgsRef.current].reverse().find((m) => m.role === "user"); return u ? u.text : ""; };

  async function showFaq(f) { await botSay({ text: f.a, links: f.links, chips: [{ label: "Ask something else", k: "flow", v: "menu" }, { label: "Talk to a person", k: "flow", v: "person" }] }); }
  async function runFlow(v) {
    modeRef.current = "";
    if (v === "menu") return botSay({ text: "Sure. What else can I help with?", ...menu() }, 350);
    if (v === "repair") return botSay({ text: "Happy to help with a repair price. What kind of device is it?", tiles: Object.keys(REPAIRS_BY_DEVICE).map((d) => ({ label: d, icon: d.toLowerCase(), k: "rdev", v: d })) });
    if (v === "sell") return botSay({ text: "Selling is quick: get an **instant quote online** (under a minute, no sign-up, any condition), and your price is held for 14 days. Which phone do you have?",
      tiles: [{ label: "iPhone", icon: "phone", k: "go", v: "/sell/apple" }, { label: "Samsung", icon: "phone", k: "go", v: "/sell/samsung" }, { label: "Google Pixel", icon: "phone", k: "go", v: "/sell/google" }, { label: "Something else", icon: "tag", k: "go", v: "/quote" }],
      chips: [{ label: "How do I get paid?", k: "faq", v: "sell-pay" }, { label: "Do I need ID?", k: "faq", v: "sell-id" }, { label: "Cracked or locked phone?", k: "faq", v: "sell-locked" }] });
    if (v === "find") return botSay({ text: "Let's find you a phone. Our refurbished phones are graded, 49-point checked and come with a **1-year warranty**. Which brand?",
      tiles: [{ label: "iPhone", icon: "phone", k: "fbrand", v: "Apple" }, { label: "Samsung", icon: "phone", k: "fbrand", v: "Samsung" }, { label: "Google Pixel", icon: "phone", k: "fbrand", v: "Google" }, { label: "Any brand", icon: "search", k: "fbrand", v: "Any" }],
      chips: [{ label: "What do conditions mean?", k: "faq", v: "grades" }, { label: "Shipping", k: "faq", v: "shipping" }] });
    if (v === "track") { modeRef.current = "track"; return botSay({ text: "I can check it for you. Type your **reference number** (like ORD-123456). You'll find it in your confirmation email or on the thank-you screen.", chips: [{ label: "I can't find it", k: "faq", v: "track-help" }, { label: "Use the Track page", k: "go", v: "/quote" }] }); }
    if (v === "person") return botSay({ text: "Of course. The fastest way is WhatsApp. You can also call, email, or leave a message here and the team will reply.", card: { type: "contact", q: lastUserText().length > 12 ? lastUserText() : "" }, chips: [{ label: "Leave a message here", k: "flow", v: "form" }] });
    if (v === "form") return botSay({ text: "Leave your details and question and the team will get back to you.", card: { type: "form", message: lastUserText().length > 12 ? lastUserText() : "" } });
  }
  async function findPhones(brand, budget) {
    const inv = (await loadList("inventory")).filter((i) => i && i.status === "listed" && Number(i.listedPrice) > 0);
    const [lo, hi] = budget === "lt300" ? [0, 300] : budget === "mid" ? [300, 600] : budget === "gt600" ? [600, 1e9] : [0, 1e9];
    const hits = inv.filter((i) => (brand === "Any" || i.brand === brand) && Number(i.listedPrice) >= lo && Number(i.listedPrice) < hi).sort((a, b) => a.listedPrice - b.listedPrice);
    const more = `/shop${brand === "Any" ? "" : `?brand=${brand}`}`;
    if (!hits.length) return botSay({ text: "Nothing matching that is in stock right now, but stock changes often. Try a wider budget or another brand, or ask us to keep an eye out.", chips: [{ label: "Any budget", k: "fbudget", v: "any" }, { label: "Other brands", k: "flow", v: "find" }, { label: "Talk to a person", k: "flow", v: "person" }] });
    return botSay({ text: `Here ${hits.length === 1 ? "is the best match" : `are the best matches (${Math.min(4, hits.length)} of ${hits.length})`} in stock right now. Tap one to see photos and details.`, card: { type: "phones", items: hits.slice(0, 4).map(({ id, brand: b, model, storage, gradeId, listedPrice, photoUrl }) => ({ id, brand: b, model, storage, gradeId, listedPrice, photoUrl })), more },
      chips: [{ label: "Change budget", k: "fbrand", v: brand }, { label: "Other brands", k: "flow", v: "find" }, { label: "Warranty", k: "faq", v: "warranty" }, { label: "Ask something else", k: "flow", v: "menu" }] }, 700);
  }
  async function trackRef(text) {
    const m = text.match(/[A-Za-z]{2,5}-\d{4,8}/);
    if (!m) {
      if (text.includes("@")) return botSay({ text: "For privacy I only look up by reference number in this chat. If you only have your email, the Track page can find it.", chips: [{ label: "Open the Track page", k: "go", v: "/quote" }, { label: "Talk to a person", k: "flow", v: "person" }, { label: "Ask something else", k: "flow", v: "menu" }] });
      return botSay({ text: "That doesn't look like a reference number. They look like **ORD-123456** or **REP-123456**. Try again?", chips: [{ label: "I can't find it", k: "faq", v: "track-help" }, { label: "Talk to a person", k: "flow", v: "person" }, { label: "Ask something else", k: "flow", v: "menu" }] });
    }
    setTyping(true);
    const r = await findByReference(m[0].toUpperCase());
    setTyping(false);
    modeRef.current = "";
    if (r && r.limited) return botSay({ text: "Too many lookups in a short time. Please try again in a few minutes.", chips: [{ label: "Talk to a person", k: "flow", v: "person" }] }, 150);
    if (!r || r.error) return botSay({ text: `I couldn't find **${m[0].toUpperCase()}**. Please check it, or I can pass it to the team.`, chips: [{ label: "Try another number", k: "flow", v: "track" }, { label: "Talk to a person", k: "flow", v: "person" }, { label: "Ask something else", k: "flow", v: "menu" }] }, 300);
    return botSay({ text: "Found it.", card: { type: "track", key: r.tracker.key, record: r.record }, chips: [{ label: "Track another", k: "flow", v: "track" }, { label: "Ask something else", k: "flow", v: "menu" }] }, 350);
  }
  async function onChoice(c) {
    // "Talk to a person" goes straight to WhatsApp (opened right in the tap, so phones don't block it).
    if (c.k === "flow" && c.v === "person") {
      const q = lastUserText();
      const question = q.length > 12 ? q : "";
      window.open(wa(question ? "Hi Mobile Recellr, " + question : "Hi Mobile Recellr, I'd like to talk to someone."), "_blank", "noopener");
      add({ role: "user", text: c.label });
      return botSay({ text: "Opening WhatsApp for you. If it didn't open, tap the green button below. You can also call, email, or leave a message here.", card: { type: "contact", q: question }, chips: [{ label: "Leave a message here", k: "flow", v: "form" }, { label: "Ask something else", k: "flow", v: "menu" }] }, 300);
    }
    if (c.k === "ext") { add({ role: "user", text: c.label }); window.open(c.v, "_blank", "noopener"); return botSay({ text: "Opened WhatsApp in a new tab. I'm still here if you need anything else.", ...menu() }, 250); }
    add({ role: "user", text: c.label });
    if (c.k === "go") { await botSay({ text: "Opening that for you…", ...menu() }, 250); return goTo(c.v); }
    if (c.k === "faq") return c.v === "track-help" ? botSay({ text: "Your reference number is in the confirmation email we sent (subject like \"Order ORD-123456 received\"), and on the thank-you screen after you submitted. Still stuck? Tell the team and they'll find it for you.", chips: [{ label: "Talk to a person", k: "flow", v: "person" }, { label: "Try another number", k: "flow", v: "track" }] }) : showFaq(FAQ.find((f) => f.id === c.v));
    if (c.k === "flow") return runFlow(c.v);
    if (c.k === "rdev") return botSay({ text: `${c.v} repairs. Tap one to see the price.`, card: { type: "repairs", device: c.v }, chips: [{ label: "Another device", k: "flow", v: "repair" }, { label: "Price match?", k: "faq", v: "price-match" }, { label: "Talk to a person", k: "flow", v: "person" }] }, 400);
    if (c.k === "fbrand") { finderRef.current = { brand: c.v }; return botSay({ text: "And what's your budget?", chips: [{ label: "Under $300", k: "fbudget", v: "lt300" }, { label: "$300 to $600", k: "fbudget", v: "mid" }, { label: "Over $600", k: "fbudget", v: "gt600" }, { label: "Any budget", k: "fbudget", v: "any" }] }, 350); }
    if (c.k === "fbudget") return findPhones(finderRef.current.brand || "Any", c.v);
  }

  async function sendText(raw) {
    const text = (raw || "").trim().slice(0, 500);
    if (!text || typing) return;
    setInput(""); const ta = inputRef.current; if (ta) ta.style.height = "auto";
    add({ role: "user", text });
    if (modeRef.current === "track") return trackRef(text);
    if (aiOn && window.SHOP_API_BASE_URL) {
      setTyping(true);
      try {
        const history = [...msgsRef.current, { role: "user", text }].filter((m) => m.text).slice(-10).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
        const res = await fetch(`${window.SHOP_API_BASE_URL}/public/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history, page: path }) });
        if (res.status === 429) { setTyping(false); return botSay({ text: "You've sent a lot of messages in a short time. Please try again in a few minutes, or message us on WhatsApp.", card: { type: "contact" }, chips: [{ label: "Leave a message here", k: "flow", v: "form" }, { label: "Browse topics", k: "flow", v: "menu" }] }, 200); }
        const j = await res.json().catch(() => ({}));
        if (j.mode === "ai" && j.reply) {
          setTyping(false);
          const links = [...j.reply.matchAll(/\[([^\]]{1,80})\]\(([^)\s]{1,200})\)/g)].filter((l) => ALLOWED_LINK.test(l[2]) && l[2].startsWith("/")).slice(0, 2).map((l) => [l[1], l[2]]);
          return add({ role: "bot", text: j.reply, ai: true, fresh: true, links: links.length ? links : undefined, card: j.handoff ? { type: "contact", q: text } : undefined,
            chips: j.handoff ? [{ label: "Leave a message here", k: "flow", v: "form" }] : [{ label: "Ask something else", k: "flow", v: "menu" }, { label: "Talk to a person", k: "flow", v: "person" }] });
        }
        setAiOn(false); // AI is off or unavailable: use the built-in answers from now on
      } catch (e) { setAiOn(false); }
      setTyping(false);
    }
    const f = matchFaq(text);
    if (f) return showFaq(f);
    return botSay({ text: "I'm not sure about that one, and I don't want to guess. I can pass it to the team, or you can pick a topic below.", chips: [{ label: "Leave a message here", k: "flow", v: "form" }, { label: "WhatsApp us", k: "ext", v: wa("Hi Mobile Recellr, " + text) }, { label: "Browse topics", k: "flow", v: "menu" }] }, 450);
  }

  async function submitForm(data) {
    const entry = await saveSupportQuery(data);
    setMsgs((cur) => cur.map((m) => (m.card && m.card.type === "form" ? { ...m, card: { type: "sent", ref: entry.id } } : m)));
    await botSay({ text: `Thanks ${data.name.trim().split(/\s+/)[0]}, your message is with the team (ref **${entry.id}**). ${isEmail(data.contact) ? "We've also emailed you a confirmation. " : ""}For something urgent, WhatsApp is fastest.`, ...menu() }, 400);
  }
  async function rate(id, rating) {
    setMsgs((cur) => cur.map((m) => (m.id === id ? { ...m, fb: rating } : m)));
    try { if (window.SHOP_API_BASE_URL) fetch(`${window.SHOP_API_BASE_URL}/public/chat/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating }) }).catch(() => {}); } catch (e) { /* ignore */ }
    if (rating === "down") await botSay({ text: "Sorry about that. Want a person to take a look?", chips: [{ label: "Talk to a person", k: "flow", v: "person" }, { label: "Leave a message here", k: "flow", v: "form" }] }, 300);
  }
  function toggleMic() {
    if (!SR) return;
    if (listening && recRef.current) { try { recRef.current.stop(); } catch (e) { /* ignore */ } return; }
    try {
      const rec = new SR(); recRef.current = rec; rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-AU"; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (e) => { const t = e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript; if (t) setInput((cur) => (cur ? cur + " " : "") + t.slice(0, 300)); };
      rec.onend = () => setListening(false); rec.onerror = () => setListening(false);
      setListening(true); rec.start();
    } catch (e) { setListening(false); }
  }
  const reset = () => { modeRef.current = ""; setMsgs([]); setAiOn(true); setTimeout(() => botSay({ text: "Fresh start! What can I help with?", ...menu() }, 250), 50); };

  const lastBotIdx = (() => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "bot") return i; return -1; })();
  const phoneHref = `tel:${String(biz.phone).replace(/\s+/g, "")}`;
  const act = (c) => onChoice(c);
  return (
    <>
      <style>{CSS}</style>
      <div className="rc-scrim" onClick={onClose} aria-hidden="true" />
      <section className="rc-wrap" role="dialog" aria-label="Chat with Mobile Recellr">
        <header className="rc-head">
          <span className={`rc-av${typing ? " busy" : ""}`}><img src="/logo-icon.svg" alt="" /></span>
          <div style={{ position: "relative", zIndex: 1 }}><b>Mobile Recellr</b><small><span className="rc-live" />AI assistant · replies instantly</small></div>
          <span className="sp" />
          <a className="rc-ib" href={wa()} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" title="WhatsApp" style={{ background: "#25D366" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-1.3-.6-2.2-1.2-3-2.7-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.5l-.8-1.8c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.8.8-1 1.7-.7 2.8.4 1.6 1.4 2.9 2.7 4 1.7 1.4 3.2 2 4.9 1.9.9-.1 1.7-.7 2-1.5.1-.3.1-.6 0-.7l-.8-.4z" /></svg></a>
          <button className="rc-ib" onClick={reset} aria-label="Start a new chat" title="New chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg></button>
          <button className="rc-ib" onClick={onClose} aria-label="Close chat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </header>
        <div className="rc-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
          {msgs.map((m, i) => (
            <React.Fragment key={m.id}>
              <div className={`rc-row ${m.role}`}>
                {m.role === "bot" && <span className="rc-mini"><img src="/logo-icon.svg" alt="" /></span>}
                <div className="rc-bub">
                  {m.role === "user" ? m.text : (m.fresh ? <Reveal text={m.text} onLink={go} onTick={toBottom} /> : <Rich text={m.text} onLink={go} />)}
                  {m.card && m.card.type === "repairs" && <RepairPicker device={m.card.device} go={go} />}
                  {m.card && m.card.type === "phones" && <div style={{ marginTop: 10 }}><PhoneCards items={m.card.items} more={m.card.more} go={go} /></div>}
                  {m.card && m.card.type === "track" && <TrackCard tracker={TRACKERS.find((t) => t.key === m.card.key)} record={m.card.record} go={go} />}
                  {m.card && m.card.type === "contact" && (
                    <div className="rc-links">
                      <a className="rc-pill solid" href={wa(m.card.q ? "Hi Mobile Recellr, " + m.card.q : undefined)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                      <a className="rc-pill" href={phoneHref}>Call {biz.phone}</a>
                      <a className="rc-pill" href={mailLink(biz.email, "Question from the website", m.card.q || undefined)}>Email</a>
                    </div>
                  )}
                  {m.card && m.card.type === "form" && <HandoffForm initialMessage={m.card.message} onSend={submitForm} onCancel={() => setMsgs((cur) => cur.filter((x) => x.id !== m.id))} />}
                  {m.card && m.card.type === "sent" && <div className="rc-card" style={{ display: "flex", alignItems: "center", gap: 12 }}><svg className="rc-tick" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="19" /><path d="M11 19.5l5.5 5.5L27 14" /></svg><div className="sm" style={{ marginTop: 0 }}>Message sent. Reference <strong>{m.card.ref}</strong>.</div></div>}
                  {m.links && m.links.length > 0 && <div className="rc-links">{m.links.map(([label, href], li) => <a key={li} className={`rc-pill${li === 0 ? " solid" : ""}`} href={href} onClick={(e) => go(e, href)}>{label}</a>)}</div>}
                  {m.ai && (
                    <div className="rc-fb" aria-label="Was this helpful?">
                      <button className={m.fb === "up" ? "on" : ""} onClick={() => !m.fb && rate(m.id, "up")} aria-label="Helpful" aria-pressed={m.fb === "up"}><Icon name="up" size={15} /></button>
                      <button className={m.fb === "down" ? "on" : ""} onClick={() => !m.fb && rate(m.id, "down")} aria-label="Not helpful" aria-pressed={m.fb === "down"}><Icon name="down" size={15} /></button>
                      {m.fb === "up" && <span>Thanks!</span>}
                    </div>
                  )}
                </div>
              </div>
              {m.role === "bot" && i === lastBotIdx && !typing && m.tiles && m.tiles.length > 0 && (
                <div className="rc-tiles">{m.tiles.map((t, ti) => <button key={t.label} className="rc-tile" style={{ "--i": ti }} onClick={() => act(t)}><span className="ic"><Icon name={t.icon || "chat"} size={18} /></span><span>{t.label}</span></button>)}</div>
              )}
              {m.role === "bot" && i === lastBotIdx && !typing && m.chips && m.chips.length > 0 && (
                <div className="rc-chips">{m.chips.map((c) => <button key={c.label} className="rc-chip" onClick={() => act(c)}>{c.label}</button>)}</div>
              )}
            </React.Fragment>
          ))}
          {typing && <div className="rc-row bot"><span className="rc-mini"><img src="/logo-icon.svg" alt="" /></span><div className="rc-bub rc-typing" aria-label="Assistant is typing"><i /><i /><i /></div></div>}
        </div>
        <footer className="rc-foot">
          <form className="rc-input" onSubmit={(e) => { e.preventDefault(); sendText(input); }}>
            <textarea ref={inputRef} rows={1} value={input} maxLength={500} aria-label="Type your question" placeholder={modeRef.current === "track" ? "Reference number, e.g. ORD-123456" : "Ask about repairs, selling, warranty…"}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) { e.preventDefault(); sendText(input); } }} />
            {SR && <button type="button" className={`rc-mic${listening ? " on" : ""}`} onClick={toggleMic} aria-label={listening ? "Stop listening" : "Speak your question"} aria-pressed={listening}><Icon name="mic" size={19} /></button>}
            <button className="rc-send" type="submit" disabled={!input.trim() || typing} aria-label="Send"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
          </form>
          <p className="rc-note">AI assistant. It answers from our website info and can make mistakes; we always confirm prices and bookings with you. Please don't share card, bank or ID numbers here.</p>
        </footer>
      </section>
    </>
  );
}
