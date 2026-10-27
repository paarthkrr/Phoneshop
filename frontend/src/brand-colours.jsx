// Brand colours for the whole site and portal (Pricing Console › Business).
// Pick them by hand, from a few presets, or straight from the logo: the logo is read
// in the browser (never uploaded) and its two strongest colours become the brand
// (buttons, links) and accent (main call-to-action, top strip, prices) colours.
import React, { useState } from "react";
import { applyBrand } from "./theme.jsx";

const PRESETS = [
  { name: "Recellr (current)", brand: "#2150C8", accent: "#7A1F2B" },
  { name: "Midnight & gold", brand: "#1F3A5F", accent: "#B7862A" },
  { name: "Emerald", brand: "#0F7B5F", accent: "#0B3D2E" },
  { name: "Graphite & orange", brand: "#2B2F36", accent: "#E4572E" },
  { name: "Violet", brand: "#5B3CC4", accent: "#C2185B" },
];
const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// The two most common strong colours in an image, ignoring white, black and greys.
export function coloursFromImage(img) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  const buckets = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.25 || l > 0.9 || l < 0.1) continue;
    const k = buckets[Math.floor(h / 15) % 24], w = s;
    k.w += w; k.r += r * w; k.g += g * w; k.b += b * w;
  }
  const ranked = buckets.map((k, i) => ({ ...k, i })).filter((k) => k.w > 0).sort((a, b) => b.w - a.w);
  if (!ranked.length) return null;
  const hex = (k) => toHex(k.r / k.w, k.g / k.w, k.b / k.w);
  const first = ranked[0];
  // The accent is the strongest colour at least ~60° round the colour wheel from the brand.
  const second = ranked.find((k) => Math.min(Math.abs(k.i - first.i), 24 - Math.abs(k.i - first.i)) >= 4);
  return { brand: hex(first), accent: second ? hex(second) : null };
}

export default function BrandColours({ brand, accent, onChange, colors }) {
  const { muted, line, paper } = colors;
  const [note, setNote] = useState("");
  const set = (b, a) => { onChange({ brandColor: b, accentColor: a }); applyBrand({ brand: b, accent: a }); };
  const fromLogo = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const got = coloursFromImage(img);
      URL.revokeObjectURL(url);
      if (!got) { setNote("Couldn't find a clear colour in that logo (it may be black and white). Pick them by hand."); return; }
      set(got.brand, got.accent || accent || "#7A1F2B");
      setNote(`From the logo: brand ${got.brand}${got.accent ? `, accent ${got.accent}` : " (no second colour found, accent kept)"}. Save the settings to make it live.`);
    };
    img.onerror = () => { URL.revokeObjectURL(url); setNote("That file couldn't be read as an image."); };
    img.src = url;
  };
  const swatch = (v) => ({ width: 22, height: 22, borderRadius: 6, background: v, border: `1px solid ${line}`, display: "inline-block" });
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, marginBottom: 4 }}>Brand colours</div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Used across the website and the portal, in light and dark mode. Changing the logo? Pick from it and the colours follow.</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="color" value={brand || "#2150C8"} onChange={(e) => set(e.target.value.toUpperCase(), accent)} aria-label="Brand colour" style={{ width: 40, height: 32, border: "none", background: "none", cursor: "pointer" }} />
          Brand <code style={{ color: muted }}>{brand || "#2150C8"}</code>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="color" value={accent || "#7A1F2B"} onChange={(e) => set(brand, e.target.value.toUpperCase())} aria-label="Accent colour" style={{ width: 40, height: 32, border: "none", background: "none", cursor: "pointer" }} />
          Accent <code style={{ color: muted }}>{accent || "#7A1F2B"}</code>
        </label>
        <label style={{ padding: "8px 12px", border: `1px solid ${line}`, borderRadius: 8, fontSize: 13, cursor: "pointer", color: paper }}>
          🎨 Pick from logo
          <input type="file" accept="image/*" onChange={(e) => fromLogo(e.target.files && e.target.files[0])} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" onClick={() => set(p.brand, p.accent)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", border: `1px solid ${line}`, borderRadius: 999, background: "transparent", color: paper, fontSize: 12.5, cursor: "pointer" }}>
            <span style={swatch(p.brand)} /><span style={swatch(p.accent)} />{p.name}
          </button>
        ))}
      </div>
      {note && <div style={{ fontSize: 12.5, color: muted, marginTop: 8 }}>{note}</div>}
    </div>
  );
}
