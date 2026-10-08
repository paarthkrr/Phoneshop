import React, { useEffect, useRef, useState } from "react";

/* Opening animation: the logo builds itself, then flies into the header.
   - Once per browser session, public pages only (never the staff portal).
   - Skipped for "reduce motion", search engines and speed-test bots.
   - Tap anywhere to skip. The page loads underneath the whole time.
   - Preview any style on the live site with ?intro=1 to 5 (?intro=0 = off). */

export const INTRO_VARIANT = 8; // 8 Shop photo, dark (default) · 6 Phone exchange, dark · 7 Phone zoom, blue · 5 Dark swap · 1 Swap slide · 2 Exchange cross · 3 Blue wipe · 4 Ring

const SCALE = 1.8; // splash logo = header logo × this, so it lands exactly on it
const TIMING = { 1: 1250, 2: 1350, 3: 1200, 4: 1300, 5: 1300, 6: 1650, 7: 1400, 8: 1650 }; // ms before the exit starts

const CSS = `
.mr-splash{position:fixed;inset:0;z-index:2000;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mr-lock{display:flex;align-items:center;gap:${7 * SCALE}px;transform-origin:0 0;will-change:transform}
.mr-mark{display:block;overflow:visible}
.mr-mark *{transform-box:fill-box;transform-origin:center}
.mr-word{font-family:'Outfit','Archivo',system-ui,sans-serif;font-size:${24 * SCALE}px;letter-spacing:-0.015em;line-height:1;color:#0F1B3D;white-space:nowrap;overflow:hidden;display:inline-block;max-width:0;opacity:0}
.mr-w1{font-weight:400}.mr-w2{font-weight:800;color:#2150C8}
@keyframes mrGrow{to{max-width:${260 * SCALE}px;opacity:1}}
@keyframes mrInR{from{transform:translateX(26px);opacity:0}to{transform:none;opacity:1}}
@keyframes mrInL{from{transform:translateX(-26px);opacity:0}to{transform:none;opacity:1}}
@keyframes mrDraw{to{stroke-dashoffset:0}}
@keyframes mrPop{0%{transform:scale(0)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes mrBounce{0%{transform:scale(.55);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes mrCrossF{from{transform:translate(12px,-10px) scale(.9);opacity:.3}to{transform:none;opacity:1}}
@keyframes mrCrossB{from{transform:translate(-12px,10px) scale(1.06);opacity:.3}to{transform:none;opacity:1}}
@keyframes mrRing{to{stroke-dashoffset:0}}
@keyframes mrTilt{from{transform:rotate(-12deg) scale(.85);opacity:0}to{transform:none;opacity:1}}
@keyframes mrUp{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}
.mr-arrow{stroke-dasharray:32;stroke-dashoffset:32}
/* 5 · Dark swap: on the site's navy, the phones slide in and the name opens out, then the
   navy fades away and the logo glides into the header, changing to the header's colours on the way. */
.dk.mr-splash{background:radial-gradient(120% 80% at 50% 45%,#1A2D63 0%,#0F1B3D 55%,#0A1330 100%)}
.dk .mr-back{fill:#5677D6;transition:fill .5s ease}.dk .mr-front{fill:#FFFFFF;transition:fill .5s ease}.dk .mr-arrow{stroke:#2150C8;transition:stroke .5s ease}
.dk .mr-w1{color:#FFFFFF;transition:color .5s ease}.dk .mr-w2{color:#8FB0FF;transition:color .5s ease}
.dk.leaving .mr-back{fill:#A9BDF5}.dk.leaving .mr-front{fill:#2150C8}.dk.leaving .mr-arrow{stroke:#FFFFFF}
.dk.leaving .mr-w1{color:#0F1B3D}.dk.leaving .mr-w2{color:#2150C8}
.v5 .mr-back{animation:mrInR .5s cubic-bezier(.16,1,.3,1) .1s both}
.v5 .mr-front{animation:mrInL .5s cubic-bezier(.16,1,.3,1) .2s both}
.v5 .mr-arrow{animation:mrDraw .3s ease-out .6s forwards}
.v5 .mr-word{animation:mrGrow .6s cubic-bezier(.16,1,.3,1) .7s forwards}
/* Real-looking phones (6 and 7) */
.mr-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;perspective:1000px;pointer-events:none}
.mr-ph{position:absolute;width:132px;height:270px;filter:drop-shadow(0 30px 38px rgba(0,0,0,.5));will-change:transform,opacity}
.mr-ph .on{opacity:0}
@keyframes mrFadeIn{to{opacity:1}}
/* 6 · Phone exchange (dark): an old cracked phone and a new one glide in from both sides,
   swap places in 3D, the new phone lights up with our logo, then shrinks into the logo and flies to the header. */
.v6 .ph-old{animation:mrOld 1.2s cubic-bezier(.45,0,.2,1) .05s both}
@keyframes mrOld{0%{transform:translateX(-190px) rotateY(42deg) scale(.88);opacity:0}32%{transform:translateX(-56px) rotateY(20deg) scale(.95);opacity:1}68%{transform:translateX(34px) rotateY(-12deg) scale(.8);opacity:.5}100%{transform:translateX(70px) rotateY(-24deg) scale(.66);opacity:0}}
.v6 .ph-new{z-index:2;animation:mrNew 1.45s cubic-bezier(.45,0,.2,1) .05s both}
@keyframes mrNew{0%{transform:translateX(190px) rotateY(-42deg) scale(.88);opacity:0}30%{transform:translateX(56px) rotateY(-20deg) scale(.95);opacity:1}60%{transform:translateX(0) rotateY(0) scale(1.05);opacity:1}80%{transform:translateX(0) rotateY(0) scale(1);opacity:1}100%{transform:scale(.3);opacity:0}}
.v6 .ph-new .on{animation:mrFadeIn .35s ease-out .8s forwards}
.v6 .mr-lock{opacity:0;animation:mrLockIn .45s cubic-bezier(.16,1,.3,1) 1.18s forwards}
@keyframes mrLockIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}
.v6 .mr-arrow{stroke-dashoffset:0}
.v6 .mr-word{animation:mrGrow .5s cubic-bezier(.16,1,.3,1) 1.25s forwards}
/* 7 · Phone zoom (blue): a phone rises, its screen lights up with the logo, then we zoom
   straight through the screen into the website. */
.v7.mr-splash{background:radial-gradient(110% 80% at 50% 40%,#3A66DA 0%,#2150C8 50%,#1A3FA3 100%)}
.v7 .mr-lock{display:none}
.v7 .ph-hero{animation:mrRise .7s cubic-bezier(.16,1,.3,1) .05s both}
@keyframes mrRise{from{transform:translateY(65vh) rotateX(32deg) scale(.9);opacity:0}to{transform:none;opacity:1}}
.v7 .ph-hero .on{animation:mrFadeIn .35s ease-out .55s forwards}
.v7 .ph-hero .word{opacity:0;animation:mrFadeIn .35s ease-out .85s forwards}
/* 8 · Shop photo (dark): our own stock photo slowly settles behind a navy shade, the logo builds
   on top, then the photo fades and the logo glides into the header. */
.v8 .mr-photo{position:absolute;inset:0;background:#0A1330 url(/intro-photo.webp) center/cover no-repeat;opacity:0;animation:mrKen 2.4s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes mrKen{0%{opacity:0;transform:scale(1.16)}22%{opacity:1}100%{opacity:1;transform:scale(1.02)}}
.v8 .mr-shade{position:absolute;inset:0;background:radial-gradient(90% 60% at 50% 50%,rgba(15,27,61,.55) 0%,rgba(10,19,48,.86) 70%,rgba(10,19,48,.94) 100%)}
.v8 .mr-lock{position:relative}
.v8 .mr-back{animation:mrInR .5s cubic-bezier(.16,1,.3,1) .3s both}
.v8 .mr-front{animation:mrInL .5s cubic-bezier(.16,1,.3,1) .4s both}
.v8 .mr-arrow{animation:mrDraw .3s ease-out .8s forwards}
.v8 .mr-word{animation:mrGrow .6s cubic-bezier(.16,1,.3,1) .88s forwards}
.v8 .mr-w2{text-shadow:0 0 24px rgba(143,176,255,.45)}
/* 1 · Swap slide: the two phones slide in from opposite sides, the arrow draws, the name opens out */
.v1 .mr-back{animation:mrInR .45s cubic-bezier(.16,1,.3,1) .05s both}
.v1 .mr-front{animation:mrInL .45s cubic-bezier(.16,1,.3,1) .15s both}
.v1 .mr-arrow{animation:mrDraw .3s ease-out .5s forwards}
.v1 .mr-word{animation:mrGrow .55s cubic-bezier(.16,1,.3,1) .62s forwards}
/* 2 · Exchange cross: the phones swap places (old phone out, new phone in), arrow pops */
.v2 .mr-back{animation:mrCrossB .6s cubic-bezier(.16,1,.3,1) .05s both}
.v2 .mr-front{animation:mrCrossF .6s cubic-bezier(.16,1,.3,1) .05s both}
.v2 .mr-arrow{stroke-dashoffset:0;animation:mrPop .35s cubic-bezier(.16,1,.3,1) .6s both}
.v2 .mr-word{animation:mrGrow .55s cubic-bezier(.16,1,.3,1) .75s forwards}
/* 3 · Blue wipe: brand-blue screen, white logo bounces in, then the blue lifts away */
.v3.mr-splash{background:#2150C8}
.v3 .mr-back{fill:rgba(255,255,255,.45)}.v3 .mr-front{fill:#fff}.v3 .mr-arrow{stroke:#2150C8}
.v3 .mr-mark{animation:mrBounce .55s cubic-bezier(.16,1,.3,1) .05s both}
.v3 .mr-arrow{animation:mrDraw .3s ease-out .45s forwards}
.v3 .mr-word{color:#fff;animation:mrGrow .55s cubic-bezier(.16,1,.3,1) .55s forwards}.v3 .mr-w2{color:#fff}
/* 4 · Ring: a ring fills around the logo like a quick check, the name rises underneath */
.v4 .mr-lock{flex-direction:column;gap:44px}
.v4 .mr-mark{animation:mrTilt .6s cubic-bezier(.16,1,.3,1) .05s both}
.v4 .mr-arrow{animation:mrDraw .3s ease-out .55s forwards}
.v4 .mr-word{max-width:none;animation:mrUp .45s cubic-bezier(.16,1,.3,1) .7s forwards}
.v4 .mr-ring{position:absolute;stroke-dasharray:352;stroke-dashoffset:352;animation:mrRing .95s cubic-bezier(.45,0,.2,1) .05s forwards}
`;

function shouldShow() {
  try {
    const q = new URLSearchParams(window.location.search).get("intro");
    if (q === "0") return 0;
    if (/^[1-8]$/.test(q || "")) return Number(q);
    if (/^\/(portal|staff)/.test(window.location.pathname)) return 0;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    if (/bot|crawl|spider|slurp|lighthouse|pagespeed|headless/i.test(navigator.userAgent) || navigator.webdriver) return 0;
    if (sessionStorage.getItem("mr_intro_seen") === "1") return 0;
    sessionStorage.setItem("mr_intro_seen", "1");
  } catch (e) { return 0; }
  return INTRO_VARIANT;
}

export default function SplashIntro() {
  const [variant] = useState(() => (typeof window === "undefined" ? 0 : shouldShow()));
  const [gone, setGone] = useState(variant === 0);
  const wrap = useRef(null), lock = useRef(null);
  const leaving = useRef(false);

  function exit(fast) {
    if (leaving.current || !wrap.current) return;
    leaving.current = true;
    const el = wrap.current, lk = lock.current;
    const done = () => setGone(true);
    if (fast || !el.animate) { el.style.transition = "opacity .2s"; el.style.opacity = "0"; return setTimeout(done, 200); }
    if (variant === 7) {
      // Zoom through the phone's screen: it turns white and grows to fill the page, which is white too.
      const stage = el.querySelector(".mr-stage"), scr = el.querySelector(".ph-hero .scr");
      const white = el.querySelector(".ph-hero .white");
      const r = scr.getBoundingClientRect();
      const k = Math.max(window.innerWidth / r.width, window.innerHeight / r.height) * 1.25;
      const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
      stage.style.transformOrigin = `${ox}px ${oy}px`;
      white.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: "forwards" });
      stage.animate([{ transform: "scale(1)" }, { transform: `scale(${k})` }], { duration: 650, delay: 120, easing: "cubic-bezier(.7,0,.3,1)", fill: "forwards" });
      el.animate([{ backgroundColor: "rgba(33,80,200,1)", opacity: 1 }, { opacity: 1, offset: 0.62 }, { opacity: 0 }], { duration: 760, delay: 60, fill: "forwards" }).onfinish = done;
      return;
    }
    if (variant === 3) {
      el.animate([{ transform: "none" }, { transform: "translateY(-100%)" }], { duration: 480, easing: "cubic-bezier(.7,0,.2,1)", fill: "forwards" }).onfinish = done;
      return;
    }
    if (variant === 4) {
      el.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.04)" }], { duration: 380, easing: "ease-in", fill: "forwards" }).onfinish = done;
      return;
    }
    // 1, 2 and 5: fly the logo into the header logo's exact spot while the background fades.
    const dark = variant === 5 || variant === 6 || variant === 8;
    if (dark) el.classList.add("leaving");
    const target = document.querySelector('nav img[src="/logo-mark.svg"]');
    const t = target && target.parentElement ? target.parentElement.getBoundingClientRect() : null;
    const s = lk.getBoundingClientRect();
    el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1 }); // keep the logo fully visible
    const fade = el.querySelector(".mr-bgfade");
    if (dark) {
      el.style.background = "transparent";
      if (fade && variant !== 8) fade.style.opacity = "1";
      el.querySelectorAll(".mr-bgfade, .mr-photo, .mr-shade").forEach((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, easing: "ease-in", fill: "forwards" }));
    }
    else el.animate([{ backgroundColor: "rgba(255,255,255,1)" }, { backgroundColor: "rgba(255,255,255,0)" }], { duration: 560, easing: "ease-in", fill: "forwards" });
    if (t && t.width && t.top >= 0 && t.top < window.innerHeight) {
      const k = t.height / s.height;
      lk.animate([{ transform: "none" }, { transform: `translate(${t.left - s.left}px, ${t.top - s.top}px) scale(${k})` }],
        { duration: 560, easing: "cubic-bezier(.65,0,.25,1)", fill: "forwards" }).onfinish = done;
    } else {
      lk.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" }).onfinish = done;
    }
  }

  useEffect(() => {
    if (gone) return undefined;
    document.documentElement.style.overflow = "hidden";
    const meta = document.querySelector('meta[name="theme-color"]');
    const oldTheme = meta && meta.getAttribute("content");
    if (meta && (variant === 5 || variant === 6 || variant === 8)) meta.setAttribute("content", "#0F1B3D");
    if (meta && variant === 7) meta.setAttribute("content", "#2150C8");
    const timer = setTimeout(() => exit(false), TIMING[variant] || 1200);
    const safety = setTimeout(() => setGone(true), 4000); // never stuck on screen
    return () => { clearTimeout(timer); clearTimeout(safety); document.documentElement.style.overflow = ""; if (meta && oldTheme) meta.setAttribute("content", oldTheme); };
  }, [gone]);

  useEffect(() => {
    if (!gone) return;
    document.documentElement.classList.remove("mr-intro");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && ["#0F1B3D", "#2150C8"].includes(meta.getAttribute("content"))) meta.setAttribute("content", "#FFFFFF");
  }, [gone]);

  if (gone) return null;
  return (
    <div ref={wrap} className={`mr-splash v${variant}${variant === 5 || variant === 6 || variant === 8 ? " dk" : ""}`} onClick={() => exit(true)} aria-hidden="true">
      <style>{CSS}</style>
      {(variant === 5 || variant === 6) && <div className="mr-bgfade" style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 45%,#1A2D63 0%,#0F1B3D 55%,#0A1330 100%)", opacity: 0, pointerEvents: "none" }} />}
      {variant === 8 && <><div className="mr-photo" /><div className="mr-shade" /></>}
      {variant === 6 && (
        <div className="mr-stage">
          <RealPhone kind="old" className="mr-ph ph-old" />
          <RealPhone kind="new" className="mr-ph ph-new" />
        </div>
      )}
      {variant === 7 && (
        <div className="mr-stage">
          <RealPhone kind="hero" className="mr-ph ph-hero" />
        </div>
      )}
      <div ref={lock} className="mr-lock" style={{ position: "relative" }}>
        {variant === 4 && (
          <svg className="mr-ring" width="124" height="124" viewBox="0 0 124 124" style={{ left: "50%", top: 0, marginLeft: -62, marginTop: (34 * SCALE) / 2 - 62 }}>
            <circle cx="62" cy="62" r="56" fill="none" stroke="#2150C8" strokeWidth="4" strokeLinecap="round" transform="rotate(-90 62 62)" />
          </svg>
        )}
        <svg className="mr-mark" viewBox="10 2 44 60" width={25 * SCALE} height={34 * SCALE}>
          <rect className="mr-back" x="24" y="4" width="28" height="46" rx="7" fill="#A9BDF5" />
          <rect className="mr-front" x="12" y="14" width="28" height="46" rx="7" fill="#2150C8" />
          <path className="mr-arrow" d="M19 37 H33 M28.5 32.5 L33 37 L28.5 41.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="mr-word"><span className="mr-w1">Mobile</span> <span className="mr-w2">Recellr</span></span>
      </div>
    </div>
  );
}

// A detailed, brand-neutral phone drawn in SVG: metal frame with side buttons,
// black bezel, pill camera cut-out, glass reflection. Not any real maker's design.
//   old  = graphite, screen off with a cracked glass
//   new  = blue frame, screen lights up with our logo
//   hero = like new, with the name on screen (zoom intro)
function RealPhone({ kind, className }) {
  const id = "mrp-" + kind;
  const blue = kind !== "old";
  const frame = blue ? ["#1E2F5E", "#A9BCEB", "#2C4583", "#0F1A38"] : ["#1A1D24", "#8A90A0", "#30343E", "#0C0E12"];
  return (
    <svg className={className} viewBox="-4 0 140 270" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={frame[1]} /><stop offset=".18" stopColor={frame[0]} /><stop offset=".55" stopColor={frame[2]} /><stop offset=".85" stopColor={frame[3]} /><stop offset="1" stopColor={frame[1]} />
        </linearGradient>
        <linearGradient id={`${id}-off`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1B2130" /><stop offset="1" stopColor="#06080C" /></linearGradient>
        <radialGradient id={`${id}-on`} cx=".5" cy=".38" r=".85"><stop offset="0" stopColor="#6E93F0" /><stop offset=".45" stopColor="#2150C8" /><stop offset="1" stopColor="#0B1F5C" /></radialGradient>
        <linearGradient id={`${id}-gl`} x1="0" y1="0" x2="1" y2=".6"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".45" stopColor="#fff" stopOpacity=".06" /><stop offset=".46" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="-2.5" y="66" width="3.5" height="14" rx="1.5" fill={frame[1]} />
      <rect x="-2.5" y="88" width="3.5" height="26" rx="1.5" fill={frame[1]} />
      <rect x="-2.5" y="120" width="3.5" height="26" rx="1.5" fill={frame[1]} />
      <rect x="131" y="96" width="3.5" height="40" rx="1.5" fill={frame[1]} />
      <rect x="1" y="1" width="130" height="268" rx="24" fill={`url(#${id}-f)`} />
      <rect x="3.2" y="3.2" width="125.6" height="263.6" rx="22" fill="none" stroke="#000" strokeOpacity=".35" />
      <rect x="5" y="5" width="122" height="260" rx="20.5" fill="#030407" />
      <rect className="scr" x="9" y="9" width="114" height="252" rx="17" fill={`url(#${id}-off)`} />
      {kind === "old" && (
        <g stroke="#fff" strokeOpacity=".38" strokeWidth=".8" fill="none" strokeLinecap="round">
          <path d="M92 64 L70 92 L44 98 M70 92 L78 130 L60 168 M70 92 L104 104 L120 96 M78 130 L112 150 M60 168 L30 190 M60 168 L72 214" />
          <circle cx="70" cy="92" r="5" strokeOpacity=".5" />
        </g>
      )}
      {blue && (
        <g className="on">
          <rect x="9" y="9" width="114" height="252" rx="17" fill={`url(#${id}-on)`} />
          <circle cx="66" cy="118" r="44" fill="#fff" opacity=".08" />
          <g transform="translate(47 88) scale(.95)">
            <rect x="14" y="2" width="28" height="46" rx="7" fill="#fff" opacity=".55" />
            <rect x="2" y="12" width="28" height="46" rx="7" fill="#fff" />
            <path d="M9 35 H23 M18.5 30.5 L23 35 L18.5 39.5" fill="none" stroke="#2150C8" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {kind === "hero" && (
            <text className="word" x="66" y="184" textAnchor="middle" fill="#fff" style={{ fontFamily: "'Outfit','Archivo',sans-serif", fontSize: 15, letterSpacing: "-0.01em" }}>
              <tspan fontWeight="400">Mobile </tspan><tspan fontWeight="800">Recellr</tspan>
            </text>
          )}
          <rect x="52" y="248" width="28" height="3" rx="1.5" fill="#fff" opacity=".7" />
        </g>
      )}
      {kind === "hero" && <rect className="white" x="9" y="9" width="114" height="252" rx="17" fill="#fff" opacity="0" />}
      <rect x="49" y="15" width="34" height="10" rx="5" fill="#000" />
      <circle cx="76" cy="20" r="2" fill="#1B2A4A" />
      <rect x="9" y="9" width="114" height="252" rx="17" fill={`url(#${id}-gl)`} />
    </svg>
  );
}

