import React, { useState } from "react";

// Device pictures. Shows a real photo when one is set (staff can add a photo
// link per model in the Pricing Console), otherwise an original drawing of the
// back of the device, styled per brand and model family (iPhone Pro camera
// square, Pixel camera bar, Galaxy vertical lenses, Fold/Flip shapes...) so
// customers recognise their phone at a glance. All drawings are original —
// no brand logos or copied product images.

const INK = "#111827", BLUE = "#2150C8", SCREEN = "rgba(33,80,200,0.12)";

export function inferDeviceType(model, category) {
  const c = (category || "").toLowerCase();
  if (["phone", "tablet", "laptop", "watch"].includes(c)) return c;
  const m = (model || "").toLowerCase();
  if (/watch/.test(m)) return "watch";
  if (/ipad|tab\b|tablet|galaxy tab/.test(m)) return "tablet";
  if (/macbook|laptop|notebook|chromebook|surface laptop|thinkpad|xps/.test(m)) return "laptop";
  return "phone";
}

// Which phone family a model belongs to, from brand + model name.
export function phoneFamily(brand, model) {
  const b = (brand || "").toLowerCase(), m = (model || "").toLowerCase();
  if (/flip/.test(m)) return "flip";
  if (/fold|duo/.test(m)) return "fold";
  if (b === "apple" || /iphone/.test(m)) {
    if (/air/.test(m)) return "iphone-air";
    const gen = parseInt((m.match(/iphone (\d+)/) || [])[1] || "0", 10);
    if (/pro/.test(m)) return gen >= 17 ? "iphone-pro-plateau" : "iphone-pro";
    if (gen >= 11 || /\d+e\b/.test(m)) return "iphone";
    return "iphone-single";
  }
  if (b === "google" || /pixel/.test(m)) return "pixel";
  if (b === "samsung") return /ultra/.test(m) ? "galaxy-ultra" : "galaxy";
  return "android";
}

// Deterministic, realistic finish per model so the grid has natural variety.
const FINISHES = [["#8E9196", "#5F6267"], ["#2E3036", "#16171B"], ["#D9D6CF", "#B9B5AC"], ["#5B6B7E", "#3D4A59"], ["#7C6A58", "#56483A"], ["#3B4A3F", "#26302A"]];
function finishFor(model) {
  let h = 0; for (const ch of String(model || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FINISHES[h % FINISHES.length];
}

const Lens = ({ x, y, r = 4.2 }) => (
  <g>
    <circle cx={x} cy={y} r={r + 1.2} fill="#0E0F12" />
    <circle cx={x} cy={y} r={r} fill="#1E2A3A" />
    <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.32} fill="rgba(255,255,255,0.55)" />
  </g>
);

function PhoneBack({ family, model, uid }) {
  const [c1, c2] = finishFor(model);
  const g = `g${uid}`;
  const body = (x, y, w, h, rx) => (
    <>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={`url(#${g})`} stroke={INK} strokeWidth="2" />
      <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={rx - 2} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
    </>
  );
  const defs = (
    <defs>
      <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} />
      </linearGradient>
    </defs>
  );
  switch (family) {
    case "fold": return (<>{defs}{body(12, 8, 56, 74, 6)}<line x1="40" y1="8" x2="40" y2="82" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
      <rect x="47" y="14" width="15" height="30" rx="7" fill="rgba(0,0,0,0.35)" /><Lens x={54.5} y={21} r={3.4} /><Lens x={54.5} y={29.5} r={3.4} /><Lens x={54.5} y={38} r={3.4} /></>);
    case "flip": return (<>{defs}{body(22, 6, 36, 78, 9)}<line x1="22" y1="45" x2="58" y2="45" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
      <rect x="26" y="10" width="28" height="31" rx="6" fill="#0E0F12" /><rect x="28" y="12" width="24" height="27" rx="5" fill={SCREEN} /><Lens x={31} y={16} r={2.8} /><Lens x={31} y={24} r={2.8} /></>);
    case "pixel": return (<>{defs}{body(20, 6, 40, 76, 9)}<rect x="20" y="16" width="40" height="12" rx="6" fill="#16171B" />
      <Lens x={29} y={22} r={3.6} /><Lens x={38.5} y={22} r={3.6} /><Lens x={48} y={22} r={3.6} /><circle cx="55" cy="22" r="1.4" fill="#F4E9C8" /></>);
    case "galaxy-ultra": return (<>{defs}{body(20, 6, 40, 76, 5)}<Lens x={28} y={16} r={3.8} /><Lens x={28} y={26} r={3.8} /><Lens x={28} y={36} r={3.8} /><Lens x={37} y={18} r={2.6} /><Lens x={37} y={26} r={2.6} /><circle cx="37" cy="33" r="1.4" fill="#F4E9C8" /></>);
    case "galaxy": return (<>{defs}{body(20, 6, 40, 76, 8)}<Lens x={28} y={16} r={3.6} /><Lens x={28} y={25.5} r={3.6} /><Lens x={28} y={35} r={3.6} /></>);
    case "iphone-air": return (<>{defs}{body(21, 6, 38, 76, 9)}<rect x="21" y="11" width="38" height="11" rx="5.5" fill="rgba(0,0,0,0.3)" /><Lens x={29} y={16.5} r={3.4} /><circle cx="37" cy="16.5" r="1.2" fill="#F4E9C8" /></>);
    case "iphone-pro-plateau": return (<>{defs}{body(20, 6, 40, 76, 9)}<rect x="20" y="9" width="40" height="22" rx="6" fill="rgba(0,0,0,0.28)" />
      <Lens x={28} y={15} r={3.5} /><Lens x={28} y={25} r={3.5} /><Lens x={37} y={20} r={3.5} /><circle cx="51" cy="15" r="1.4" fill="#F4E9C8" /></>);
    case "iphone-pro": return (<>{defs}{body(20, 6, 40, 76, 9)}<rect x="23" y="9" width="21" height="21" rx="5.5" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.15)" />
      <Lens x={29} y={15} r={3.4} /><Lens x={29} y={24.5} r={3.4} /><Lens x={38} y={19.8} r={3.4} /><circle cx="39" cy="12.5" r="1.2" fill="#F4E9C8" /></>);
    case "iphone": return (<>{defs}{body(20, 6, 40, 76, 9)}<rect x="23" y="9" width="17" height="19" rx="5" fill="rgba(0,0,0,0.28)" />
      <Lens x={29} y={14.5} r={3.4} /><Lens x={34.5} y={22.5} r={3.4} /><circle cx="37" cy="13" r="1.1" fill="#F4E9C8" /></>);
    case "iphone-single": return (<>{defs}{body(21, 6, 38, 76, 8)}<Lens x={28} y={14} r={3.6} /><circle cx="35" cy="14" r="1.1" fill="#F4E9C8" /></>);
    default: return (<>{defs}{body(20, 6, 40, 76, 8)}<rect x="23" y="9" width="18" height="18" rx="9" fill="rgba(0,0,0,0.3)" /><Lens x={29} y={15} r={3.2} /><Lens x={35.5} y={21} r={3.2} /></>);
  }
}

const OTHER = {
  tablet: (<><rect x="8" y="12" width="64" height="66" rx="7" fill="#fff" stroke={INK} strokeWidth="3" /><rect x="14" y="18" width="52" height="54" rx="3" fill={SCREEN} /><circle cx="40" cy="15" r="1.4" fill={INK} /><rect x="20" y="26" width="26" height="4" rx="2" fill={BLUE} opacity="0.55" /><rect x="20" y="34" width="18" height="4" rx="2" fill={BLUE} opacity="0.35" /></>),
  laptop: (<><rect x="14" y="16" width="52" height="38" rx="4" fill="#fff" stroke={INK} strokeWidth="3" /><rect x="19" y="21" width="42" height="28" rx="2" fill={SCREEN} /><path d="M6 60 H74 L70 68 H10 Z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" /><rect x="34" y="60" width="12" height="2.5" rx="1.25" fill={BLUE} /></>),
  watch: (<><rect x="30" y="4" width="20" height="18" rx="4" fill="#fff" stroke={INK} strokeWidth="3" /><rect x="30" y="68" width="20" height="18" rx="4" fill="#fff" stroke={INK} strokeWidth="3" /><rect x="22" y="20" width="36" height="50" rx="11" fill="#fff" stroke={INK} strokeWidth="3" /><rect x="28" y="27" width="24" height="36" rx="6" fill={SCREEN} /><rect x="58" y="36" width="4" height="10" rx="2" fill={BLUE} /><path d="M40 38 V45 L45 48" stroke={BLUE} strokeWidth="2.5" fill="none" strokeLinecap="round" /></>),
};

let uidCounter = 0;
export default function DeviceArt({ type = "phone", size = 64, label, brand, model, imageUrl }) {
  const [failed, setFailed] = useState(false);
  const [uid] = useState(() => ++uidCounter);
  if (imageUrl && !failed) {
    return <img src={imageUrl} alt={label || ""} width={size} height={Math.round(size * 1.1)} loading="lazy" onError={() => setFailed(true)}
      style={{ display: "block", width: size, height: size * 1.1, objectFit: "cover", borderRadius: Math.max(6, size / 9) }} />;
  }
  const family = type === "phone" ? phoneFamily(brand, model) : type;
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 80 88" role={label ? "img" : undefined} aria-label={label}
      aria-hidden={label ? undefined : true} data-family={family} style={{ display: "block" }}>
      {type === "phone" ? <PhoneBack family={family} model={model || brand || ""} uid={uid} /> : (OTHER[type] || OTHER.tablet)}
    </svg>
  );
}
