import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { POSTS } from "./src/blog-posts.js";
import { metaFor, SELL_BRAND_NAMES } from "./src/seo-meta.js";
import { REPAIRS_BY_DEVICE } from "./src/repair-prices.js";

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
  "quote", "sell", "shop", "repairs", "home-service", "parts", "accessories", "about", "faq", "help", "contact", "blog", "tutorials", "privacy", "terms",
  "portal", "portal/pricing", "portal/inspect", "portal/pos", "portal/repairs", "portal/till", "portal/crm", "portal/team", "portal/products",
  "portal/activity", "portal/unlock",
  "staff", "staff/admin", "staff/inspect", "staff/pos", "staff/repairs", "staff/till", "staff/crm",
];
// Guides and sell-by-brand pages come straight from their source lists, so a
// new guide or brand gets its page file, SEO tags and sitemap entry automatically.
const ROUTES = [...STATIC_ROUTES, ...POSTS.map((p) => `blog/${p.slug}`), ...Object.keys(SELL_BRAND_NAMES).map((b) => `sell/${b}`)];
// Pages Google should index (not staff tools or duplicate aliases).
const SITEMAP_EXCLUDE = new Set(["sell", "parts", "help"]);
const isStaffRoute = (r) => /^(portal|staff)(\/|$)/.test(r);
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Real H1 per route (honest, matches the live copy). Others fall back to the title.
const SEO_H1 = {
  "": "Sell your phone in Sydney. Get paid today.",
  "quote": "Sell your phone in Sydney \u2014 instant quote, cash paid",
  "sell": "Sell your phone \u2014 instant quote",
  "shop": "Refurbished phones, graded and tested",
  "repairs": "Phone repairs in Sydney from $55",
  "accessories": "Phone accessories, parts and DIY kits",
  "parts": "Phone accessories, parts and DIY kits",
  "home-service": "Mobile Recellr, at your door in Sydney",
  "tutorials": "Phone repair tutorials",
  "blog": "Guides: phone repair and trade-in advice",
  "about": "About Mobile Recellr",
  "faq": "Frequently asked questions",
  "contact": "Contact Mobile Recellr",
};
function seoH1(route) {
  if (SEO_H1[route] != null) return SEO_H1[route];
  const brand = route.startsWith("sell/") && SELL_BRAND_NAMES[route.slice(5)];
  if (brand) return `Sell your ${brand} in Sydney`;
  const meta = metaFor(route ? "/" + route : "/");
  return meta ? meta.title.split(" | ")[0].split(" \u2014 ")[0] : "Mobile Recellr";
}
// A static, crawlable fallback for the page body: real heading, the page's own
// description, and links to the main pages. React replaces this on mount, so
// visitors see real text instead of "Loading\u2026" and crawlers (and social
// scrapers that don't run JS) get genuine content and internal links.
function seoBody(route) {
  const meta = metaFor(route ? "/" + route : "/");
  const h1 = esc(seoH1(route));
  const intro = meta ? esc(meta.desc) : "";
  const links = [["/quote","Sell your phone"],["/repairs","Phone repairs"],["/shop","Refurbished phones"],["/accessories","Accessories"],["/home-service","At your door"],["/about","About us"],["/contact","Contact"]]
    .map(([h,t]) => `<a href="${h}" style="color:#2150C8;text-decoration:none;margin:0 10px 6px 0;display:inline-block">${t}</a>`).join("");
  return `<div id="boot-msg" style="max-width:720px;margin:48px auto;padding:20px;font-family:system-ui,sans-serif;color:#5B6472;">
        <h1 style="font-size:28px;line-height:1.15;color:#111827;margin:0 0 12px">${h1}</h1>
        ${intro ? `<p style="font-size:16px;line-height:1.55;margin:0 0 16px">${intro}</p>` : ""}
        <nav aria-label="Main pages" style="margin:0 0 16px">${links}</nav>
        <p style="font-size:13px;color:#8A93A0">Loading Mobile Recellr\u2026</p>
      </div>`;
}

// Structured data written into the page file itself, so Google reads it without running
// the app: the repair price list (from the same file the page shows) and breadcrumbs on
// nested pages. Only facts the visible page also states.
function jsonLd(route, base) {
  const out = [];
  if (route === "repairs") {
    out.push({
      "@context": "https://schema.org", "@type": "OfferCatalog", name: "Repairs — starting prices", url: `${base}/repairs`,
      itemListElement: Object.entries(REPAIRS_BY_DEVICE).flatMap(([device, list]) => list.map((r) => ({
        "@type": "Offer", priceCurrency: "AUD",
        priceSpecification: { "@type": "PriceSpecification", minPrice: r.from, priceCurrency: "AUD" },
        itemOffered: { "@type": "Service", name: `${device} ${r.name.toLowerCase()}`, areaServed: "Sydney, NSW", provider: { "@type": "ElectronicsStore", name: "Mobile Recellr", url: base + "/" } },
      }))),
    });
  }
  const parts = route.split("/").filter(Boolean);
  if (parts.length > 1) {
    const parentName = { blog: "Guides", sell: "Sell your phone" }[parts[0]] || parts[0];
    const meta = metaFor("/" + route);
    out.push({
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: base + "/" },
        { "@type": "ListItem", position: 2, name: parentName, item: `${base}/${parts[0] === "sell" ? "quote" : parts[0]}` },
        { "@type": "ListItem", position: 3, name: meta ? meta.title.split(" | ")[0] : parts[1], item: `${base}/${route}` },
      ],
    });
  }
  return out.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n    ");
}

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
  const ld = isStaffRoute(route) ? "" : jsonLd(route, base);
  out = out.replace("</head>", `    ${extra}${ld ? "\n    " + ld : ""}\n  </head>`);
  // Swap the generic "Loading\u2026" block for this page's real content (staff tools keep the plain loader).
  if (!isStaffRoute(route)) {
    out = out.replace(/<div id="boot-msg"[\s\S]*?<\/div>\s*(?=<\/div>)/, seoBody(route));
  }
  return out;
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
        // Content-named, so files from different deploys never mix (the entry, app.js, stays stable and only loads these).
        chunkFileNames: "assets/[name]-[hash].js",
        // Vite's dynamic-import helper would otherwise sit inside app.js, and every other
        // file would import "./app.js" without its ?v= version (possibly an old cached copy).
        manualChunks(id) { if (id.includes("vite/preload-helper") || id.includes("modulepreload-polyfill")) return "loader"; },
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
