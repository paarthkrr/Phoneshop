import React from "react";

// Original line-art device illustrations — used wherever a real product
// photo would go but none exists yet. Drawn from scratch (no brand logos or
// product shapes copied), so there's no licensing concern.

const INK = "#201C18", BLUE = "#2150C8", SCREEN = "rgba(33,80,200,0.12)";

// Works out the device type from the catalogue category if present,
// otherwise from the model name ("iPad Air" -> tablet, "MacBook" -> laptop).
export function inferDeviceType(model, category) {
  const c = (category || "").toLowerCase();
  if (["phone", "tablet", "laptop", "watch"].includes(c)) return c;
  const m = (model || "").toLowerCase();
  if (/watch/.test(m)) return "watch";
  if (/ipad|tab\b|tablet|galaxy tab/.test(m)) return "tablet";
  if (/macbook|laptop|notebook|chromebook|surface laptop|thinkpad|xps/.test(m)) return "laptop";
  return "phone";
}

const SHAPES = {
  phone: (
    <>
      <rect x="20" y="6" width="40" height="76" rx="8" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x="25" y="13" width="30" height="60" rx="3" fill={SCREEN} />
      <rect x="34" y="9" width="12" height="2.5" rx="1.25" fill={INK} />
      <circle cx="40" cy="77.5" r="2" fill={BLUE} />
      <rect x="30" y="22" width="20" height="3" rx="1.5" fill={BLUE} opacity="0.55" />
      <rect x="30" y="29" width="14" height="3" rx="1.5" fill={BLUE} opacity="0.35" />
    </>
  ),
  tablet: (
    <>
      <rect x="8" y="12" width="64" height="66" rx="7" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x="14" y="18" width="52" height="54" rx="3" fill={SCREEN} />
      <circle cx="40" cy="15" r="1.4" fill={INK} />
      <rect x="20" y="26" width="26" height="4" rx="2" fill={BLUE} opacity="0.55" />
      <rect x="20" y="34" width="18" height="4" rx="2" fill={BLUE} opacity="0.35" />
    </>
  ),
  laptop: (
    <>
      <rect x="14" y="16" width="52" height="38" rx="4" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x="19" y="21" width="42" height="28" rx="2" fill={SCREEN} />
      <path d="M6 60 H74 L70 68 H10 Z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <rect x="34" y="60" width="12" height="2.5" rx="1.25" fill={BLUE} />
      <rect x="24" y="28" width="20" height="3" rx="1.5" fill={BLUE} opacity="0.55" />
    </>
  ),
  watch: (
    <>
      <rect x="30" y="4" width="20" height="18" rx="4" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x="30" y="68" width="20" height="18" rx="4" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x="22" y="20" width="36" height="50" rx="11" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x="28" y="27" width="24" height="36" rx="6" fill={SCREEN} />
      <rect x="58" y="36" width="4" height="10" rx="2" fill={BLUE} />
      <path d="M40 38 V45 L45 48" stroke={BLUE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
};

export default function DeviceArt({ type = "phone", size = 64, label }) {
  const shape = SHAPES[type] || SHAPES.phone;
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 80 88" role={label ? "img" : undefined}
      aria-label={label} aria-hidden={label ? undefined : true} style={{ display: "block" }}>
      {shape}
    </svg>
  );
}
