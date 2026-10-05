import React from "react";

// Brand "scene" banners — replaced the old stock photos with a modern,
// photo-free visual that matches the hero: navy-to-blue gradient, faint
// grid, soft glow and floating glass tiles with line icons for each page.
// Same API as before (name, height, radius, overlay, children, style), so
// every page picked this up without changes. Loads instantly (no images).
const I = {
  phone: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18.5h2" /></>,
  wrench: <path d="M14.5 5.5a4 4 0 0 0-5.3 5.3L3.5 16.5l2 2 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.4 2.4-2-2z" />,
  screwdriver: <><path d="M14 4l6 6-3 3-6-6z" /><path d="M11 7l-7 7 2 2 7-7" /><path d="M3 21l3-3" /></>,
  chip: <><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>,
  screen: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M9 9l3 3-2 4M14 7l-1 4" /></>,
  battery: <><rect x="3" y="7" width="16" height="10" rx="2" /><path d="M21 10v4M7 10v4M10.5 10v4" /></>,
  plug: <><path d="M9 3v5M15 3v5" /><path d="M6 8h12v3a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></>,
  camera: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><circle cx="12" cy="12.5" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></>,
  case: <><rect x="6" y="2" width="12" height="20" rx="3" /><rect x="8.5" y="4.5" width="4" height="4" rx="1.2" /></>,
  cable: <><path d="M7 3v4M11 3v4" /><rect x="5" y="7" width="8" height="4" rx="1" /><path d="M9 11v4a4 4 0 0 0 8 0v-2a2 2 0 0 1 4 0" /></>,
  shield: <><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  pin: <><path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>,
};
const SCENES = {
  workshop: ["phone", "wrench", "screwdriver", "chip"],
  microscope: ["screen", "battery", "plug", "camera"],
  repairMat: ["case", "plug", "cable", "shield"],
  screwdriver: ["phone", "heart", "pin", "shield"],
  workbench: ["phone", "screwdriver", "chip", "battery"],
  battery: ["battery", "phone", "plug", "shield"],
};
// kept for anything that still reads photo metadata
export const PHOTOS = Object.fromEntries(Object.keys(SCENES).map((k) => [k, { alt: "" }]));

const CSS = `
.mvb{position:relative;overflow:hidden;background:radial-gradient(120% 140% at 85% 20%,#2150C8 0%,#1E3A8A 38%,#0B1530 78%);isolation:isolate}
.mvb::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 45%);mask-image:linear-gradient(90deg,transparent,#000 45%);z-index:-1}
.mvb-glow{position:absolute;width:60%;height:120%;right:-10%;top:-10%;background:radial-gradient(closest-side,rgba(14,165,233,.45),transparent);filter:blur(10px);z-index:-1}
.mvb-tiles{position:absolute;right:5%;top:50%;transform:translateY(-50%);display:grid;grid-template-columns:repeat(2,auto);gap:14px}
.mvb-tile{width:76px;height:76px;border-radius:20px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;box-shadow:0 14px 30px rgba(0,0,0,.25);animation:mvb-float 6s ease-in-out infinite}
.mvb-tile:nth-child(2){animation-delay:.8s;transform:translateY(18px)}.mvb-tile:nth-child(3){animation-delay:1.6s}.mvb-tile:nth-child(4){animation-delay:2.4s;transform:translateY(18px)}
.mvb-tile svg{width:36px;height:36px;stroke:#fff;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
@keyframes mvb-float{0%,100%{translate:0 0}50%{translate:0 -10px}}
@media(max-width:720px){.mvb-tiles{right:4%;gap:10px}.mvb-tile{width:54px;height:54px;border-radius:15px}.mvb-tile svg{width:26px;height:26px}}
@media(prefers-reduced-motion:reduce){.mvb-tile{animation:none}}
`;

export default function Photo({ name, height = 260, radius = 18, children, style }) {
  const icons = SCENES[name] || SCENES.workshop;
  return (
    <div className="mvb" role={children ? undefined : "presentation"} style={{ height, borderRadius: radius, ...style }}>
      <style>{CSS}</style>
      <div className="mvb-glow" />
      <div className="mvb-tiles" aria-hidden="true">
        {icons.map((k) => <div key={k} className="mvb-tile"><svg viewBox="0 0 24 24">{I[k]}</svg></div>)}
      </div>
      {children && <div style={{ position: "relative", height: "100%" }}>{children}</div>}
    </div>
  );
}
