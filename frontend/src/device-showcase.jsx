// "Tap to look inside": a photoreal exploded view of an iPhone, played from a frame
// sequence (/photos/exploded/{hd,sd}/000–079.webp). Tap the phone (or the button) and it comes
// apart; tap again and it plays backwards and closes. Once open, priced hotspots mark
// the parts we repair.
//
// How it stays smooth (the same technique Apple uses for its product pages):
//  - frames are drawn on a <canvas>; the files load in the background and only the few
//    frames around the current one are decoded at a time (createImageBitmap),
//  - the first frame is a normal <img> that shows immediately; the rest load in the
//    background only when the section is close to the screen,
//  - the canvas is sized for the screen's pixel ratio (capped at 2) so it stays sharp,
//  - phones get every second frame of the lighter set (half the download, still smooth).
// Reduced motion / no JS: the opened phone as a still image with the price list.
//
// Three ways to drive it (preview any on the live site with ?xv=scroll / ?xv=auto / ?xv=tap):
//  scroll: the section pins while you scroll and the phone opens with your scroll, closes
//          when you scroll back (Apple product-page style). Default.
//  auto:   opens by itself when it comes into view, closes again once it leaves.
//  tap:    opens on tap, closes on the next tap.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { REPAIRS_BY_DEVICE } from "./repair-prices.js";

const PRICE = Object.fromEntries((REPAIRS_BY_DEVICE.Phone || []).map((r) => [r.name, r.from]));
// Frames: AI-upscaled (Real-ESRGAN) from the source clip, printed labels removed, cropped to
// the parts. Two sizes: hd (960 wide) for big/sharp canvases, sd (640 wide) for phones.
const COUNT = 80, W = 960, H = 1802;
const SRC = (i, q = "sd") => `/photos/exploded/${q}/${String(i).padStart(3, "0")}.webp`;
const DURATION = 2600; // ms for a full open or close (tap/auto): slow enough to watch it come apart
const MIN_OPEN_MS = 2400; // scroll mode: however fast the scroll, a full open takes at least this long
export const SHOWCASE_MODE = "scroll";
// Backdrop. The frames' own backdrop is pure white, and the picture is multiplied onto the
// section colour, so any light tint shows through seamlessly (no box around the picture).
// Preview on the live site with ?xvbg=white|blush|sand|mist|rose. (Solid colours only: the
// stage paints the same colour under the picture, so a gradient would show a seam.)
export const TINTS = {
  white: "#FFFFFF",
  blush: "#F7F1F3",
  sand: "#F4EFE8",
  mist: "#EEF1F6",
  rose: "#F4E9EC",
};
export const SHOWCASE_BG = "mist";
const pickTint = () => {
  try { const t = new URLSearchParams(window.location.search).get("xvbg"); if (t && TINTS[t]) return TINTS[t]; } catch (e) { /* no window */ }
  return TINTS[SHOWCASE_BG];
};
const pickMode = () => {
  let m = SHOWCASE_MODE;
  try { const q = new URLSearchParams(window.location.search).get("xv"); if (q === "scroll" || q === "auto" || q === "tap") m = q; } catch (e) { /* no window */ }
  // Pinning needs overflow:clip (older iPhones lack it and the pin would scroll away,
  // leaving a tall empty section): those get the auto-play version instead.
  if (m === "scroll" && typeof CSS !== "undefined" && CSS.supports && !CSS.supports("overflow", "clip")) m = "auto";
  return m;
};

// Part labels on the fully opened phone, as fractions of the (cropped) frame. The clip's own
// printed labels were blurry and misspelt, so they are removed from the frames and drawn here
// as real text instead: sharp at any size, spelt right, and they reveal one by one.
// side = which gutter the label sits in on wide screens; m = which way the tag points on
// phones (phones show only the parts we price, to keep it uncluttered).
const SPOTS = [
  { id: "lenses", x: 0.428, y: 0.107, title: "Camera lenses", side: "left" },
  { id: "camera", x: 0.446, y: 0.230, title: "Camera", price: PRICE["Camera repair"], side: "right", m: "r" },
  { id: "sensor", x: 0.218, y: 0.316, title: "Image sensor", side: "left" },
  { id: "screen", x: 0.477, y: 0.344, title: "Screen", price: PRICE["Screen replacement"], side: "right", m: "l" },
  { id: "layers", x: 0.446, y: 0.492, title: "Display layers", side: "left" },
  { id: "board", x: 0.638, y: 0.619, title: "Logic board", price: PRICE["Water damage diagnosis"], side: "right", m: "l", note: "water damage check" },
  { id: "battery", x: 0.508, y: 0.705, title: "Battery", price: PRICE["Battery replacement"], side: "left", m: "r" },
  { id: "speaker", x: 0.662, y: 0.840, title: "Speaker", side: "right" },
  { id: "port", x: 0.312, y: 0.918, title: "Charging port", price: PRICE["Charging port"], side: "left", m: "r" },
  { id: "frame", x: 0.762, y: 0.889, title: "Frame", side: "right" },
];
const PRICED = SPOTS.filter((s) => s.price);

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const CSS = `
.xv{position:relative;overflow:hidden;overflow:clip;background:var(--xv-bg,#EEF1F6);color:#111827;padding:clamp(40px,7vh,80px) 20px}
.xv-in{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:18px;align-items:center}
@media (min-width: 900px){ .xv-in{grid-template-columns:minmax(0,0.75fr) minmax(0,1.25fr);gap:32px} }
.xv-kicker{font-size:12px;letter-spacing:.24em;color:#7a1630;font-weight:700;margin-bottom:10px}
.xv-title{font-family:'Archivo Black',sans-serif;font-size:clamp(28px,4vw,48px);line-height:1.04;margin:0;color:#0f1115;animation:xv-rise .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes xv-rise{from{opacity:0;transform:translateY(10px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
@media (prefers-reduced-motion: reduce){ .xv-title{animation:none} }
.xv-sub{color:#4b5563;font-size:15.5px;line-height:1.55;margin:14px 0 18px;max-width:440px}
.xv-list{list-style:none;padding:0;margin:0 0 20px;max-width:420px}
.xv-list li{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid rgba(17,24,39,.09);font-size:15px}
.xv-list a{color:inherit;text-decoration:none;font-weight:600}
.xv-list a:hover{color:#7a1630}
.xv-list b{color:#7a1630}
.xv-btns{display:flex;gap:10px;flex-wrap:wrap}
.xv-btns button,.xv-btns a{display:inline-flex;align-items:center;min-height:48px;padding:0 22px;border-radius:999px;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;text-decoration:none}
.xv-btns button{background:#0f1115;color:#fff;border:0}
.xv-btns a{border:1px solid rgba(17,24,39,.22);color:#0f1115;background:#fff}
.xv-frame{position:relative;width:min(100%,calc(78vh * ${W / H}),520px);margin:0 auto}
.xv-stage{position:relative;width:100%;aspect-ratio:${W}/${H};cursor:pointer;-webkit-tap-highlight-color:transparent;background:var(--xv-bg,#EEF1F6);isolation:isolate}
.xv-stage.drawn img{visibility:hidden}
.xv-stage:focus-visible{outline:2px solid #7a1630;outline-offset:6px;border-radius:16px}
.xv-stage img,.xv-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none}
.xv-stage img{mix-blend-mode:multiply}
.xv-co{position:absolute;left:0;right:0;height:0;opacity:0;transition:opacity .45s ease;pointer-events:none;z-index:2}
.xv-co.on{opacity:1}
.xv-co .xv-tag{transition:transform .55s cubic-bezier(.2,.8,.2,1),border-color .2s}
.xv-co:not(.on) .xv-tag{transform:translateY(-50%) translateX(var(--xv-in,0))}
.xv-co.l{--xv-in:10px}.xv-co.r{--xv-in:-10px}
.xv-line{transform:scaleX(0);transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.xv-co.on .xv-line{transform:scaleX(1)}
.xv-co.l .xv-line{transform-origin:right center}.xv-co.r .xv-line{transform-origin:left center}
.xv-co.plain .xv-dot{width:7px;height:7px;top:-3.5px;margin-left:-3.5px;background:#111827;box-shadow:0 0 0 2px rgba(255,255,255,.9)}
.xv-co.plain .xv-dot::after{display:none}
.xv-co.plain .xv-line{background:rgba(17,24,39,.32)}
.xv-co.plain .xv-tag{background:transparent;border-color:transparent;box-shadow:none;padding:4px 2px;font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#4b5563}
.xv-co.on .xv-tag{pointer-events:auto}
.xv-dot{position:absolute;top:-6px;margin-left:-6px;width:12px;height:12px;border-radius:50%;background:#7a1630;box-shadow:0 0 0 3px rgba(255,255,255,.85),0 0 0 6px rgba(122,22,48,.2)}
.xv-dot::after{content:"";position:absolute;left:0;top:0;width:12px;height:12px;box-sizing:border-box;border-radius:50%;border:2px solid rgba(122,22,48,.55);animation:xv-ping 1.8s ease-out infinite}
.xv-line{position:absolute;top:-.5px;height:1px;background:linear-gradient(90deg,rgba(122,22,48,.6),rgba(122,22,48,.35))}
@keyframes xv-ping{from{transform:scale(1);opacity:1}to{transform:scale(2.6);opacity:0}}
.xv-tag{position:absolute;top:0;transform:translateY(-50%);white-space:nowrap;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.96);
  border:1px solid rgba(17,24,39,.1);box-shadow:0 6px 20px rgba(17,24,39,.12);font-size:12.5px;font-weight:600;color:#0f1115;text-decoration:none}
.xv-tag b{color:#7a1630;margin-left:6px}
/* wide screens: outside the picture, in the gutters either side of it */
@media (min-width: 900px){
  .xv-frame{width:min(calc(100% - 300px),calc(78vh * ${W / H}),460px)}
  .xv-co.l .xv-tag{right:calc(100% + 12px)} .xv-co.r .xv-tag{left:calc(100% + 12px)}
  .xv-tag:hover{border-color:#7a1630}
}
/* phones: a small tag over the part, no hairline */
@media (max-width: 899px){
  .xv-line{display:none}
  .xv-tag{font-size:11px;padding:4px 8px}
  .xv-co.plain{display:none}
}

.xv-close{position:absolute;top:12px;right:12px;width:40px;height:40px;border-radius:50%;background:rgba(15,17,21,.85);color:#fff;border:none;font-size:20px;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center;transition:opacity .3s}
.xv-close:hover{background:#7a1630}
.xv-hint{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(15,17,21,.82);color:#fff;font-size:12.5px;
  font-weight:600;letter-spacing:.02em;transition:opacity .3s ease;pointer-events:none;z-index:2;white-space:nowrap}
.xv-load{position:absolute;left:12%;right:12%;bottom:1.5%;height:2px;border-radius:2px;background:rgba(17,24,39,.08);overflow:hidden;z-index:2;transition:opacity .4s}
.xv-load i{display:block;height:100%;background:#7a1630;transition:width .2s}
/* scroll mode: a tall section whose inner stage stays pinned while the phone opens */
.xv.scroll{padding:0 20px}
.xv-pin{position:sticky;top:0;min-height:100vh;min-height:100svh;display:flex;align-items:center;padding:calc(var(--xv-top,72px) + 12px) 0 16px;box-sizing:border-box}
.xv-pin>.xv-in{width:100%}
.xv.scroll .xv-frame{width:min(100%,calc((100svh - var(--xv-top,72px) - 40px) * ${W / H}),520px)}
@media (min-width: 900px){ .xv.scroll .xv-frame{width:min(calc(100% - 300px),calc((100svh - var(--xv-top,72px) - 40px) * ${W / H}),460px)} }
.xv-cue{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#4b5563;margin-top:4px}
.xv-cue i{display:block;width:16px;height:26px;border:2px solid #9ca3af;border-radius:10px;position:relative}
.xv-cue i::after{content:"";position:absolute;left:50%;top:5px;width:3px;height:6px;margin-left:-1.5px;border-radius:2px;background:#7a1630;animation:xv-cue 1.4s ease-in-out infinite}
@keyframes xv-cue{0%{transform:translateY(0);opacity:1}70%{transform:translateY(8px);opacity:0}100%{opacity:0}}
.xv-after{max-width:1120px;margin:0 auto;padding:8px 0 48px}
@media (max-width: 899px){ .xv.scroll .xv-sub,.xv.scroll .xv-text .xv-list,.xv.scroll .xv-text .xv-btns{display:none} .xv.scroll .xv-title{font-size:26px} .xv.scroll .xv-kicker{margin-bottom:6px}
  .xv.scroll .xv-in{gap:10px} .xv-pin{padding-bottom:72px} .xv.scroll .xv-frame{width:min(100%,calc((100svh - var(--xv-top,72px) - 190px) * ${W / H}))} }
@media (min-width: 900px){ .xv-after{display:none} }
@media (max-width: 899px){ .xv-text{text-align:center} .xv-sub,.xv-list{margin-left:auto;margin-right:auto} .xv-btns{justify-content:center} }
`;

export default function DeviceShowcase() {
  const section = useRef(null), track = useRef(null), stage = useRef(null), canvas = useRef(null);
  const [moved, setMoved] = useState(false); // scroll mode: has the phone started opening
  const [phase, setPhase] = useState(0);      // scroll mode: which line of the story to show
  // Frames are kept as small compressed files and only a handful are decoded at a time
  // (decoded, each is ~2-4 MB of memory; all 80 at once made phones stall or reload the page).
  const blobs = useRef([]), decoded = useRef(new Map()), pending = useRef(new Map());
  const frame = useRef(0), shown = useRef(-1), anim = useRef(0), wantOpen = useRef(false);
  const [open, setOpen] = useState(false);       // target state
  const [settled, setSettled] = useState(false); // fully open and still: show hotspots
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const step = useRef(1);
  const [mode] = useState(pickMode);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 900);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 900); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const scrollMode = mode === "scroll" && !reduced;

  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq && mq.matches) setReduced(true);
    tintRef.current = pickTint();
    section.current?.style.setProperty("--xv-bg", tintRef.current);
    step.current = 2; // faster load: every 2nd frame
    // the pinned stage sits just under the sticky header
    const nav = document.querySelector(".cs-glass-nav");
    const setTop = () => { if (nav && section.current) section.current.style.setProperty("--xv-top", `${nav.getBoundingClientRect().bottom > 0 ? nav.offsetHeight : 0}px`); };
    setTop(); window.addEventListener("resize", setTop);
    return () => window.removeEventListener("resize", setTop);
  }, []);

  const keep = () => (window.innerWidth < 760 ? 8 : 36); // decoded frames held in memory
  const tier = useRef("sd"); // which frame size to load: picked from the canvas size
  const decode = useCallback((i) => {
    if (decoded.current.has(i)) return Promise.resolve(decoded.current.get(i));
    if (pending.current.has(i)) return pending.current.get(i);
    const blob = blobs.current[i]; if (!blob) return Promise.resolve(null);
    const c = canvas.current;
    const job = (async () => {
      let bmp = null;
      try {
        if ("createImageBitmap" in window) {
          // decode straight to the canvas size where supported: less memory, sharper downscale
          try { bmp = c && c.width ? await createImageBitmap(blob, { resizeWidth: c.width, resizeHeight: c.height, resizeQuality: "high" }) : await createImageBitmap(blob); }
          catch (e) { bmp = await createImageBitmap(blob); }
        } else {
          bmp = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(blob); });
        }
      } catch (e) { bmp = null; }
      pending.current.delete(i);
      if (!bmp) return null;
      const d = decoded.current; d.set(i, bmp);
      // forget the frames furthest from where the animation is now
      while (d.size > keep()) {
        let far = -1, fd = -1;
        for (const k of d.keys()) { const dist = Math.abs(k - frame.current); if (dist > fd) { fd = dist; far = k; } }
        const b = d.get(far); d.delete(far); if (b && b.close) b.close();
      }
      return bmp;
    })();
    pending.current.set(i, job);
    return job;
  }, []);

  const tintRef = useRef(TINTS[SHOWCASE_BG]);
  const paint = useCallback((i, bmp) => {
    const c = canvas.current; if (!c || !bmp) return;
    // the section colour and the frame are multiplied inside the canvas itself (the frame's
    // backdrop is pure white, so it becomes exactly the section colour). Done here rather than
    // with a CSS blend: no seam at the canvas edge, and cheaper for slower laptops to composite.
    const ctx = c.getContext("2d");
    ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = tintRef.current; ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "multiply"; ctx.drawImage(bmp, 0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
    shown.current = i;
    // the canvas now covers the still underneath; hide it so the two don't multiply together
    stage.current?.classList.add("drawn");
  }, []);

  // nearest frame we actually have the file for (phones load every 2nd one)
  const nearest = (i) => { for (let d = 0; d < COUNT; d++) { if (blobs.current[i - d]) return i - d; if (blobs.current[i + d]) return i + d; } return -1; };

  const draw = useCallback((i) => {
    const n = nearest(i); if (n < 0) return;
    const ready = decoded.current.get(n);
    if (ready) { if (shown.current !== n) paint(n, ready); }
    else decode(n).then((b) => { if (b && nearest(frame.current) === n) paint(n, b); });
    // decode a few frames ahead in the direction of travel
    const dir = i >= shown.current ? 1 : -1;
    for (let k = 1; k <= 3; k++) { const m = nearest(Math.min(COUNT - 1, Math.max(0, i + dir * k * step.current))); if (m >= 0) decode(m); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decode, paint]);

  // size the canvas for the screen
  useEffect(() => {
    const c = canvas.current, s = stage.current; if (!c || !s) return undefined;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(s.clientWidth * dpr); c.height = Math.round(s.clientHeight * dpr);
      const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
      decoded.current.forEach((b) => b && b.close && b.close()); decoded.current.clear(); shown.current = -1;
      draw(frame.current);
    };
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [draw]);

  // load the frames once the section is near the screen
  useEffect(() => {
    if (reduced) return undefined;
    const el = stage.current; if (!el) return undefined;
    let cancelled = false;
    const load = async () => {
      // big or high-density canvases get the sharp set; phones the lighter one
      tier.current = (canvas.current?.width || 0) > 700 ? "hd" : "sd";
      const idx = [];
      for (let i = 0; i < COUNT; i += step.current) idx.push(i);
      if (idx[idx.length - 1] !== COUNT - 1) idx.push(COUNT - 1);
      let done = 0;
      const one = async (i) => {
        try {
          const res = await fetch(SRC(i, tier.current)); if (!res.ok) return;
          const blob = await res.blob();
          if (cancelled) return;
          blobs.current[i] = blob; done += 1; setLoaded(done / idx.length);
          if (i === 0) draw(0);
        } catch (e) { /* a missing frame is skipped; neighbours cover it */ }
      };
      await one(idx[0]);
      // the rest, a few at a time
      const rest = idx.slice(1); let p = 0;
      await Promise.all(Array.from({ length: 6 }, async () => { while (p < rest.length) { const i = rest[p++]; await one(i); } }));
      if (!cancelled) setReady(true);
    };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [reduced, draw]);

  const play = useCallback((toOpen) => {
    cancelAnimationFrame(anim.current);
    wantOpen.current = toOpen; setOpen(toOpen); setSettled(false);
    const from = frame.current, to = toOpen ? COUNT - 1 : 0;
    const dur = Math.max(250, (DURATION * Math.abs(to - from)) / (COUNT - 1));
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const f = Math.round(from + (to - from) * ease(t));
      if (f !== frame.current) { frame.current = f; draw(f); }
      if (t < 1) anim.current = requestAnimationFrame(tick);
      else if (toOpen) setSettled(true);
    };
    anim.current = requestAnimationFrame(tick);
  }, [draw]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // scroll: frame follows how far you've scrolled through the (tall) section, eased so a
  // flick of the wheel still glides. Fully open for the last stretch, with the hotspots.
  useEffect(() => {
    if (!scrollMode) return undefined;
    let raf = 0, cur = frame.current, alive = true;
    const target = () => {
      const el = track.current; if (!el) return 0;
      const r = el.getBoundingClientRect(), run = r.height - window.innerHeight;
      const p = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 0;
      const q = Math.min(1, Math.max(0, (p - 0.06) / 0.78)); // 6%–84% of the run opens it, the rest holds it open
      return q * (COUNT - 1);
    };
    let last = 0;
    const tick = (now) => {
      if (!alive) return;
      const dt = last ? Math.min(64, now - last) : 16; last = now;
      const t = target();
      // glide toward the scroll position, but never faster than a full open in MIN_OPEN_MS
      const maxStep = (dt / MIN_OPEN_MS) * (COUNT - 1);
      const want = (t - cur) * 0.12;
      cur += Math.sign(want) * Math.min(Math.abs(want) + 0.02, maxStep);
      if (Math.abs(t - cur) < 0.05) cur = t;
      const f = Math.round(cur);
      if (f !== frame.current) { frame.current = f; draw(f); }
      const isOpen = f >= COUNT - 2;
      setMoved((m) => (m === f > 2 ? m : f > 2));
      const ph = f >= COUNT - 2 ? 3 : f > COUNT * 0.6 ? 2 : f > 4 ? 1 : 0;
      setPhase((p) => (p === ph ? p : ph));
      wantOpen.current = isOpen;
      setOpen((o) => (o === isOpen ? o : isOpen)); setSettled((v) => (v === isOpen ? v : isOpen));
      if (Math.abs(t - cur) > 0) raf = requestAnimationFrame(tick); else { raf = 0; last = 0; }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener("scroll", kick, { passive: true }); window.addEventListener("resize", kick);
    kick();
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("scroll", kick); window.removeEventListener("resize", kick); };
  }, [scrollMode, draw, ready]);

  // auto: opens on its own once mostly in view, closes again when it has left
  useEffect(() => {
    if (mode !== "auto" || reduced || !ready) return undefined;
    const el = stage.current; if (!el) return undefined;
    let timer = 0;
    const io = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      if (e.intersectionRatio >= 0.6 && !wantOpen.current) { clearTimeout(timer); timer = setTimeout(() => play(true), 350); }
      else if (e.intersectionRatio < 0.12 && wantOpen.current) { clearTimeout(timer); play(false); }
    }, { threshold: [0, 0.12, 0.6, 1] });
    io.observe(el);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, [mode, reduced, ready, play]);

  const toggle = () => {
    if (!ready) return;
    if (scrollMode) {
      // scroll the page to the open (or closed) end of the section instead of fighting the scroll
      const el = track.current; const r = el.getBoundingClientRect(); const top = window.scrollY + r.top;
      window.scrollTo({ top: wantOpen.current ? top : top + (r.height - window.innerHeight) * 0.86, behavior: "smooth" });
      return;
    }
    play(!wantOpen.current);
  };

  const list = (
    <ul className="xv-list">
      {PRICED.map((s) => (
        <li key={s.id}><a href={`/repairs?part=${s.id}`}>{s.title}{s.note ? ` (${s.note})` : ""}</a><b>{s.price ? `from $${s.price}` : "Free quote"}</b></li>
      ))}
    </ul>
  );

  return (
    <section ref={section} className={`xv${scrollMode ? " scroll" : ""}`} aria-label="Look inside an iPhone — the repairs we do">
      <style>{CSS}</style>
      <div ref={track} style={scrollMode ? { height: wide ? "380vh" : "340vh" } : undefined}>
      <div className={scrollMode ? "xv-pin" : undefined}>
      <div className="xv-in">
        <div className="xv-text">
          <div className="xv-kicker">INSIDE EVERY REPAIR</div>
          {/* scroll mode tells it in beats as the phone comes apart; each line fades in */}
          <h2 className="xv-title" key={scrollMode ? phase : open ? "o" : "c"}>{reduced || open || (scrollMode && phase === 3) ? "Every part. Fixed right here."
            : scrollMode ? ["Scroll to look inside.", "Precision, layer by layer.", "Every part, accounted for."][phase]
            : mode === "auto" ? "Look inside your phone." : "Tap the phone to look inside."}</h2>
          <p className="xv-sub">Screen, battery, cameras, charging port, logic board — we repair all of it in-store in Sydney, most jobs the same day.</p>
          {list}
          <div className="xv-btns">
            {!reduced && <button type="button" onClick={toggle} aria-pressed={open} disabled={!ready} style={{ opacity: ready ? 1 : 0.6 }}>{open ? "Put it back together" : ready ? "Open the phone" : "Loading…"}</button>}
            <a href="/repairs">Book a repair</a>
          </div>
        </div>

        <div className="xv-frame">
        <div ref={stage} className="xv-stage" role={reduced ? undefined : "button"} tabIndex={reduced ? undefined : 0} aria-pressed={reduced ? undefined : open}
          aria-label={reduced ? undefined : open ? "Close the phone" : "Open the phone to see its parts"}
          onClick={reduced ? undefined : toggle} onKeyDown={(e) => { if (!reduced && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }}>
          {/* first frame shows straight away (and is the still image for reduced motion) */}
          <img src={reduced ? SRC(COUNT - 1, "hd") : SRC(0)} alt="An iPhone coming apart into its parts: cameras, display, logic board, battery, speakers and charging port" width={W} height={H} fetchpriority="high" decoding="async" />
          {!reduced && <canvas ref={canvas} aria-hidden="true" />}
          {!reduced && open && <button type="button" className="xv-close" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label="Close">×</button>}

          {!reduced && <div className="xv-hint" style={{ opacity: open || (scrollMode && moved) ? 0 : 1 }}>{!ready ? "Loading…" : scrollMode ? <span className="xv-cue" style={{ color: "#fff", margin: 0 }}><i />Scroll to open</span> : mode === "auto" ? "Tap to replay" : "Tap to open"}</div>}
          {!reduced && <div className="xv-load" style={{ opacity: ready ? 0 : 1 }}><i style={{ width: `${Math.round(loaded * 100)}%` }} /></div>}
        </div>
        {/* outside the masked stage so the side prices aren't clipped */}
        {SPOTS.map((s, n) => {
          const on = settled || reduced;
          const plain = !s.price;
          if (plain && !wide) return null; // phones: only the parts we price
          const dir = wide ? (s.side === "left" ? "l" : "r") : s.m;
          const x = `${s.x * 100}%`;
          const tagPos = wide ? undefined : dir === "r" ? { left: `calc(${x} + 12px)` } : { right: `calc(${100 - s.x * 100}% + 12px)` };
          const linePos = dir === "l" ? { left: -12, width: `calc(${x} + 12px)` } : { left: x, right: -12 };
          return (
            // labels reveal top to bottom, a beat apart, as the phone settles open
            <div key={s.id} className={`xv-co ${dir}${plain ? " plain" : ""}${on ? " on" : ""}`} style={{ top: `${s.y * 100}%`, transitionDelay: on ? `${n * 70}ms` : "0ms" }}>
              <i className="xv-line" style={{ ...linePos, transitionDelay: on ? `${n * 70}ms` : "0ms" }} />
              <i className="xv-dot" style={{ left: x }} />
              {plain
                ? <span className="xv-tag" style={tagPos}>{s.title}</span>
                : <a className="xv-tag" style={{ ...tagPos, transitionDelay: on ? `${n * 70}ms` : "0ms" }} href={`/repairs?part=${s.id}`} tabIndex={on ? 0 : -1}>{s.title}<b>${s.price}+</b></a>}
            </div>
          );
        })}
        </div>
      </div>
      </div>
      </div>
      {scrollMode && <div className="xv-after">{list}<div className="xv-btns" style={{ justifyContent: "center" }}><a href="/repairs">Book a repair</a></div></div>}
    </section>
  );
}
