import React, { useEffect, useRef, useState } from "react";

/* Small motion effects in the style of 21st.dev / Magic UI components
   (Number Ticker, Shimmer Button, Spotlight Card), written without an
   animation library so customers' phones download almost nothing extra.
   Every effect switches off for people who ask for reduced motion. */

const reduced = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Counts up to a number the first time it scrolls into view.
// Accepts values like "12+", "1,240", "4.8★"; anything after the number is kept as is.
export function NumberTicker({ value, duration = 1400 }) {
  const ref = useRef(null);
  const str = String(value);
  const m = str.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
  const target = m ? Number(m[2].replace(/,/g, "")) : NaN;
  const decimals = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
  const [shown, setShown] = useState(Number.isFinite(target) && !reduced() ? 0 : target);

  useEffect(() => {
    if (!Number.isFinite(target) || reduced() || !ref.current || !("IntersectionObserver" in window)) { setShown(target); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // ease-out-expo
        setShown(target * eased);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, duration]);

  if (!m) return <span>{str}</span>;
  const text = Number(shown).toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }} aria-label={str}>
      <span aria-hidden="true">{m[1]}{text}{m[3]}</span>
    </span>
  );
}

// Spotlight: a soft glow follows the pointer across cards inside `rootRef`.
// Only on devices with a real mouse; touch screens never see it.
export function useSpotlight(rootRef, selector) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const move = (e) => {
      const card = e.target.closest && e.target.closest(selector);
      if (!card || !root.contains(card)) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    root.addEventListener("pointermove", move, { passive: true });
    return () => root.removeEventListener("pointermove", move);
  }, [rootRef, selector]);
}

// Shared CSS: shimmer sweep for primary buttons, spotlight glow, and
// scroll-linked reveals (pure CSS where the browser supports it).
export const FX_CSS = `
  .fx-shimmer { position: relative; overflow: hidden; isolation: isolate; }
  .fx-shimmer::after { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.28) 48%, transparent 66%);
    transform: translateX(-120%); animation: fx-sweep 1.6s cubic-bezier(.4,0,.2,1) 1.4s 1 forwards; }
  .fx-shimmer.fx-on-light::after { background: linear-gradient(110deg, transparent 30%, rgba(33,80,200,.16) 48%, transparent 66%); }
  @keyframes fx-sweep { to { transform: translateX(120%); } }

  .fx-spot { position: relative; }
  .fx-spot::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0; transition: opacity .25s ease;
    background: radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(33,80,200,.10), transparent 70%); }
  .fx-spot.fx-spot-dark::after { background: radial-gradient(320px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,.16), transparent 70%); }
  @media (hover: hover) and (pointer: fine) { .fx-spot:hover::after { opacity: 1; } }

  @supports (animation-timeline: view()) {
    .fx-scroll-in, .mv-rise.fx-scroll-in { animation: fx-in linear both; animation-timeline: view(); animation-range: entry 0% cover 28%; animation-delay: 0s !important; }
    @keyframes fx-in { from { opacity: 0; translate: 0 28px; scale: .97; } to { opacity: 1; translate: 0 0; scale: 1; } }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-shimmer::after { animation: none; display: none; }
    .fx-spot::after { display: none; }
    .fx-scroll-in { animation: none !important; }
  }
`;
