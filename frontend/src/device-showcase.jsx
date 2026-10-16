// "Tap to look inside": a photoreal exploded view of an iPhone, played from a frame
// sequence (/photos/exploded/000–079.webp). Tap the phone (or the button) and it comes
// apart; tap again and it plays backwards and closes. Once open, priced hotspots mark
// the parts we repair.
//
// How it stays smooth (the same technique Apple uses for its product pages):
//  - frames are drawn on a <canvas>, decoded ahead of time with createImageBitmap,
//  - the first frame is a normal <img> that shows immediately; the rest load in the
//    background only when the section is close to the screen,
//  - the canvas is sized for the screen's pixel ratio (capped at 2) so it stays sharp,
//  - phones get every second frame (half the download, still smooth over 1.4 s).
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
const COUNT = 80, W = 720, H = 1280;
const SRC = (i) => `/photos/exploded/${String(i).padStart(3, "0")}.webp`;
const DURATION = 1400; // ms for a full open or close
export const SHOWCASE_MODE = "scroll";
const pickMode = () => {
  try { const m = new URLSearchParams(window.location.search).get("xv"); if (m === "scroll" || m === "auto" || m === "tap") return m; } catch (e) { /* no window */ }
  return SHOWCASE_MODE;
};

// Hotspots on the fully opened phone, as fractions of the frame (x, y).
const SPOTS = [
  { id: "camera", x: 0.45, y: 0.235, title: "Camera", price: PRICE["Camera repair"], side: "left" },
  { id: "screen", x: 0.5, y: 0.345, title: "Screen", price: PRICE["Screen replacement"], side: "right" },
  { id: "board", x: 0.66, y: 0.6, title: "Logic board", price: PRICE["Water damage diagnosis"], side: "left", note: "water damage check" },
  { id: "battery", x: 0.48, y: 0.7, title: "Battery", price: PRICE["Battery replacement"], side: "left" },
  { id: "port", x: 0.34, y: 0.896, title: "Charging port", price: PRICE["Charging port"], side: "right" },
];

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const CSS = `
.xv{position:relative;overflow:hidden;overflow:clip;background:var(--xv-bg,#fefcfd);transition:background-color .2s linear;color:#111827;padding:clamp(40px,7vh,80px) 20px}
.xv-in{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:18px;align-items:center}
@media (min-width: 900px){ .xv-in{grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:40px} }
.xv-kicker{font-size:12px;letter-spacing:.24em;color:#7a1630;font-weight:700;margin-bottom:10px}
.xv-title{font-family:'Archivo Black',sans-serif;font-size:clamp(28px,4vw,48px);line-height:1.04;margin:0;color:#0f1115}
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
.xv-stage{position:relative;width:min(100%,calc(78vh * ${W / H}),520px);aspect-ratio:${W}/${H};margin:0 auto;cursor:pointer;-webkit-tap-highlight-color:transparent;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 3%,#000 97%,transparent),linear-gradient(180deg,transparent,#000 2%,#000 98%,transparent);-webkit-mask-composite:source-in;
  mask-image:linear-gradient(90deg,transparent,#000 3%,#000 97%,transparent),linear-gradient(180deg,transparent,#000 2%,#000 98%,transparent);mask-composite:intersect}
.xv-stage:focus-visible{outline:2px solid #7a1630;outline-offset:6px;border-radius:16px}
.xv-stage img,.xv-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none}
.xv-spot{position:absolute;transform:translate(-50%,-50%);opacity:0;transition:opacity .35s ease;pointer-events:none;z-index:2}
.xv-spot.on{opacity:1;pointer-events:auto}
.xv-dot{display:block;width:14px;height:14px;border-radius:50%;background:#7a1630;box-shadow:0 0 0 4px rgba(122,22,48,.18)}
.xv-dot::after{content:"";position:absolute;left:0;top:0;width:14px;height:14px;border-radius:50%;border:2px solid rgba(122,22,48,.55);animation:xv-ping 1.8s ease-out infinite}
@keyframes xv-ping{from{transform:scale(1);opacity:1}to{transform:scale(2.6);opacity:0}}
.xv-tag{position:absolute;top:50%;transform:translateY(-50%);white-space:nowrap;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.92);
  border:1px solid rgba(17,24,39,.1);box-shadow:0 6px 20px rgba(17,24,39,.12);font-size:12.5px;font-weight:600;color:#0f1115;text-decoration:none}
.xv-tag b{color:#7a1630;margin-left:6px}
.xv-tag.r{left:22px}.xv-tag.l{right:22px}
.xv-hint{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(15,17,21,.82);color:#fff;font-size:12.5px;
  font-weight:600;letter-spacing:.02em;transition:opacity .3s ease;pointer-events:none;z-index:2;white-space:nowrap}
.xv-load{position:absolute;left:12%;right:12%;bottom:1.5%;height:2px;border-radius:2px;background:rgba(17,24,39,.08);overflow:hidden;z-index:2;transition:opacity .4s}
.xv-load i{display:block;height:100%;background:#7a1630;transition:width .2s}
/* scroll mode: a tall section whose inner stage stays pinned while the phone opens */
.xv.scroll{padding:0 20px}
.xv-pin{position:sticky;top:0;min-height:100vh;min-height:100svh;display:flex;align-items:center;padding:calc(var(--xv-top,72px) + 12px) 0 16px;box-sizing:border-box}
.xv-pin>.xv-in{width:100%}
.xv.scroll .xv-stage{width:min(100%,calc((100svh - var(--xv-top,72px) - 40px) * ${W / H}),520px)}
.xv-cue{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#4b5563;margin-top:4px}
.xv-cue i{display:block;width:16px;height:26px;border:2px solid #9ca3af;border-radius:10px;position:relative}
.xv-cue i::after{content:"";position:absolute;left:50%;top:5px;width:3px;height:6px;margin-left:-1.5px;border-radius:2px;background:#7a1630;animation:xv-cue 1.4s ease-in-out infinite}
@keyframes xv-cue{0%{transform:translateY(0);opacity:1}70%{transform:translateY(8px);opacity:0}100%{opacity:0}}
.xv-after{max-width:1120px;margin:0 auto;padding:8px 0 48px}
@media (max-width: 899px){ .xv.scroll .xv-sub,.xv.scroll .xv-text .xv-list,.xv.scroll .xv-text .xv-btns{display:none} .xv.scroll .xv-title{font-size:26px} .xv.scroll .xv-kicker{margin-bottom:6px}
  .xv.scroll .xv-in{gap:10px} .xv-pin{padding-bottom:72px} .xv.scroll .xv-stage{width:min(100%,calc((100svh - var(--xv-top,72px) - 190px) * ${W / H}))} }
@media (min-width: 900px){ .xv-after{display:none} }
@media (max-width: 899px){ .xv-text{text-align:center} .xv-sub,.xv-list{margin-left:auto;margin-right:auto} .xv-btns{justify-content:center} .xv-tag{font-size:11.5px;padding:5px 8px} }
`;

export default function DeviceShowcase() {
  const section = useRef(null), track = useRef(null), stage = useRef(null), canvas = useRef(null);
  const [moved, setMoved] = useState(false); // scroll mode: has the phone started opening
  const bitmaps = useRef([]), frame = useRef(0), anim = useRef(0), wantOpen = useRef(false);
  const [open, setOpen] = useState(false);       // target state
  const [settled, setSettled] = useState(false); // fully open and still: show hotspots
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const step = useRef(1);
  const [mode] = useState(pickMode);
  const scrollMode = mode === "scroll" && !reduced;

  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq && mq.matches) { setReduced(true); section.current?.style.setProperty("--xv-bg", "rgb(243,240,241)"); }
    step.current = window.innerWidth < 760 ? 2 : 1;
    // the pinned stage sits just under the sticky header
    const nav = document.querySelector(".cs-glass-nav");
    const setTop = () => { if (nav && section.current) section.current.style.setProperty("--xv-top", `${nav.getBoundingClientRect().bottom > 0 ? nav.offsetHeight : 0}px`); };
    setTop(); window.addEventListener("resize", setTop);
    return () => window.removeEventListener("resize", setTop);
  }, []);

  const draw = useCallback((i) => {
    const c = canvas.current; if (!c) return;
    const bmp = bitmaps.current[i] || bitmaps.current.slice(0, i + 1).reverse().find(Boolean);
    if (!bmp) return;
    const ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    // the video's backdrop shifts from white to pale grey as it opens: match the section to it
    try {
      const d = ctx.getImageData(Math.round(c.width * 0.02), Math.round(c.height * 0.5), 1, 1).data;
      if (section.current) section.current.style.setProperty("--xv-bg", `rgb(${d[0]},${d[1]},${d[2]})`);
    } catch (e) { /* tainted canvas can't happen (same origin); ignore if it does */ }
  }, []);

  // size the canvas for the screen
  useEffect(() => {
    const c = canvas.current, s = stage.current; if (!c || !s) return undefined;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(s.clientWidth * dpr); c.height = Math.round(s.clientHeight * dpr);
      const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
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
      const idx = [];
      for (let i = 0; i < COUNT; i += step.current) idx.push(i);
      if (idx[idx.length - 1] !== COUNT - 1) idx.push(COUNT - 1);
      let done = 0;
      const one = async (i) => {
        try {
          const res = await fetch(SRC(i)); const blob = await res.blob();
          const bmp = "createImageBitmap" in window ? await createImageBitmap(blob) : await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(blob); });
          if (cancelled) return;
          bitmaps.current[i] = bmp; done += 1; setLoaded(done / idx.length);
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
      const q = Math.min(1, Math.max(0, (p - 0.04) / 0.78)); // 4%–82% of the run opens it, the rest holds it open
      return q * (COUNT - 1);
    };
    const tick = () => {
      if (!alive) return;
      const t = target();
      cur += (t - cur) * 0.18;
      if (Math.abs(t - cur) < 0.05) cur = t;
      const f = Math.round(cur);
      if (f !== frame.current) { frame.current = f; draw(f); }
      const isOpen = f >= COUNT - 2;
      setMoved((m) => (m === f > 2 ? m : f > 2));
      wantOpen.current = isOpen;
      setOpen((o) => (o === isOpen ? o : isOpen)); setSettled((v) => (v === isOpen ? v : isOpen));
      raf = Math.abs(t - cur) > 0 ? requestAnimationFrame(tick) : 0;
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
      {SPOTS.map((s) => (
        <li key={s.id}><a href={`/repairs?part=${s.id}`}>{s.title}{s.note ? ` (${s.note})` : ""}</a><b>{s.price ? `from $${s.price}` : "Free quote"}</b></li>
      ))}
    </ul>
  );

  return (
    <section ref={section} className={`xv${scrollMode ? " scroll" : ""}`} aria-label="Look inside an iPhone — the repairs we do">
      <style>{CSS}</style>
      <div ref={track} style={scrollMode ? { height: "260vh" } : undefined}>
      <div className={scrollMode ? "xv-pin" : undefined}>
      <div className="xv-in">
        <div className="xv-text">
          <div className="xv-kicker">INSIDE EVERY REPAIR</div>
          <h2 className="xv-title">{reduced || open ? "Every part. Fixed right here." : scrollMode ? "Scroll to look inside." : mode === "auto" ? "Look inside your phone." : "Tap the phone to look inside."}</h2>
          <p className="xv-sub">Screen, battery, cameras, charging port, logic board — we repair all of it in-store in Sydney, most jobs the same day.</p>
          {list}
          <div className="xv-btns">
            {!reduced && <button type="button" onClick={toggle} aria-pressed={open} disabled={!ready} style={{ opacity: ready ? 1 : 0.6 }}>{open ? "Put it back together" : ready ? "Open the phone" : "Loading…"}</button>}
            <a href="/repairs">Book a repair</a>
          </div>
        </div>

        <div ref={stage} className="xv-stage" role={reduced ? undefined : "button"} tabIndex={reduced ? undefined : 0} aria-pressed={reduced ? undefined : open}
          aria-label={reduced ? undefined : open ? "Close the phone" : "Open the phone to see its parts"}
          onClick={reduced ? undefined : toggle} onKeyDown={(e) => { if (!reduced && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }}>
          {/* first frame shows straight away (and is the still image for reduced motion) */}
          <img src={reduced ? SRC(COUNT - 1) : SRC(0)} alt="An iPhone coming apart into its parts: cameras, display, logic board, battery, speakers and charging port" width={W} height={H} fetchpriority="high" decoding="async" />
          {!reduced && <canvas ref={canvas} aria-hidden="true" />}
          {SPOTS.map((s) => (
            <div key={s.id} className={`xv-spot${settled || reduced ? " on" : ""}`} style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}>
              <i className="xv-dot" />
              <a className={`xv-tag ${s.side === "left" ? "l" : "r"}`} href={`/repairs?part=${s.id}`} onClick={(e) => e.stopPropagation()} tabIndex={settled || reduced ? 0 : -1}>
                {s.title}<b>{s.price ? `$${s.price}+` : "Quote"}</b>
              </a>
            </div>
          ))}
          {!reduced && <div className="xv-hint" style={{ opacity: open || (scrollMode && moved) ? 0 : 1 }}>{!ready ? "Loading…" : scrollMode ? <span className="xv-cue" style={{ color: "#fff", margin: 0 }}><i />Scroll to open</span> : mode === "auto" ? "Tap to replay" : "Tap to open"}</div>}
          {!reduced && <div className="xv-load" style={{ opacity: ready ? 0 : 1 }}><i style={{ width: `${Math.round(loaded * 100)}%` }} /></div>}
        </div>
      </div>
      </div>
      </div>
      {scrollMode && <div className="xv-after">{list}<div className="xv-btns" style={{ justifyContent: "center" }}><a href="/repairs">Book a repair</a></div></div>}
    </section>
  );
}
