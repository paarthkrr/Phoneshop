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

// Every address on the site gets a REAL copy of index.html at build time
// (e.g. dist/portal/index.html). The host serves real files directly, so
// deep links like /portal or /repairs work on a fresh load without
// depending on the dashboard rewrite rule at all — that rule was returning
// an empty page for every address except the homepage.
const ROUTES = [
  "quote", "sell", "shop", "repairs", "parts", "accessories", "about", "faq", "help", "contact", "blog", "tutorials", "privacy", "terms",
  "blog/charging-port-dust-or-real-fault", "blog/refurbished-grades-explained", "blog/how-much-is-my-old-phone-worth",
  "portal", "portal/pricing", "portal/inspect", "portal/pos", "portal/repairs", "portal/till", "portal/crm",
  "staff", "staff/admin", "staff/inspect", "staff/pos", "staff/repairs", "staff/till", "staff/crm",
];
function pagePerRoute() {
  return {
    name: "page-per-route",
    writeBundle(options) {
      const html = fs.readFileSync(path.join(options.dir, "index.html"));
      for (const r of ROUTES) {
        fs.mkdirSync(path.join(options.dir, r), { recursive: true });
        fs.writeFileSync(path.join(options.dir, r, "index.html"), html);
      }
    },
  };
}

// Domain switch in one place: set SITE_URL on the host (e.g.
// https://www.mobilevault.com.au) and the sitemap and robots file are
// rewritten to it at build time. Unset = keep the current address.
const CURRENT_URL = "https://phoneshop-frontend-51tg.onrender.com";
function siteUrl() {
  return {
    name: "site-url",
    writeBundle(options) {
      const target = (process.env.SITE_URL || "").replace(/\/$/, "");
      if (!target) return;
      for (const f of ["sitemap.xml", "robots.txt"]) {
        const p = path.join(options.dir, f);
        if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, "utf8").split(CURRENT_URL).join(target));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), legacyEntryForwarders(), pagePerRoute(), siteUrl()],
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
