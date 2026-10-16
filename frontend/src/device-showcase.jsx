// "Tap to look inside": an exploded view of an iPhone. Closed, it's the real phone
// (front and back photos) floating in 3D and leaning toward the pointer. Tap it and it
// lies down at an angle and comes apart into its layers — cover glass, display,
// titanium frame, logic board, battery, charging port, camera module, back glass —
// with a priced callout for each repairable part. Tap again and it closes.
//
// The inside parts are technical line drawings (not fake photos): white hairlines on
// tinted glass, like an engineering diagram. Everything is CSS 3D + inline SVG, so it
// needs no 3D library and stays sharp at any size.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { REPAIRS_BY_DEVICE } from "./repair-prices.js";

const PRICE = Object.fromEntries((REPAIRS_BY_DEVICE.Phone || []).map((r) => [r.name, r.from]));
const IMG_FRONT = "/photos/device/iphone-blue-front.webp";
const IMG_BACK = "/photos/device/iphone-blue-back.webp";
const ASPECT = 2.09, RADIUS = 0.168;
const INSIDE = ["board", "battery", "port", "camera"];

// Layers from top (screen side) to bottom (back).
// `at` = where its callout points, as fractions of the layer (x, y from top-left).
const LAYERS = [
  { id: "glass", name: "Cover glass", note: "Cracked glass", price: PRICE["Screen replacement"], at: [0.86, 0.12], kind: "glass" },
  { id: "display", name: "OLED display", note: "Lines, black screen, no touch", price: PRICE["Screen replacement"], at: [0.82, 0.55], kind: "display" },
  { id: "frame", name: "Titanium frame", note: "Bent frame, buttons", price: null, at: [0.04, 0.3], kind: "frame" },
  { id: "board", name: "Logic board", note: "Water damage, no power", price: PRICE["Water damage diagnosis"], at: [0.78, 0.2], kind: "board" },
  { id: "battery", name: "Battery", note: "Drains fast, health under 80%", price: PRICE["Battery replacement"], at: [0.2, 0.55], kind: "battery" },
  { id: "port", name: "Charging port", note: "Loose cable, won't charge", price: PRICE["Charging port"], at: [0.5, 0.96], kind: "port" },
  { id: "camera", name: "Camera module", note: "Blurry, cracked lens", price: PRICE["Camera repair"], at: [0.3, 0.14], kind: "camera" },
  { id: "back", name: "Back glass", note: "Shattered back", price: null, at: [0.86, 0.75], kind: "back" },
];

const LINE = "rgba(214,226,255,.9)", FAINT = "rgba(214,226,255,.38)";

function Art({ kind }) {
  // Line drawings in a 100 x 209 box (the phone's proportions).
  const common = { viewBox: "0 0 100 209", preserveAspectRatio: "none", className: "dx-art", "aria-hidden": true };
  const sw = { fill: "none", stroke: LINE, strokeWidth: 1, vectorEffect: "non-scaling-stroke" };
  const thin = { ...sw, stroke: FAINT };
  if (kind === "frame") return (
    <svg {...common}>
      <rect x="4.5" y="4.5" width="91" height="200" rx="13" {...thin} />
      <rect x="9" y="30" width="82" height="150" rx="6" {...thin} />
      {[40, 70, 100, 130, 160].map((y) => <line key={y} x1="9" x2="91" y1={y} y2={y} {...thin} />)}
    </svg>
  );
  if (kind === "board") return (
    <svg {...common}>
      <path d="M52 14 h34 a6 6 0 0 1 6 6 v74 a6 6 0 0 1 -6 6 h-12 v-30 h-22 z" {...sw} fill="rgba(90,140,255,.08)" />
      <rect x="60" y="24" width="20" height="20" rx="2" {...sw} />
      <rect x="64" y="28" width="12" height="12" rx="1.2" {...thin} />
      <text x="70" y="35.5" textAnchor="middle" fontSize="3.6" fill={LINE} fontFamily="ui-monospace,monospace">SoC</text>
      {[0, 1, 2].map((i) => <rect key={i} x={57 + i * 9} y="52" width="6" height="8" rx=".8" {...thin} />)}
      {[0, 1, 2, 3].map((i) => <rect key={i} x={57 + i * 7} y="66" width="4" height="4" rx=".5" {...thin} />)}
      <rect x="78" y="74" width="10" height="6" rx="1" {...sw} />
      <path d="M56 90 h14 M56 94 h10" {...thin} />
      {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={56 + (i % 5) * 7} cy={i < 5 ? 18 : 48} r=".8" {...thin} />)}
      <rect x="10" y="168" width="30" height="13" rx="4" {...sw} /><path d="M14 174.5 h22" {...thin} />
      <rect x="62" y="168" width="28" height="13" rx="4" {...sw} />
      {Array.from({ length: 6 }, (_, i) => <circle key={i} cx={67 + i * 3.6} cy="174.5" r=".9" {...thin} />)}
    </svg>
  );
  if (kind === "battery") return (
    <svg {...common}>
      <path d="M14 32 h36 v128 a5 5 0 0 1 -5 5 h-36 a5 5 0 0 1 -5 -5 v-118 a10 10 0 0 1 10 -10 z" {...sw} fill="rgba(90,140,255,.07)" />
      <rect x="14" y="60" width="26" height="60" rx="2" {...thin} />
      <text x="27" y="80" textAnchor="middle" fontSize="5" fill={LINE} fontFamily="ui-sans-serif,system-ui" fontWeight="700">Li-ion</text>
      <text x="27" y="88" textAnchor="middle" fontSize="3.2" fill={FAINT} fontFamily="ui-monospace,monospace">3.87 V</text>
      <text x="27" y="93" textAnchor="middle" fontSize="3.2" fill={FAINT} fontFamily="ui-monospace,monospace">4,252 mAh</text>
      <rect x="42" y="22" width="6" height="10" rx=".8" {...sw} />
    </svg>
  );
  if (kind === "port") return (
    <svg {...common}>
      <path d="M22 190 h56 v12 h-56 z" {...sw} fill="rgba(90,140,255,.08)" />
      <rect x="42" y="194" width="16" height="4.4" rx="2.2" {...sw} />
      <path d="M30 190 v-12 h40 v12" {...thin} />
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={26 + i * 3} cy="196.2" r=".9" {...thin} />)}
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={65 + i * 3} cy="196.2" r=".9" {...thin} />)}
    </svg>
  );
  if (kind === "camera") return (
    <svg {...common}>
      <rect x="6" y="6" width="56" height="52" rx="10" {...thin} />
      {[[20, 20], [20, 44], [44, 32]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="10" {...sw} fill="rgba(90,140,255,.1)" />
          <circle cx={cx} cy={cy} r="6.5" {...thin} />
          <circle cx={cx} cy={cy} r="3" {...sw} />
        </g>
      ))}
      <circle cx="54" cy="13" r="2.4" {...sw} />
    </svg>
  );
  return null;
}

const CSS = `
.dx-wrap{position:relative;overflow:hidden;background:radial-gradient(110% 80% at 50% 35%,#151c30 0%,#07080b 62%);color:#fff;padding:clamp(48px,8vh,84px) 20px clamp(40px,7vh,72px)}
.dx-head{max-width:620px;margin:0 auto;text-align:center;position:relative;z-index:3}
.dx-kicker{font-size:12px;letter-spacing:.24em;color:#A9BDF5;font-weight:700;margin-bottom:10px}
.dx-title{font-family:'Archivo Black',sans-serif;font-size:clamp(28px,4.4vw,50px);line-height:1.04;margin:0;
  background:linear-gradient(180deg,#fff 30%,#b9c3d9);-webkit-background-clip:text;background-clip:text;color:transparent}
.dx-sub{color:rgba(255,255,255,.66);font-size:15px;margin:12px auto 0;max-width:440px}
.dx-scene{position:relative;height:var(--sceneh);margin:0 auto;max-width:1100px}
.dx-stage{position:absolute;left:50%;top:50%;width:var(--w);height:calc(var(--w) * ${ASPECT});margin:calc(var(--w) * ${ASPECT} / -2) 0 0 calc(var(--w) / -2);perspective:1800px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.dx-stage:focus-visible{outline:2px solid #A9BDF5;outline-offset:12px;border-radius:24px}
.dx-glow{position:absolute;inset:-35% -70%;background:radial-gradient(closest-side,rgba(74,118,255,.26),rgba(122,22,48,.16) 55%,transparent 75%);filter:blur(12px);pointer-events:none}
.dx-3d{position:absolute;inset:0;transform-style:preserve-3d}
.dx-float{animation:dx-float 6s ease-in-out infinite}
@keyframes dx-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.dx-phone{transition:transform 1.15s cubic-bezier(.7,0,.2,1)}
.dx-layer{position:absolute;inset:0;transform-style:preserve-3d;border-radius:calc(var(--w) * ${RADIUS});transition:transform 1.15s cubic-bezier(.7,0,.2,1),opacity .6s ease}
.dx-layer img{width:100%;height:100%;display:block;object-fit:fill;border-radius:inherit;user-select:none;-webkit-user-drag:none}
.dx-art{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.dx-glass{background:linear-gradient(125deg,rgba(255,255,255,.28),rgba(255,255,255,.04) 35%,rgba(255,255,255,0) 60%,rgba(255,255,255,.12));border:1px solid rgba(214,226,255,.55);box-shadow:inset 0 0 18px rgba(170,200,255,.15)}
.dx-tint{background:rgba(40,60,110,.14);box-shadow:inset 0 0 0 1px rgba(214,226,255,.18)}
.dx-frame{background:rgba(16,20,32,.92);box-shadow:inset 0 0 0 calc(var(--w) * .03) #8fa0c4,inset 0 0 0 calc(var(--w) * .036) #c9d4ec}
.dx-anchor{position:absolute;width:1px;height:1px}
.dx-calls{position:absolute;inset:0;pointer-events:none;z-index:4}
.dx-call{position:absolute;left:0;top:0;opacity:0;transition:opacity .35s ease;will-change:transform}
.dx-call.on{opacity:1}
.dx-dot{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(120,160,255,.35),0 0 14px rgba(120,160,255,.9)}
.dx-line{position:absolute;top:0;height:1px;background:rgba(214,226,255,.55)}
.dx-card{position:absolute;top:0;transform:translateY(-50%);white-space:nowrap;padding:7px 11px;border-radius:10px;background:rgba(14,18,30,.74);border:1px solid rgba(255,255,255,.14);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-size:13px;line-height:1.25;text-decoration:none;color:#fff}
.dx-call.on .dx-card{pointer-events:auto}
.dx-card b{font-weight:700}
.dx-card em{font-style:normal;color:#A9BDF5;font-weight:700;margin-left:8px}
.dx-card small{display:block;color:rgba(255,255,255,.6);font-size:11.5px}
.dx-card:hover{border-color:rgba(169,189,245,.7)}
.dx-btn{display:flex;justify-content:center;gap:10px;margin-top:6px;position:relative;z-index:5;flex-wrap:wrap}
.dx-btn button,.dx-btn a{display:inline-flex;align-items:center;min-height:46px;padding:0 22px;border-radius:999px;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;text-decoration:none}
.dx-btn button{background:#fff;color:#0b0d12;border:0}
.dx-btn a{border:1px solid rgba(255,255,255,.3);color:#fff}
.dx-hint{position:absolute;left:50%;bottom:2%;transform:translateX(-50%);font-size:12px;letter-spacing:.18em;color:rgba(255,255,255,.5);text-transform:uppercase;transition:opacity .4s;pointer-events:none;z-index:3}
@media (max-width: 760px){ .dx-card small{display:none} .dx-card{font-size:11.5px;padding:5px 8px} .dx-card em{margin-left:5px} }
@media (prefers-reduced-motion: reduce){ .dx-phone,.dx-layer{transition:none} .dx-float{animation:none} }
`;

export default function DeviceShowcase() {
  const [open, setOpen] = useState(false);
  const [w, setW] = useState(230);
  const [sceneH, setSceneH] = useState(620);
  const stage = useRef(null), tilt = useRef(null), calls = useRef(null), anchors = useRef({}), callRefs = useRef({});
  const narrowRef = useRef(false);

  useLayoutEffect(() => {
    const size = () => {
      const narrow = window.innerWidth < 760; narrowRef.current = narrow;
      const ww = Math.round(Math.max(140, Math.min(narrow ? window.innerWidth * 0.4 : 240, window.innerHeight * 0.25)));
      setW(ww); setSceneH(Math.round(ww * (narrow ? 3.2 : 2.9)));
    };
    size(); window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  // lean toward the pointer while closed
  useEffect(() => {
    const el = stage.current; if (!el) return undefined;
    const onMove = (e) => {
      if (open || !tilt.current) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      tilt.current.style.transform = `rotateY(${dx * 22}deg) rotateX(${-dy * 14}deg)`;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [open]);

  // callouts follow their anchor points while the layers move
  useEffect(() => {
    let raf = 0; const until = performance.now() + 1700;
    const place = () => {
      const host = calls.current, st = stage.current; if (!host || !st) return;
      const hb = host.getBoundingClientRect(), sb = st.getBoundingClientRect();
      const mid = sb.left + sb.width / 2 - hb.left;
      LAYERS.forEach((L, i) => {
        const a = anchors.current[L.id], c = callRefs.current[L.id]; if (!a || !c) return;
        const r = a.getBoundingClientRect();
        const x = r.left - hb.left, y = r.top - hb.top;
        const right = i % 2 === 0;
        // cards line up in two columns either side of the stack
        const colX = right ? mid + sb.width * (narrowRef.current ? 0.75 : 1.15) : mid - sb.width * (narrowRef.current ? 0.75 : 1.15);
        const reach = Math.max(18, Math.abs(colX - x));
        c.style.transform = `translate(${x}px, ${y}px)`;
        const line = c.querySelector(".dx-line"), card = c.querySelector(".dx-card");
        line.style.width = `${reach}px`; line.style.left = right ? "0" : `${-reach}px`;
        card.style.left = right ? `${reach + 4}px` : "auto"; card.style.right = right ? "auto" : `${reach + 4}px`;
      });
      if (performance.now() < until) raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [open, w]);

  const toggle = () => { setOpen((o) => !o); if (tilt.current) tilt.current.style.transform = "none"; };
  const gap = w * 0.3; // spacing between layers when open
  const n = LAYERS.length;

  return (
    <section className="dx-wrap" aria-label="Look inside an iPhone — the repairs we do">
      <style>{CSS}</style>
      <div className="dx-head">
        <div className="dx-kicker">INSIDE EVERY REPAIR</div>
        <h2 className="dx-title">{open ? "Every part. Fixed right here." : "Tap the phone to look inside."}</h2>
        <p className="dx-sub">{open ? "Tap a part for its repair price, or tap the phone to close it." : "Screen, battery, cameras, charging port — we fix all of it, most jobs the same day."}</p>
      </div>

      <div className="dx-scene" style={{ "--w": `${w}px`, "--sceneh": `${sceneH}px` }}>
        <div ref={stage} className="dx-stage" role="button" tabIndex={0} aria-pressed={open}
          aria-label={open ? "Close the phone" : "Open the phone to see its parts"}
          onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
          <div className="dx-glow" aria-hidden="true" />
          <div className={`dx-3d${open ? "" : " dx-float"}`}>
            <div ref={tilt} className="dx-3d" style={{ transition: "transform .5s ease-out" }}>
              <div className="dx-3d dx-phone" style={{ transform: open ? "rotateX(58deg) rotateZ(-34deg) scale(.86)" : "rotateY(-14deg) rotateX(6deg)" }}>
                {LAYERS.map((L, i) => {
                  // closed: packed into the phone's thickness; open: a tall stack
                  const zClosed = ((n - 1) / 2 - i) * (w * 0.016);
                  const zOpen = ((n - 1) / 2 - i) * gap;
                  const inside = INSIDE.includes(L.kind);
                  const style = {
                    transform: `translateZ(${open ? zOpen : zClosed}px)`,
                    transitionDelay: `${open ? i * 45 : (n - i) * 35}ms`,
                    opacity: !open && inside ? 0 : 1,
                  };
                  const cls = ["dx-layer", L.kind === "glass" && "dx-glass", inside && "dx-tint", L.kind === "frame" && "dx-frame"].filter(Boolean).join(" ");
                  return (
                    <div key={L.id} className={cls} style={style}>
                      {L.kind === "display" && <img src={IMG_FRONT} alt="" width="720" height="1508" decoding="async" />}
                      {/* the back glass lies face-up when open, so its cameras show */}
                      {L.kind === "back" && <img src={IMG_BACK} alt="" width="720" height="1546" decoding="async" />}
                      {(L.kind === "frame" || inside) && <Art kind={L.kind} />}
                      <i className="dx-anchor" ref={(el) => { anchors.current[L.id] = el; }} style={{ left: `${L.at[0] * 100}%`, top: `${L.at[1] * 100}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div ref={calls} className="dx-calls">
          {LAYERS.map((L, i) => (
            <div key={L.id} ref={(el) => { callRefs.current[L.id] = el; }} className={`dx-call${open ? " on" : ""}`} style={{ transitionDelay: open ? `${750 + i * 70}ms` : "0ms" }}>
              <i className="dx-dot" /><i className="dx-line" />
              <a className="dx-card" href={`/repairs?part=${L.id}`} tabIndex={open ? 0 : -1}>
                <b>{L.name}</b><em>{L.price ? `from $${L.price}` : "Quote"}</em><small>{L.note}</small>
              </a>
            </div>
          ))}
        </div>
        <div className="dx-hint" style={{ opacity: open ? 0 : 1 }}>Tap to open</div>
      </div>

      <div className="dx-btn">
        <button type="button" onClick={toggle} aria-pressed={open}>{open ? "Close it up" : "Look inside"}</button>
        <a href="/repairs">Book a repair</a>
      </div>
    </section>
  );
}
