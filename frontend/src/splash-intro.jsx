import React, { useEffect, useRef, useState } from "react";

/* Opening animation: the logo builds itself, then flies into the header.
   - Every time the website is opened or reloaded, public pages only (never the staff portal).
   - Skipped for "reduce motion", search engines and speed-test bots.
   - Tap anywhere to skip. The page loads underneath the whole time.
   - Preview any style on the live site with ?intro=1 to 11 (?intro=0 = off). */

export const INTRO_VARIANT = 11; // 11 Phones merge, logo comes out, site opens like an app (default) · 10 Phones become the logo · 9 Two phones meet, dark · 8 Shop photo, dark · 6 Phone exchange, dark · 7 Phone zoom, blue · 5 Dark swap · 1 Swap slide · 2 Exchange cross · 3 Blue wipe · 4 Ring

const SCALE = 1.8; // splash logo = header logo × this, so it lands exactly on it
const TIMING = { 1: 1250, 2: 1350, 3: 1200, 4: 1300, 5: 1300, 6: 1650, 7: 1400, 8: 1650, 9: 2250, 10: 2700, 11: 2650 }; // ms before the exit starts

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

/* 9 · Two phones meet (dark, default): a graphite phone slides in from the left and a blue one
   from the right, both showing their backs (our logo where a maker's would be). They meet in the
   middle, the blue phone turns round and its screen lights up with our logo, the name opens out
   underneath, then the logo glides into the header and the website appears. */
.m9{flex-direction:column}
.m9-glow{position:absolute;left:50%;top:44%;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;
  background:radial-gradient(circle,rgba(86,119,214,.42) 0%,rgba(33,80,200,.16) 38%,rgba(15,27,61,0) 70%);opacity:0;animation:m9Glow 1.2s ease-out .55s forwards}
@keyframes m9Glow{0%{opacity:0;transform:scale(.6)}60%{opacity:1}100%{opacity:.85;transform:scale(1)}}
.m9-ph{position:absolute;left:50%;top:44%;width:150px;height:308px;margin:-154px 0 0 -75px;perspective:900px;will-change:transform,opacity}
.m9-flip{position:absolute;inset:0;transform-style:preserve-3d}
.m9-ph .face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.m9-ph .back{transform:translateZ(4px)}
.m9-ph .front{transform:rotateY(180deg) translateZ(4px)}
.m9-ph .edge{position:absolute;top:4%;bottom:4%;width:8px;border-radius:4px;background:linear-gradient(90deg,var(--e1),var(--e2) 45%,var(--e1))}
.m9-ph .edge.l{left:-4px;transform:rotateY(-90deg)}.m9-ph .edge.r{right:-4px;transform:rotateY(90deg)}
.m9-ph .edge{opacity:0}
.m9-right .edge{animation:m9Edge .75s linear .6s both}
@keyframes m9Edge{0%{opacity:0}18%{opacity:1}82%{opacity:1}100%{opacity:0}}
.m9-shadow{position:absolute;left:8%;right:8%;bottom:-26px;height:30px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.55),rgba(0,0,0,0));filter:blur(4px)}
/* outer layer: slide, tilt and fade (flat). inner layer: the 3D turn only, never faded. */
.m9-left{animation:m9L 1.3s cubic-bezier(.22,.9,.24,1) .05s both}
@keyframes m9L{0%{transform:translateX(-62vw) rotate(-16deg);opacity:0}
  42%{transform:translateX(-58px) rotate(-7deg);opacity:1}
  100%{transform:translateX(-92px) rotate(-11deg) scale(.84);opacity:.5}}
.m9-right{z-index:2;animation:m9R 1.3s cubic-bezier(.22,.9,.24,1) .05s both}
@keyframes m9R{0%{transform:translateX(62vw) rotate(16deg);opacity:0}
  42%{transform:translateX(58px) rotate(7deg);opacity:1}
  100%{transform:translateX(0) rotate(0) scale(1.04);opacity:1}}
.m9-right .m9-flip{animation:m9Turn .75s cubic-bezier(.45,0,.2,1) .6s both}
@keyframes m9Turn{from{transform:rotateY(0)}to{transform:rotateY(180deg)}}
.m9-right .on{opacity:0;animation:mrFadeIn .35s ease-out 1.15s forwards}
.m9-right .shine{animation:m9Shine .9s ease-in-out 1.3s both}
@keyframes m9Shine{from{transform:translateX(-160px)}to{transform:translateX(200px)}}
.v9 .mr-lock{position:absolute !important;left:0;right:0;margin:0 auto;width:max-content;top:calc(44% + 182px);opacity:0;animation:m9Lock .45s cubic-bezier(.16,1,.3,1) 1.3s forwards}
@keyframes m9Lock{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.v9 .mr-arrow{stroke-dashoffset:0}
.v9 .mr-word{animation:mrGrow .5s cubic-bezier(.16,1,.3,1) 1.35s forwards}
.v9.leaving .m9-ph{transition:opacity .4s ease-in, transform .5s ease-in;opacity:0 !important}
@media (min-width:900px){.m9-ph{width:190px;height:390px;margin:-195px 0 0 -95px}}
@media (max-width:420px){.m9-ph{width:124px;height:255px;margin:-128px 0 0 -62px}.v9 .mr-lock{top:calc(44% + 150px)}}

/* 10 · Phones become the logo (dark, default): the same two phones slide in from both sides and
   meet, then shrink onto the two phones of our logo mark and turn into it (flat brand colours,
   no glow or shine). The arrow draws, the name is revealed, and the logo glides into the header. */
.m10-left{animation:m10L .8s cubic-bezier(.22,.9,.24,1) .05s both}
@keyframes m10L{from{transform:translateX(-62vw) rotate(-16deg);opacity:0}to{transform:translateX(-40px) rotate(-7deg);opacity:1}}
.m10-right{z-index:2;animation:m10R .8s cubic-bezier(.22,.9,.24,1) .05s both}
@keyframes m10R{from{transform:translateX(62vw) rotate(16deg);opacity:0}to{transform:translateX(40px) rotate(7deg);opacity:1}}
.v10 .mr-lock{position:absolute !important;left:0;right:0;margin:0 auto;width:max-content;top:calc(50% - 30px)}
.v10 .mr-back,.v10 .mr-front{opacity:0}
.v10 .mr-word{max-width:none;opacity:1;clip-path:inset(0 100% 0 0);-webkit-clip-path:inset(0 100% 0 0)}
.v10 .mr-word.show{animation:m10Reveal .5s cubic-bezier(.16,1,.3,1) forwards}
@keyframes m10Reveal{to{clip-path:inset(0 0 0 0);-webkit-clip-path:inset(0 0 0 0)}}

/* 11 · Merge and open (dark, default): the blue phone comes in from the middle of the left edge,
   the black one from the middle of the right edge. They meet in the centre and slide into each
   other until they are gone, our logo comes out of the middle (flat colours, no glow), then the
   website opens out of the logo the way an app opens on a phone. */
.m11-ph{top:50%}
.m11-left{animation:m11L 1.9s linear .05s both}
.m11-right{z-index:2;animation:m11R 1.9s linear .05s both}
@keyframes m11L{0%{transform:translateX(calc(-50vw + 50% + 14px));opacity:0;animation-timing-function:ease-out}8%{transform:translateX(calc(-50vw + 50% + 14px));opacity:1;animation-timing-function:cubic-bezier(.45,0,.3,1)}52%{transform:translateX(-56%);opacity:1;animation-timing-function:cubic-bezier(.5,0,.3,1)}70%{transform:translateX(0);opacity:1;animation-timing-function:ease-in}100%{transform:translateX(0);opacity:0}}
@keyframes m11R{0%{transform:translateX(calc(50vw - 50% - 14px));opacity:0;animation-timing-function:ease-out}8%{transform:translateX(calc(50vw - 50% - 14px));opacity:1;animation-timing-function:cubic-bezier(.45,0,.3,1)}52%{transform:translateX(56%);opacity:1;animation-timing-function:cubic-bezier(.5,0,.3,1)}70%{transform:translateX(0) scale(1);opacity:1}76%{transform:translateX(0) scale(1.04);opacity:1;animation-timing-function:ease-in}100%{transform:translateX(0) scale(.9);opacity:0}}
@media (min-width:900px){.m11-left{animation-name:m11Lw}.m11-right{animation-name:m11Rw}}
@keyframes m11Lw{0%{transform:translateX(-38vw);opacity:0;animation-timing-function:ease-out}8%{transform:translateX(-38vw);opacity:1;animation-timing-function:cubic-bezier(.45,0,.3,1)}52%{transform:translateX(-56%);opacity:1;animation-timing-function:cubic-bezier(.5,0,.3,1)}70%{transform:translateX(0);opacity:1;animation-timing-function:ease-in}100%{transform:translateX(0);opacity:0}}
@keyframes m11Rw{0%{transform:translateX(38vw);opacity:0;animation-timing-function:ease-out}8%{transform:translateX(38vw);opacity:1;animation-timing-function:cubic-bezier(.45,0,.3,1)}52%{transform:translateX(56%);opacity:1;animation-timing-function:cubic-bezier(.5,0,.3,1)}70%{transform:translateX(0) scale(1);opacity:1}76%{transform:translateX(0) scale(1.04);opacity:1;animation-timing-function:ease-in}100%{transform:translateX(0) scale(.9);opacity:0}}
.v11 .mr-lock{transform-origin:50% 50%;opacity:0;animation:m11Pop .6s cubic-bezier(.2,1.3,.4,1) 1.45s forwards}
@keyframes m11Pop{from{opacity:0;transform:scale(.25)}to{opacity:1;transform:none}}
.v11 .mr-arrow{stroke-dashoffset:0}
.v11 .mr-word{animation:mrGrow .55s cubic-bezier(.16,1,.3,1) 1.8s forwards}
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
    if (/^([1-9]|1[01])$/.test(q || "")) return Number(q);
    if (/^\/(portal|staff)/.test(window.location.pathname)) return 0;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    if (/bot|crawl|spider|slurp|lighthouse|pagespeed|headless/i.test(navigator.userAgent) || navigator.webdriver) return 0;
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
    const dark = variant === 5 || variant === 6 || variant === 8 || variant === 9 || variant === 10 || variant === 11;
    if (dark) el.classList.add("leaving");
    const target = document.querySelector('nav img[src="/logo-mark.svg"]');
    const t = target && target.parentElement ? target.parentElement.getBoundingClientRect() : null;
    if (variant === 11) lk.style.transformOrigin = "0 0"; // its pop scaled from the centre; the flight maths needs the corner
    const s = lk.getBoundingClientRect();
    el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1 }); // keep the logo fully visible
    const fade = el.querySelector(".mr-bgfade");
    if (dark) {
      el.style.background = "transparent";
      if (fade && variant !== 8 && variant !== 9 && variant !== 10) fade.style.opacity = "1";
      el.querySelectorAll(".mr-bgfade, .mr-photo, .mr-shade, .m9, .m11").forEach((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, easing: "ease-in", fill: "forwards" }));
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
    if (meta && (variant === 5 || variant === 6 || variant === 8 || variant === 9 || variant === 10 || variant === 11)) meta.setAttribute("content", "#0F1B3D");
    if (meta && variant === 7) meta.setAttribute("content", "#2150C8");
    const timer = setTimeout(() => exit(false), TIMING[variant] || 1200);
    const safety = setTimeout(() => setGone(true), 4000); // never stuck on screen
    return () => { clearTimeout(timer); clearTimeout(safety); document.documentElement.style.overflow = ""; if (meta && oldTheme) meta.setAttribute("content", oldTheme); };
  }, [gone]);

  // 10: after the phones meet, shrink each one onto its phone in the logo mark and swap it for the mark.
  useEffect(() => {
    if (variant !== 10 || gone || !wrap.current) return undefined;
    const el = wrap.current;
    const t = setTimeout(() => {
      const pairs = [[".m10-left", ".mr-front"], [".m10-right", ".mr-back"]];
      for (const [ph, part] of pairs) {
        const p = el.querySelector(ph), m = el.querySelector(part);
        if (!p || !m) continue;
        const a = p.getBoundingClientRect(), b = m.getBoundingClientRect();
        const k = b.height / p.offsetHeight;
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        const from = getComputedStyle(p).transform;
        const to = `translate(${dx}px, ${dy}px) ${from === "none" ? "" : from} scale(${k})`;
        p.animate([{ transform: from === "none" ? "none" : from, opacity: 1 }, { transform: to, opacity: 1, offset: 0.78 }, { transform: to, opacity: 0 }],
          { duration: 520, easing: "cubic-bezier(.65,0,.3,1)", fill: "forwards" });
        m.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: 520, fill: "forwards" });
      }
      const arrow = el.querySelector(".mr-arrow");
      if (arrow) arrow.animate([{ strokeDashoffset: 32 }, { strokeDashoffset: 0 }], { duration: 280, delay: 520, easing: "ease-out", fill: "forwards" });
      const word = el.querySelector(".mr-word");
      if (word) setTimeout(() => word.classList.add("show"), 600);
    }, 1050);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!gone) return;
    document.documentElement.classList.remove("mr-intro");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && ["#0F1B3D", "#2150C8"].includes(meta.getAttribute("content"))) meta.setAttribute("content", "#FFFFFF");
  }, [gone]);

  if (gone) return null;
  return (
    <div ref={wrap} className={`mr-splash v${variant}${variant === 5 || variant === 6 || variant === 8 || variant === 9 || variant === 10 || variant === 11 ? " dk" : ""}`} onClick={() => exit(true)} aria-hidden="true">
      <style>{CSS}</style>
      {(variant === 5 || variant === 6 || variant === 9 || variant === 10) && <div className="mr-bgfade" style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 45%,#1A2D63 0%,#0F1B3D 55%,#0A1330 100%)", opacity: 0, pointerEvents: "none" }} />}
      {variant === 8 && <><div className="mr-photo" /><div className="mr-shade" /></>}
      {variant === 6 && (
        <div className="mr-stage">
          <RealPhone kind="old" className="mr-ph ph-old" />
          <RealPhone kind="new" className="mr-ph ph-new" />
        </div>
      )}
      {variant === 9 && (
        <div className="mr-stage m9">
          <div className="m9-glow" />
          <Phone3D tone="black" className="m9-ph m9-left" />
          <Phone3D tone="blue" className="m9-ph m9-right" />
        </div>
      )}
      {variant === 11 && (
        <div className="mr-stage m11">
          <Phone3D tone="blue" className="m9-ph m11-ph m11-left" />
          <Phone3D tone="black" className="m9-ph m11-ph m11-right" />
        </div>
      )}
      {variant === 10 && (
        <div className="mr-stage m9 m10">
          <Phone3D tone="black" className="m9-ph m10-ph m10-left" />
          <Phone3D tone="blue" className="m9-ph m10-ph m10-right" />
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



// Photo-real phone for intro 9, drawn in SVG so it stays sharp on any screen.
// Two faces plus metal edges for real thickness: the back (frosted matte glass,
// raised glossy camera block, three lenses with coatings, flash, depth sensor,
// our glossy mark where a maker's logo would sit) and the front (thin bezels,
// status bar, island cut-out, lock-screen wallpaper that lights up with our logo).
// Modelled on current flagship proportions, but no real maker's logo or exact design.
const TONES = {
  black: { body: ["#3B3D42", "#2A2C30", "#1C1D20"], frame: ["#9A9CA2", "#4A4C52", "#77797F", "#2E3034"], plate: ["#4A4C52", "#2C2E33"], mark: "#55585F", e: ["#2E3034", "#8C8E94"] },
  blue: { body: ["#C9D8EC", "#AFC4E1", "#93ABCF"], frame: ["#E8EEF7", "#8EA3C2", "#C3D0E3", "#6F84A6"], plate: ["#D3E0F1", "#9FB6D8"], mark: "#8FA7CC", e: ["#7489AB", "#DCE5F2"] },
};
function Lens({ cx, cy, id }) {
  return (
    <g>
      <circle cx={cx} cy={cy + 1.2} r="15.8" fill="#000" opacity=".35" />
      <circle cx={cx} cy={cy} r="15.6" fill={`url(#${id}-bezel)`} />
      <circle cx={cx} cy={cy} r="13.4" fill="#0A0B0E" />
      <circle cx={cx} cy={cy} r="11.6" fill="none" stroke="#2A2D35" strokeWidth=".8" />
      <circle cx={cx} cy={cy} r="10.4" fill={`url(#${id}-glass)`} />
      <circle cx={cx} cy={cy} r="6.6" fill="#05060A" />
      <circle cx={cx} cy={cy} r="6.6" fill="none" stroke="#3B4C8E" strokeOpacity=".55" strokeWidth=".7" />
      <circle cx={cx} cy={cy} r="3.2" fill="#0E1631" />
      <path d={`M${cx - 8.6} ${cy + 2} A8.8 8.8 0 0 1 ${cx - 2} ${cy - 8.6}`} fill="none" stroke="#7B5CFF" strokeOpacity=".55" strokeWidth="1.1" strokeLinecap="round" />
      <path d={`M${cx + 7.6} ${cy + 4.6} A8.8 8.8 0 0 1 ${cx + 2.4} ${cy + 8.4}`} fill="none" stroke="#3FE0B0" strokeOpacity=".45" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx={cx - 3.8} cy={cy - 4.4} rx="2.6" ry="1.5" fill="#fff" opacity=".85" transform={`rotate(-38 ${cx - 3.8} ${cy - 4.4})`} />
      <circle cx={cx + 3.4} cy={cy + 3.8} r=".9" fill="#fff" opacity=".5" />
    </g>
  );
}
function Phone3D({ tone, className }) {
  const t = TONES[tone], id = "m9-" + tone;
  const time = "10:30";
  return (
    <div className={className} style={{ "--e1": t.e[0], "--e2": t.e[1] }}>
      <div className="m9-shadow" />
      <div className="m9-flip">
        <div className="edge l" /><div className="edge r" />
        <svg className="face back" viewBox="0 0 150 308" width="100%" height="100%" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-fr`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={t.frame[0]} /><stop offset=".22" stopColor={t.frame[1]} /><stop offset=".5" stopColor={t.frame[2]} /><stop offset=".85" stopColor={t.frame[3]} /><stop offset="1" stopColor={t.frame[0]} />
            </linearGradient>
            <linearGradient id={`${id}-bd`} x1="0" y1="0" x2=".85" y2="1">
              <stop offset="0" stopColor={t.body[0]} /><stop offset=".5" stopColor={t.body[1]} /><stop offset="1" stopColor={t.body[2]} />
            </linearGradient>
            <linearGradient id={`${id}-pl`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={t.plate[0]} /><stop offset="1" stopColor={t.plate[1]} /></linearGradient>
            <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2=".75">
              <stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset=".32" stopColor="#fff" stopOpacity=".04" /><stop offset=".33" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".45" /><stop offset=".4" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
            <radialGradient id={`${id}-bezel`} cx=".3" cy=".25" r=".9"><stop offset="0" stopColor={t.frame[0]} /><stop offset=".45" stopColor={t.frame[2]} /><stop offset="1" stopColor={t.frame[3]} /></radialGradient>
            <radialGradient id={`${id}-glass`} cx=".38" cy=".32" r=".8"><stop offset="0" stopColor="#2C3A6B" /><stop offset=".45" stopColor="#11172E" /><stop offset="1" stopColor="#030409" /></radialGradient>
            <radialGradient id={`${id}-flash`} cx=".4" cy=".35" r=".7"><stop offset="0" stopColor="#FFFBEA" /><stop offset=".6" stopColor="#EDE0B8" /><stop offset="1" stopColor="#B8A97F" /></radialGradient>
            <filter id={`${id}-frost`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="4" result="n" />
              <feColorMatrix in="n" type="saturate" values="0" result="g" />
              <feComponentTransfer in="g"><feFuncA type="table" tableValues="0 .07" /></feComponentTransfer>
              <feComposite in2="SourceGraphic" operator="in" />
            </filter>
            <filter id={`${id}-lift`} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#000" floodOpacity=".35" /></filter>
          </defs>
          <rect x="0.5" y="0.5" width="149" height="307" rx="27" fill={`url(#${id}-fr)`} />
          <rect x="2.6" y="2.6" width="144.8" height="302.8" rx="25" fill={`url(#${id}-bd)`} />
          <rect x="2.6" y="2.6" width="144.8" height="302.8" rx="25" fill="#fff" filter={`url(#${id}-frost)`} />
          <g filter={`url(#${id}-lift)`}>
            <rect x="8" y="8" width="88" height="92" rx="23" fill={`url(#${id}-pl)`} />
          </g>
          <rect x="8" y="8" width="88" height="92" rx="23" fill={`url(#${id}-gloss)`} />
          <rect x="8.5" y="8.5" width="87" height="91" rx="22.5" fill="none" stroke="#fff" strokeOpacity=".25" />
          <Lens cx={32} cy={32} id={id} />
          <Lens cx={32} cy={76} id={id} />
          <Lens cx={71} cy={54} id={id} />
          <circle cx="72" cy="23" r="5.2" fill={`url(#${id}-flash)`} stroke="#000" strokeOpacity=".25" strokeWidth=".6" />
          <circle cx="72.5" cy="85.5" r="4.4" fill="#08090C" /><circle cx="71.6" cy="84.6" r="1.2" fill="#2E3550" />
          <circle cx="82" cy="40" r="1.1" fill="#000" opacity=".55" />
          <g transform="translate(62 140)">
            <rect x="9" y="0" width="15" height="24" rx="4.4" fill={t.mark} opacity=".5" />
            <rect x="2" y="6" width="15" height="24" rx="4.4" fill={t.mark} />
            <rect x="2" y="6" width="15" height="24" rx="4.4" fill={`url(#${id}-gloss)`} />
          </g>
          <rect x="2.6" y="2.6" width="144.8" height="302.8" rx="25" fill={`url(#${id}-sheen)`} />
        </svg>
        <svg className="face front" viewBox="0 0 150 308" width="100%" height="100%" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-fr2`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={t.frame[0]} /><stop offset=".22" stopColor={t.frame[1]} /><stop offset=".5" stopColor={t.frame[2]} /><stop offset=".85" stopColor={t.frame[3]} /><stop offset="1" stopColor={t.frame[0]} />
            </linearGradient>
            <linearGradient id={`${id}-off`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#151922" /><stop offset="1" stopColor="#040507" /></linearGradient>
            <radialGradient id={`${id}-wall`} cx=".3" cy=".25" r="1.1"><stop offset="0" stopColor="#6F95F7" /><stop offset=".35" stopColor="#2A58D0" /><stop offset=".7" stopColor="#14307E" /><stop offset="1" stopColor="#0A1636" /></radialGradient>
            <radialGradient id={`${id}-wall2`} cx=".85" cy=".85" r=".7"><stop offset="0" stopColor="#8F6BFF" stopOpacity=".55" /><stop offset="1" stopColor="#8F6BFF" stopOpacity="0" /></radialGradient>
            <linearGradient id={`${id}-glare`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".26" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
            <linearGradient id={`${id}-glass2`} x1="0" y1="0" x2="1" y2=".6"><stop offset="0" stopColor="#fff" stopOpacity=".12" /><stop offset=".4" stopColor="#fff" stopOpacity=".02" /><stop offset=".41" stopColor="#fff" stopOpacity="0" /></linearGradient>
            <clipPath id={`${id}-clip`}><rect x="6.5" y="6.5" width="137" height="295" rx="21.5" /></clipPath>
          </defs>
          <rect x="0.5" y="0.5" width="149" height="307" rx="27" fill={`url(#${id}-fr2)`} />
          <rect x="2.4" y="2.4" width="145.2" height="303.2" rx="25.2" fill="#010103" />
          <rect x="6.5" y="6.5" width="137" height="295" rx="21.5" fill={`url(#${id}-off)`} />
          <g className="on" clipPath={`url(#${id}-clip)`}>
            <rect x="6.5" y="6.5" width="137" height="295" fill={`url(#${id}-wall)`} />
            <rect x="6.5" y="6.5" width="137" height="295" fill={`url(#${id}-wall2)`} />
            <path d="M6 210 C 40 180, 90 240, 144 196 L144 302 L6 302 Z" fill="#fff" opacity=".06" />
            <path d="M6 240 C 50 214, 96 262, 144 236 L144 302 L6 302 Z" fill="#fff" opacity=".05" />
            <text x="22" y="23.5" fill="#fff" style={{ font: "600 8.6px system-ui,-apple-system,'Segoe UI',sans-serif" }}>{time}</text>
            <g fill="#fff">
              <rect x="105" y="18.5" width="2" height="3.5" rx=".6" /><rect x="108" y="17.2" width="2" height="4.8" rx=".6" /><rect x="111" y="15.9" width="2" height="6.1" rx=".6" /><rect x="114" y="14.6" width="2" height="7.4" rx=".6" opacity=".45" />
              <rect x="119" y="15" width="13" height="7" rx="2" fill="none" stroke="#fff" strokeWidth=".8" opacity=".9" /><rect x="120.4" y="16.4" width="8.6" height="4.2" rx="1" /><rect x="132.6" y="17.3" width="1.2" height="2.4" rx=".5" opacity=".7" />
            </g>
            <circle cx="75" cy="140" r="48" fill="#fff" opacity=".07" />
            <g transform="translate(51 108) scale(1.4)">
              <rect x="14" y="2" width="20" height="32" rx="5.5" fill="#fff" opacity=".55" />
              <rect x="4" y="10" width="20" height="32" rx="5.5" fill="#fff" />
              <path d="M9.5 28 H19 M15.5 24.5 L19 28 L15.5 31.5" fill="none" stroke="#2150C8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <rect x="56" y="290" width="38" height="3.6" rx="1.8" fill="#fff" opacity=".8" />
            <rect className="shine" x="0" y="-20" width="46" height="360" fill={`url(#${id}-glare)`} transform="rotate(18 75 154)" />
          </g>
          <rect x="55" y="12.5" width="40" height="12" rx="6" fill="#000" />
          <circle cx="87.5" cy="18.5" r="2.4" fill="#0D1328" /><circle cx="87" cy="18" r=".8" fill="#2A3A70" />
          <rect x="6.5" y="6.5" width="137" height="295" rx="21.5" fill={`url(#${id}-glass2)`} />
        </svg>
      </div>
    </div>
  );
}
