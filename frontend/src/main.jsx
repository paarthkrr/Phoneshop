import React from "react";
import ReactDOM from "react-dom/client";
import "./storage-shim.js"; // sets up window.shopAuth
import App from "./App.jsx";

// Point this at your deployed backend (see DEPLOYMENT.md). Read from a
// build-time environment variable so the same code works whether you're
// building locally or deploying via Render/Vercel/Netlify without editing
// this file each time. Falls back to unset (not empty string) if not
// provided, so App.jsx's "skip storage installation gracefully" path
// still applies correctly for a from-scratch local preview.
window.SHOP_API_BASE_URL = import.meta.env.VITE_SHOP_API_BASE_URL || undefined;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
