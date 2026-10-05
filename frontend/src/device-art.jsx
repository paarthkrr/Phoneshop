import React, { useState } from "react";

// Device pictures: one uniform, original line-art style for every model (thin navy
// lines, white and light grey, no colour, no brand logos), drawn per family with
// the right camera layout and screen cut-out. The back sits behind the front, like
// a spec sheet. A real photo is shown only when staff set one (Pricing Console
// photo link, or a shop listing's own stock photo).

const INK = "#0F1B3D", FILL = "#FFFFFF", SOFT = "#F1F4F9";

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

// Screen cut-out on the front.
function cutout(family, model) {
  const m = (model || "").toLowerCase();
  if (family.startsWith("iphone")) {
    const gen = parseInt((m.match(/iphone (\d+)/) || [])[1] || "0", 10);
    if (family === "iphone-single") return /\bx/.test(m.replace("iphone ", "")) ? "notch" : "home";
    if (family === "iphone-air" || family === "iphone-pro-plateau") return "island";
    if (/\d+e\b/.test(m)) return "notch";
    if (gen >= 15 || (gen === 14 && /pro/.test(m))) return "island";
    return "notch";
  }
  return "hole";
}

function Lens({ x, y, r, sw }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={FILL} stroke={INK} strokeWidth={sw} />
      <circle cx={x} cy={y} r={r * 0.55} fill={SOFT} stroke={INK} strokeWidth={sw * 0.75} />
      <circle cx={x - r * 0.2} cy={y - r * 0.2} r={r * 0.13} fill={INK} opacity=".35" />
    </g>
  );
}
const Body = ({ x, y, w, h, rx, sw }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={rx} fill={FILL} stroke={INK} strokeWidth={sw} />
    <rect x={x + 3.5} y={y + 3.5} width={w - 7} height={h - 7} rx={Math.max(1, rx - 3.5)} fill="none" stroke={INK} strokeWidth={sw * 0.4} opacity=".35" />
  </g>
);

function Front({ x, y, w, h, rx, sw, cut, crease }) {
  const cx = x + w / 2, b = cut === "home" ? 20 : 6;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={FILL} stroke={INK} strokeWidth={sw} />
      <rect x={x + 6} y={y + b} width={w - 12} height={h - b * 2} rx={cut === "home" ? 2 : Math.max(1, rx - 6)} fill={SOFT} stroke={INK} strokeWidth={sw * 0.5} />
      {cut === "island" && <rect x={cx - 12} y={y + 11} width="24" height="7" rx="3.5" fill={INK} />}
      {cut === "notch" && <path d={`M${cx - 17} ${y + 6} h34 v4 a5 5 0 0 1 -5 5 h-24 a5 5 0 0 1 -5 -5 z`} fill={INK} />}
      {cut === "hole" && <circle cx={cx} cy={y + 14} r="2.8" fill={INK} />}
      {cut === "home" && <><circle cx={cx} cy={y + h - 10} r="5.5" fill="none" stroke={INK} strokeWidth={sw * 0.8} /><rect x={cx - 7} y={y + 9} width="14" height="2.5" rx="1.25" fill={INK} opacity=".6" /></>}
      {cut !== "home" && <line x1={cx - 13} y1={y + h - 10} x2={cx + 13} y2={y + h - 10} stroke={INK} strokeWidth={sw} strokeLinecap="round" opacity=".45" />}
      {crease && <line x1={cx} y1={y + 6} x2={cx} y2={y + h - 6} stroke={INK} strokeWidth={sw * 0.5} opacity=".3" />}
    </g>
  );
}

// Back-of-phone camera layouts (back body sits at x=24..106, y=20..196).
function Back({ family, model, sw }) {
  const ml = (model || "").toLowerCase();
  const eModel = /\d+e\b/.test(ml);   // iPhone 16e / 17e: single camera
  const gen = parseInt((ml.match(/(?:iphone|pixel) (\d+)/) || [])[1] || "0", 10);
  const x = 24, y = 20, w = 82, h = 176;
  const rx = { "galaxy-ultra": 8, galaxy: 15, pixel: 18, android: 14, flip: 16 }[family] ?? 17;
  const parts = [];
  if (family === "iphone-pro-plateau") {
    parts.push(<rect key="p" x={x + 4} y={y + 6} width={w - 8} height="50" rx="12" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 21} y={y + 20} r={9.5} sw={sw} />, <Lens key="2" x={x + 21} y={y + 43} r={9.5} sw={sw} />, <Lens key="3" x={x + 42} y={y + 31} r={9.5} sw={sw} />);
    parts.push(<circle key="f" cx={x + 63} cy={y + 18} r="3.4" fill="none" stroke={INK} strokeWidth={sw} />);
  } else if (family === "iphone-pro") {
    parts.push(<rect key="p" x={x + 6} y={y + 6} width="46" height="46" rx="12" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 19} y={y + 19} r={7.5} sw={sw} />, <Lens key="2" x={x + 19} y={y + 39} r={7.5} sw={sw} />, <Lens key="3" x={x + 38} y={y + 29} r={7.5} sw={sw} />);
    parts.push(<circle key="f" cx={x + 40} cy={y + 13} r="2.6" fill="none" stroke={INK} strokeWidth={sw * 0.8} />);
  } else if (family === "iphone" && eModel) {
    parts.push(<Lens key="1" x={x + 18} y={y + 18} r={8} sw={sw} />, <circle key="f" cx={x + 33} cy={y + 18} r="2.6" fill="none" stroke={INK} strokeWidth={sw * 0.8} />);
  } else if (family === "iphone" && gen >= 16) {
    // iPhone 16 / 17: two cameras in a tall pill
    parts.push(<rect key="p" x={x + 8} y={y + 6} width="26" height="54" rx="13" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 21} y={y + 20} r={8} sw={sw} />, <Lens key="2" x={x + 21} y={y + 46} r={8} sw={sw} />);
    parts.push(<circle key="f" cx={x + 42} cy={y + 13} r="2.6" fill="none" stroke={INK} strokeWidth={sw * 0.8} />);
  } else if (family === "iphone" && gen >= 13) {
    // iPhone 13 / 14 / 15: two cameras on a diagonal in a square
    parts.push(<rect key="p" x={x + 6} y={y + 6} width="44" height="44" rx="12" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 18} y={y + 18} r={7.5} sw={sw} />, <Lens key="2" x={x + 38} y={y + 38} r={7.5} sw={sw} />);
    parts.push(<circle key="f" cx={x + 40} cy={y + 15} r="2.4" fill="none" stroke={INK} strokeWidth={sw * 0.8} />);
  } else if (family === "iphone") {
    parts.push(<rect key="p" x={x + 6} y={y + 6} width="34" height="46" rx="11" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 23} y={y + 19} r={7.5} sw={sw} />, <Lens key="2" x={x + 23} y={y + 39} r={7.5} sw={sw} />);
  } else if (family === "iphone-single") {
    parts.push(<Lens key="1" x={x + 16} y={y + 16} r={7} sw={sw} />, <circle key="f" cx={x + 29} cy={y + 16} r="2.4" fill="none" stroke={INK} strokeWidth={sw * 0.8} />);
  } else if (family === "iphone-air") {
    parts.push(<rect key="p" x={x + 4} y={y + 7} width={w - 8} height="28" rx="14" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 20} y={y + 21} r={8.5} sw={sw} />, <circle key="f" cx={x + 62} cy={y + 21} r="3" fill="none" stroke={INK} strokeWidth={sw} />);
  } else if (family === "galaxy-ultra") {
    [0, 1, 2].forEach((i) => parts.push(<Lens key={"b" + i} x={x + 17} y={y + 19 + i * 23} r={8.5} sw={sw} />));
    [0, 1].forEach((i) => parts.push(<Lens key={"s" + i} x={x + 36} y={y + 25 + i * 21} r={5.5} sw={sw} />));
  } else if (family === "galaxy") {
    [0, 1, 2].forEach((i) => parts.push(<Lens key={"b" + i} x={x + 18} y={y + 19 + i * 21} r={7.5} sw={sw} />));
    parts.push(<circle key="f" cx={x + 34} cy={y + 19} r="2.4" fill={INK} opacity=".5" />);
  } else if (family === "pixel" && gen >= 9) {
    // Pixel 9 / 10: rounded camera island that stops short of the edges
    parts.push(<rect key="v" x={x + 7} y={y + 22} width={w - 14} height="30" rx="15" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    if (/pro/.test(ml)) parts.push(<Lens key="1" x={x + 19} y={y + 37} r={6} sw={sw} />, <Lens key="2" x={x + 34} y={y + 37} r={6} sw={sw} />, <Lens key="3" x={x + 49} y={y + 37} r={6} sw={sw} />, <circle key="f" cx={x + 63} cy={y + 37} r="2.4" fill="none" stroke={INK} strokeWidth={sw * 0.8} />);
    else parts.push(<Lens key="1" x={x + 22} y={y + 37} r={6.5} sw={sw} />, <Lens key="2" x={x + 40} y={y + 37} r={6.5} sw={sw} />, <circle key="f" cx={x + 58} cy={y + 37} r="2.6" fill="none" stroke={INK} strokeWidth={sw * 0.8} />);
  } else if (family === "pixel") {
    parts.push(<rect key="v" x={x - 1} y={y + 26} width={w + 2} height="28" rx="14" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<rect key="w" x={x + 9} y={y + 31} width="40" height="18" rx="9" fill={FILL} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 19} y={y + 40} r={5.5} sw={sw} />, <Lens key="2" x={x + 39} y={y + 40} r={5.5} sw={sw} />, <Lens key="3" x={x + 60} y={y + 40} r={5.5} sw={sw} />);
  } else if (family === "flip") {
    parts.push(<rect key="c" x={x + 8} y={y + 8} width={w - 16} height="60" rx="10" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 22} y={y + 22} r={6.5} sw={sw} />, <Lens key="2" x={x + 22} y={y + 46} r={6.5} sw={sw} />);
    parts.push(<line key="h" x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={INK} strokeWidth={sw * 0.8} opacity=".5" />);
  } else if (family === "fold") {
    [0, 1, 2].forEach((i) => parts.push(<Lens key={"b" + i} x={x + 17} y={y + 19 + i * 22} r={7.5} sw={sw} />));
  } else {
    parts.push(<rect key="p" x={x + 6} y={y + 6} width="44" height="44" rx="11" fill={SOFT} stroke={INK} strokeWidth={sw} />);
    parts.push(<Lens key="1" x={x + 18} y={y + 18} r={6.5} sw={sw} />, <Lens key="2" x={x + 38} y={y + 18} r={6.5} sw={sw} />, <Lens key="3" x={x + 18} y={y + 38} r={6.5} sw={sw} />);
  }
  return <g><Body x={x} y={y} w={w} h={h} rx={rx} sw={sw} />{parts}</g>;
}

function PhonePair({ family, model, sw }) {
  if (family === "fold") {
    // closed back on the left, the open inner screen in front
    return <g><Back family="fold" model={model} sw={sw} /><Front x={70} y={34} w={124} h={150} rx={10} sw={sw} cut="hole" crease /></g>;
  }
  const rx = { "galaxy-ultra": 8, galaxy: 15, pixel: 18, android: 14, flip: 16 }[family] ?? 17;
  return <g><Back family={family} model={model} sw={sw} /><Front x={94} y={28} w={82} h={176} rx={rx} sw={sw} cut={cutout(family, model)} crease={family === "flip"} /></g>;
}

function Other({ type, sw }) {
  if (type === "tablet") return (
    <g><rect x="28" y="16" width="144" height="190" rx="14" fill={FILL} stroke={INK} strokeWidth={sw} />
      <rect x="37" y="25" width="126" height="172" rx="6" fill={SOFT} stroke={INK} strokeWidth={sw * 0.5} />
      <circle cx="100" cy="20.5" r="2" fill={INK} /></g>);
  if (type === "laptop") return (
    <g><rect x="34" y="52" width="132" height="90" rx="8" fill={FILL} stroke={INK} strokeWidth={sw} />
      <rect x="42" y="60" width="116" height="74" rx="3" fill={SOFT} stroke={INK} strokeWidth={sw * 0.5} />
      <path d="M18 150 h164 l-8 12 h-148 z" fill={FILL} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <line x1="88" y1="150" x2="112" y2="150" stroke={INK} strokeWidth={sw} opacity=".5" /></g>);
  // watch
  return (
    <g><path d="M78 10 h44 l-4 52 h-36 z" fill={SOFT} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M82 158 h36 l4 52 h-44 z" fill={SOFT} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <rect x="60" y="56" width="80" height="108" rx="26" fill={FILL} stroke={INK} strokeWidth={sw} />
      <rect x="68" y="64" width="64" height="92" rx="19" fill={SOFT} stroke={INK} strokeWidth={sw * 0.5} />
      <rect x="140" y="92" width="7" height="20" rx="3.5" fill={FILL} stroke={INK} strokeWidth={sw * 0.8} /></g>);
}

export default function DeviceArt({ type = "phone", size = 64, label, brand, model, imageUrl }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    const clean = /\.(png|webp|svg)($|\?)/.test(imageUrl);
    return <img src={imageUrl} alt={label || ""} width={size} height={Math.round(size * 1.1)} loading="lazy" onError={() => setFailed(true)}
      style={{ display: "block", width: size, height: size * 1.1, objectFit: clean ? "contain" : "cover", borderRadius: clean ? 0 : Math.max(6, size / 9) }} />;
  }
  const family = type === "phone" ? phoneFamily(brand, model) : type;
  const sw = Math.max(1.6, 230 / size);   // lines stay visible at thumbnail size, fine when large
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 200 220" role={label ? "img" : undefined} aria-label={label}
      aria-hidden={label ? undefined : true} data-family={family} style={{ display: "block" }}>
      {type === "phone" ? <PhonePair family={family} model={model || ""} sw={sw} /> : <Other type={type} sw={sw} />}
    </svg>
  );
}
