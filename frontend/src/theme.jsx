// Light / dark / follow-the-device, and the shop's brand colours, for the whole app.
// index.html applies the saved choice before the first paint (no white flash in dark
// mode); this keeps it in sync and draws the switch.
import React, { useEffect, useState } from "react";
import "./theme.css";

const KEY = "mr-theme";          // "system" | "light" | "dark"
const BRAND_KEY = "mr-brand";    // last brand colours, so they apply instantly next visit
const HEX = /^#[0-9a-f]{6}$/i;

const prefersDark = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
export function readChoice() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }
export function applyTheme(choice = readChoice()) {
  const dark = choice === "dark" || (choice === "system" && prefersDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0B0F17" : "#FFFFFF");
}

// Brand colours from the Pricing Console (businessSettings.brandColor / accentColor).
export function applyBrand({ brand, accent } = {}) {
  const root = document.documentElement.style;
  if (HEX.test(brand || "")) root.setProperty("--mr-brand-base", brand); else root.removeProperty("--mr-brand-base");
  if (HEX.test(accent || "")) root.setProperty("--mr-accent-base", accent); else root.removeProperty("--mr-accent-base");
}
export function rememberBrand(colors) {
  applyBrand(colors);
  try { localStorage.setItem(BRAND_KEY, JSON.stringify(colors || {})); } catch (e) { /* storage blocked: colours still apply this visit */ }
}
export function loadBrand() {
  try { applyBrand(JSON.parse(localStorage.getItem(BRAND_KEY) || "{}")); } catch (e) { /* ignore */ }
  // Then the current settings (public read of the shared config).
  if (typeof window !== "undefined" && window.storage) {
    window.storage.get("pricing-config", true).then((r) => {
      const b = r ? JSON.parse(r.value)?.businessSettings || {} : {};
      rememberBrand({ brand: b.brandColor, accent: b.accentColor });
    }).catch(() => {});
  }
}

export function useThemeSync() {
  useEffect(() => {
    applyTheme();
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (readChoice() === "system") applyTheme("system"); };
    mq && mq.addEventListener && mq.addEventListener("change", onChange);
    return () => mq && mq.removeEventListener && mq.removeEventListener("change", onChange);
  }, []);
}

const ICONS = {
  system: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
};
const LABEL = { system: "Auto", light: "Light", dark: "Dark" };
const NEXT = { system: "light", light: "dark", dark: "system" };

export default function ThemeToggle({ showLabel = false, style }) {
  const [choice, setChoice] = useState(readChoice);
  const pick = () => {
    const n = NEXT[choice] || "system";
    try { localStorage.setItem(KEY, n); } catch (e) { /* this visit only */ }
    setChoice(n); applyTheme(n);
  };
  return (
    <button type="button" className="mr-theme-btn" onClick={pick} style={style}
      aria-label={`Theme: ${LABEL[choice]}. Change to ${LABEL[NEXT[choice]]}`} title={`Theme: ${LABEL[choice]} (tap to change)`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[choice]}</svg>
      {showLabel && <span>{LABEL[choice]}</span>}
    </button>
  );
}
