import React from "react";

// "Device Signature" — inspired by Pentagram's Damage Signature idea for
// Tractable: the device sits at the centre, and the inspection that surrounds
// and analyses it is drawn as a ring. One arc per checklist group (sized by
// how many checks it holds), one dot per individual check. Arcs and dots turn
// amber for any group where a fault is declared, so customers see their
// device's condition at a glance. Pure SVG + CSS: fast, crisp, accessible.
const BLUE = "#2150C8", AMBER = "#F59E0B", NAVY = "#0F1B3D", TRACK = "#E2E8F2";

const polar = (cx, cy, r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const CSS = `
.mvs-arc{stroke-dasharray:1;stroke-dashoffset:1;animation:mvs-draw .9s cubic-bezier(.16,1,.3,1) forwards}
.mvs-dot{opacity:0;animation:mvs-pop .4s ease forwards}
.mvs-scan{transform-origin:160px 160px;animation:mvs-spin 6s linear infinite}
.mvs-arc,.mvs-dot{transition:stroke .35s ease,fill .35s ease}
@keyframes mvs-draw{to{stroke-dashoffset:0}}
@keyframes mvs-pop{to{opacity:1}}
@keyframes mvs-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.mvs-arc{animation:none;stroke-dashoffset:0}.mvs-dot{animation:none;opacity:1}.mvs-scan{animation:none;display:none}}
`;

// groups: [{ name, faults: [{ id, label }] }], extra: optional trailing group (e.g. security checks)
// faulty: Set or array of fault ids the customer has declared
export default function InspectionSignature({ groups, faulty = [], size = 320, scanning = true, title = "Device inspection signature" }) {
  const bad = new Set(faulty);
  const total = groups.reduce((n, g) => n + g.faults.length, 0) || 1;
  const GAP = 4.5, cx = 160, cy = 160;
  let angle = 0;
  const segs = groups.map((g, gi) => {
    const span = (360 * g.faults.length) / total;
    const a0 = angle + GAP / 2, a1 = angle + span - GAP / 2;
    const hasFault = g.faults.some((f) => bad.has(f.id));
    const dots = g.faults.map((f, k) => {
      const a = a0 + ((a1 - a0) * (k + 0.5)) / g.faults.length;
      const [x, y] = polar(cx, cy, 146, a);
      return { id: f.id, label: f.label, x, y, bad: bad.has(f.id) };
    });
    angle += span;
    return { name: g.name, d: arc(cx, cy, 118, a0, a1), hasFault, dots, gi };
  });
  const faultCount = groups.reduce((n, g) => n + g.faults.filter((f) => bad.has(f.id)).length, 0);
  return (
    <svg viewBox="0 0 320 320" width={size} height={size} role="img" aria-label={`${title}: ${total} checks${faultCount ? `, ${faultCount} issue${faultCount === 1 ? "" : "s"} flagged` : ", all clear"}`} style={{ display: "block", maxWidth: "100%", height: "auto" }}>
      <style>{CSS}</style>
      <defs>
        <linearGradient id="mvs-scan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={BLUE} stopOpacity="0" /><stop offset="1" stopColor={BLUE} stopOpacity=".35" /></linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r="118" fill="none" stroke={TRACK} strokeWidth="16" />
      {scanning && <path className="mvs-scan" d={`M${cx} ${cy} L${cx} ${cy - 132} A132 132 0 0 1 ${polar(cx, cy, 132, 40).map((v) => v.toFixed(2)).join(" ")} Z`} fill="url(#mvs-scan)" />}
      {segs.map((s) => (
        <path key={s.name} className="mvs-arc" d={s.d} pathLength="1" fill="none" stroke={s.hasFault ? AMBER : BLUE} strokeWidth="16" strokeLinecap="butt"
          style={{ animationDelay: `${0.08 * s.gi}s` }} data-group={s.name} data-fault={s.hasFault ? "1" : "0"} />
      ))}
      {segs.flatMap((s) => s.dots.map((d, k) => (
        <circle key={d.id} className="mvs-dot" cx={d.x.toFixed(2)} cy={d.y.toFixed(2)} r={d.bad ? 4.2 : 3} fill={d.bad ? AMBER : NAVY}
          style={{ animationDelay: `${0.5 + 0.012 * (s.gi * 6 + k)}s` }}><title>{d.label}</title></circle>
      )))}
      {/* the device at the centre */}
      <rect x="128" y="104" width="64" height="112" rx="14" fill="#fff" stroke={NAVY} strokeWidth="5" />
      <rect x="150" y="112" width="20" height="5" rx="2.5" fill={NAVY} />
      <text x={cx} y="166" textAnchor="middle" fontFamily="'Archivo Black', sans-serif" fontSize="24" fill={faultCount ? AMBER : BLUE}>{faultCount ? faultCount : total}</text>
      <text x={cx} y="184" textAnchor="middle" fontFamily="'Archivo', sans-serif" fontSize="9.5" fontWeight="700" fill="#5B6472" letterSpacing="1">{faultCount ? (faultCount === 1 ? "ISSUE" : "ISSUES") : "CHECKS"}</text>
    </svg>
  );
}
