import React, { useState, useEffect } from "react";

export default function OfflineIndicator() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#7A1F2B",
      color: "#fff",
      padding: "10px 20px",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
      zIndex: 9999,
      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    }}>
      You're offline — changes will sync when connected
    </div>
  );
}
