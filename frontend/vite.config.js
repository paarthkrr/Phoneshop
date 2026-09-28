import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Why the app file has a FIXED name (assets/app.js) instead of Vite's usual
// random-per-build name:
// Render's CDN can keep serving an OLD copy of a page's HTML for some URLs
// (e.g. /staff) after a deploy. With random names, that stale HTML points
// at a file deleted by the newer build, and the page loads blank. With one
// permanent name, even a stale page loads the current app.
const APP_FILE = "assets/app.js";

// Every filename Render has ever built for this site (recovered by
// rebuilding each deployed commit; the recent ones match Render's own build
// logs exactly). Each gets a one-line file that forwards to the current app,
// so stale pages already sitting in a cache start working too. No new names
// will ever be added, since builds no longer produce random names.
const LEGACY_ENTRY_FILES = [
    "index--uwKGpXp.js",
    "index-BEQpdGiZ.js",
    "index-BNylIkmc.js",
    "index-Bfo0HoYL.js",
    "index-BgBzROAg.js",
    "index-BkHUff-q.js",
    "index-C7Vw-cQX.js",
    "index-CdqGbtye.js",
    "index-CnhtuykJ.js",
    "index-CuVBTpsX.js",
    "index-D8PBL7z1.js",
    "index-DZSb2jJ8.js",
    "index-Dd7zIgiU.js",
    "index-DpwoIRMh.js",
    "index-Lg9w3ejb.js",
    "index-Wco2wez2.js",
    "index-ZGgXk_B2.js",
    "index-rDktp_5e.js",
    "index-yW-SwCVY.js",
];

function legacyEntryForwarders() {
  return {
    name: "legacy-entry-forwarders",
    writeBundle(options) {
      const dir = path.join(options.dir, "assets");
      for (const name of LEGACY_ENTRY_FILES) {
        fs.writeFileSync(path.join(dir, name), 'import "./app.js";\n');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), legacyEntryForwarders()],
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        entryFileNames: APP_FILE,
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
