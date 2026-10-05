import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { POSTS } from "./src/blog-posts.js";
import { metaFor, SELL_BRAND_NAMES } from "./src/seo-meta.js";

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
const STATIC_ROUTES = [
  "quote", "sell", "shop", "repairs", "parts", "accessories", "about", "faq", "help", "contact", "blog", "tutorials", "privacy", "terms",
  "portal", "portal/pricing", "portal/inspect", "portal/pos", "portal/repairs", "portal/till", "portal/crm", "portal/team", "portal/products",
  "staff", "staff/admin", "staff/inspect", "staff/pos", "staff/repairs", "staff/till", "staff/crm",
];
// Guides and sell-by-brand pages come straight from their source lists, so a
// new guide or brand gets its page file, SEO tags and sitemap entry automatically.
const ROUTES = [...STATIC_ROUTES, ...POSTS.map((p) => `blog/${p.slug}`), ...Object.keys(SELL_BRAND_NAMES).map((b) => `sell/${b}`)];
// Pages Google should index (not staff tools or duplicate aliases).
const SITEMAP_EXCLUDE = new Set(["sell", "parts", "help"]);
const isStaffRoute = (r) => /^(portal|staff)(\/|$)/.test(r);
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function withMeta(html, route, base) {
  const url = base + (route ? "/" + route : "/");
  const meta = metaFor(route ? "/" + route : "/");
  let out = html;
  if (meta) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(meta.desc)}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(meta.desc)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(meta.title)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(meta.desc)}$2`);
  }
  const extra = isStaffRoute(route) ? `<meta name="robots" content="noindex" />` : `<link rel="canonical" href="${url === base + "/parts" ? base + "/accessories" : url}" />\n    <meta property="og:url" content="${url}" />`;
  return out.replace("</head>", `    ${extra}\n  </head>`);
}
function pagePerRoute() {
  return {
    name: "page-per-route",
    writeBundle(options) {
      const base = (process.env.SITE_URL || CURRENT_URL).replace(/\/$/, "");
      const html = fs.readFileSync(path.join(options.dir, "index.html"), "utf8");
      for (const r of ROUTES) {
        fs.mkdirSync(path.join(options.dir, r), { recursive: true });
        fs.writeFileSync(path.join(options.dir, r, "index.html"), withMeta(html, r, base));
      }
      fs.writeFileSync(path.join(options.dir, "index.html"), withMeta(html, "", base));
      const today = new Date().toISOString().slice(0, 10);
      const urls = ["", ...ROUTES.filter((r) => !isStaffRoute(r) && !SITEMAP_EXCLUDE.has(r))];
      const pri = (r) => r === "" ? "1.0" : ["quote", "repairs", "shop", "accessories"].includes(r) || r.startsWith("sell/") ? "0.8" : r.startsWith("blog") ? "0.6" : "0.4";
      fs.writeFileSync(path.join(options.dir, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map((r) => `  <url><loc>${base}/${r}</loc><lastmod>${today}</lastmod><priority>${pri(r)}</priority></url>`).join("\n") + "\n</urlset>\n");
    },
  };
}

// Domain switch in one place: set SITE_URL on the host (e.g.
// https://www.mobilevault.com.au) and the sitemap and robots file are
// rewritten to it at build time. Unset = keep the current address.
const CURRENT_URL = "https://mobilerecellr.com.au";
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
  plugins: [
    // Cache-busting: the bundle keeps its stable name (/assets/app.js) but every
    // build stamps a fresh ?v= on it in the HTML, so browsers (iPhone Safari
    // especially) always fetch the new version after a deploy.
    {
      name: "cache-bust-assets",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          const v = Date.now().toString(36);
          return html.replace(/(src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g, `$1="$2?v=${v}"`);
        },
      },
    },react(), legacyEntryForwarders(), pagePerRoute(), siteUrl()],
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
