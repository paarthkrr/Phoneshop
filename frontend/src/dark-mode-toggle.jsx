import React, { useState, useEffect } from "react";
import "./dark-mode.css";
import "./burgundy-theme.css";
import "./luxury-home.css";

export default function DarkModeToggle() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("dark-mode") === "1"; } catch { return false; }
  });

  useEffect(() => {
    document.body.classList.toggle("dark-mode", dark);
    try { localStorage.setItem("dark-mode", dark ? "1" : "0"); } catch {}
  }, [dark]);

  return (
    <button
      className="dark-toggle"
      onClick={() => setDark((d) => !d)}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      style={{ marginLeft: 8 }}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
