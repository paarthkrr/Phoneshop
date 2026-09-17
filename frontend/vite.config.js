import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup — nothing shop-specific here. The actual
// business logic all lives in the 9 tool files and App.jsx; this file
// just tells Vite how to build them.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
