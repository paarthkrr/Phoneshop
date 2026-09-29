import React, { useState } from "react";

// Licensed stock photos from Pexels (pexels.com/license): free for
// commercial use, no attribution required. Chosen to match the look of
// established repair shops without copying any competitor's images.
// Swap these for your own shop photos any time — just change the entry.
export const PHOTOS = {
  workshop: { id: 10568286, alt: "Technician repairing a smartphone at a workbench" },
  microscope: { id: 6755056, alt: "Technician using a microscope for precision phone repair" },
  repairMat: { id: 31862950, alt: "Disassembled smartphone parts and tools on a repair mat" },
  screwdriver: { id: 6755075, alt: "Close-up of a phone being repaired with a precision screwdriver" },
  workbench: { id: 31862953, alt: "Smartphone and repair tools on a workbench" },
  battery: { id: 32942100, alt: "Open iPhone with tools during a battery replacement" },
};

const url = (id, w) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

// Lazy-loaded, responsive, and never shows a broken-image icon: if the
// photo can't load, a soft brand-coloured panel takes its place.
export default function Photo({ name, height = 260, radius = 14, overlay, children, eager = false, style }) {
  const p = PHOTOS[name];
  const [failed, setFailed] = useState(false);
  return (
    <div style={{ position: "relative", height, borderRadius: radius, overflow: "hidden",
      background: "linear-gradient(135deg, rgba(33,80,200,0.18), rgba(33,80,200,0.05))", ...style }}>
      {p && !failed && (
        <img src={url(p.id, 1200)} srcSet={`${url(p.id, 600)} 600w, ${url(p.id, 1200)} 1200w, ${url(p.id, 1800)} 1800w`}
          sizes="(max-width: 720px) 100vw, 1000px" alt={p.alt} loading={eager ? "eager" : "lazy"} decoding="async"
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      )}
      {overlay && <div style={{ position: "absolute", inset: 0, background: overlay }} />}
      {children && <div style={{ position: "relative", height: "100%" }}>{children}</div>}
    </div>
  );
}
