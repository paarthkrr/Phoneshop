// "Look around a real iPhone": a scroll-driven 3D turn of a phone photographed on
// our own bench (front and back cut-outs in /photos/device). The phone is a real
// CSS 3D object — two photo faces, a solid rounded edge built from stacked layers,
// and flat side panels with the buttons and charging port — so it turns smoothly
// with no 3D library and stays sharp at any size. As it turns, each repairable
// part gets a label with its starting price from repair-prices.js.
//
// No JS / reduced motion: a still front-and-back view with the same price list.
import React, { useEffect, useRef, useState } from "react";
import { REPAIRS_BY_DEVICE } from "./repair-prices.js";

const PRICE = Object.fromEntries((REPAIRS_BY_DEVICE.Phone || []).map((r) => [r.name, r.from]));
const IMG_FRONT = "/photos/device/iphone-blue-front.webp";
const IMG_BACK = "/photos/device/iphone-blue-back.webp";

// Phone proportions (iPhone 17 Pro, measured on the photos).
const ASPECT = 2.09, RADIUS = 0.168, THICK = 0.122;

// Labels: where they point on the phone (fractions of width/height from the centre;
// z: +1 front face, -1 back face, 0 middle) and which scene they belong to.
const PARTS = [
  { id: "screen", scene: 0, x: -0.05, y: -0.18, z: 1, side: "left", title: "Screen", price: PRICE["Screen replacement"], note: "Cracked glass, lines, no touch" },
  { id: "battery", scene: 0, x: 0.1, y: 0.16, z: 0.2, side: "right", title: "Battery", price: PRICE["Battery replacement"], note: "Drains fast, health under 80%" },
  { id: "camera", scene: 1, x: 0.27, y: -0.36, z: -1, side: "right", title: "Camera", price: PRICE["Camera repair"], note: "Blurry, cracked lens, won't focus" },
  { id: "backglass", scene: 1, x: -0.05, y: 0.18, z: -1, side: "left", title: "Back glass", price: null, note: "Shattered back — free quote" },
  { id: "port", scene: 2, x: 0, y: 0.5, z: 0, side: "right", title: "Charging port", price: PRICE["Charging port"], note: "Loose cable, slow or no charge" },
  { id: "water", scene: 2, x: -0.18, y: -0.05, z: 0, side: "left", title: "Water damage", price: PRICE["Water damage diagnosis"], note: "Dropped in water? Bring it in fast" },
];
const SCENES = [
  { kicker: "INSIDE EVERY REPAIR", title: "Every part. Fixed right here.", sub: "Scroll to look around a real iPhone from our Sydney bench." },
  { kicker: "TURN IT OVER", title: "Cameras and back glass, sorted.", sub: "Genuine-quality parts, most repairs done same day." },
  { kicker: "DOWN TO THE DETAILS", title: "Ports, water damage, the lot.", sub: "Free check before we start — you approve every price." },
];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a, b, t) => a + (b - a) * t;

// Pose of the phone (degrees) along the scroll, p in 0..1.
function poseAt(p) {
  // three scenes; each turns in during its first 40% and holds for the rest
  const k1 = ease(clamp((p - 0.26) / 0.16)); // front -> back
  const k2 = ease(clamp((p - 0.6) / 0.16));  // back  -> bottom three-quarter
  const intro = ease(clamp(p / 0.12));
  let ry = mix(-24, -16, intro), rx = mix(14, 8, intro);
  ry = mix(ry, 196, k1); rx = mix(rx, 10, k1);
  ry = mix(ry, 158, k2); rx = mix(rx, 50, k2);
  const scene = p < 0.36 ? 0 : p < 0.7 ? 1 : 2;
  return { ry, rx, scene, rise: intro };
}

function project(pt, ry, rx, persp) {
  const a = (ry * Math.PI) / 180, b = (rx * Math.PI) / 180;
  // rotateX(rx) then rotateY(ry), matching the CSS transform order below
  let { x, y, z } = pt;
  const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
  const y2 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
  const s = persp / (persp - z2);
  return { x: x1 * s, y: y2 * s, z: z2 };
}

const CSS = `
.ds-wrap{position:relative;background:radial-gradient(120% 70% at 50% 30%,#141a2b 0%,#07080b 60%);color:#fff;height:330vh}
.ds-stick{position:sticky;top:0;height:100vh;height:100svh;overflow:hidden;display:grid;grid-template-columns:1fr;place-items:center}
.ds-copy{position:absolute;top:clamp(100px,13vh,130px);left:0;right:0;text-align:center;padding:0 20px;pointer-events:none;z-index:3}
.ds-kicker{font-size:12px;letter-spacing:.24em;color:#A9BDF5;font-weight:700;margin-bottom:10px}
.ds-title{font-family:'Archivo Black',sans-serif;font-size:clamp(26px,4.4vw,52px);line-height:1.04;margin:0 auto;max-width:14ch;
  background:linear-gradient(180deg,#fff 30%,#b9c3d9);-webkit-background-clip:text;background-clip:text;color:transparent}
.ds-sub{color:rgba(255,255,255,.66);font-size:clamp(14px,1.4vw,16px);margin:12px auto 0;max-width:420px}
.ds-copy > div{transition:opacity .5s ease,transform .6s cubic-bezier(.16,1,.3,1)}
.ds-scene-txt{position:absolute;left:0;right:0;top:0}
.ds-stage{position:relative;width:var(--w);height:calc(var(--w) * ${ASPECT});perspective:1700px;margin-top:clamp(120px,20vh,190px)}
.ds-glow{position:absolute;inset:-30% -60%;background:radial-gradient(closest-side,rgba(74,118,255,.28),rgba(122,22,48,.18) 55%,transparent 75%);filter:blur(10px);pointer-events:none}
.ds-phone{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.ds-face{position:absolute;inset:0;border-radius:calc(var(--w) * ${RADIUS});overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.ds-face img{width:100%;height:100%;display:block;object-fit:fill;user-select:none;-webkit-user-drag:none}
.ds-face::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 32%,rgba(255,255,255,0) 64%,rgba(255,255,255,.08) 100%);
  opacity:var(--sheen,0.6);mix-blend-mode:screen;pointer-events:none}
.ds-slice{position:absolute;inset:0;border-radius:calc(var(--w) * ${RADIUS});background:linear-gradient(90deg,#4f5d7c,#9aaacb 20%,#c8d3ea 50%,#8b9bbd 80%,#4c5a78)}
.ds-panel{position:absolute;background:linear-gradient(180deg,#5e6d8f,#b4c2e0 45%,#8695b8);transform-origin:center}
.ds-btn{position:absolute;background:linear-gradient(180deg,#7d8db0,#c9d4ec 50%,#7a8aac);border-radius:3px}
.ds-port{position:absolute;left:50%;top:50%;width:18%;height:42%;transform:translate(-50%,-50%);background:#0b0d12;border-radius:999px;box-shadow:inset 0 1px 2px rgba(255,255,255,.25)}
.ds-holes{position:absolute;top:50%;height:22%;transform:translateY(-50%);display:flex;gap:6%}
.ds-holes i{display:block;width:5px;height:100%;border-radius:50%;background:#0b0d12}
.ds-labels{position:absolute;inset:0;pointer-events:none;z-index:4}
.ds-lab{position:absolute;left:0;top:0;opacity:0;transition:opacity .45s ease;pointer-events:none}
.ds-lab.on{opacity:1;pointer-events:auto}
.ds-dot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(120,160,255,.35),0 0 18px rgba(120,160,255,.9)}
.ds-dot::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:1px solid rgba(160,190,255,.6);animation:ds-ping 2s ease-out infinite}
@keyframes ds-ping{from{transform:scale(.6);opacity:1}to{transform:scale(1.8);opacity:0}}
.ds-line{position:absolute;height:1px;background:linear-gradient(90deg,rgba(169,189,245,.9),rgba(169,189,245,.25));transform-origin:0 0}
.ds-card{position:absolute;width:210px;padding:12px 14px;border-radius:14px;background:rgba(18,22,36,.62);border:1px solid rgba(255,255,255,.14);
  -webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);box-shadow:0 18px 40px rgba(0,0,0,.45);text-decoration:none;color:#fff;
  transform:translateY(-50%)}
.ds-card b{display:block;font-size:15px;margin-bottom:2px}
.ds-card span{display:block;font-size:12.5px;color:rgba(255,255,255,.66);line-height:1.35}
.ds-card em{font-style:normal;font-weight:700;color:#A9BDF5;font-size:14px;float:right}
.ds-card:hover{border-color:rgba(169,189,245,.7)}
.ds-cta{position:absolute;bottom:clamp(22px,5vh,48px);left:0;right:0;display:flex;gap:10px;justify-content:center;z-index:5;transition:opacity .5s ease,transform .5s ease}
.ds-cta a{display:inline-flex;align-items:center;min-height:46px;padding:0 20px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none}
.ds-cta a:first-child{background:#fff;color:#0b0d12}
.ds-cta a:last-child{border:1px solid rgba(255,255,255,.35);color:#fff}
.ds-progress{position:absolute;right:clamp(12px,3vw,32px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:5}
.ds-progress i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.25);transition:background .3s,transform .3s}
.ds-progress i.on{background:#A9BDF5;transform:scale(1.5)}
.ds-dock{display:none}
@media (min-width: 900px){
  .ds-copy{top:50%;height:280px;left:max(5vw,calc(50vw - 600px));right:auto;width:min(36vw,440px);text-align:left;transform:translateY(-50%);padding:0}
  .ds-scene-txt{top:0;transform-origin:left}
  .ds-copy .ds-title,.ds-copy .ds-sub{margin-left:0}
  .ds-stage{margin-top:0;margin-left:min(30vw,380px)}
}
@media (max-width: 899px){
  .ds-line,.ds-card{display:none}
  .ds-cta{display:none}
  .ds-dock{display:flex;position:absolute;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));gap:8px;z-index:5}
  .ds-dock a{flex:1;padding:10px 12px;border-radius:14px;background:rgba(18,22,36,.7);border:1px solid rgba(255,255,255,.14);
    -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;text-decoration:none;transition:opacity .35s ease,transform .35s ease}
  .ds-dock b{display:block;font-size:14px}
  .ds-dock em{font-style:normal;color:#A9BDF5;font-weight:700;font-size:13px}
}
.ds-static{background:#07080b;color:#fff;padding:56px 20px;text-align:center}
.ds-static-row{display:flex;gap:18px;justify-content:center;margin:24px 0}
.ds-static-row img{width:min(38vw,190px);height:auto}
.ds-static ul{list-style:none;padding:0;margin:0 auto;max-width:420px;text-align:left}
.ds-static li{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1)}
`;

function Edge({ w }) {
  const t = w * THICK, h = w * ASPECT, r = w * RADIUS;
  const N = 12;
  const slices = Array.from({ length: N }, (_, i) => -t / 2 + 1 + (i * (t - 2)) / (N - 1));
  // flat side panels (straight parts of the edge) carry the buttons and the port
  return (
    <>
      {slices.map((z, i) => <div key={i} className="ds-slice" style={{ transform: `translateZ(${z}px)` }} />)}
      {/* left side: action + volume buttons */}
      <div className="ds-panel" style={{ width: t, height: h - 2 * r, left: -t / 2, top: r, transform: "rotateY(-90deg)" }}>
        <div className="ds-btn" style={{ left: "26%", width: "48%", top: (h * 0.2 - r), height: h * 0.045 }} />
        <div className="ds-btn" style={{ left: "26%", width: "48%", top: (h * 0.28 - r), height: h * 0.075 }} />
        <div className="ds-btn" style={{ left: "26%", width: "48%", top: (h * 0.37 - r), height: h * 0.075 }} />
      </div>
      {/* right side: side button + camera control */}
      <div className="ds-panel" style={{ width: t, height: h - 2 * r, left: w - t / 2, top: r, transform: "rotateY(90deg)" }}>
        <div className="ds-btn" style={{ left: "26%", width: "48%", top: (h * 0.27 - r), height: h * 0.1 }} />
        <div className="ds-btn" style={{ left: "22%", width: "56%", top: (h * 0.62 - r), height: h * 0.07 }} />
      </div>
      {/* bottom: USB-C port and speaker/mic holes */}
      <div className="ds-panel" style={{ width: w - 2 * r, height: t, left: r, top: h - t / 2, transform: "rotateX(-90deg)" }}>
        <div className="ds-port" />
        <div className="ds-holes" style={{ left: "12%" }}>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>
        <div className="ds-holes" style={{ right: "12%" }}>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>
      </div>
      <div className="ds-panel" style={{ width: w - 2 * r, height: t, left: r, top: -t / 2, transform: "rotateX(90deg)" }} />
    </>
  );
}

function StaticView() {
  return (
    <section className="ds-static" aria-label="Phone repairs we do">
      <div className="ds-kicker">INSIDE EVERY REPAIR</div>
      <h2 className="ds-title" style={{ maxWidth: "18ch" }}>Every part. Fixed right here.</h2>
      <div className="ds-static-row">
        <img src={IMG_FRONT} alt="iPhone front on our repair bench" loading="lazy" decoding="async" width="720" height="1508" />
        <img src={IMG_BACK} alt="iPhone back on our repair bench" loading="lazy" decoding="async" width="720" height="1511" />
      </div>
      <ul>
        {PARTS.map((p) => <li key={p.id}><span>{p.title}</span><b>{p.price ? `from $${p.price}` : "Free quote"}</b></li>)}
      </ul>
    </section>
  );
}

export default function DeviceShowcase() {
  const wrap = useRef(null), phone = useRef(null), labRefs = useRef({}), progress = useRef(0);
  const [scene, setScene] = useState(0);
  const [done, setDone] = useState(false);
  const [w, setW] = useState(280);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq && mq.matches) { setReduced(true); return undefined; }
    const size = () => {
      const narrow = window.innerWidth < 900;
      const byHeight = narrow ? (window.innerHeight - 380) / 2.09 : (window.innerHeight * 0.66) / 2.09;
      setW(Math.round(Math.max(150, Math.min(narrow ? window.innerWidth * 0.5 : 300, byHeight))));
    };
    size(); window.addEventListener("resize", size);

    let raf = 0, cur = 0, tiltX = 0, tiltY = 0, tx = 0, ty = 0, lastScene = -1, lastDone = null;
    const onMove = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 10; ty = (e.clientY / window.innerHeight - 0.5) * -6; };
    window.addEventListener("pointermove", onMove, { passive: true });
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = wrap.current, ph = phone.current; if (!el || !ph) return;
      const r = el.getBoundingClientRect();
      const span = el.offsetHeight - window.innerHeight;
      const target = clamp(-r.top / Math.max(1, span));
      if (r.bottom < -200 || r.top > window.innerHeight + 200) return; // off screen: do nothing
      cur += (target - cur) * 0.1; tiltX += (tx - tiltX) * 0.06; tiltY += (ty - tiltY) * 0.06;
      progress.current = cur;
      const pose = poseAt(cur);
      const ry = pose.ry + tiltX, rx = pose.rx + tiltY;
      const lift = (1 - pose.rise) * 60;
      ph.style.transform = `translateY(${lift}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      ph.style.setProperty("--sheen", (0.35 + 0.4 * Math.abs(Math.sin((ry * Math.PI) / 180))).toFixed(2));
      // labels follow their points on the phone
      const stage = ph.parentElement, sw = stage.offsetWidth, sh = stage.offsetHeight;
      const box = stage.getBoundingClientRect(), host = el.querySelector(".ds-stick").getBoundingClientRect();
      const cx = box.left - host.left + sw / 2, cy = box.top - host.top + sh / 2 + lift;
      for (const p of PARTS) {
        const node = labRefs.current[p.id]; if (!node) continue;
        const pt = project({ x: p.x * sw, y: p.y * sh, z: (p.z * sw * THICK) / 2 }, ry, rx, 1700);
        const x = cx + pt.x, y = cy + pt.y;
        node.style.transform = `translate(${x}px, ${y}px)`;
        const dir = p.side === "left" ? -1 : 1;
        const reach = Math.max(70, sw * 0.62 + (p.side === "left" ? pt.x : -pt.x));
        const line = node.querySelector(".ds-line"), card = node.querySelector(".ds-card");
        line.style.width = `${reach}px`; line.style.transform = dir < 0 ? "scaleX(-1)" : "none";
        card.style.left = dir < 0 ? `${-reach - (card.offsetWidth || 200) - 8}px` : `${reach + 8}px`;
        node.classList.toggle("on", p.scene === pose.scene && cur > 0.04 && cur < 0.97);
      }
      if (pose.scene !== lastScene) { lastScene = pose.scene; setScene(pose.scene); }
      const d = cur > 0.86; if (d !== lastDone) { lastDone = d; setDone(d); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", size); window.removeEventListener("pointermove", onMove); };
  }, []);

  if (reduced) return <><style>{CSS}</style><StaticView /></>;

  return (
    <section ref={wrap} className="ds-wrap" aria-label="Look around a real iPhone — repairs we do">
      <style>{CSS}</style>
      <div className="ds-stick">
        <div className="ds-copy" aria-live="polite">
          {SCENES.map((s, i) => (
            <div key={i} className="ds-scene-txt" style={{ opacity: scene === i ? 1 : 0, transform: `translateY(${scene === i ? 0 : scene > i ? -14 : 14}px)` }} aria-hidden={scene !== i}>
              <div className="ds-kicker">{s.kicker}</div>
              <h2 className="ds-title">{s.title}</h2>
              <p className="ds-sub">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="ds-stage" style={{ "--w": `${w}px` }}>
          <div className="ds-glow" aria-hidden="true" />
          <div ref={phone} className="ds-phone" style={{ transform: "rotateX(14deg) rotateY(-24deg)" }}>
            <div className="ds-face" style={{ transform: `translateZ(${(w * THICK) / 2}px)` }}>
              <img src={IMG_FRONT} alt="Front of an iPhone on our repair bench" width="720" height="1508" decoding="async" />
            </div>
            <Edge w={w} />
            <div className="ds-face" style={{ transform: `rotateY(180deg) translateZ(${(w * THICK) / 2}px)` }}>
              <img src={IMG_BACK} alt="Back of the same iPhone, showing the cameras" width="720" height="1511" decoding="async" />
            </div>
          </div>
        </div>

        <div className="ds-labels">
          {PARTS.map((p) => (
            <div key={p.id} ref={(n) => { labRefs.current[p.id] = n; }} className="ds-lab">
              <i className="ds-dot" />
              <i className="ds-line" />
              <a className="ds-card" href={`/repairs?part=${p.id}`} tabIndex={p.scene === scene ? 0 : -1}>
                <em>{p.price ? `from $${p.price}` : "Quote"}</em>
                <b>{p.title}</b>
                <span>{p.note}</span>
              </a>
            </div>
          ))}
        </div>

        <div className="ds-dock">
          {PARTS.filter((p) => p.scene === scene).map((p) => (
            <a key={p.id} href={`/repairs?part=${p.id}`}><b>{p.title}</b><em>{p.price ? `from $${p.price}` : "Free quote"}</em></a>
          ))}
        </div>

        <div className="ds-progress" aria-hidden="true">{SCENES.map((_, i) => <i key={i} className={scene === i ? "on" : ""} />)}</div>
        <div className="ds-cta" style={{ opacity: done ? 1 : 0, transform: `translateY(${done ? 0 : 12}px)`, pointerEvents: done ? "auto" : "none" }}>
          <a href="/repairs">Book a repair</a>
          <a href="/quote">Sell this phone instead</a>
        </div>
      </div>
    </section>
  );
}
